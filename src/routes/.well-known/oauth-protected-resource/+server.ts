import { protectedResourceHandler, metadataCorsOptionsRequestHandler } from 'mcp-handler';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

const handler = protectedResourceHandler({
	authServerUrls: env.WORKOS_ISSUER ? [env.WORKOS_ISSUER] : [],
	resourceUrl: env.MCP_RESOURCE_URL
});

export const GET: RequestHandler = ({ request }) => handler(request);
export const OPTIONS: RequestHandler = () => metadataCorsOptionsRequestHandler()();
