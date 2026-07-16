import { db } from './db';
import { diceCoefficient } from './enrichment';

interface LeadRow {
	id: string;
	business_name: string;
	address: string | null;
	email: string | null;
	website_url: string | null;
}

const NAME_SIMILARITY_THRESHOLD = 0.85;

function rootDomain(url: string | null): string | null {
	if (!url) return null;
	try {
		return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
	} catch {
		return null;
	}
}

function addressFirstToken(address: string | null): string {
	if (!address) return '';
	return address.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
}

/**
 * Cross-references every non-hidden lead against every other one to flag likely
 * large-corp/multi-location businesses — a bad fit for small-business outreach even
 * though a real, verifiable contact was found. Three signals, in order of confidence:
 * an identical contact email shared across leads (e.g. a franchise's central
 * "privacy officer" address), an identical website root domain, and a fuzzy business
 * name match at a distinct address (same brand, different location).
 *
 * Re-flags from scratch each run (clears stale flags first) so it stays correct as
 * leads' emails/websites change between runs, rather than only ever adding flags.
 */
export async function detectBadFitLeads(): Promise<{ flagged: number; checked: number }> {
	const { data, error } = await db
		.from('leads')
		.select('id, business_name, address, email, website_url')
		.eq('hidden', false);
	if (error) throw new Error(error.message);

	const leads = (data ?? []) as LeadRow[];
	const flagged = new Map<string, string>();

	const byEmail = new Map<string, LeadRow[]>();
	for (const lead of leads) {
		if (!lead.email) continue;
		const key = lead.email.toLowerCase();
		if (!byEmail.has(key)) byEmail.set(key, []);
		byEmail.get(key)!.push(lead);
	}
	for (const [email, group] of byEmail) {
		if (group.length < 2) continue;
		for (const lead of group) {
			flagged.set(
				lead.id,
				`Same contact email (\`${email}\`) is shared with ${group.length - 1} other lead(s) — likely a multi-location/franchise business, not a distinct owner-operated prospect.`
			);
		}
	}

	const byDomain = new Map<string, LeadRow[]>();
	for (const lead of leads) {
		const domain = rootDomain(lead.website_url);
		if (!domain) continue;
		if (!byDomain.has(domain)) byDomain.set(domain, []);
		byDomain.get(domain)!.push(lead);
	}
	for (const [domain, group] of byDomain) {
		if (group.length < 2) continue;
		for (const lead of group) {
			if (flagged.has(lead.id)) continue;
			flagged.set(
				lead.id,
				`Website domain (\`${domain}\`) is shared with ${group.length - 1} other lead(s) — likely the same multi-location business.`
			);
		}
	}

	// Bucket by first address token (street number) to avoid an O(n^2) scan over
	// the whole table — same-chain duplicates observed in practice share a city/area.
	const byAddressToken = new Map<string, LeadRow[]>();
	for (const lead of leads) {
		if (flagged.has(lead.id)) continue;
		const token = addressFirstToken(lead.address);
		if (!byAddressToken.has(token)) byAddressToken.set(token, []);
		byAddressToken.get(token)!.push(lead);
	}
	for (const group of byAddressToken.values()) {
		for (let i = 0; i < group.length; i++) {
			for (let j = i + 1; j < group.length; j++) {
				const a = group[i];
				const b = group[j];
				if (a.address && b.address && a.address === b.address) continue;
				const sim = diceCoefficient(a.business_name.toLowerCase(), b.business_name.toLowerCase());
				if (sim < NAME_SIMILARITY_THRESHOLD) continue;
				if (!flagged.has(a.id)) {
					flagged.set(
						a.id,
						`Business name closely matches "${b.business_name}" at a different address — likely the same multi-location business.`
					);
				}
				if (!flagged.has(b.id)) {
					flagged.set(
						b.id,
						`Business name closely matches "${a.business_name}" at a different address — likely the same multi-location business.`
					);
				}
			}
		}
	}

	// Clear stale flags before re-applying — keeps repeated runs correct as leads change.
	await db.from('leads').update({ possible_bad_fit: false, bad_fit_reason: null }).eq('hidden', false).eq('possible_bad_fit', true);

	let flaggedCount = 0;
	for (const [id, reason] of flagged) {
		const { error: updateErr } = await db
			.from('leads')
			.update({ possible_bad_fit: true, bad_fit_reason: reason })
			.eq('id', id);
		if (!updateErr) flaggedCount++;
	}

	return { flagged: flaggedCount, checked: leads.length };
}
