import { after } from "next/server";
import twilio from "twilio";
import { updateCallLogBySid } from "./store.js";
import { processRecording } from "./pipeline.js";

const { VoiceResponse } = twilio.twiml;

// Twilio DialCallStatus → our CallLog.status vocabulary.
function mapDialStatus(dialStatus) {
  switch (dialStatus) {
    case "completed":
    case "answered":
      return "completed";
    case "busy":
      return "busy";
    case "no-answer":
      return "no-answer";
    case "canceled":
      return "canceled";
    case "failed":
      return "failed";
    default:
      return dialStatus || "completed";
  }
}

// Calls that never connect produce no recording, so the transcribe/analyze
// pipeline never runs to advance processingState past "pending". Treat these as
// terminal with nothing to process, so the UI stops showing "Waiting for
// recording…". A "completed" call is left untouched — its recording webhook
// drives processingState through the pipeline.
const NO_RECORDING_STATUSES = new Set([
  "busy",
  "no-answer",
  "canceled",
  "failed",
]);

/**
 * Recording status callback. Twilio POSTs (form-encoded) when the recording is
 * ready. We respond immediately and kick off transcription + analysis in the
 * background via `after()`. Wire to: POST /api/dialer/recording-status
 */
export async function recordingStatusPOST(request) {
  try {
    const form = await request.formData();
    const callSid = form.get("CallSid");
    const recordingSid = form.get("RecordingSid");
    const recordingUrl = form.get("RecordingUrl");
    const recordingStatus = form.get("RecordingStatus");
    const recordingDuration = form.get("RecordingDuration");

    if (recordingStatus === "completed" && recordingSid && callSid) {
      after(() =>
        processRecording({
          callSid,
          recordingSid,
          recordingUrl: recordingUrl ? `${recordingUrl}.mp3` : null,
          recordingDuration,
        })
      );
    }
  } catch (error) {
    console.error("[dialer] recording-status error:", error);
  }
  return new Response("", { status: 204 });
}

/**
 * Dial action callback. Fires when the <Dial> completes; gives us the final
 * status and duration. We persist them and return empty TwiML to end the call.
 * Wire to: POST /api/dialer/call-status
 */
export async function callStatusPOST(request) {
  try {
    const form = await request.formData();
    const callSid = form.get("CallSid");
    const dialStatus = form.get("DialCallStatus");
    const dialDuration = form.get("DialCallDuration");

    if (callSid) {
      const status = mapDialStatus(dialStatus);
      await updateCallLogBySid(callSid, {
        status,
        durationSec: dialDuration ? Number(dialDuration) : undefined,
        endedAt: new Date(),
        ...(NO_RECORDING_STATUSES.has(status)
          ? { processingState: "done" }
          : {}),
      });
    }
  } catch (error) {
    console.error("[dialer] call-status error:", error);
  }
  const response = new VoiceResponse();
  return new Response(response.toString(), {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}
