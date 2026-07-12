import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as leadOps from './leadOperations';
import * as clientOps from './clientOperations';
import { runScrape, runScrapePolygon } from './scraper';

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean };

function ok(data: unknown): ToolResult {
	return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function fail(e: unknown): ToolResult {
	return { content: [{ type: 'text', text: e instanceof Error ? e.message : 'Unknown error' }], isError: true };
}

export function registerLeadTools(server: McpServer) {
	server.registerTool(
		'list_leads',
		{
			description: 'List leads, optionally filtered by status/priority. Hidden leads are excluded unless include_hidden is set.',
			inputSchema: {
				status: z.string().optional().describe("e.g. 'cold', 'contacted', 'proposal', 'closed_won', 'closed_lost'"),
				priority: z.enum(['high', 'medium', 'low']).optional(),
				include_hidden: z.boolean().optional()
			}
		},
		async ({ status, priority, include_hidden }) => {
			try {
				return ok(await leadOps.listLeads({ status, priority, includeHidden: include_hidden }));
			} catch (e) {
				return fail(e);
			}
		}
	);

	server.registerTool(
		'get_lead',
		{ description: 'Get a single lead by id.', inputSchema: { id: z.string() } },
		async ({ id }) => {
			try {
				return ok(await leadOps.getLead(id));
			} catch (e) {
				return fail(e);
			}
		}
	);

	server.registerTool(
		'create_lead',
		{
			description: 'Create a manual lead.',
			inputSchema: {
				business_name: z.string(),
				address: z.string().optional(),
				phone: z.string().optional(),
				website_url: z.string().optional(),
				email: z.string().optional(),
				google_rating: z.number().optional(),
				review_count: z.number().optional(),
				notes: z.string().optional()
			}
		},
		async (input) => {
			try {
				return ok(await leadOps.createLead(input));
			} catch (e) {
				return fail(e);
			}
		}
	);

	server.registerTool(
		'update_lead',
		{
			description:
				'Update a lead. Recomputes lead_score/priority if website_url or email changes. Setting status to closed_won auto-creates a client record.',
			inputSchema: {
				id: z.string(),
				status: z.string().optional(),
				notes: z.string().optional(),
				hidden: z.boolean().optional(),
				business_name: z.string().optional(),
				address: z.string().optional(),
				phone: z.string().optional(),
				email: z.string().optional(),
				website_url: z.string().optional()
			}
		},
		async ({ id, ...rest }) => {
			try {
				return ok(await leadOps.updateLead(id, rest));
			} catch (e) {
				return fail(e);
			}
		}
	);

	server.registerTool(
		'delete_leads',
		{
			description:
				'Delete one or more leads by id. Requires confirmation: call without confirm first to preview what would be deleted, then call again with confirm: true to actually delete.',
			inputSchema: {
				ids: z.array(z.string()).min(1),
				confirm: z
					.boolean()
					.optional()
					.describe('Must be true to actually delete. Omit or false to preview first.')
			}
		},
		async ({ ids, confirm }) => {
			try {
				if (!confirm) {
					const leads = await leadOps.getLeadsSummary(ids);
					return ok({
						message: `This will permanently delete ${leads.length} lead(s). Call delete_leads again with confirm: true to proceed.`,
						leads
					});
				}
				return ok(await leadOps.deleteLeads(ids));
			} catch (e) {
				return fail(e);
			}
		}
	);

	server.registerTool(
		'enrich_lead',
		{
			description: 'Run the enrichment pipeline (PageSpeed, Yelp, DuckDuckGo, etc.) on one lead and rescore it.',
			inputSchema: { id: z.string(), deep: z.boolean().optional() }
		},
		async ({ id, deep }) => {
			try {
				return ok(await leadOps.enrichLead(id, { deep }));
			} catch (e) {
				return fail(e);
			}
		}
	);

	server.registerTool(
		'rescore_leads',
		{
			description:
				'Re-enrich and rescore leads. By default only leads not updated in the last 24h; pass force to rescore all. Can be slow on large tables.',
			inputSchema: { force: z.boolean().optional() }
		},
		async ({ force }) => {
			try {
				return ok(await leadOps.rescoreLeads({ force }));
			} catch (e) {
				return fail(e);
			}
		}
	);

	server.registerTool(
		'geocode_missing_leads',
		{ description: 'Backfill latitude/longitude for leads missing geocoding.', inputSchema: {} },
		async () => {
			try {
				return ok(await leadOps.geocodeMissingLeads());
			} catch (e) {
				return fail(e);
			}
		}
	);

	server.registerTool(
		'trigger_scrape',
		{
			description: 'Run a Google Places scrape (by category+city, or a drawn polygon) and upsert results as leads.',
			inputSchema: {
				category: z.string().describe("business category keyword, or '*' for all businesses"),
				city: z.string().optional().describe('required unless polygon is provided'),
				target: z.number().int().positive().default(60),
				neighborhood: z.string().optional(),
				polygon: z.array(z.tuple([z.number(), z.number()])).min(3).optional()
			}
		},
		async ({ category, city, target, neighborhood, polygon }) => {
			try {
				if (polygon) return ok(await runScrapePolygon(category, polygon, target));
				if (!city) return fail(new Error('city or polygon is required'));
				return ok(await runScrape(category, city, target, neighborhood));
			} catch (e) {
				return fail(e);
			}
		}
	);

	server.registerTool(
		'generate_lead_email',
		{
			description: 'Generate an AI-personalized outreach email draft for a lead via Gemini.',
			inputSchema: {
				id: z.string(),
				template_subject: z.string(),
				template_body: z.string(),
				sender_name: z.string(),
				extra_context: z.string().optional()
			}
		},
		async ({ id, template_subject, template_body, sender_name, extra_context }) => {
			try {
				return ok(
					await leadOps.generateLeadEmailDraft(id, {
						templateSubject: template_subject,
						templateBody: template_body,
						senderName: sender_name,
						extraContext: extra_context
					})
				);
			} catch (e) {
				return fail(e);
			}
		}
	);

	server.registerTool(
		'list_clients',
		{ description: 'List converted clients.', inputSchema: {} },
		async () => {
			try {
				return ok(await clientOps.listClients());
			} catch (e) {
				return fail(e);
			}
		}
	);

	server.registerTool(
		'get_client',
		{ description: 'Get a single client by id.', inputSchema: { id: z.string() } },
		async ({ id }) => {
			try {
				return ok(await clientOps.getClient(id));
			} catch (e) {
				return fail(e);
			}
		}
	);
}
