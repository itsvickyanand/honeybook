// Reusable calling feature — drop these anywhere in the app.
//
//   <CallProvider tenantId={...}>          // mount once (app layout)
//   <CallButton phone="+1…" name="…" contactId="…" />   // any card/row/page
//   <CallHistory contactId="…" />          // call log + AI analysis panel
//   const { startCall, hangup } = useCall() // imperative access
export { CallProvider, useCall } from './CallProvider';
export type { CallTarget, DialerStatus } from './CallProvider';
export { CallButton } from './CallButton';
export { CallHistory } from './CallHistory';
