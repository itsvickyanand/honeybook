"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Device } from "@twilio/voice-sdk";

/**
 * Connection lifecycle states surfaced to the UI.
 * @typedef {"loading"|"idle"|"connecting"|"ringing"|"in-call"|"error"} DialerStatus
 */

/**
 * Headless hook that wraps the Twilio Voice SDK `Device` for outbound calling.
 * It fetches an access token, registers a device, and exposes simple
 * call / hangup / mute controls plus a live status and call timer.
 *
 * @param {object} [options]
 * @param {string} [options.tokenUrl="/api/dialer/token"] - Endpoint that returns `{ token }`.
 * @returns {{
 *   status: DialerStatus,
 *   error: string|null,
 *   isMuted: boolean,
 *   callDuration: number,
 *   call: (to: string, params?: object) => Promise<void>,
 *   hangup: () => void,
 *   toggleMute: () => void,
 * }}
 */
export function useDialer({ tokenUrl = "/api/dialer/token" } = {}) {
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  const deviceRef = useRef(null);
  const activeCallRef = useRef(null);
  const timerRef = useRef(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Initialise the Twilio Device once on mount.
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const res = await fetch(tokenUrl);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Token request failed (${res.status})`);
        }
        const { token } = await res.json();
        if (cancelled) return;

        const device = new Device(token, {
          codecPreferences: ["opus", "pcmu"],
          logLevel: "error",
          publishEvents: true,
        });

        device.on("error", (err) => {
          console.error("[dialer] device error:", err);
          setError(err.message || "Device error");
          setStatus("error");
        });

        device.on("tokenWillExpire", async () => {
          try {
            const r = await fetch(tokenUrl);
            const { token: fresh } = await r.json();
            device.updateToken(fresh);
          } catch (e) {
            console.error("[dialer] token refresh failed:", e);
          }
        });

        await device.register();
        if (cancelled) {
          device.destroy();
          return;
        }
        deviceRef.current = device;
        setStatus("idle");
      } catch (err) {
        if (cancelled) return;
        console.error("[dialer] init failed:", err);
        setError(err.message || "Failed to initialise dialer");
        setStatus("error");
      }
    }

    init();

    return () => {
      cancelled = true;
      stopTimer();
      if (activeCallRef.current) activeCallRef.current.disconnect();
      if (deviceRef.current) deviceRef.current.destroy();
      deviceRef.current = null;
    };
  }, [tokenUrl, stopTimer]);

  const attachCallHandlers = useCallback(
    (call) => {
      activeCallRef.current = call;
      setIsMuted(false);
      setStatus("ringing");

      call.on("accept", () => {
        setStatus("in-call");
        setCallDuration(0);
        const startedAt = Date.now();
        stopTimer();
        timerRef.current = setInterval(() => {
          setCallDuration(Math.floor((Date.now() - startedAt) / 1000));
        }, 1000);
      });

      const cleanup = () => {
        stopTimer();
        activeCallRef.current = null;
        setIsMuted(false);
        setStatus("idle");
      };

      call.on("disconnect", cleanup);
      call.on("cancel", cleanup);
      call.on("reject", cleanup);
      call.on("error", (err) => {
        console.error("[dialer] call error:", err);
        setError(err.message || "Call error");
        cleanup();
      });
    },
    [stopTimer]
  );

  const call = useCallback(
    async (to, params = {}) => {
      const device = deviceRef.current;
      if (!device) {
        setError("Dialer is not ready yet");
        return;
      }
      const target = (to || "").trim();
      if (!target) {
        setError("Enter a number to dial");
        return;
      }
      try {
        setError(null);
        setStatus("connecting");
        // Extra params (e.g. tenantId/contactId/leadName) are forwarded to the
        // voice webhook so the call can be associated in the logs. Drop empties.
        const extra = Object.fromEntries(
          Object.entries(params).filter(([, v]) => v != null && v !== "")
        );
        const activeCall = await device.connect({
          params: { To: target, ...extra },
        });
        attachCallHandlers(activeCall);
      } catch (err) {
        console.error("[dialer] connect failed:", err);
        setError(err.message || "Failed to place call");
        setStatus("idle");
      }
    },
    [attachCallHandlers]
  );

  const hangup = useCallback(() => {
    if (activeCallRef.current) {
      activeCallRef.current.disconnect();
    } else if (deviceRef.current) {
      deviceRef.current.disconnectAll();
    }
  }, []);

  const toggleMute = useCallback(() => {
    const activeCall = activeCallRef.current;
    if (!activeCall) return;
    const next = !activeCall.isMuted();
    activeCall.mute(next);
    setIsMuted(next);
  }, []);

  return { status, error, isMuted, callDuration, call, hangup, toggleMute };
}
