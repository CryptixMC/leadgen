import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export interface InvoiceData {
	invoiceNumber: string;
	issueDate: string;
	dueDate: string;
	clientName: string;
	clientAddress: string;
	clientEmail?: string;
	lineItems: { description: string; qty: number; rate: number }[];
	taxRate?: number;   // e.g. 5 for 5%
	taxLabel?: string;  // e.g. "GST (5%)"
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

export async function generateInvoice(data: InvoiceData): Promise<Uint8Array> {
	const doc  = await PDFDocument.create();
	const page = doc.addPage([595, 842]); // A4
	const { width, height } = page.getSize();

	const bold    = await doc.embedFont(StandardFonts.HelveticaBold);
	const regular = await doc.embedFont(StandardFonts.Helvetica);

	const L = 50;
	const R = width - 50;

	const fromEmail   = data.fromEmail   ?? 'liam@liamnicholson.ca';
	const fromWebsite = data.fromWebsite ?? 'liamnicholson.ca';

	let y = height - 50;

	// ── Header ──────────────────────────────────────────────────────────────────
	page.drawText('Liam Nicholson', { x: L, y, font: bold, size: 20, color: BLACK });

	// "INVOICE" top-right with purple number below
	const invLabel = 'INVOICE';
	const invLabelW = bold.widthOfTextAtSize(invLabel, 22);
	page.drawText(invLabel, { x: R - invLabelW, y, font: bold, size: 22, color: BLACK });

	y -= 18;
	page.drawText('Business Tech Consultant', { x: L, y, font: regular, size: 10, color: GRAY });

	const numStr  = data.invoiceNumber;
	const numStrW = regular.widthOfTextAtSize(numStr, 9);
	page.drawText(numStr, { x: R - numStrW, y, font: regular, size: 9, color: PURPLE });

	y -= 18;
	page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 0.75, color: LIGHT_GRAY });
	y -= 22;

	// ── Three-column info block: FROM | BILL TO | DATES ──────────────────────
	const col1 = L;
	const col2 = L + 170;
	const col3 = L + 350;

	function sectionLabel(label: string, cx: number, cy: number) {
		page.drawText('// ' + label, { x: cx, y: cy, font: bold, size: 8, color: PURPLE });
	}

	sectionLabel('FROM', col1, y);
	sectionLabel('BILL TO', col2, y);
	sectionLabel('DATES', col3, y);
	y -= 14;

	// FROM column
	let fy = y;
	page.drawText('Liam Nicholson',       { x: col1, y: fy, font: bold,    size: 10, color: BLACK }); fy -= 13;
	page.drawText('Business Tech Consultant', { x: col1, y: fy, font: regular, size: 9,  color: GRAY  }); fy -= 13;
	page.drawText('Winnipeg, MB',          { x: col1, y: fy, font: regular, size: 9,  color: GRAY  }); fy -= 13;
	page.drawText(fromEmail,               { x: col1, y: fy, font: regular, size: 9,  color: GRAY  }); fy -= 13;
	page.drawText('(204) 557-0596',        { x: col1, y: fy, font: regular, size: 9,  color: GRAY  });

	// BILL TO column
	let by = y;
	page.drawText(data.clientName,    { x: col2, y: by, font: bold,    size: 10, color: BLACK }); by -= 13;
	if (data.clientAddress) {
		page.drawText(data.clientAddress, { x: col2, y: by, font: regular, size: 9, color: GRAY }); by -= 13;
	}
	if (data.clientEmail) {
		page.drawText(data.clientEmail,   { x: col2, y: by, font: regular, size: 9, color: GRAY });
	}

	// DATES column
	let dy = y;
	page.drawText('ISSUED',       { x: col3, y: dy, font: bold,    size: 8,  color: GRAY  }); dy -= 13;
	page.drawText(data.issueDate, { x: col3, y: dy, font: regular, size: 10, color: BLACK }); dy -= 18;
	page.drawText('DUE',          { x: col3, y: dy, font: bold,    size: 8,  color: GRAY  }); dy -= 13;
	page.drawText(data.dueDate,   { x: col3, y: dy, font: regular, size: 10, color: BLACK });

	y -= 72;
	page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 0.75, color: LIGHT_GRAY });
	y -= 20;

	// ── Line items table ─────────────────────────────────────────────────────
	const COL_QTY  = L + 310;
	const COL_RATE = L + 380;
	const COL_AMT  = R - 10;

	// Header row
	page.drawText('DESCRIPTION', { x: L,        y, font: bold, size: 8, color: GRAY });
	page.drawText('QTY',         { x: COL_QTY,  y, font: bold, size: 8, color: GRAY });
	page.drawText('RATE',        { x: COL_RATE, y, font: bold, size: 8, color: GRAY });
	page.drawText('AMOUNT',      { x: COL_AMT - regular.widthOfTextAtSize('AMOUNT', 8), y, font: bold, size: 8, color: GRAY });
	y -= 8;
	page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 0.4, color: LIGHT_GRAY });
	y -= 16;

	// Compute subtotal
	let subtotal = 0;
	for (const item of data.lineItems) {
		const amount = (Number(item.qty) || 0) * (Number(item.rate) || 0);
		subtotal += amount;

		page.drawText(item.description, { x: L,       y, font: regular, size: 10, color: BLACK });
		page.drawText(String(item.qty), { x: COL_QTY, y, font: regular, size: 10, color: BLACK });

		const rateStr = fmt$(Number(item.rate) || 0);
		page.drawText(rateStr, { x: COL_RATE, y, font: regular, size: 10, color: BLACK });

		const amtStr = fmt$(amount);
		const amtW   = regular.widthOfTextAtSize(amtStr, 10);
		page.drawText(amtStr, { x: COL_AMT - amtW, y, font: regular, size: 10, color: BLACK });

		y -= 20;
	}

	y -= 8;
	page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 0.4, color: LIGHT_GRAY });
	y -= 20;

	// ── Totals ────────────────────────────────────────────────────────────────
	const taxRate  = Number(data.taxRate)  || 0;
	const taxLabel = data.taxLabel         ?? (taxRate > 0 ? `GST (${taxRate}%)` : 'Tax');
	const taxAmt   = subtotal * (taxRate / 100);
	const total    = subtotal + taxAmt;

	function drawTotalRow(label: string, value: string, isBold: boolean) {
		const font  = isBold ? bold : regular;
		const size  = isBold ? 12 : 10;
		const color = isBold ? BLACK : GRAY;
		const valW  = font.widthOfTextAtSize(value, size);
		const labW  = font.widthOfTextAtSize(label, size);
		page.drawText(label, { x: R - 180 - labW, y, font, size, color });
		page.drawText(value, { x: R - valW,        y, font, size, color: BLACK });
		y -= size + 6;
	}

	drawTotalRow('Subtotal', fmt$(subtotal), false);
	if (taxAmt > 0) {
		drawTotalRow(taxLabel, fmt$(taxAmt), false);
	}
	y -= 4;
	page.drawLine({ start: { x: R - 200, y }, end: { x: R, y }, thickness: 0.75, color: BLACK });
	y -= 6;
	drawTotalRow('TOTAL DUE', fmt$(total), true);

	y -= 16;
	page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 0.75, color: LIGHT_GRAY });
	y -= 20;

	// ── Notes / Payment Terms ─────────────────────────────────────────────────
	sectionLabel('NOTES', L, y);
	y -= 14;
	page.drawText(data.paymentTerms, { x: L, y, font: regular, size: 10, color: BLACK });

	// ── Footer ────────────────────────────────────────────────────────────────
	const footerY = 30;
	page.drawText(fromEmail,   { x: L, y: footerY, font: regular, size: 9, color: GRAY });
	const siteW = regular.widthOfTextAtSize(fromWebsite, 9);
	page.drawText(fromWebsite, { x: R - siteW, y: footerY, font: regular, size: 9, color: GRAY });

	return doc.save();
}
