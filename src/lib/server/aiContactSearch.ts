import { env } from '$env/dynamic/private';

// Uses $env/dynamic/private (not static) because this key is brand new and won't yet be
// configured in every deployment target — static env vars must exist at build time or the
// build itself fails to resolve the import; dynamic ones are read at request time instead.
const ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL = 'claude-3-5-haiku-latest';

const SIMPLE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface AnthropicContentBlock {
	type: string;
	text?: string;
}

function buildPrompt(businessName: string, address: string, websiteUrl: string | null): string {
	return `Find the public contact email and phone number for this specific business, using only information you can confirm from the business's own official website — not third-party directories, review sites, or data brokers (e.g. not ZoomInfo, RocketReach, Yellow Pages, BBB).

Business name: ${businessName}
Address: ${address}
${websiteUrl ? `Known website: ${websiteUrl}` : 'No known website — search for the business by name and address to find it first.'}

If you cannot confirm a value directly from the business's own site, return null for that field rather than guessing a format or reusing an unrelated result.

Return ONLY valid JSON, no markdown fences, no extra text, in this exact format:
{"email": "..." or null, "phone": "..." or null}`;
}

/**
 * Last-resort contact lookup for Find Contact: uses Claude's hosted web-search tool to find
 * a business's own published email/phone when the on-site crawl and social bios come up
 * empty. Results are inherently less certain than a direct page fetch — callers should treat
 * a found email as unverified.
 */
export async function searchContactViaAI(
	businessName: string,
	address: string,
	websiteUrl: string | null
): Promise<{ email: string | null; phone: string | null }> {
	if (!ANTHROPIC_API_KEY || !businessName) return { email: null, phone: null };

	try {
		const resp = await fetch(ANTHROPIC_API_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': ANTHROPIC_API_KEY,
				'anthropic-version': '2023-06-01'
			},
			body: JSON.stringify({
				model: ANTHROPIC_MODEL,
				max_tokens: 1024,
				tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
				messages: [{ role: 'user', content: buildPrompt(businessName, address, websiteUrl) }]
			}),
			signal: AbortSignal.timeout(20_000)
		});
		if (!resp.ok) return { email: null, phone: null };

		const data = await resp.json();
		const blocks = (data.content ?? []) as AnthropicContentBlock[];
		const text = blocks
			.filter((b) => b.type === 'text' && typeof b.text === 'string')
			.map((b) => b.text)
			.join('')
			.trim();

		const jsonMatch = text.match(/\{[\s\S]*\}/);
		if (!jsonMatch) return { email: null, phone: null };

		const parsed = JSON.parse(jsonMatch[0]);
		const email = typeof parsed.email === 'string' && SIMPLE_EMAIL_RE.test(parsed.email) ? parsed.email : null;
		const phone = typeof parsed.phone === 'string' && parsed.phone.trim() ? parsed.phone.trim() : null;
		return { email, phone };
	} catch {
		return { email: null, phone: null };
	}
}
