/**
 * Thin Sentry wrapper.
 * No-op if SENTRY_DSN is missing. Avoids pulling @sentry/nextjs into the bundle
 * for the typical demo run — production deploys can install @sentry/nextjs and
 * wire init() + an instrumentation file.
 */
import { logger } from './logger';

export function captureException(err: unknown, context?: Record<string, unknown>) {
  logger.error({ err: err instanceof Error ? err.message : String(err), ...context }, 'exception');
  // When Sentry is enabled, mirror to it:
  // if (sentryClient) sentryClient.captureException(err, { extra: context });
}

export function captureMessage(msg: string, context?: Record<string, unknown>) {
  logger.warn({ ...context }, msg);
}
