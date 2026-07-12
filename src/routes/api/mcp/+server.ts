import { timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { createMcpHandler, withMcpAuth } from 'mcp-handler';
import { env } from '$env/dynamic/private';
import { registerLeadTools } from '$lib/server/mcpTools';
import type { RequestHandler } from './$types';

const handler = createMcpHandler((server) => registerLeadTools(server), {}, { basePath: '/api' });

const JWKS = env.WORKOS_ISSUER
	? createRemoteJWKSet(new URL(`${env.WORKOS_ISSUER}/oauth2/jwks`))
	: null;

function checkStaticKey(bearerToken: string): boolean {
	const apiKey = env.MCP_API_KEY;
	if (!apiKey) return false;
	const tokenBuf = Buffer.from(bearerToken);
	const keyBuf = Buffer.from(apiKey);
	return tokenBuf.length === keyBuf.length && timingSafeEqual(tokenBuf, keyBuf);
}

async function verifyToken(_req: Request, bearerToken?: string) {
	if (!bearerToken) return undefined;

	// Fallback path for the maintainer's own scripts/curl — independent of WorkOS.
	if (checkStaticKey(bearerToken)) return { token: bearerToken, clientId: 'static-key', scopes: [] };

	// Primary path for interactive MCP clients (e.g. Claude Desktop) via WorkOS AuthKit OAuth.
	if (!JWKS || !env.MCP_RESOURCE_URL) return undefined;
	try {
		const { payload } = await jwtVerify(bearerToken, JWKS, {
			issuer: env.WORKOS_ISSUER,
			audience: env.MCP_RESOURCE_URL
		});
		if (env.WORKOS_AUTHORIZED_USER_ID && payload.sub !== env.WORKOS_AUTHORIZED_USER_ID) {
			return undefined;
		}
		return {
			token: bearerToken,
			clientId: payload.sub as string,
			scopes: [],
			extra: { claims: payload }
		};
	} catch {
		return undefined;
	}
}

const authHandler = withMcpAuth(handler, verifyToken, { required: true });

export const GET: RequestHandler = ({ request }) => authHandler(request);
export const POST: RequestHandler = ({ request }) => authHandler(request);
export const DELETE: RequestHandler = ({ request }) => authHandler(request);
