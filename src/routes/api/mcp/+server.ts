import { error } from '@sveltejs/kit';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { createMcpHandler, withMcpAuth } from 'mcp-handler';
import { env } from '$env/dynamic/private';
import { registerLeadTools } from '$lib/server/mcpTools';
import type { RequestHandler } from './$types';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';

const rawHandler = createMcpHandler((server) => registerLeadTools(server), {}, { basePath: '/api' });

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

async function verifyToken(_req: Request, bearerToken?: string): Promise<AuthInfo | undefined> {
	if (!bearerToken) return undefined;

	const issuer = env.WORKOS_ISSUER;
	const resource = env.MCP_RESOURCE_URL;
	const authorizedUserId = env.WORKOS_AUTHORIZED_USER_ID;
	if (!issuer || !resource || !authorizedUserId) {
		throw error(500, 'WorkOS MCP auth not configured');
	}

	jwks ??= createRemoteJWKSet(new URL(`${issuer}/oauth2/jwks`));

	try {
		const { payload } = await jwtVerify(bearerToken, jwks, { issuer, audience: resource });

		// Single-user MCP server — only this WorkOS user's tokens are accepted.
		if (payload.sub !== authorizedUserId) return undefined;

		return {
			token: bearerToken,
			clientId: typeof payload.client_id === 'string' ? payload.client_id : String(payload.aud),
			scopes: typeof payload.scope === 'string' ? payload.scope.split(' ') : [],
			expiresAt: payload.exp,
			resource: new URL(resource)
		};
	} catch {
		return undefined;
	}
}

// Note: no resourceUrl override here — withMcpAuth uses it as the *origin* for
// constructing the resource_metadata pointer (not the full resource identifier,
// which is env.MCP_RESOURCE_URL and is checked separately in verifyToken above).
// Letting it auto-detect from proxy headers keeps the pointer at the origin root,
// matching where the metadata route is actually registered.
const handler = withMcpAuth(rawHandler, verifyToken, {
	required: true
});

export const GET: RequestHandler = ({ request }) => handler(request);
export const POST: RequestHandler = ({ request }) => handler(request);
export const DELETE: RequestHandler = ({ request }) => handler(request);
