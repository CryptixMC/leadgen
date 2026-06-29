import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export interface InvoiceData {
	invoiceNumber: string;
	issueDate: string;
	dueDate: string;
	clientName: string;
	clientAddress: string;
	lineItems: { description: string; amount: number }[];
	subtotal: number;
	tax: number;
	total: number;
	paymentTerms: string;
}

const BLACK = rgb(0, 0, 0);
const GRAY = rgb(0.4, 0.4, 0.4);
const LIGHT_GRAY = rgb(0.7, 0.7, 0.7);

function fmt$(n: number): string {
	return '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export async function generateInvoice(data: InvoiceData): Promise<Uint8Array> {
	const doc = await PDFDocument.create();
	const page = doc.addPage([595, 842]); // A4
	const { width, height } = page.getSize();

	const bold = await doc.embedFont(StandardFonts.HelveticaBold);
	const regular = await doc.embedFont(StandardFonts.Helvetica);

	const L = 50; // left margin
	const R = width - 50; // right margin

	let y = height - 50;

	// ── Header ──────────────────────────────────────────────────────────────
	page.drawText('Liam Nicholson', { x: L, y, font: bold, size: 22, color: BLACK });
	y -= 20;
	page.drawText('Business Tech Consultant · Winnipeg, MB · liamnicholson.ca', {
		x: L,
		y,
		font: regular,
		size: 11,
		color: GRAY
	});
	y -= 16;
	page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 1, color: LIGHT_GRAY });
	y -= 24;

	// ── Invoice meta ─────────────────────────────────────────────────────────
	page.drawText('INVOICE', { x: L, y, font: bold, size: 14, color: BLACK });

	const metaLines = [
		['Invoice #', data.invoiceNumber],
		['Issue Date', data.issueDate],
		['Due Date', data.dueDate]
	];
	let metaY = y;
	for (const [label, value] of metaLines) {
		const labelW = bold.widthOfTextAtSize(label + ':', 9);
		const valueW = regular.widthOfTextAtSize(value, 9);
		page.drawText(label + ':', { x: R - labelW - valueW - 8, y: metaY, font: bold, size: 9, color: GRAY });
		page.drawText(value, { x: R - valueW, y: metaY, font: regular, size: 9, color: BLACK });
		metaY -= 14;
	}

	y -= 36;

	// ── Bill To ──────────────────────────────────────────────────────────────
	page.drawText('BILL TO', { x: L, y, font: bold, size: 9, color: GRAY });
	y -= 14;
	page.drawText(data.clientName, { x: L, y, font: bold, size: 11, color: BLACK });
	y -= 14;
	page.drawText(data.clientAddress, { x: L, y, font: regular, size: 10, color: BLACK });
	y -= 24;

	page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 1, color: LIGHT_GRAY });
	y -= 20;

	// ── Line items table ─────────────────────────────────────────────────────
	const COL_AMT = R - 70;

	// Header row
	page.drawText('DESCRIPTION', { x: L, y, font: bold, size: 9, color: GRAY });
	page.drawText('AMOUNT', { x: COL_AMT, y, font: bold, size: 9, color: GRAY });
	y -= 8;
	page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 0.5, color: LIGHT_GRAY });
	y -= 16;

	for (const item of data.lineItems) {
		page.drawText(item.description, { x: L, y, font: regular, size: 10, color: BLACK });
		const amtStr = fmt$(item.amount);
		const amtW = regular.widthOfTextAtSize(amtStr, 10);
		page.drawText(amtStr, { x: R - amtW, y, font: regular, size: 10, color: BLACK });
		y -= 18;
	}

	y -= 8;
	page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 0.5, color: LIGHT_GRAY });
	y -= 16;

	// ── Totals ───────────────────────────────────────────────────────────────
	const totals: [string, string, boolean][] = [
		['Subtotal', fmt$(data.subtotal), false],
		...(data.tax > 0 ? [['Tax', fmt$(data.tax), false] as [string, string, boolean]] : []),
		['Total', fmt$(data.total), true]
	];

	for (const [label, value, isBold] of totals) {
		const font = isBold ? bold : regular;
		const size = isBold ? 12 : 10;
		const labelW = font.widthOfTextAtSize(label, size);
		const valueW = font.widthOfTextAtSize(value, size);
		page.drawText(label, { x: R - 160 - labelW, y, font, size, color: isBold ? BLACK : GRAY });
		page.drawText(value, { x: R - valueW, y, font, size, color: BLACK });
		y -= isBold ? 0 : 16;
		if (isBold) {
			y -= 4;
			page.drawLine({ start: { x: R - 200, y }, end: { x: R, y }, thickness: 1, color: BLACK });
			y -= 16;
		}
	}

	y -= 16;
	page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 1, color: LIGHT_GRAY });
	y -= 20;

	// ── Payment Terms ─────────────────────────────────────────────────────────
	page.drawText('PAYMENT TERMS', { x: L, y, font: bold, size: 9, color: GRAY });
	y -= 14;
	page.drawText(data.paymentTerms, { x: L, y, font: regular, size: 10, color: BLACK });

	// ── Footer ────────────────────────────────────────────────────────────────
	const footerText = 'Thank you for your business.';
	const footerW = regular.widthOfTextAtSize(footerText, 10);
	page.drawText(footerText, {
		x: (width - footerW) / 2,
		y: 40,
		font: regular,
		size: 10,
		color: GRAY
	});

	return doc.save();
}
