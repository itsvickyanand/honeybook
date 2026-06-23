/**
 * Starter form templates — the 4 shapes a vendor can clone via the "Create
 * new" dropdown on /app/forms.
 *
 * Each template includes:
 *   - key            stable identifier (used in API requests)
 *   - label / blurb  shown in the picker + preview modal
 *   - formType       LeadForm.formType
 *   - category       LeadForm.category (LEAD vs CONTACT)
 *   - actionTags     visible chips on the card (Services / Scheduler / Invoice / Questions)
 *   - title / description / fields  copy + structure used as the LeadForm defaults
 *   - actions        post-submit action chain (Phase 2 runtime — stored from Phase 1)
 *
 * After picking a template, the vendor lands in the existing form editor where
 * EVERY field below is fully editable — the starter is a starting point, not
 * a lock-in. That's how we keep "customization" promised at pick time.
 */
export type FormFieldType = 'text' | 'email' | 'phone' | 'textarea' | 'select' | 'number';

export interface StarterField {
  name: string;
  label: string;
  type: FormFieldType;
  required?: boolean;
  options?: string[];
  placeholder?: string;
}

/** Tags rendered as chips on each template card — matches the screenshot. */
export type ActionTag = 'Services' | 'Scheduler' | 'Invoice' | 'Questions' | 'Pay';

/** A single Phase-2 post-submit action. The submit route will iterate these. */
export interface FormAction {
  type:
    | 'create_lead'
    | 'create_contact_only'
    | 'ai_draft_proposal'
    | 'book_meeting'
    | 'send_invoice'
    | 'enroll_drip'
    | 'notify_internal'
    | 'redirect';
  props?: Record<string, unknown>;
}

export interface StarterFormTemplate {
  key: string;
  label: string;
  blurb: string;
  formType: 'INQUIRY' | 'QUOTE_REQUEST' | 'DISCOVERY_CALL' | 'INSTANT_BOOKING' | 'PARTNERSHIP' | 'CONTACT_ONLY' | 'CUSTOM';
  category: 'LEAD' | 'CONTACT';
  actionTags: ActionTag[];
  defaults: {
    name: string;
    title: string;
    description: string;
    fields: StarterField[];
  };
  actions: FormAction[];
}

// ─── 1. Inquiry — catch-all for any lead ──────────────────────────────────────
export const inquiryTemplate: StarterFormTemplate = {
  key: 'inquiry',
  label: 'Inquiry form',
  blurb: 'A simple catch-all for incoming leads — name, contact, and what they need.',
  formType: 'INQUIRY',
  category: 'LEAD',
  actionTags: ['Questions'],
  defaults: {
    name: 'Inquiry form',
    title: 'Get in touch',
    description: 'Tell us about your project and we will be in touch within a working day.',
    fields: [
      { name: 'name', label: 'Your name', type: 'text', required: true },
      { name: 'email', label: 'Email', type: 'email', required: true },
      { name: 'phone', label: 'Phone (WhatsApp)', type: 'phone' },
      { name: 'message', label: 'What can we help with?', type: 'textarea', required: true,
        placeholder: 'Briefly tell us about your project, dates, and how we can help.' },
    ],
  },
  actions: [
    { type: 'create_lead' },
    { type: 'enroll_drip', props: { trigger: 'lead.created' } },
    { type: 'notify_internal' },
  ],
};

// ─── 2. Quote request — feeds the AI proposal generator ───────────────────────
export const quoteRequestTemplate: StarterFormTemplate = {
  key: 'quote-request',
  label: 'Quote request',
  blurb: 'Capture event details so the AI can draft a proposal automatically.',
  formType: 'QUOTE_REQUEST',
  category: 'LEAD',
  actionTags: ['Services', 'Questions'],
  defaults: {
    name: 'Quote request',
    title: 'Request a quote',
    description: 'Share the details and we will send back a draft proposal — usually same day.',
    fields: [
      { name: 'name', label: 'Your name', type: 'text', required: true },
      { name: 'email', label: 'Email', type: 'email', required: true },
      { name: 'phone', label: 'Phone (WhatsApp)', type: 'phone', required: true },
      { name: 'eventType', label: 'Type of event', type: 'select', required: true,
        options: ['Wedding', 'Reception', 'Engagement', 'Corporate', 'Birthday', 'Other'] },
      { name: 'eventDate', label: 'Event date', type: 'text', placeholder: 'e.g. 12 Dec 2026' },
      { name: 'guestCount', label: 'Expected guest count', type: 'number' },
      { name: 'venue', label: 'Venue / city', type: 'text' },
      { name: 'budget', label: 'Approximate budget (₹)', type: 'text', placeholder: 'e.g. 5-7 lakhs' },
      { name: 'message', label: 'Anything else we should know?', type: 'textarea',
        placeholder: 'Dietary preferences, must-haves, references…' },
    ],
  },
  actions: [
    { type: 'create_lead' },
    { type: 'ai_draft_proposal' },  // Stage-A/B/C from the brief
    { type: 'enroll_drip', props: { trigger: 'lead.created' } },
    { type: 'notify_internal' },
  ],
};

// ─── 3. Discovery call — embeds the scheduler ─────────────────────────────────
export const discoveryCallTemplate: StarterFormTemplate = {
  key: 'discovery-call',
  label: 'Discovery call',
  blurb: 'Let prospects book a 30-min intro call straight from the form.',
  formType: 'DISCOVERY_CALL',
  category: 'LEAD',
  actionTags: ['Scheduler', 'Questions'],
  defaults: {
    name: 'Discovery call',
    title: 'Book a discovery call',
    description: 'Pick a slot and tell us a little about your project — we will jump on a 30-minute call to align.',
    fields: [
      { name: 'name', label: 'Your name', type: 'text', required: true },
      { name: 'email', label: 'Email', type: 'email', required: true },
      { name: 'phone', label: 'Phone', type: 'phone' },
      { name: 'message', label: 'What would you like to discuss?', type: 'textarea', required: true,
        placeholder: 'Project type, timeline, anything specific you want to cover.' },
    ],
  },
  actions: [
    { type: 'create_lead' },
    { type: 'book_meeting' }, // props.meetingTypeSlug to be filled by vendor in the editor
    { type: 'notify_internal' },
  ],
};

// ─── 4. Contact only — no lead, just a touchpoint ─────────────────────────────
export const contactOnlyTemplate: StarterFormTemplate = {
  key: 'contact-only',
  label: 'Contact form',
  blurb: 'Adds a contact to your address book without creating a project or lead.',
  formType: 'CONTACT_ONLY',
  category: 'CONTACT',
  actionTags: ['Questions'],
  defaults: {
    name: 'Contact us',
    title: 'Get in touch',
    description: 'Drop us a line — we read every message.',
    fields: [
      { name: 'name', label: 'Your name', type: 'text', required: true },
      { name: 'email', label: 'Email', type: 'email', required: true },
      { name: 'message', label: 'Your message', type: 'textarea', required: true },
    ],
  },
  actions: [
    { type: 'create_contact_only' },
    { type: 'notify_internal' },
  ],
};

export const STARTER_FORM_TEMPLATES: StarterFormTemplate[] = [
  inquiryTemplate,
  quoteRequestTemplate,
  discoveryCallTemplate,
  contactOnlyTemplate,
];

export function findStarterTemplate(key: string): StarterFormTemplate | null {
  return STARTER_FORM_TEMPLATES.find((t) => t.key === key) ?? null;
}
