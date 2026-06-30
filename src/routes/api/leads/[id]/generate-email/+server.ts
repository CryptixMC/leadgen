import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { requireAuth } from '$lib/server/auth';
import { generateEmail } from '$lib/server/gemini';
import { fillTemplate } from '$lib/emailTemplates';

export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (locals.demo) return json({ subject: 'Demo mode — email generation disabled', body: '' });

	requireAuth(locals);

	const { data: lead, error: dbErr } = await db
		.from('leads')
		.select('*')
		.eq('id', params.id)
		.single();
	if (dbErr || !lead) throw error(404, 'Lead not found');

	const body = (await request.json()) as {
		templateSubject: string;
		templateBody: string;
		senderName: string;
		extraContext?: string;
	};

	if (!body.templateSubject || !body.templateBody || !body.senderName) {
		throw error(400, 'templateSubject, templateBody, and senderName are required');
	}

	const city = (lead.address as string)?.split(',')[1]?.trim() ?? '';
	const vars = {
		business_name: lead.business_name as string,
		city,
		sender_name: body.senderName
	};

	const filledSubject = fillTemplate(body.templateSubject, vars);
	const filledBody = fillTemplate(body.templateBody, vars);

	try {
		const generated = await generateEmail({
			lead: lead as never,
			templateSubject: filledSubject,
			templateBody: filledBody,
			senderName: body.senderName,
			extraContext: body.extraContext ?? ''
		});
		return json(generated);
	} catch (e) {
		const msg = e instanceof Error ? e.message : 'AI generation failed';
		throw error(502, msg);
	}
};
