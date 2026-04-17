import PostalMime, { Email } from 'postal-mime';
import { createMimeMessage } from 'mimetext/browser';
import { EmailMessage } from 'cloudflare:email';

interface Env {
	R2_BUCKET: R2Bucket;
	APP_API_URL: string;
	ENABLE_ATTACHMENTS: string;
	SEND_EMAIL: SendEmail;
	SEND_API_KEY: string;
}

interface SendEmailRequest {
	from: { name?: string; address: string };
	to: { name?: string; address: string };
	subject: string;
	text?: string;
	html?: string;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname !== '/send') {
			return Response.json({ error: 'Not Found' }, { status: 404 });
		}

		if (request.method !== 'POST') {
			return Response.json({ error: 'Method Not Allowed' }, { status: 405 });
		}

		const authHeader = request.headers.get('Authorization');
		if (!authHeader || authHeader !== `Bearer ${env.SEND_API_KEY}`) {
			return Response.json({ error: 'Unauthorized' }, { status: 401 });
		}

		let body: SendEmailRequest;
		try {
			body = await request.json();
		} catch {
			return Response.json({ error: 'Invalid JSON' }, { status: 400 });
		}

		if (!body.from?.address || !body.to?.address || !body.subject) {
			return Response.json({ error: 'Missing required fields: from.address, to.address, subject' }, { status: 400 });
		}

		const msg = createMimeMessage();
		msg.setSender({ name: body.from.name || '', addr: body.from.address });
		msg.setRecipient(body.to.address);
		msg.setSubject(body.subject);

		if (body.html) {
			msg.addMessage({ contentType: 'text/html', data: body.html });
		}
		if (body.text) {
			msg.addMessage({ contentType: 'text/plain', data: body.text });
		}
		if (!body.html && !body.text) {
			msg.addMessage({ contentType: 'text/plain', data: '' });
		}

		try {
			const message = new EmailMessage(body.from.address, body.to.address, msg.asRaw());
			await env.SEND_EMAIL.send(message);
		} catch (e: any) {
			return Response.json({ error: e.message }, { status: 500 });
		}

		return Response.json({ success: true });
	},

	async email(message: any, env: Env, ctx: ExecutionContext): Promise<void> {
		let email: Email;

		try {
			email = await PostalMime.parse(message.raw);
		} catch (error) {
			console.error('Failed to parse email:', error);
			return;
		}

		const emailData = {
			from: message.from,
			fromName: email.from.name || '',
			to: message.to,
			subject: email.subject || 'No Subject',
			text: email.text || '',
			html: email.html || '',
			date: email.date || '',
			messageId: email.messageId || '',
			cc: JSON.stringify(email.cc || []),
			replyTo: JSON.stringify(email.replyTo || ''),
			headers: JSON.stringify(email.headers || []),
			attachments: [] as {
				filename: string;
				mimeType: string;
				r2Path: string;
				size: number; // 添加附件大小
			}[],
		};

		if (env.ENABLE_ATTACHMENTS === '1' && email.attachments && email.attachments.length > 0) {
			const date = new Date();
			const year = date.getUTCFullYear();
			const month = date.getUTCMonth() + 1;

			for (const attachment of email.attachments) {
				const r2Path = `${year}/${month}/${attachment.filename}`;
				if (env.R2_BUCKET) {
					await env.R2_BUCKET.put(r2Path, attachment.content);
				}

				const size =
					typeof attachment.content === 'string'
						? attachment.content.length // 字符串使用 length
						: attachment.content.byteLength;

				emailData.attachments.push({
					filename: attachment.filename || 'untitled',
					mimeType: attachment.mimeType || 'application/octet-stream',
					r2Path: r2Path,
					size,
				});
			}
		}

		await forwardToApp(env.APP_API_URL, emailData);
	},
};

async function forwardToApp(apiUrl: string, emailData: any): Promise<void> {
	try {
		await fetch(`${apiUrl}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(emailData),
		});
	} catch (error) {
		console.log('Error forwarding email:', error);
	}
}
