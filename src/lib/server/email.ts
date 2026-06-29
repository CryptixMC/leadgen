import nodemailer from 'nodemailer';
import { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_SIGNATURE_URL } from '$env/static/private';

export interface SendEmailOptions {
	to: string;
	subject: string;
	body: string;
}

function textToHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/\n/g, '<br>');
}

export async function sendEmail(opts: SendEmailOptions): Promise<{ messageId: string }> {
	const port = parseInt(SMTP_PORT || '587', 10);
	const transport = nodemailer.createTransport({
		host: SMTP_HOST,
		port,
		secure: port === 465,
		auth: { user: SMTP_USER, pass: SMTP_PASS },
		tls: { rejectUnauthorized: true }
	});

	const signatureHtml = SMTP_SIGNATURE_URL
		? `<br><br><img src="${SMTP_SIGNATURE_URL}" alt="Signature" style="max-width:400px; display:block;">`
		: '';

	const html = `<div style="font-family:inherit; font-size:14px; line-height:1.6;">${textToHtml(opts.body)}</div>${signatureHtml}`;

	const info = await transport.sendMail({
		from: SMTP_FROM || SMTP_USER,
		to: opts.to,
		subject: opts.subject,
		text: opts.body,
		html
	});
	return { messageId: info.messageId };
}
