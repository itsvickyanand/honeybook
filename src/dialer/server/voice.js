import twilio from "twilio";
import { getDialerConfig } from "./config.js";
import { upsertCallLog } from "./store.js";

const { VoiceResponse } = twilio.twiml;

// Default country code for numbers stored without one. India (+91) for now.
const DEFAULT_COUNTRY_CODE = process.env.DIALER_DEFAULT_COUNTRY_CODE || "91";

/**
 * Normalise a phone number to E.164. Numbers that already start with "+" are
 * kept as-is; bare national numbers get the default country code prepended
 * (leading trunk "0" stripped first).
 */
function toE164(raw, cc = DEFAULT_COUNTRY_CODE) {
  if (raw == null) return raw;
  const s = String(raw).trim();
  if (s.startsWith("+")) return s.replace(/[^\d+]/g, "");
  let digits = s.replace(/\D/g, "").replace(/^0+/, "");
  if (!digits) return raw;
  // Already carries the country code (e.g. "917487832545").
  if (digits.startsWith(cc) && digits.length > 10) return "+" + digits;
  return "+" + cc + digits;
}

/**
 * Builds the TwiML that Twilio executes when the browser client places a call.
 * Twilio hits this endpoint (the TwiML App's Voice Request URL) with the `To`
 * parameter passed from `device.connect({ params: { To } })`.
 *
 * When `baseUrl` is provided, the call is recorded (dual channel) and Twilio is
 * told to POST recording + dial-completion callbacks back to this app, which
 * drives the transcript + AI-analysis pipeline.
 *
 * @param {string} to       - Destination number in E.164 (e.g. "+12025550123").
 * @param {string} callerId - Verified Twilio caller ID to display.
 * @param {object} [opts]
 * @param {string|null} [opts.baseUrl] - Public base URL for webhooks (no trailing slash).
 * @returns {string} TwiML XML string.
 */
export function buildVoiceResponse(to, callerId, { baseUrl } = {}) {
  const response = new VoiceResponse();

  if (!to) {
    response.say("No destination number was provided. Goodbye.");
    return response.toString();
  }

  const dialOptions = { callerId, answerOnBridge: true };

  if (baseUrl) {
    // Record both legs so transcription can label each speaker.
    dialOptions.record = "record-from-answer-dual";
    dialOptions.recordingStatusCallback = `${baseUrl}/api/dialer/recording-status`;
    dialOptions.recordingStatusCallbackEvent = "completed";
    // Fires when the dial finishes; gives us final status + duration.
    dialOptions.action = `${baseUrl}/api/dialer/call-status`;
    dialOptions.method = "POST";
  }

  const dial = response.dial(dialOptions);

  // Phone number → PSTN; otherwise treat as another Twilio client identity.
  if (/^[\d+\-() ]+$/.test(to)) {
    dial.number(to.replace(/[^\d+]/g, ""));
  } else {
    dial.client(to);
  }

  return response.toString();
}

/**
 * Next.js Route Handler (POST) returning TwiML. Twilio sends the request body
 * as `application/x-www-form-urlencoded`. Re-exported from
 * `app/api/dialer/voice/route.ts`.
 */
export async function POST(request) {
  try {
    const config = getDialerConfig();
    const form = await request.formData();
    // TEMP DIAGNOSTIC — logs exactly what Twilio delivers to this webhook.
    console.log(
      "[dialer] voice webhook params:",
      JSON.stringify(Object.fromEntries(form))
    );
    // Twilio form-encodes "+" as a space, which form parsers decode back to a
    // leading space — restore the "+" first, then normalise to E.164 with the
    // default country code (+91) so bare national numbers route correctly.
    const rawTo = form.get("To");
    const restored =
      typeof rawTo === "string" && rawTo.startsWith(" ")
        ? "+" + rawTo.trim()
        : rawTo;
    const to = toE164(restored);
    const callSid = form.get("CallSid");
    const from = form.get("From");
    // Custom params forwarded from device.connect({ params: { ... } }).
    const tenantId = form.get("tenantId") || null;
    const contactId = form.get("contactId") || null;
    const leadId = form.get("leadId") || null;
    const leadName = form.get("leadName") || null;
    const leadCompany = form.get("leadCompany") || null;

    const baseUrl = (process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "") || null;

    // Record the call attempt. Best-effort: never block TwiML on the DB, and
    // never fail the call if storage isn't configured yet.
    if (callSid) {
      upsertCallLog(callSid, {
        toNumber: to,
        fromNumber: from,
        tenantId,
        contactId,
        leadId,
        leadName,
        leadCompany,
        status: "in-progress",
        processingState: baseUrl ? "pending" : "done",
      }).catch((error) => console.error("[dialer] call log upsert failed:", error));
    }

    const twiml = buildVoiceResponse(to, config.callerId, { baseUrl });
    return new Response(twiml, {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  } catch (error) {
    console.error("[dialer] voice error:", error);
    const response = new VoiceResponse();
    response.say("An application error occurred. Goodbye.");
    return new Response(response.toString(), {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  }
}
