export interface InvoiceData {
	invoiceNumber: string;
	issueDate: string;
	dueDate: string;
	clientName: string;
	clientAddress: string;
	clientCity?: string;
	clientEmail?: string;
	lineItems: { description: string; qty: number; rate: number }[];
	taxRate?: number;
	taxLabel?: string;
	notes?: string;
}

function fmt$(n: number): string {
	return '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function generateInvoiceHtml(data: InvoiceData): string {
	const taxRate = Number(data.taxRate ?? 5);
	const taxLabel = data.taxLabel ?? `GST (${taxRate}%)`;
	const subtotal = data.lineItems.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0);
	const tax = subtotal * (taxRate / 100);
	const total = subtotal + tax;

	const rows = data.lineItems.map((it, i) => {
		const amt = (Number(it.qty) || 0) * (Number(it.rate) || 0);
		return `
		<tr style="background:${i % 2 === 1 ? 'rgba(255,255,255,0.025)' : 'transparent'}">
			<td style="padding:12px 0;border-bottom:1px solid #1E1E2E;font-family:'DM Sans',sans-serif;font-size:14px;color:#F5F0FF;">${esc(it.description)}</td>
			<td style="padding:12px 14px;border-bottom:1px solid #1E1E2E;text-align:center;width:60px;font-family:'DM Sans',sans-serif;font-size:14px;color:#F5F0FF;">${esc(String(it.qty))}</td>
			<td style="padding:12px 14px;border-bottom:1px solid #1E1E2E;text-align:right;width:96px;font-family:'DM Sans',sans-serif;font-size:14px;color:#F5F0FF;">${esc(fmt$(Number(it.rate) || 0))}</td>
			<td style="padding:12px 0 12px 14px;border-bottom:1px solid #1E1E2E;text-align:right;width:104px;font-family:'JetBrains Mono',monospace;font-size:13px;color:#F5F0FF;">${fmt$(amt)}</td>
		</tr>`;
	}).join('');

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Invoice ${esc(data.invoiceNumber)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&family=JetBrains+Mono:wght@400;700;800&family=Syne:wght@500;600;700&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;padding:0;background:#080810;font-family:'DM Sans',sans-serif;}
@keyframes blob-a{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(14px,-16px) scale(1.08)}}
@keyframes blob-b{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(-12px,14px) scale(1.1)}}
.no-print{display:block}
@media print{
  .no-print{display:none!important}
  @page{margin:0;size:A4}
  *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
  body{background:#0A0A0F!important;margin:0!important}
  #inv-doc{box-shadow:none!important;border:none!important;margin:0 auto!important}
}
</style>
</head>
<body>

<!-- Toolbar -->
<div class="no-print" style="position:sticky;top:0;z-index:100;background:rgba(8,8,16,0.9);backdrop-filter:blur(12px);border-bottom:1px solid #1E1E2E;padding:13px 32px;display:flex;justify-content:space-between;align-items:center;">
  <span style="font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#D946EF;">// invoice</span>
  <button onclick="window.print()" style="padding:7px 20px;background:linear-gradient(135deg,#7C3AED,#D946EF);border:none;border-radius:6px;color:#0A0A0F;font-family:'Syne',sans-serif;font-size:12px;font-weight:700;letter-spacing:0.06em;cursor:pointer;">Print / Export PDF</button>
</div>

<!-- Document card -->
<div id="inv-doc" style="max-width:794px;margin:40px auto 80px;background:#0A0A0F;border:1px solid rgba(255,255,255,0.05);box-shadow:0 24px 80px rgba(0,0,0,0.65);position:relative;overflow:hidden;">

  <!-- Glow blobs -->
  <div style="position:absolute;width:380px;height:380px;top:-130px;right:-60px;background:radial-gradient(circle,rgba(124,58,237,0.22) 0%,transparent 70%);filter:blur(80px);pointer-events:none;animation:blob-a 11s ease-in-out infinite;"></div>
  <div style="position:absolute;width:300px;height:300px;bottom:60px;left:-80px;background:radial-gradient(circle,rgba(217,70,239,0.18) 0%,transparent 70%);filter:blur(80px);pointer-events:none;animation:blob-b 9s ease-in-out infinite;"></div>

  <div style="position:relative;padding:64px;">

    <!-- HEADER -->
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:48px;">
      <div style="display:flex;align-items:center;gap:14px;">
        <div style="width:44px;height:44px;flex-shrink:0;border-radius:10px;background:linear-gradient(135deg,#7C3AED,#D946EF);display:flex;align-items:center;justify-content:center;box-shadow:0 0 22px rgba(217,70,239,0.3);">
          <span style="font-family:'JetBrains Mono',monospace;font-weight:800;font-size:17px;letter-spacing:-0.04em;color:#0A0A0F;">LN.</span>
        </div>
        <div>
          <div style="font-family:'JetBrains Mono',monospace;font-weight:700;font-size:20px;line-height:1.1;letter-spacing:-0.02em;color:#F5F0FF;">Liam Nicholson<span style="color:#D946EF;">.</span></div>
          <div style="margin-top:4px;font-family:'Syne',sans-serif;font-weight:500;font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:#9090B0;">Business Tech Consultant</div>
        </div>
      </div>
      <div style="text-align:right;">
        <div style="font-family:'JetBrains Mono',monospace;font-weight:800;font-size:34px;line-height:1;letter-spacing:-0.03em;color:#F5F0FF;">INVOICE</div>
        <div style="margin-top:9px;font-family:'JetBrains Mono',monospace;font-size:13px;letter-spacing:0.1em;color:#D946EF;">${esc(data.invoiceNumber)}</div>
      </div>
    </div>

    <!-- Divider -->
    <div style="height:1px;background:#1E1E2E;margin-bottom:40px;"></div>

    <!-- FROM / BILL TO / DATES -->
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:32px;margin-bottom:40px;">

      <div>
        <div style="font-family:'Syne',sans-serif;font-size:10px;font-weight:600;letter-spacing:0.22em;text-transform:uppercase;color:#D946EF;margin-bottom:14px;">// from</div>
        <div style="display:flex;flex-direction:column;gap:3px;">
          <span style="font-family:'DM Sans',sans-serif;font-size:14px;font-weight:500;color:#F5F0FF;">Liam Nicholson</span>
          <span style="font-family:'DM Sans',sans-serif;font-size:13px;color:#9090B0;">Business Tech Consultant</span>
          <span style="font-family:'DM Sans',sans-serif;font-size:13px;color:#9090B0;">Winnipeg, MB</span>
          <span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:#9090B0;margin-top:6px;">liam@liamnicholson.ca</span>
          <span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:#9090B0;">(204) 557-0596</span>
        </div>
      </div>

      <div>
        <div style="font-family:'Syne',sans-serif;font-size:10px;font-weight:600;letter-spacing:0.22em;text-transform:uppercase;color:#D946EF;margin-bottom:14px;">// bill to</div>
        <div style="display:flex;flex-direction:column;gap:4px;">
          <span style="font-family:'DM Sans',sans-serif;font-size:14px;font-weight:500;color:#F5F0FF;">${esc(data.clientName)}</span>
          ${data.clientAddress ? `<span style="font-family:'DM Sans',sans-serif;font-size:13px;color:#9090B0;">${esc(data.clientAddress)}</span>` : ''}
          ${data.clientCity ? `<span style="font-family:'DM Sans',sans-serif;font-size:13px;color:#9090B0;">${esc(data.clientCity)}</span>` : ''}
          ${data.clientEmail ? `<span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:#9090B0;margin-top:4px;">${esc(data.clientEmail)}</span>` : ''}
        </div>
      </div>

      <div>
        <div style="font-family:'Syne',sans-serif;font-size:10px;font-weight:600;letter-spacing:0.22em;text-transform:uppercase;color:#D946EF;margin-bottom:14px;">// dates</div>
        <div style="display:flex;flex-direction:column;gap:18px;">
          <div>
            <div style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#3a3a55;margin-bottom:5px;">issued</div>
            <div style="font-family:'DM Sans',sans-serif;font-size:14px;color:#F5F0FF;">${esc(data.issueDate)}</div>
          </div>
          <div>
            <div style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#3a3a55;margin-bottom:5px;">due</div>
            <div style="font-family:'DM Sans',sans-serif;font-size:14px;color:#F5F0FF;">${esc(data.dueDate)}</div>
          </div>
        </div>
      </div>

    </div>

    <!-- Divider -->
    <div style="height:1px;background:#1E1E2E;"></div>

    <!-- LINE ITEMS -->
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr>
          <th style="font-family:'Syne',sans-serif;font-size:10px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:#9090B0;text-align:left;padding:15px 0;border-bottom:1px solid #1E1E2E;">Description</th>
          <th style="font-family:'Syne',sans-serif;font-size:10px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:#9090B0;text-align:center;padding:15px 14px;border-bottom:1px solid #1E1E2E;width:60px;">Qty</th>
          <th style="font-family:'Syne',sans-serif;font-size:10px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:#9090B0;text-align:right;padding:15px 14px;border-bottom:1px solid #1E1E2E;width:96px;">Rate</th>
          <th style="font-family:'Syne',sans-serif;font-size:10px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:#9090B0;text-align:right;padding:15px 0 15px 14px;border-bottom:1px solid #1E1E2E;width:104px;">Amount</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <!-- TOTALS -->
    <div style="display:flex;justify-content:flex-end;padding:32px 0 40px;">
      <div style="width:280px;display:flex;flex-direction:column;">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:11px 0;border-bottom:1px solid #1E1E2E;">
          <span style="font-family:'DM Sans',sans-serif;font-size:14px;color:#9090B0;">Subtotal</span>
          <span style="font-family:'JetBrains Mono',monospace;font-size:13px;color:#F5F0FF;">${fmt$(subtotal)}</span>
        </div>
        ${tax > 0 ? `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:11px 0;border-bottom:1px solid #1E1E2E;">
          <span style="font-family:'DM Sans',sans-serif;font-size:14px;color:#9090B0;">${esc(taxLabel)}</span>
          <span style="font-family:'JetBrains Mono',monospace;font-size:13px;color:#F5F0FF;">${fmt$(tax)}</span>
        </div>` : ''}
        <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 0 0;">
          <span style="font-family:'Syne',sans-serif;font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#F5F0FF;">Total due</span>
          <span style="font-family:'JetBrains Mono',monospace;font-weight:700;font-size:22px;background:linear-gradient(135deg,#7C3AED,#D946EF);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;letter-spacing:-0.01em;">${fmt$(total)}</span>
        </div>
      </div>
    </div>

    <!-- NOTES -->
    ${data.notes ? `
    <div style="border-top:1px solid #1E1E2E;padding-top:32px;margin-bottom:48px;">
      <div style="font-family:'Syne',sans-serif;font-size:10px;font-weight:600;letter-spacing:0.22em;text-transform:uppercase;color:#D946EF;margin-bottom:10px;">// notes</div>
      <div style="font-family:'DM Sans',sans-serif;font-size:13px;line-height:1.75;color:#9090B0;">${esc(data.notes)}</div>
    </div>` : '<div style="height:48px;"></div>'}

    <!-- FOOTER -->
    <div style="border-top:1px solid #1E1E2E;padding-top:22px;display:flex;justify-content:space-between;align-items:center;">
      <span style="font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:0.06em;color:#9090B0;">liam@liamnicholson.ca</span>
      <span style="font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:0.06em;color:#9090B0;">liamnicholson.ca</span>
    </div>

  </div>
</div>

</body>
</html>`;
}

function esc(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Legacy PDF export — kept for compatibility; returns HTML opened in browser now
export async function generateInvoice(data: InvoiceData): Promise<string> {
	return generateInvoiceHtml(data);
}
