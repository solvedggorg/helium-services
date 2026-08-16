import * as Util from './util.ts';
import * as Omaha from './omaha/index.ts';
import * as ExtensionProxy from './proxy.ts';
import * as RequestHelpers from './helpers.ts';

const handleProxy = async (url: string, headers?: Headers, method = 'GET') => {
    const response = await fetch(url, {
        method,
        headers,
    });

    const filtered = Util.filterHeaders(
        response.headers,
        Util.SAFE_RESPONSE_HEADERS,
    );
    filtered.set('cache-control', 'private, no-store');

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: filtered,
    });
};

const handlePayloadProxy = async (request: Request, bindings: Env) => {
    if (request.method !== 'GET') {
        throw { status: 405, text: 'method not allowed' };
    }

    const originalURL = await ExtensionProxy.unwrap(request.url, bindings);
    return handleProxy(
        originalURL,
        Util.filterHeaders(
            request.headers,
            Util.SAFE_REQUEST_HEADERS,
        ),
    );
};

const CHROME_WEBSTORE_SNIPPET =
    'https://chromewebstore.googleapis.com/v2/items/{}:fetchItemSnippet';

const handleSnippetProxy = (request: Request, _bindings: Env) => {
    if (!['GET', 'POST'].includes(request.method)) {
        throw { status: 405, text: 'method not allowed' };
    }

    const extensionId = new URL(request.url).searchParams.get('id');

    if (!extensionId || !RequestHelpers.APP_ID_REGEX.test(extensionId)) {
        throw 'missing or invalid extension id';
    }

    const headers = new Headers();
    headers.set('Accept', 'application/x-protobuf');
    headers.set('Content-Type', 'application/x-protobuf');
    headers.set('X-HTTP-Method-Override', 'GET');

    return handleProxy(
        CHROME_WEBSTORE_SNIPPET.replace('{}', extensionId),
        headers,
        'POST',
    );
};

type RequestHandler = (request: Request, bindings: Env) => Promise<Response>;
const handlers: Record<string, RequestHandler> = {
    '/proxy': handlePayloadProxy,
    '/cws_snippet': handleSnippetProxy,
    '/com': Omaha.handleOmahaQuery,
    '/': Omaha.handleOmahaQuery,
};

export const handle = (request: Request, bindings: Env) => {
    const { pathname } = new URL(request.url);

    if (Object.hasOwn(handlers, pathname)) {
        return handlers[pathname](request, bindings);
    }

    throw { status: 404, text: 'Not Found' };
};
