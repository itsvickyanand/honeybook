/**
 * Lightweight i18n. Drives client portal language from tenant.locale.
 *
 * For deeper i18n (route-based, all UI), swap in next-intl later.
 * This module is intentionally tiny.
 */
import en from './messages/en.json';
import hi from './messages/hi.json';
import ar from './messages/ar.json';

const DICTS: Record<string, Record<string, string>> = { en, hi, ar };

export function isRTL(locale: string): boolean {
  return locale.toLowerCase().startsWith('ar') || locale.toLowerCase().startsWith('he');
}

export function localeLanguage(locale: string): string {
  return (locale.split('-')[0] || 'en').toLowerCase();
}

export function t(locale: string, key: string, fallback?: string): string {
  const lang = localeLanguage(locale);
  return DICTS[lang]?.[key] ?? DICTS.en?.[key] ?? fallback ?? key;
}
