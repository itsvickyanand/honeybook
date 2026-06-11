import { getTwilioClient } from "./twilioClient.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Transcribe a Twilio recording with Voice Intelligence and return the joined
 * transcript text. Dual-channel recordings let us label each speaker:
 * channel 1 is the agent (browser leg), channel 2 is the lead (PSTN leg).
 *
 * @param {string} recordingSid - Twilio Recording SID (RE…).
 * @returns {Promise<{ transcriptSid: string, text: string }>}
 */
export async function transcribeRecording(recordingSid) {
  const serviceSid = process.env.TWILIO_VOICE_INTELLIGENCE_SERVICE_SID;
  if (!serviceSid) {
    throw new Error("TWILIO_VOICE_INTELLIGENCE_SERVICE_SID is not set");
  }
  const client = getTwilioClient();

  const transcript = await client.intelligence.v2.transcripts.create({
    serviceSid,
    channel: { media_properties: { source_sid: recordingSid } },
  });

  const status = await pollUntilDone(client, transcript.sid);
  if (status !== "completed") {
    throw new Error(`Transcript ${transcript.sid} ended with status "${status}"`);
  }

  const sentences = await client.intelligence.v2
    .transcripts(transcript.sid)
    .sentences.list({ limit: 1000 });

  sentences.sort((a, b) => a.sentenceIndex - b.sentenceIndex);
  const text = sentences
    .map((s) => `${s.mediaChannel === 2 ? "Lead" : "Agent"}: ${s.transcript}`)
    .join("\n");

  return { transcriptSid: transcript.sid, text };
}

async function pollUntilDone(client, sid, { attempts = 40, intervalMs = 3000 } = {}) {
  for (let i = 0; i < attempts; i++) {
    const t = await client.intelligence.v2.transcripts(sid).fetch();
    if (t.status === "completed" || t.status === "failed") return t.status;
    await sleep(intervalMs);
  }
  return "timed-out";
}
