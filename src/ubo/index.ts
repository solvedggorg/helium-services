import * as Assets from './ublock.ts';
import * as Util from './util.ts';

const handleData = (request: Request, bindings: Env, ctx: ExecutionContext) => {
    const url = new URL(request.url);

    if (url.pathname === '/assets.json') {
        return Assets.handleAssets(bindings, ctx);
    }

    return Assets.handleFilterlist(url.pathname, bindings, ctx);
};

export const handle = async (
    request: Request,
    bindings: Env,
    ctx: ExecutionContext,
): Promise<Response> => {
    try {
        if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
            throw { status: 405, text: 'method not allowed' };
        }

        const [data, etag] = await handleData(request, bindings, ctx);
        const cachedOnClient = request.headers.get('if-none-match')
            ?.split(', ', 8)
            .includes(etag);

        const headers: Record<string, string> = {
            'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
            'Cache-Tag': 'ubo',
            'Content-Type': data.type,
            'ETag': etag,
            'Vary': 'Accept-Encoding',
        };

        if (request.method === 'OPTIONS') {
            return new Response(null, {
                status: 204,
                headers: {
                    Allow: 'OPTIONS, GET, HEAD',
                    ...headers,
                },
            });
        }

        if (request.method === 'HEAD' || cachedOnClient) {
            return new Response(null, {
                status: cachedOnClient ? 304 : 200,
                headers,
            });
        }

        return new Response(data.stream(), { headers });
    } catch (e) {
        return Util.respondWithError(e);
    }
};
