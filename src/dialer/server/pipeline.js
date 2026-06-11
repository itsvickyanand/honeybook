import { getCallLogBySid, updateCallLogBySid } from "./store.js";
import { transcribeRecording } from "./transcription.js";
import { analyzeTranscript } from "./analysis.js";

/**
 * Post-call automation: transcribe the recording (Twilio Voice Intelligence)
 * then analyze it (Claude), persisting each step. Runs in the background via
 * `after()` so the Twilio webhook can return immediately. Each stage is
 * independently guarded so a failure is recorded, not thrown.
 *
 * @param {object} args
 * @param {string} args.callSid
 * @param {string} args.recordingSid
 * @param {string} [args.recordingUrl]
 * @param {string|number} [args.recordingDuration] - seconds
 */
export async function processRecording({
  callSid,
  recordingSid,
  recordingUrl,
  recordingDuration,
}) {
  await updateCallLogBySid(callSid, {
    recordingSid,
    recordingUrl: recordingUrl || undefined,
    durationSec: recordingDuration ? Number(recordingDuration) : undefined,
    processingState: "transcribing",
  }).catch((e) => console.error("[dialer] pre-transcribe update failed:", e));

  let transcriptText;
  let transcriptSid;
  try {
    const result = await transcribeRecording(recordingSid);
    transcriptText = result.text;
    transcriptSid = result.transcriptSid;
    await updateCallLogBySid(callSid, {
      transcript: transcriptText,
      transcriptSid,
      processingState: "analyzing",
    });
  } catch (error) {
    console.error("[dialer] transcription failed:", error);
    await updateCallLogBySid(callSid, {
      processingState: "error",
      errorMessage: `transcription: ${error.message}`,
    }).catch(() => {});
    return;
  }

  try {
    const log = await getCallLogBySid(callSid);
    const analysis = await analyzeTranscript(transcriptText, {
      leadName: log?.leadName,
      leadCompany: log?.leadCompany,
    });
    await updateCallLogBySid(callSid, {
      summary: analysis.summary,
      sentiment: analysis.sentiment,
      sentimentScore: analysis.sentimentScore,
      keyPoints: analysis.keyPoints,
      actionItems: analysis.actionItems,
      analysis,
      analyzedAt: new Date(),
      processingState: "done",
    });
  } catch (error) {
    console.error("[dialer] analysis failed:", error);
    await updateCallLogBySid(callSid, {
      processingState: "error",
      errorMessage: `analysis: ${error.message}`,
    }).catch(() => {});
  }
}
