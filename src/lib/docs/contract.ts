import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export interface ContractData {
	clientName: string;
	clientAddress: string;
	serviceDesc: string;
	projectValue: number;
	mrr: number;
	startDate: string;
	paymentTerms: string;
	fromEmail?: string;
	fromWebsite?: string;
}

const BLACK      = rgb(0,    0,    0);
const GRAY       = rgb(0.4,  0.4,  0.4);
const LIGHT_GRAY = rgb(0.75, 0.75, 0.75);
const PURPLE     = rgb(0.55, 0.2,  0.85);

function fmt$(n: number): string {
	return '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function wrapText(text: string, font: import('pdf-lib').PDFFont, size: number, maxWidth: number): string[] {
	const words = text.split(' ');
	const lines: string[] = [];
	let current = '';
	for (const word of words) {
		const test = current ? current + ' ' + word : word;
		if (font.widthOfTextAtSize(test, size) > maxWidth && current) {
			lines.push(current);
			current = word;
		} else {
			current = test;
		}
	}
	if (current) lines.push(current);
	return lines;
}

export async function generateContract(data: ContractData): Promise<Uint8Array> {
	const doc  = await PDFDocument.create();
	const page = doc.addPage([595, 842]);
	const { width, height } = page.getSize();

	const bold    = await doc.embedFont(StandardFonts.HelveticaBold);
	const regular = await doc.embedFont(StandardFonts.Helvetica);

	const L         = 50;
	const R         = width - 50;
	const textWidth = R - L;

	const fromEmail   = data.fromEmail   ?? 'liam@liamnicholson.ca';
	const fromWebsite = data.fromWebsite ?? 'liamnicholson.ca';

	let y = height - 50;

	function sectionLabel(label: string) {
		y -= 6;
		page.drawText('// ' + label, { x: L, y, font: bold, size: 8, color: PURPLE });
		y -= 14;
	}

	function drawParagraph(text: string, size = 10) {
		const lines = wrapText(text, regular, size, textWidth);
		for (const line of lines) {
			page.drawText(line, { x: L, y, font: regular, size, color: BLACK });
			y -= size + 4;
		}
	}

	// ── Header ──────────────────────────────────────────────────────────────────
	page.drawText('Liam Nicholson', { x: L, y, font: bold, size: 20, color: BLACK });
	y -= 18;
	page.drawText('Business Tech Consultant', { x: L, y, font: regular, size: 10, color: GRAY });
	y -= 18;
	page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 0.75, color: LIGHT_GRAY });
	y -= 22;

	// ── Three-column info block: FROM | CLIENT | EFFECTIVE DATE ───────────────
	const col1 = L;
	const col2 = L + 170;
	const col3 = L + 350;

	page.drawText('// FROM',           { x: col1, y, font: bold, size: 8, color: PURPLE });
	page.drawText('// CLIENT',         { x: col2, y, font: bold, size: 8, color: PURPLE });
	page.drawText('// EFFECTIVE DATE', { x: col3, y, font: bold, size: 8, color: PURPLE });
	y -= 14;

	let fy = y;
	page.drawText('Liam Nicholson',           { x: col1, y: fy, font: bold,    size: 10, color: BLACK }); fy -= 13;
	page.drawText('Business Tech Consultant', { x: col1, y: fy, font: regular, size: 9,  color: GRAY  }); fy -= 13;
	page.drawText('Winnipeg, MB',             { x: col1, y: fy, font: regular, size: 9,  color: GRAY  }); fy -= 13;
	page.drawText(fromEmail,                  { x: col1, y: fy, font: regular, size: 9,  color: GRAY  });

	let cy = y;
	page.drawText(data.clientName, { x: col2, y: cy, font: bold,    size: 10, color: BLACK }); cy -= 13;
	if (data.clientAddress) {
		page.drawText(data.clientAddress, { x: col2, y: cy, font: regular, size: 9, color: GRAY });
	}

	page.drawText(data.startDate, { x: col3, y, font: regular, size: 10, color: BLACK });

	y -= 58;
	page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 0.75, color: LIGHT_GRAY });
	y -= 20;

	// ── Title ─────────────────────────────────────────────────────────────────
	const title  = 'Service Agreement';
	const titleW = bold.widthOfTextAtSize(title, 16);
	page.drawText(title, { x: (width - titleW) / 2, y, font: bold, size: 16, color: BLACK });
	y -= 28;

	// ── Parties ───────────────────────────────────────────────────────────────
	sectionLabel('PARTIES');
	drawParagraph(
		`This agreement is between Liam Nicholson ("Consultant"), operating from Winnipeg, Manitoba, Canada, and ${data.clientName} ("Client"), located at ${data.clientAddress}.`
	);
	y -= 4;

	// ── Scope of Services ─────────────────────────────────────────────────────
	sectionLabel('SCOPE OF SERVICES');
	drawParagraph(data.serviceDesc);
	y -= 4;

	// ── Fees ──────────────────────────────────────────────────────────────────
	sectionLabel('FEES');
	if (data.projectValue > 0) {
		drawParagraph(`Project fee: ${fmt$(data.projectValue)} (one-time).`);
	}
	if (data.mrr > 0) {
		drawParagraph(`Monthly retainer: ${fmt$(data.mrr)}/month.`);
	}
	if (data.projectValue === 0 && data.mrr === 0) {
		drawParagraph('Fees to be agreed upon separately in writing.');
	}
	y -= 4;

	// ── Payment Terms ─────────────────────────────────────────────────────────
	sectionLabel('PAYMENT TERMS');
	drawParagraph(data.paymentTerms);
	if (data.projectValue > 0) {
		drawParagraph(
			`For project work: 50% deposit (${fmt$(data.projectValue * 0.5)}) is due before work begins; the remaining 50% (${fmt$(data.projectValue * 0.5)}) is due upon completion.`
		);
	}
	y -= 4;

	// ── Terms & Conditions ────────────────────────────────────────────────────
	sectionLabel('TERMS & CONDITIONS');

	const clauses = [
		'1. Warranty. Work is delivered as-is. Consultant provides 30 days of post-launch bug-fix support at no additional charge for issues directly related to delivered work.',
		'2. Ownership. Upon receipt of final payment, Client owns all deliverables produced under this agreement.',
		...(data.mrr > 0
			? ['3. Termination. Either party may terminate the monthly retainer with 30 days written notice. Outstanding invoices remain due.']
			: []),
		`${data.mrr > 0 ? '4' : '3'}. Governing Law. This agreement is governed by the laws of the Province of Manitoba, Canada.`
	];

	for (const clause of clauses) {
		drawParagraph(clause);
		y -= 4;
	}

	y -= 12;

	// ── Signature Block ───────────────────────────────────────────────────────
	const sigLine  = '________________________________';
	const colLeft  = L;
	const colRight = width / 2 + 20;

	page.drawText('Liam Nicholson (Consultant)',    { x: colLeft,  y, font: bold, size: 10, color: BLACK });
	page.drawText(data.clientName + ' (Client)',    { x: colRight, y, font: bold, size: 10, color: BLACK });
	y -= 36;

	page.drawText(sigLine, { x: colLeft,  y, font: regular, size: 10, color: BLACK });
	page.drawText(sigLine, { x: colRight, y, font: regular, size: 10, color: BLACK });
	y -= 14;

	page.drawText('Signature', { x: colLeft,  y, font: regular, size: 9, color: GRAY });
	page.drawText('Signature', { x: colRight, y, font: regular, size: 9, color: GRAY });
	y -= 24;

	page.drawText(sigLine, { x: colLeft,  y, font: regular, size: 10, color: BLACK });
	page.drawText(sigLine, { x: colRight, y, font: regular, size: 10, color: BLACK });
	y -= 14;

	page.drawText('Date', { x: colLeft,  y, font: regular, size: 9, color: GRAY });
	page.drawText('Date', { x: colRight, y, font: regular, size: 9, color: GRAY });

	// ── Footer ────────────────────────────────────────────────────────────────
	const footerY = 30;
	page.drawText(fromEmail,   { x: L, y: footerY, font: regular, size: 9, color: GRAY });
	const siteW = regular.widthOfTextAtSize(fromWebsite, 9);
	page.drawText(fromWebsite, { x: R - siteW, y: footerY, font: regular, size: 9, color: GRAY });

	const pgText = 'Page 1 of 1';
	const pgW    = regular.widthOfTextAtSize(pgText, 8);
	page.drawText(pgText, { x: (width - pgW) / 2, y: footerY, font: regular, size: 8, color: LIGHT_GRAY });

	return doc.save();
}
