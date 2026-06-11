import twilio from "twilio";
import { getDialerConfig } from "./config.js";

let client;

/**
 * Authenticated Twilio REST client. Uses the API Key SID + Secret (with the
 * Account SID) so we never need the account auth token.
 */
export function getTwilioClient() {
  if (!client) {
    const config = getDialerConfig();
    client = twilio(config.apiKey, config.apiSecret, {
      accountSid: config.accountSid,
    });
  }
  return client;
}
