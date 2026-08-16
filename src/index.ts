import { handle as handleExt } from './ext/handlers.ts';
import { handle as handleUbo } from './ubo/index.ts';
import { handle as handleDict } from './dict.ts';
import { logError, rewritePathname, textResponse, withSecurityHeaders } from './http.ts';
import { respondWithError } from './ext/util.ts';

const HELIUM_HOME = 'https://helium.computer';
const ROBOTS = 'User-agent: *\nDisallow: /\n';

const stripPrefix = (pathname: string, prefix: string) => {
    if (pathname === prefix) {
        return '/';
    }
    if (pathname.startsWith(`${prefix}/`)) {
        return pathname.slice(prefix.length) || '/';
    }
    return null;
};

const handleBangs = async (request: Request, env: Env) => {
    const asset = await env.ASSETS.fetch(new URL('/bangs.json', request.url));
    const headers = new Headers(asset.headers);
    headers.set('cache-control', 'public, max-age=86400, stale-if-error=604800, stale-while-revalidate=86400');
    headers.set('access-control-allow-origin', '*');
    headers.set('content-type', 'application/json; charset=utf-8');
    headers.set('cache-tag', 'bangs');
    return new Response(request.method === 'HEAD' ? null : asset.body, {
        status: asset.status,
        headers,
    });
};

const route = async (
    request: Request,
    env: Env,
    ctx: ExecutionContext,
): Promise<Response> => {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname === '/') {
        return Response.redirect(HELIUM_HOME, 302);
    }

    if (pathname === '/robots.txt') {
        return textResponse(200, ROBOTS, {
            'cache-control': 'public, max-age=86400',
        });
    }

    if (pathname === '/connectivitycheck') {
        return new Response(null, { status: 204 });
    }

    if (pathname === '/bangs.json') {
        return handleBangs(request, env);
    }

    if (pathname === '/dict' || pathname.startsWith('/dict/')) {
        return handleDict(request, env, ctx);
    }

    const extPath = stripPrefix(pathname, '/ext');
    if (extPath !== null) {
        return handleExt(rewritePathname(request, extPath), env);
    }

    if (pathname === '/com' || pathname.startsWith('/com/')) {
        return handleExt(request, env);
    }

    const uboPath = stripPrefix(pathname, '/ubo');
    if (uboPath !== null) {
        return handleUbo(rewritePathname(request, uboPath), env, ctx);
    }

    throw { status: 404, text: 'Not Found' };
};

const fetchHandler = async (
    request: Request,
    env: Env,
    ctx: ExecutionContext,
) => {
    const path = new URL(request.url).pathname;
    try {
        const response = await route(request, env, ctx);
        return withSecurityHeaders(response);
    } catch (error) {
        logError(error, path);
        return withSecurityHeaders(respondWithError(error));
    }
};

export default {
    fetch: fetchHandler,
} satisfies ExportedHandler<Env>;
