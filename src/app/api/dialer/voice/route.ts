// Twilio TwiML App "Voice Request URL" target (HTTP POST). Returns the <Dial>
// TwiML and records the call attempt. Logic lives in the portable dialer module.
export const dynamic = 'force-dynamic';
export { POST } from '@/dialer/server/voice.js';
