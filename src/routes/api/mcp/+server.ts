import { error } from '@sveltejs/kit';
import { timingSafeEqual } from 'node:crypto';
import { createMcpHandler } from 'mcp-handler';
import { env } from '$env/dynamic/private';
import { registerLeadTools } from '$lib/server/mcpTools';
import type { RequestHandler } from './$types';

const handler = createMcpHandler((server) => registerLeadTools(server), {}, { basePath: '/api' });

function checkAuth(request: Request): void {
	const apiKey = env.MCP_API_KEY;
	if (!apiKey) throw error(500, 'MCP_API_KEY not configured');

	const header = request.headers.get('authorization') ?? '';
	const token = header.replace(/^Bearer\s+/i, '');
	const tokenBuf = Buffer.from(token);
	const keyBuf = Buffer.from(apiKey);
	const valid = tokenBuf.length === keyBuf.length && timingSafeEqual(tokenBuf, keyBuf);
	if (!valid) throw error(401, 'Unauthorized');
}

export const GET: RequestHandler = ({ request }) => {
	checkAuth(request);
	return handler(request);
};

export const POST: RequestHandler = ({ request }) => {
	checkAuth(request);
	return handler(request);
};

export const DELETE: RequestHandler = ({ request }) => {
	checkAuth(request);
	return handler(request);
};
