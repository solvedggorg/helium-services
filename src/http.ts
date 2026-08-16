export const HSTS = 'max-age=63072000';

export const SECURITY_HEADERS: Record<string, string> = {
    'Strict-Transport-Security': HSTS,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex, nofollow',
};

export const withSecurityHeaders = (response: Response) => {
    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
        if (!headers.has(name)) {
            headers.set(name, value);
        }
    }
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
};

export const textResponse = (
    status: number,
    body: string,
    headers?: Record<string, string>,
) =>
    new Response(body, {
        status,
        headers: {
            'content-type': 'text/plain; charset=utf-8',
            ...headers,
        },
    });

export const rewritePathname = (request: Request, pathname: string) => {
    const url = new URL(request.url);
    url.pathname = pathname;
    return new Request(url, request);
};

export const isHttpError = (
    error: unknown,
): error is { status: number; text: string } => {
    return !!error
        && typeof error === 'object'
        && 'status' in error
        && 'text' in error
        && typeof (error as { status: unknown }).status === 'number';
};

export const logError = (error: unknown, path: string) => {
    if (isHttpError(error) && error.status < 500) {
        return;
    }
    const message = error instanceof Error
        ? error.message
        : isHttpError(error)
        ? error.text
        : typeof error === 'string'
        ? error
        : String(error);
    console.error(JSON.stringify({
        message: 'unhandled error',
        error: message,
        path,
    }));
};
