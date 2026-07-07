import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth';
import { sendLeadEmailAndLog, LeadOpError } from '$lib/server/leadOperations';

export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (locals.demo) return json({ ok: true });

	requireAuth(locals);
	try {
		const body = (await request.json()) as {
			subject: string;
			emailBody: string;
			markContacted: boolean;
		};
		const updated = await sendLeadEmailAndLog(params.id, {
			subject: body.subject,
			emailBody: body.emailBody,
			markContacted: body.markContacted
		});
		return json(updated);
	} catch (e) {
		if (e instanceof LeadOpError) throw error(e.status, e.message);
		throw error(500, e instanceof Error ? e.message : 'Send failed');
	}
};
