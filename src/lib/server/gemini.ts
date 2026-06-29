import { GoogleGenerativeAI } from '@google/generative-ai';
import { GEMINI_API_KEY } from '$env/static/private';
import type { Lead } from '$lib/api';

export interface GenerateEmailInput {
	lead: Lead;
	templateSubject: string;
	templateBody: string;
	senderName: string;
	extraContext: string;
}

export interface GeneratedEmail {
	subject: string;
	body: string;
}

function buildPrompt(input: GenerateEmailInput): string {
	const { lead, templateSubject, templateBody, senderName, extraContext } = input;
	const city = (lead.address ?? '').split(',')[1]?.trim() ?? '';

	const leadSummary = [
		`Business name: ${lead.business_name}`,
		`Address: ${lead.address}`,
		`Phone: ${lead.phone ?? 'unknown'}`,
		`Website: ${lead.website_url ?? 'none'}`,
		`Has website: ${lead.has_website}`,
		`Has HTTPS: ${lead.has_https}`,
		`Mobile friendly: ${lead.mobile_friendly ?? 'unknown'}`,
		`PageSpeed mobile: ${lead.pagespeed_mobile ?? 'unknown'} / 100`,
		`PageSpeed desktop: ${lead.pagespeed_desktop ?? 'unknown'} / 100`,
		`SEO score: ${lead.pagespeed_seo ?? 'unknown'} / 100`,
		`Best practices: ${lead.pagespeed_best_practices ?? 'unknown'} / 100`,
		`Google rating: ${lead.google_rating ?? 'unknown'} (${lead.review_count} reviews)`,
		`Has Google Business Profile: ${lead.has_gbp}`,
		`Also on Yelp: ${lead.also_on_yelp ?? 'unknown'}`,
		`Site age estimate: ${lead.site_age_estimate ?? 'unknown'}`,
		`Lead score: ${lead.lead_score ?? 'unknown'} / 100`,
		`Current status: ${lead.status}`,
		`Notes: ${lead.notes ?? 'none'}`
	].join('\n');

	return `You are writing a personalized cold outreach email on behalf of a web consultant named ${senderName}.

## Lead Data
${leadSummary}

## Template to Personalize
Subject: ${templateSubject}
Body:
${templateBody}

## Additional Context from Sender
${extraContext || 'None provided.'}

## Instructions
- The template already has placeholders filled in. Use the lead data to add specific, personalized details.
- Mention specific issues you noticed (e.g. exact PageSpeed score, mobile issues, no website, few reviews).
- Keep the tone conversational and professional — not pushy or salesy.
- Keep the body concise: 3–5 short paragraphs maximum.
- Do NOT invent contact details or make claims not supported by the lead data.
- Return ONLY valid JSON in this exact format, no markdown fences, no extra text:
{"subject":"...","body":"..."}`;
}

function parseRetryDelayMs(err: unknown): number {
	const msg = err instanceof Error ? err.message : String(err);
	const match = msg.match(/retry in ([\d.]+)s/i);
	return match ? Math.ceil(parseFloat(match[1]) * 1000) + 200 : 3000;
}

function is429(err: unknown): boolean {
	const msg = err instanceof Error ? err.message : String(err);
	return msg.includes('429') || msg.includes('Too Many Requests');
}

export async function generateEmail(input: GenerateEmailInput): Promise<GeneratedEmail> {
	if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not configured');

	const model = new GoogleGenerativeAI(GEMINI_API_KEY).getGenerativeModel({
		model: 'gemini-2.0-flash',
		generationConfig: {
			temperature: 0.7,
			maxOutputTokens: 1024,
			responseMimeType: 'application/json'
		}
	});

	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			const result = await model.generateContent(buildPrompt(input));
			const text = result.response.text().trim();

			let parsed: GeneratedEmail;
			try {
				parsed = JSON.parse(text);
			} catch {
				throw new Error(`Gemini returned unexpected response: ${text.slice(0, 200)}`);
			}

			if (!parsed.subject || !parsed.body) {
				throw new Error('Gemini response missing subject or body');
			}

			return { subject: parsed.subject, body: parsed.body };
		} catch (err) {
			if (is429(err)) {
				if (attempt < 2) await new Promise((r) => setTimeout(r, parseRetryDelayMs(err)));
			} else {
				throw err;
			}
		}
	}

	throw new Error('Gemini rate limit reached — please wait a moment and try again');
}
