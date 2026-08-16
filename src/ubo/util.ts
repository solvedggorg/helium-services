export const digest = async (str: string) => {
    const u8 = new TextEncoder().encode(str);
    const hashBytes = await crypto.subtle.digest('SHA-256', u8);
    return [...new Uint8Array(hashBytes)]
        .map((a) => a.toString(16).padStart(2, '0'))
        .join('');
};

export const isValidUrl = (str: unknown) => {
    try {
        const { protocol } = new URL(String(str));
        return protocol === 'http:' || protocol === 'https:';
    } catch {
        return false;
    }
};

export const respondWithError = (e: unknown) => {
    if (typeof e === 'string') {
        e = { status: 400, text: e };
    }

    if (e instanceof Object) {
        if ('status' in e && 'text' in e) {
            return new Response(
                e.text as string,
                {
                    status: e.status as number,
                    headers: { 'content-type': 'text/plain; charset=utf-8' },
                },
            );
        }
    }

    console.error(JSON.stringify({
        message: 'ubo unhandled error',
        error: e instanceof Error ? e.message : String(e),
    }));

    return new Response('server error', { status: 500 });
};

export const shotgunFetch = async (
    input: readonly (RequestInfo | URL)[],
    init?: Omit<RequestInit, 'signal'>,
) => {
    const controller = new AbortController();
    const response = await Promise.any(
        input.map(async (info) => {
            const response = await fetch(info, {
                ...init,
                signal: controller.signal,
                cf: { cacheEverything: true, cacheTtl: 3600 },
            } as RequestInit);

            if (response.ok && response.status === 200) {
                const body = await response.arrayBuffer();
                return new Response(body, response);
            }
            throw response;
        }),
    );

    controller.abort();
    return response;
};

export const tag = async (s: string) => {
    const buf = await crypto.subtle.digest(
        { name: 'SHA-256' },
        new TextEncoder().encode(s),
    );

    return ['"', ...new Uint32Array(buf).slice(0, 3), '"']
        .map((a) => a.toString(36))
        .join('');
};
