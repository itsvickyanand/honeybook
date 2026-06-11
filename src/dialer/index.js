// Portable Twilio dialer module — headless client hooks.
//
// honeybook-v2 ships its own design-system UI on top of these hooks in
// src/components/calling/* (CallProvider, CallButton, CallHistory). The hooks
// below are framework-agnostic and can drive any UI.
//
// Server logic lives in ./server/* and is wired up via the route handlers in
// src/app/api/dialer/*. The only host-app coupling is ./server/store.js, which
// reads/writes the `CallLog` model through @/lib/db.
export { useDialer } from "./client/useDialer.js";
export { useCallLogs } from "./client/useCallLogs.js";
