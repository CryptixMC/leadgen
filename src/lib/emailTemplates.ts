export interface EmailTemplate {
	id: string;
	label: string;
	subject: string;
	body: string;
	condition?: (lead: LeadContext) => boolean;
}

export interface LeadContext {
	has_website: boolean;
	pagespeed_mobile: number | null;
	mobile_friendly: boolean | null;
	status: string;
}

export const EMAIL_TEMPLATES: EmailTemplate[] = [
	{
		id: 'no_website',
		label: 'No Website',
		subject: "Quick question about {{business_name}}'s online presence",
		body: `Hi there,

I was looking up local businesses in {{city}} and came across {{business_name}}. I noticed you don't have a website yet — in today's market, that could mean missing out on a lot of customers searching online.

I help small businesses like yours get a professional web presence quickly and affordably. Would you be open to a quick chat about what that might look like for {{business_name}}?

Best,
{{sender_name}}`,
		condition: (l) => !l.has_website
	},
	{
		id: 'poor_performance',
		label: 'Poor Web Performance',
		subject: "{{business_name}}'s website might be losing you customers",
		body: `Hi there,

I recently checked {{business_name}}'s website and noticed it has some technical issues — slow load times and mobile-friendliness problems — that can hurt your Google ranking and drive visitors away before they even see what you offer.

I specialize in fixing exactly these issues for local businesses in {{city}}. A faster, mobile-friendly site can make a real difference in how many customers find and contact you.

Would you be interested in a free site audit? I'd love to show you what I found and how we can improve it.

Best,
{{sender_name}}`,
		condition: (l) =>
			l.has_website &&
			((l.pagespeed_mobile !== null && l.pagespeed_mobile < 50) || l.mobile_friendly === false)
	},
	{
		id: 'cold_general',
		label: 'Cold Outreach — General',
		subject: 'Helping {{business_name}} grow online',
		body: `Hi there,

I came across {{business_name}} while researching businesses in {{city}} and wanted to reach out. I work with local businesses to improve their online presence — websites, search visibility, and digital marketing.

I'd love to learn more about your goals and see if there's a way I can help {{business_name}} reach more customers online.

Would you have 15 minutes for a quick call this week?

Best,
{{sender_name}}`
	},
	{
		id: 'follow_up',
		label: 'Follow-Up',
		subject: 'Following up — {{business_name}}',
		body: `Hi there,

I wanted to follow up on my previous message about {{business_name}}'s online presence. I know you're busy, so I'll keep it short — I genuinely think there's an opportunity here to bring more customers through the door.

Would a brief call at your convenience work? Happy to work around your schedule.

Best,
{{sender_name}}`,
		condition: (l) => l.status === 'contacted'
	},
	{
		id: 'gbp_seo',
		label: 'Local SEO / Google Presence',
		subject: 'Is {{business_name}} showing up on Google?',
		body: `Hi there,

I was researching businesses in {{city}} and wanted to reach out to {{business_name}}. Getting found on Google Maps and in local search results is one of the highest-ROI things a local business can do right now.

I help businesses optimize their Google Business Profile and local SEO so more customers in {{city}} discover them first. Would you be open to hearing what that could look like for you?

Best,
{{sender_name}}`
	}
];

export function fillTemplate(text: string, vars: Record<string, string>): string {
	return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}
