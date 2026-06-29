import nodemailer from 'nodemailer';
import { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } from '$env/static/private';

export interface SendEmailOptions {
	to: string;
	subject: string;
	body: string;
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
	const info = await transport.sendMail({
		from: SMTP_FROM || SMTP_USER,
		to: opts.to,
		subject: opts.subject,
		text: opts.body
	});
	return { messageId: info.messageId };
}
