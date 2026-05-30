/**
 * Vertical plugin registry.
 *
 * Plugins customize behavior per business type without forking core.
 * Hooks (current set; more can be added as the surface stabilises):
 *
 *   afterProposalGenerated(ctx) — mutate or add sections after Stage E
 *   defaultPortalTemplate(ctx)  — return a starter template for new tenants
 *   defaultDocumentPacks(ctx)   — auto-create documents (visa pack, contract)
 *
 * Plugins are pure functions registered at module load. The registry returns
 * the plugin for a given businessTypeSlug; verticals without one fall through
 * to the default behavior.
 */
import type { ProposalDoc } from '../proposal-schema';
import type { PortalTemplateData } from '../portal/types';

export interface PluginContext {
  tenantId: string;
  businessTypeSlug: string;
}

export interface VerticalPlugin {
  slug: string;
  afterProposalGenerated?: (ctx: PluginContext, doc: ProposalDoc) => ProposalDoc | Promise<ProposalDoc>;
  defaultPortalTemplate?: (ctx: PluginContext, base: PortalTemplateData) => PortalTemplateData;
  defaultDocumentPacks?: (ctx: PluginContext) => { title: string; category: string }[];
}

const plugins = new Map<string, VerticalPlugin>();

export function registerPlugin(p: VerticalPlugin) {
  plugins.set(p.slug, p);
}

export function getPlugin(slug: string): VerticalPlugin | undefined {
  // Lazy boot the baked-in plugins on first access. This avoids a circular
  // initialization issue under Turbopack where registry.ts is imported before
  // the plugin files have fully bound their `registerPlugin` references.
  ensureBaked();
  return plugins.get(slug);
}

let baked = false;
function ensureBaked() {
  if (baked) return;
  baked = true;
  // Side-effect imports: each calls registerPlugin()
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('./travel');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('./photography');
}
