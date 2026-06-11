import twilio from "twilio";
import { getDialerConfig } from "./config.js";

const { AccessToken } = twilio.jwt;
const { VoiceGrant } = AccessToken;

/**
 * Mints a short-lived Twilio Access Token with a Voice grant so the browser
 * client can place outbound calls through the TwiML App.
 *
 * @param {object} [options]
 * @param {string} [options.identity] - Override the client identity for this token.
 * @param {number} [options.ttl]      - Token lifetime in seconds (default 3600).
 * @returns {{ token: string, identity: string }}
 */
export function createAccessToken({ identity, ttl = 3600 } = {}) {
  const config = getDialerConfig();
  const clientIdentity = identity || config.identity;

  const accessToken = new AccessToken(
    config.accountSid,
    config.apiKey,
    config.apiSecret,
    { identity: clientIdentity, ttl }
  );

  // Outbound-only: point the client at the TwiML App, disallow incoming.
  accessToken.addGrant(
    new VoiceGrant({
      outgoingApplicationSid: config.twimlAppSid,
      incomingAllow: false,
    })
  );

  return { token: accessToken.toJwt(), identity: clientIdentity };
}
