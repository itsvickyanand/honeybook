/**
 * Portal template schema.
 * A template = ordered list of section blocks + a theme.
 * The client portal renderer reads this and composes the page.
 */
export type SectionKind =
  | 'hero'
  | 'about'
  | 'scope'
  | 'gallery'
  | 'menu'
  | 'visa'
  | 'documents'
  | 'pay'
  | 'sign'
  | 'chat'
  | 'inclusions'
  | 'terms'
  | 'cta';

export interface SectionConfig {
  id: string;
  kind: SectionKind;
  visible: boolean;
  title?: string;
  // Per-kind config payload (free-form)
  data?: Record<string, unknown>;
}

export interface Theme {
  primary: string;
  accent: string;
  background: 'dark' | 'light';
  font: string;
  cornerRadius: 'sharp' | 'soft' | 'round';
}

export interface PortalTemplateData {
  theme: Theme;
  sections: SectionConfig[];
}

export function defaultTemplate(accent: string): PortalTemplateData {
  return {
    theme: { primary: '#8b5cf6', accent, background: 'dark', font: 'sans', cornerRadius: 'soft' },
    sections: [
      { id: 'sec-hero', kind: 'hero', visible: true },
      { id: 'sec-scope', kind: 'scope', visible: true, title: 'Scope & Pricing' },
      { id: 'sec-inc', kind: 'inclusions', visible: true, title: "What's included" },
      { id: 'sec-terms', kind: 'terms', visible: true, title: 'Terms' },
      { id: 'sec-cta', kind: 'cta', visible: true },
    ],
  };
}
