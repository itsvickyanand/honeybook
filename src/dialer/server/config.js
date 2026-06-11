/**
 * Reads and validates the Twilio configuration from environment variables.
 *
 * Required env vars (set these in `.env`):
 *   TWILIO_ACCOUNT_SID   - Account SID  (starts with "AC...")
 *   TWILIO_API_KEY       - API Key SID  (starts with "SK...")  -> Console > Account > API keys
 *   TWILIO_API_SECRET    - API Key secret (shown only once when the key is created)
 *   TWILIO_TWIML_APP_SID - TwiML App SID (starts with "AP...") -> Console > Voice > TwiML > Apps
 *   TWILIO_CALLER_ID     - A Twilio phone number in E.164, e.g. "+12025550123"
 *
 * Optional:
 *   DIALER_IDENTITY      - Stable identity for the browser client (default "dialer-agent")
 */
export function getDialerConfig() {
  const config = {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    apiKey: process.env.TWILIO_API_KEY,
    apiSecret: process.env.TWILIO_API_SECRET,
    twimlAppSid: process.env.TWILIO_TWIML_APP_SID,
    callerId: process.env.TWILIO_CALLER_ID,
    identity: process.env.DIALER_IDENTITY || "dialer-agent",
  };

  const missing = Object.entries({
    TWILIO_ACCOUNT_SID: config.accountSid,
    TWILIO_API_KEY: config.apiKey,
    TWILIO_API_SECRET: config.apiSecret,
    TWILIO_TWIML_APP_SID: config.twimlAppSid,
    TWILIO_CALLER_ID: config.callerId,
  })
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(
      `[dialer] Missing required environment variables: ${missing.join(", ")}.`
    );
  }

  return config;
}
