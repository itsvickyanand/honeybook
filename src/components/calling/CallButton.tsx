'use client';
import * as React from 'react';
import { Phone, PhoneOff, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCall, type CallTarget } from './CallProvider';

interface CallButtonProps extends CallTarget {
  /**
   * "icon" = round icon button (cards/lists); "full" = labelled pill button;
   * "group" = flat segmented item to sit inside a divided pill group (matches
   * the Email/WhatsApp/SMS send menu).
   */
  variant?: 'icon' | 'full' | 'group';
  /** Label for the "full" variant (default "Call"). */
  label?: string;
  className?: string;
  /** Stop click from bubbling to a parent (e.g. a card wrapped in a <Link>). */
  stopPropagation?: boolean;
}

/**
 * Reusable one-click call button. Drop it anywhere there's a phone number —
 * Clients cards, contact detail, leads, projects, etc. It shares the app-wide
 * <CallProvider> device, shows a live state for the call it started, and turns
 * into a hang-up button while that call is active.
 */
export function CallButton({
  phone,
  name,
  company,
  contactId,
  variant = 'icon',
  label = 'Call',
  className,
  stopPropagation = true,
}: CallButtonProps) {
  const { startCall, hangup, activeTarget, isBusy, isReady, status } = useCall();

  // Is *this* button's call the one currently active?
  const isActive =
    isBusy &&
    activeTarget != null &&
    activeTarget.phone === phone &&
    (contactId ? activeTarget.contactId === contactId : true);

  const noPhone = !phone || !phone.trim();
  const disabled = noPhone || !isReady || (isBusy && !isActive);

  const onClick = (e: React.MouseEvent) => {
    if (stopPropagation) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (isActive) hangup();
    else startCall({ phone, name, company, contactId });
  };

  const title = noPhone
    ? 'No phone number'
    : !isReady
      ? 'Dialer connecting…'
      : isActive
        ? 'Hang up'
        : `Call ${name || phone}`;

  const busyThisCall = isActive && (status === 'connecting' || status === 'ringing');
  const Icon = busyThisCall ? Loader2 : isActive ? PhoneOff : Phone;

  if (variant === 'group') {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        title={title}
        className={cn(
          'px-3 py-2 inline-flex items-center gap-1.5 text-sm transition disabled:opacity-40 disabled:cursor-not-allowed',
          isActive ? 'text-[var(--color-danger)] hover:opacity-90' : 'text-[var(--color-muted)] hover:text-white',
          className
        )}
      >
        <Icon className={cn('h-3.5 w-3.5', busyThisCall && 'animate-spin')} />
        {isActive ? 'Hang up' : label}
      </button>
    );
  }

  if (variant === 'full') {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        title={title}
        className={cn(isActive ? 'btn-danger' : 'btn-secondary', className)}
      >
        <Icon className={cn('h-4 w-4', busyThisCall && 'animate-spin')} />
        {isActive ? 'Hang up' : label}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={cn(
        'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40',
        isActive
          ? 'bg-[var(--color-danger)] text-white border-transparent hover:opacity-90'
          : 'text-[var(--color-primary-soft)] hover:bg-[var(--color-primary)]/10 hover:border-[var(--color-primary)]/60',
        className
      )}
      style={{ borderColor: isActive ? 'transparent' : 'var(--color-border)' }}
    >
      <Icon className={cn('h-4 w-4', busyThisCall && 'animate-spin')} />
    </button>
  );
}
