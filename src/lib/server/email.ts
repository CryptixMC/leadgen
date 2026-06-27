import nodemailer from 'nodemailer';
import { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } from '$env/static/private';

export interface SendEmailOptions {
	to: string;
	subject: string;
	body: string;
}

export interface SendEmailResult {
	messageId: string;
}

function createTransport() {
	const port = parseInt(SMTP_PORT || '587', 10);
	const isLocalhost = SMTP_HOST === '127.0.0.1' || SMTP_HOST === 'localhost';
	return nodemailer.createTransport({
		host: SMTP_HOST,
		port,
		secure: port === 465,
		auth: { user: SMTP_USER, pass: SMTP_PASS },
		tls: {
			// Proton Bridge uses a self-signed cert locally; external relays should verify
			rejectUnauthorized: !isLocalhost
		}
	});
}

export async function sendEmail(opts: SendEmailOptions): Promise<SendEmailResult> {
	const transport = createTransport();
	const info = await transport.sendMail({
		from: SMTP_FROM || SMTP_USER,
		to: opts.to,
		subject: opts.subject,
		text: opts.body
	});
	return { messageId: info.messageId };
}
