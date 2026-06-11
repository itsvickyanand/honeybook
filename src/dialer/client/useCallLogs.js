"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const PROCESSING_STATES = ["pending", "transcribing", "analyzing"];

// Calls that never connected produce no recording, so they never advance past
// "pending" — don't treat them as "processing" or we'd poll forever.
const NO_RECORDING_STATUSES = new Set([
  "busy",
  "no-answer",
  "canceled",
  "failed",
]);

function isProcessing(log) {
  return (
    PROCESSING_STATES.includes(log.processingState) &&
    !NO_RECORDING_STATUSES.has(log.status)
  );
}

/**
 * Fetches call logs (optionally filtered) and auto-polls while any log is still
 * being transcribed/analyzed, so the UI fills in live.
 *
 * @param {object} [options]
 * @param {string} [options.contactId]
 * @param {string} [options.leadId]
 * @param {string} [options.phone]
 * @param {string} [options.logsUrl="/api/dialer/logs"]
 * @param {number} [options.pollMs=5000] - Poll interval while processing.
 */
export function useCallLogs({
  contactId,
  leadId,
  phone,
  logsUrl = "/api/dialer/logs",
  pollMs = 5000,
} = {}) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const timerRef = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (contactId) qs.set("contactId", contactId);
      if (leadId) qs.set("leadId", leadId);
      if (phone) qs.set("phone", phone);
      const res = await fetch(`${logsUrl}?${qs.toString()}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Failed to load logs (${res.status})`);
      setLogs(body.logs || []);
      setError(null);
      return body.logs || [];
    } catch (err) {
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, [contactId, leadId, phone, logsUrl]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  // Poll while any log is still processing; stop when all are settled.
  useEffect(() => {
    const anyProcessing = logs.some(isProcessing);
    if (!anyProcessing || !pollMs) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }
    if (!timerRef.current) {
      timerRef.current = setInterval(refresh, pollMs);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [logs, pollMs, refresh]);

  return { logs, loading, error, refresh };
}
