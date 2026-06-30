import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { requireAuth } from '$lib/server/auth';
import { sendEmail } from '$lib/server/email';

export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (locals.demo) return json({ ok: true });

	requireAuth(locals);

	const { data: lead, error: dbErr } = await db
		.from('leads')
		.select('*')
		.eq('id', params.id)
		.single();
	if (dbErr || !lead) throw error(404, 'Lead not found');
	if (!lead.email) throw error(400, 'Lead has no email address');

	const body = (await request.json()) as {
		subject: string;
		emailBody: string;
		markContacted: boolean;
	};

	if (!body.subject?.trim()) throw error(400, 'subject is required');
	if (!body.emailBody?.trim()) throw error(400, 'emailBody is required');

	try {
		await sendEmail({
			to: lead.email as string,
			subject: body.subject,
			body: body.emailBody
		});
	} catch (e) {
		const msg = e instanceof Error ? e.message : 'SMTP send failed';
		throw error(502, msg);
	}

	const timestamp = new Date().toUTCString();
	const noteEntry = `Email sent: ${timestamp} — ${body.subject}`;
	const existingNotes = (lead.notes as string | null) ?? '';
	const updatedNotes = existingNotes ? `${existingNotes}\n${noteEntry}` : noteEntry;

	const updatePayload: Record<string, unknown> = {
		notes: updatedNotes,
		last_updated: new Date().toISOString()
	};

	if (body.markContacted && lead.status === 'cold') {
		updatePayload.status = 'contacted';
	}

	const { data: updated, error: updateErr } = await db
		.from('leads')
		.update(updatePayload)
		.eq('id', params.id)
		.select()
		.single();

	if (updateErr || !updated) throw error(500, 'Email sent but failed to update lead record');

	return json(updated);
};
