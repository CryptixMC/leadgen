import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth';
import { generateLeadEmailDraft, LeadOpError } from '$lib/server/leadOperations';

export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (locals.demo) return json({ subject: 'Demo mode — email generation disabled', body: '' });

	requireAuth(locals);
	try {
		const body = (await request.json()) as {
			templateSubject: string;
			templateBody: string;
			senderName: string;
			extraContext?: string;
		};
		const generated = await generateLeadEmailDraft(params.id, {
			templateSubject: body.templateSubject,
			templateBody: body.templateBody,
			senderName: body.senderName,
			extraContext: body.extraContext
		});
		return json(generated);
	} catch (e) {
		if (e instanceof LeadOpError) throw error(e.status, e.message);
		throw error(500, e instanceof Error ? e.message : 'AI generation failed');
	}
};
