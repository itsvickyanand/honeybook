'use client';
import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Phone, PhoneOff, Mic, MicOff, Loader2 } from 'lucide-react';
import { useDialer } from '@/dialer';

export type DialerStatus =
  | 'loading'
  | 'idle'
  | 'connecting'
  | 'ringing'
  | 'in-call'
  | 'error';

export interface CallTarget {
  phone: string;
  name?: string;
  company?: string;
  contactId?: string;
}

interface CallContextValue {
  status: DialerStatus;
  error: string | null;
  isMuted: boolean;
  callDuration: number;
  activeTarget: CallTarget | null;
  isBusy: boolean;
  isReady: boolean;
  startCall: (target: CallTarget) => void;
  hangup: () => void;
  toggleMute: () => void;
}

const CallContext = React.createContext<CallContextValue | null>(null);

/**
 * Provides a single, app-wide Twilio softphone. Mount once (in the app layout)
 * and call `useCall()` from anywhere — every <CallButton> shares this one
 * device, so we never spin up N tokens/devices for N rendered buttons.
 *
 * @param tenantId - Stamped onto each call log so reads stay tenant-scoped.
 */
export function CallProvider({
  tenantId,
  children,
}: {
  tenantId: string;
  children: React.ReactNode;
}) {
  const { status, error, isMuted, callDuration, call, hangup, toggleMute } =
    useDialer();
  const [activeTarget, setActiveTarget] = React.useState<CallTarget | null>(null);

  const isBusy = ['connecting', 'ringing', 'in-call'].includes(status);
  const isReady = status !== 'loading' && status !== 'error';

  // `activeTarget` is only ever read while a call is in progress (the bar and
  // CallButton's active state both gate on isBusy), so a stale value once idle
  // is harmless — the next startCall overwrites it. No reset effect needed.

  const startCall = React.useCallback(
    (target: CallTarget) => {
      if (!isReady || isBusy) return;
      setActiveTarget(target);
      call(target.phone, {
        tenantId,
        contactId: target.contactId,
        leadId: target.contactId,
        leadName: target.name,
        leadCompany: target.company,
      });
    },
    [call, isReady, isBusy, tenantId]
  );

  const value: CallContextValue = {
    status: status as DialerStatus,
    error,
    isMuted,
    callDuration,
    activeTarget,
    isBusy,
    isReady,
    startCall,
    hangup,
    toggleMute,
  };

  return (
    <CallContext.Provider value={value}>
      {children}
      <ActiveCallBar />
    </CallContext.Provider>
  );
}

export function useCall() {
  const ctx = React.useContext(CallContext);
  if (!ctx) throw new Error('useCall() must be used within a <CallProvider>');
  return ctx;
}

const STATUS_LABEL: Record<DialerStatus, string> = {
  loading: 'Connecting…',
  idle: 'Ready',
  connecting: 'Calling…',
  ringing: 'Ringing…',
  'in-call': 'In call',
  error: 'Dialer error',
};

function fmt(totalSeconds: number) {
  const m = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const s = String(totalSeconds % 60).padStart(2, '0');
  return `${m}:${s}`;
}

/** Floating call bar, visible whenever a call is in progress. */
function ActiveCallBar() {
  const { status, isBusy, isMuted, callDuration, activeTarget, hangup, toggleMute } =
    useCall();

  return (
    <AnimatePresence>
      {isBusy && (
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          className="fixed bottom-5 right-5 z-50 card p-4 shadow-2xl w-[20rem] max-w-[calc(100vw-2.5rem)]"
        >
          <div className="flex items-center gap-3">
            <div className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-accent)] text-white">
              <Phone className="h-4 w-4" />
              <span className="absolute inset-0 rounded-full ring-2 ring-[var(--color-primary)]/40 animate-ping" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold text-sm">
                {activeTarget?.name || activeTarget?.phone || 'Unknown'}
              </div>
              <div className="text-xs text-[var(--color-muted)]">
                {STATUS_LABEL[status]}
                {status === 'in-call' && (
                  <span className="ml-1 font-mono tabular-nums">· {fmt(callDuration)}</span>
                )}
              </div>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={toggleMute}
              disabled={status !== 'in-call'}
              className="btn-secondary flex-1 justify-center disabled:opacity-40"
            >
              {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              {isMuted ? 'Unmute' : 'Mute'}
            </button>
            <button
              type="button"
              onClick={hangup}
              className="btn-danger flex-1 justify-center"
            >
              {status === 'connecting' || status === 'ringing' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PhoneOff className="h-4 w-4" />
              )}
              Hang up
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
