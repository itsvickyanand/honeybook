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
  return plugins.get(slug);
}

// Register baked-in plugins
import './travel';
import './photography';
