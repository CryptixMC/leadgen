export interface ContractData {
	clientName: string;
	clientAddress: string;
	serviceDesc: string;
	projectValue: number;
	mrr: number;
	startDate: string;
	paymentTerms?: string;
	contractNumber?: string;
	revisionRounds?: number;
	estimatedCompletion?: string;
}

function fmt$(n: number): string {
	return '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function esc(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function ef(value: string, fallback: string): string {
	const v = value?.trim();
	return `<span contenteditable="true" class="ce-f">${esc(v || fallback)}</span>`;
}

export function generateContractHtml(data: ContractData): string {
	const contractNum = data.contractNumber ?? 'SA-' + new Date().getFullYear() + '-001';
	const deposit = data.projectValue > 0 ? data.projectValue * 0.5 : 0;
	const revRounds = data.revisionRounds ?? 2;
	const completion = data.estimatedCompletion ?? '~2–3 weeks from deposit receipt';

	const feeBlock = data.projectValue > 0
		? `Total project fee: ${ef(fmt$(data.projectValue), '$[Total]')}. Payment is structured as follows:`
		: data.mrr > 0
			? `Monthly retainer: ${ef(fmt$(data.mrr) + '/month', '$[Amount]/month')}. Invoiced monthly on the same date.`
			: `Fee: ${ef('$[Total]', '$[Total]')}. Payment is structured as follows:`;

	const depositBlock = data.projectValue > 0 ? `
		<div style="margin:0 0 14px;padding-left:20px;display:flex;flex-direction:column;gap:10px;">
			<div style="display:flex;gap:12px;align-items:baseline;">
				<span style="font-family:'JetBrains Mono',monospace;font-size:12px;color:#D946EF;flex-shrink:0;">→</span>
				<p class="body" style="margin:0;"><strong>Deposit (50%):</strong> ${ef(fmt$(deposit), '$[Amount]')} — non-refundable, due before work begins.</p>
			</div>
			<div style="display:flex;gap:12px;align-items:baseline;">
				<span style="font-family:'JetBrains Mono',monospace;font-size:12px;color:#D946EF;flex-shrink:0;">→</span>
				<p class="body" style="margin:0;"><strong>Balance (50%):</strong> ${ef(fmt$(deposit), '$[Amount]')} — due upon project completion, before final files or access are transferred.</p>
			</div>
		</div>` : '';

	const mrrTermination = data.mrr > 0
		? `<p class="body">For monthly retainer: either party may terminate with <strong>30 days written notice</strong>. All outstanding invoices remain due upon termination.</p>`
		: '';

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Service Agreement — ${esc(data.clientName)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&family=JetBrains+Mono:wght@400;700;800&family=Syne:wght@500;600;700&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;padding:0;background:#080810;font-family:'DM Sans',sans-serif;}
.sec{padding:36px 0;border-bottom:1px solid #1E1E2E}
.eyebrow{font-family:'Syne',sans-serif;font-size:10px;font-weight:600;letter-spacing:0.22em;text-transform:uppercase;color:#D946EF;margin-bottom:10px;}
.sec-h{font-family:'JetBrains Mono',monospace;font-weight:700;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#F5F0FF;margin-bottom:18px;}
.body{font-family:'DM Sans',sans-serif;font-weight:300;font-size:15px;line-height:1.85;color:rgba(245,240,255,0.7);margin:0 0 14px;}
.body:last-child{margin-bottom:0}
.body strong{font-weight:500;color:rgba(245,240,255,0.9)}
.ce-f{color:#F0ABFC;border-bottom:1px solid rgba(217,70,239,0.4);outline:none;min-width:60px;display:inline-block;padding:0 3px;cursor:text;white-space:pre-wrap;transition:border-color 200ms}
.ce-f:focus{border-bottom-color:#D946EF;background:rgba(217,70,239,0.06)}
.sig-line{height:1px;background:rgba(255,255,255,0.15);margin-bottom:10px;margin-top:40px;}
@keyframes blob-a{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(14px,-16px) scale(1.08)}}
@keyframes blob-b{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(-12px,14px) scale(1.1)}}
.no-print{display:block}
@media print{
  .no-print{display:none!important}
  @page{margin:0;size:A4}
  *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
  body{background:#0A0A0F!important;margin:0!important}
  #con-doc{box-shadow:none!important;border:none!important;margin:0 auto!important}
}
</style>
</head>
<body>

<!-- Toolbar -->
<div class="no-print" style="position:sticky;top:0;z-index:100;background:rgba(8,8,16,0.9);backdrop-filter:blur(12px);border-bottom:1px solid #1E1E2E;padding:13px 32px;display:flex;justify-content:space-between;align-items:center;">
  <span style="font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#D946EF;">// contract — click pink fields to edit</span>
  <button onclick="window.print()" style="padding:7px 20px;background:linear-gradient(135deg,#7C3AED,#D946EF);border:none;border-radius:6px;color:#0A0A0F;font-family:'Syne',sans-serif;font-size:12px;font-weight:700;letter-spacing:0.06em;cursor:pointer;">Print / Export PDF</button>
</div>

<!-- Document card -->
<div id="con-doc" style="max-width:794px;margin:40px auto 80px;background:#0A0A0F;border:1px solid rgba(255,255,255,0.05);box-shadow:0 24px 80px rgba(0,0,0,0.65);position:relative;overflow:hidden;">

  <!-- Glow blobs -->
  <div style="position:absolute;width:420px;height:420px;top:-160px;right:-80px;background:radial-gradient(circle,rgba(124,58,237,0.2) 0%,transparent 70%);filter:blur(80px);pointer-events:none;animation:blob-a 12s ease-in-out infinite;"></div>
  <div style="position:absolute;width:280px;height:280px;top:400px;left:-90px;background:radial-gradient(circle,rgba(217,70,239,0.15) 0%,transparent 70%);filter:blur(80px);pointer-events:none;animation:blob-b 9s ease-in-out infinite;"></div>

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
        <div style="font-family:'JetBrains Mono',monospace;font-weight:800;font-size:26px;line-height:1;letter-spacing:-0.02em;color:#F5F0FF;">SERVICE</div>
        <div style="font-family:'JetBrains Mono',monospace;font-weight:800;font-size:26px;line-height:1.1;letter-spacing:-0.02em;color:#F5F0FF;">AGREEMENT</div>
        <div style="margin-top:10px;display:flex;flex-direction:column;gap:4px;align-items:flex-end;">
          <span contenteditable="true" class="ce-f" style="font-family:'JetBrains Mono',monospace;font-size:12px;letter-spacing:0.08em;color:#D946EF;text-align:right;">${esc(contractNum)}</span>
          <span contenteditable="true" class="ce-f" style="font-family:'DM Sans',sans-serif;font-size:13px;color:#9090B0;text-align:right;">${esc(data.startDate)}</span>
        </div>
      </div>
    </div>

    <!-- Divider -->
    <div style="height:1px;background:#1E1E2E;"></div>

    <!-- SECTION 1: PARTIES -->
    <div class="sec">
      <div class="eyebrow">// parties</div>
      <div class="sec-h">Parties</div>
      <p class="body">This Service Agreement (the "Agreement") is entered into as of ${ef(data.startDate, '[date]')} between <strong>Liam Nicholson</strong>, Business Tech Consultant, operating from Winnipeg, Manitoba ("Consultant"), and ${ef(data.clientName, '[Client Name]')}, located at ${ef(data.clientAddress, '[Client Address, City, Province]')} ("Client"). Together referred to as the "Parties."</p>
      <p class="body">This Agreement is effective as of the date first written above and governs the professional relationship between both Parties for the services described herein.</p>
    </div>

    <!-- SECTION 2: SCOPE OF WORK -->
    <div class="sec">
      <div class="eyebrow">// scope of work</div>
      <div class="sec-h">Scope of Work</div>
      <p class="body">The Consultant agrees to provide the following services to the Client:</p>
      <p class="body"><span contenteditable="true" class="ce-f" style="display:block;min-width:100%;white-space:normal;">${esc(data.serviceDesc || '[Describe the project and deliverables…]')}</span></p>
      <p class="body">Deliverables, timelines, and any specific milestones will be communicated in writing prior to commencement. Any work outside this defined scope requires a separate written change order and may affect the project timeline and fee.</p>
      <p class="body">Estimated completion: ${ef(completion, '[~2 weeks from deposit receipt]')}.</p>
    </div>

    <!-- SECTION 3: PAYMENT TERMS -->
    <div class="sec">
      <div class="eyebrow">// payment terms</div>
      <div class="sec-h">Payment Terms</div>
      <p class="body">${feeBlock}</p>
      ${depositBlock}
      <p class="body">All invoices are payable within <strong>15 days</strong> of issue. Payment is accepted via e-transfer to <strong>liam@liamnicholson.ca</strong> — please include the invoice number in your memo. Invoices unpaid after <strong>14 days</strong> are subject to a <strong>2% monthly interest charge</strong>. Late payments beyond 30 days may result in a pause of work until the balance is settled.</p>
      <p class="body">Credentials, source files, and access are not transferred until the final payment has cleared — no exceptions.</p>
    </div>

    <!-- SECTION 4: REVISION POLICY -->
    <div class="sec">
      <div class="eyebrow">// revision policy</div>
      <div class="sec-h">Revision Policy</div>
      <p class="body">This project includes ${ef(String(revRounds), '[2]')} rounds of revisions at no additional charge. A revision round is defined as one consolidated set of feedback submitted after a formal review. Revisions must be requested within 7 days of delivery.</p>
      <p class="body">Additional revision rounds beyond the included allowance will be billed at <strong>$150/round or $95/hour, whichever is lower</strong>. Fundamental changes to the agreed scope are considered scope changes, not revisions.</p>
    </div>

    <!-- SECTION 5: CLIENT RESPONSIBILITIES -->
    <div class="sec">
      <div class="eyebrow">// client responsibilities</div>
      <div class="sec-h">Client Responsibilities</div>
      <p class="body">The Client agrees to respond to requests for feedback, approvals, or required materials within <strong>5 business days</strong>. Project timelines adjust accordingly for delays caused by the Client's non-response.</p>
      <p class="body">The Client is responsible for providing accurate content, credentials, and any third-party assets required for the project. The Consultant will not be held liable for delays or errors caused by inaccurate or incomplete information provided by the Client.</p>
    </div>

    <!-- SECTION 6: INTELLECTUAL PROPERTY -->
    <div class="sec">
      <div class="eyebrow">// intellectual property</div>
      <div class="sec-h">Intellectual Property</div>
      <p class="body">Upon receipt of final payment in full, the Client owns all original deliverables created by the Consultant under this Agreement, including but not limited to designs, code, and written content produced specifically for this project.</p>
      <p class="body">The Consultant retains the right to display completed work in portfolio materials and case studies unless the Client requests confidentiality in writing. Third-party assets remain subject to their original licenses.</p>
      <p class="body">Prior to final payment, all work product remains the intellectual property of the Consultant.</p>
    </div>

    <!-- SECTION 7: CONFIDENTIALITY -->
    <div class="sec">
      <div class="eyebrow">// confidentiality</div>
      <div class="sec-h">Confidentiality</div>
      <p class="body">Both Parties agree to keep confidential any proprietary, sensitive, or non-public business information shared during this engagement. This obligation does not apply to information that is publicly available, independently developed, or required to be disclosed by applicable law.</p>
      <p class="body">The Consultant will not share Client data, business systems access, or proprietary processes with any third party without prior written consent. This confidentiality obligation survives the termination of this Agreement.</p>
    </div>

    <!-- SECTION 8: LIMITATION OF LIABILITY -->
    <div class="sec">
      <div class="eyebrow">// limitation of liability</div>
      <div class="sec-h">Limitation of Liability</div>
      <p class="body">The Consultant's total liability under this Agreement shall not exceed the total fees paid by the Client for the specific project in question. The Consultant is not liable for indirect, incidental, special, or consequential damages arising from the use or inability to use the deliverables.</p>
      <p class="body">The Client is responsible for maintaining backups of any existing data, files, or systems before the Consultant performs any work.</p>
    </div>

    <!-- SECTION 9: TERMINATION -->
    <div class="sec">
      <div class="eyebrow">// termination</div>
      <div class="sec-h">Termination</div>
      <p class="body">Either Party may terminate this Agreement with written notice. In the event of Client-initiated termination:</p>
      <div style="margin:0 0 14px;padding-left:20px;display:flex;flex-direction:column;gap:10px;">
        <div style="display:flex;gap:12px;align-items:baseline;">
          <span style="font-family:'JetBrains Mono',monospace;font-size:12px;color:#D946EF;flex-shrink:0;">→</span>
          <p class="body" style="margin:0;">The deposit is <strong>non-refundable</strong> under all circumstances.</p>
        </div>
        <div style="display:flex;gap:12px;align-items:baseline;">
          <span style="font-family:'JetBrains Mono',monospace;font-size:12px;color:#D946EF;flex-shrink:0;">→</span>
          <p class="body" style="margin:0;">Any work completed to the point of termination is billable at <strong>$95/hour</strong>, applied against the deposit. If billable hours exceed the deposit, the Client owes the difference.</p>
        </div>
        <div style="display:flex;gap:12px;align-items:baseline;">
          <span style="font-family:'JetBrains Mono',monospace;font-size:12px;color:#D946EF;flex-shrink:0;">→</span>
          <p class="body" style="margin:0;">Files, source code, and credentials are <strong>not released</strong> until all outstanding amounts are settled.</p>
        </div>
      </div>
      ${mrrTermination}
      <p class="body">In the event of Consultant-initiated termination due to Client non-payment or breach, all work product remains the Consultant's property until outstanding balances are paid in full.</p>
    </div>

    <!-- SECTION 10: GOVERNING LAW -->
    <div class="sec">
      <div class="eyebrow">// governing law</div>
      <div class="sec-h">Governing Law</div>
      <p class="body">This Agreement is governed by the laws of the Province of Manitoba and the applicable laws of Canada. Any disputes arising from this Agreement shall be resolved in the courts of Manitoba.</p>
    </div>

    <!-- SIGNATURES -->
    <div style="padding-top:36px;page-break-inside:avoid;">
      <div class="eyebrow">// signatures</div>
      <div class="sec-h">Agreement &amp; Signatures</div>
      <p class="body" style="margin-bottom:36px;">By signing below, both Parties confirm they have read, understood, and agreed to the terms of this Service Agreement.</p>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:48px;">
        <div>
          <div class="sig-line"></div>
          <div style="font-family:'DM Sans',sans-serif;font-size:14px;font-weight:500;color:#F5F0FF;">Liam Nicholson</div>
          <div style="font-family:'Syne',sans-serif;font-size:11px;color:#9090B0;letter-spacing:0.08em;margin-top:3px;">Business Tech Consultant</div>
          <div style="margin-top:18px;display:flex;align-items:center;gap:8px;">
            <span style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#3a3a55;">Date:</span>
            <span contenteditable="true" class="ce-f" style="font-family:'DM Sans',sans-serif;font-size:13px;">[Date]</span>
          </div>
        </div>
        <div>
          <div class="sig-line"></div>
          <span contenteditable="true" class="ce-f" style="font-family:'DM Sans',sans-serif;font-size:14px;font-weight:500;color:#F5F0FF;">${esc(data.clientName)}</span><br>
          <span contenteditable="true" class="ce-f" style="font-family:'Syne',sans-serif;font-size:11px;color:#9090B0;letter-spacing:0.08em;margin-top:3px;display:inline-block;">[Title / Company]</span>
          <div style="margin-top:18px;display:flex;align-items:center;gap:8px;">
            <span style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#3a3a55;">Date:</span>
            <span contenteditable="true" class="ce-f" style="font-family:'DM Sans',sans-serif;font-size:13px;">[Date]</span>
          </div>
        </div>
      </div>
    </div>

    <!-- FOOTER -->
    <div style="margin-top:48px;border-top:1px solid #1E1E2E;padding-top:22px;display:flex;justify-content:space-between;align-items:center;">
      <span style="font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:0.06em;color:#9090B0;">liam@liamnicholson.ca</span>
      <span style="font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:0.06em;color:#9090B0;">(204) 557-0596</span>
      <span style="font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:0.06em;color:#9090B0;">liamnicholson.ca</span>
    </div>

  </div>
</div>

</body>
</html>`;
}

export async function generateContract(data: ContractData): Promise<string> {
	return generateContractHtml(data);
}
