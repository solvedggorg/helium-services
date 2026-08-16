

export const DICT_COMMIT = 'cccf64a8acc951afe3f47fee023908e55699bc58';
const DICT_REPO = 'https://chromium.googlesource.com/chromium/deps/hunspell_dictionaries';
const INDEX_KEY = 'index.json';

const GITILES_PREFIX = ")]}'";

type IndexEntry = {
    name: string;
    size?: number;
};

const mimeFor = (name: string) => {
    if (name.endsWith('.txt') || name.endsWith('.dic') || name.endsWith('.aff')) {
        return 'text/plain; charset=utf-8';
    }
    if (name.endsWith('.html') || name.endsWith('.htm')) {
        return 'text/html; charset=utf-8';
    }
    return 'application/octet-stream';
};

const objectKey = (name: string) => name.replace(/^\/+/, '');

const isSafeName = (name: string) => {
    if (!name || name.includes('..') || name.startsWith('/') || name.includes('\\')) {
        return false;
    }
    return /^[A-Za-z0-9._+\-]+$/.test(name);
};

const parseGitilesJson = async (response: Response) => {
    const text = await response.text();
    const json = text.startsWith(GITILES_PREFIX) ? text.slice(GITILES_PREFIX.length) : text;
    return JSON.parse(json) as {
        entries?: { name: string; type: string; size?: number }[];
    };
};

const loadIndex = async (bindings: Env, ctx: ExecutionContext): Promise<IndexEntry[]> => {
    const cached = await bindings.DICTS.get(INDEX_KEY);
    if (cached) {
        return cached.json<IndexEntry[]>();
    }

    const response = await fetch(
        `${DICT_REPO}/+/${DICT_COMMIT}/?format=JSON`,
    );
    if (!response.ok) {
        throw { status: 502, text: 'failed to list dictionaries' };
    }

    const data = await parseGitilesJson(response);
    const entries = (data.entries ?? [])
        .filter((entry) => entry.type === 'blob' && isSafeName(entry.name))
        .map((entry) => ({ name: entry.name, size: entry.size }));

    ctx.waitUntil(
        bindings.DICTS.put(INDEX_KEY, JSON.stringify(entries), {
            httpMetadata: { contentType: 'application/json' },
        }),
    );

    return entries;
};

const fetchOriginFile = async (name: string) => {
    const response = await fetch(
        `${DICT_REPO}/+/${DICT_COMMIT}/${name}?format=TEXT`,
    );
    if (!response.ok) {
        throw { status: 404, text: 'Not Found' };
    }

    const encoded = (await response.text()).replace(/\s+/g, '');
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
};

const listingPage = (entries: IndexEntry[]) => {
    const rows = entries
        .map((entry) => {
            const size = typeof entry.size === 'number' ? String(entry.size) : '';
            return `<a href="${entry.name}">${entry.name}</a>${size ? ` ${size}` : ''}`;
        })
        .join('\n');

    return `<!DOCTYPE html>
<html>
<head><title>Index of /dict/</title></head>
<body>
<h1>Index of /dict/</h1>
<pre>${rows}
</pre>
</body>
</html>`;
};

export const handle = async (
    request: Request,
    bindings: Env,
    ctx: ExecutionContext,
): Promise<Response> => {
    if (!['GET', 'HEAD'].includes(request.method)) {
        throw { status: 405, text: 'method not allowed' };
    }

    const url = new URL(request.url);
    const rest = url.pathname.replace(/^\/dict\/?/, '');

    if (!rest) {
        const entries = await loadIndex(bindings, ctx);
        const body = listingPage(entries);
        return new Response(request.method === 'HEAD' ? null : body, {
            headers: {
                'content-type': 'text/html; charset=utf-8',
                'cache-control': 'public, max-age=86400, stale-while-revalidate=604800',
                'cache-tag': 'dict',
            },
        });
    }

    if (!isSafeName(rest)) {
        throw { status: 404, text: 'Not Found' };
    }

    const key = objectKey(rest);
    let object = await bindings.DICTS.get(key);
    if (!object) {
        const bytes = await fetchOriginFile(rest);
        ctx.waitUntil(
            bindings.DICTS.put(key, bytes, {
                httpMetadata: { contentType: mimeFor(rest) },
            }),
        );
        return new Response(request.method === 'HEAD' ? null : bytes, {
            headers: {
                'content-type': mimeFor(rest),
                'content-length': String(bytes.byteLength),
                'cache-control': 'public, max-age=604800, stale-while-revalidate=2592000',
                'cache-tag': 'dict',
            },
        });
    }

    const headers = new Headers();
    headers.set('content-type', object.httpMetadata?.contentType || mimeFor(rest));
    headers.set('cache-control', 'public, max-age=604800, stale-while-revalidate=2592000');
    headers.set('cache-tag', 'dict');
    if (object.size) {
        headers.set('content-length', String(object.size));
    }
    if (object.httpEtag) {
        headers.set('etag', object.httpEtag);
    }

    if (request.headers.get('if-none-match') === object.httpEtag) {
        return new Response(null, { status: 304, headers });
    }

    return new Response(request.method === 'HEAD' ? null : object.body, { headers });
};
