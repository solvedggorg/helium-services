import { decodeBase64, encodeBase64 } from './base64url.ts';
import * as Util from './util.ts';

let cachedSecret: string | null = null;
let cachedKey: CryptoKey | null = null;

const importSecret = async (secret: string) => {
    if (cachedKey && cachedSecret === secret) {
        return cachedKey;
    }

    cachedKey = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: { name: 'SHA-256' } },
        false,
        ['sign', 'verify'],
    );
    cachedSecret = secret;
    return cachedKey;
};

const getSecret = async (bindings: Env) => {
    const secret = bindings.HMAC_SECRET;
    if (!secret || secret.length < 32) {
        return null;
    }
    return importSecret(secret);
};

const getBaseOrigin = (bindings: Env) => {
    const value = bindings.PROXY_BASE_URL;
    if (!value) {
        return undefined;
    }
    return new URL(value);
};

const sign = async (key: CryptoKey, url: string, expiry: number) => {
    Util.parseURLStrict(url);

    const signature = await crypto.subtle.sign(
        'HMAC',
        key,
        new TextEncoder().encode(JSON.stringify({ url, expiry })),
    );

    return encodeBase64(signature);
};

const verify = async (key: CryptoKey, url: string, exp: string, sig: string) => {
    Util.parseURLStrict(url);

    const signature = decodeBase64(sig);
    const ok = await crypto.subtle.verify(
        'HMAC',
        key,
        signature,
        new TextEncoder().encode(JSON.stringify({ url, expiry: Number(exp) })),
    );

    if (!ok) {
        throw 'signature verification failed';
    }
};

export const wrap = async (url: string, bindings: Env) => {
    const baseOrigin = getBaseOrigin(bindings);
    const secret = await getSecret(bindings);
    if (!baseOrigin || !secret) {
        return url;
    }

    const proxyURL = new URL(baseOrigin);
    const expiry = Util.now() + Util.ms.hours(1);

    if (!proxyURL.pathname.endsWith('/')) {
        proxyURL.pathname += '/';
    }
    proxyURL.pathname += 'proxy';
    proxyURL.searchParams.set('url', url);
    proxyURL.searchParams.set('sig', await sign(secret, url, expiry));
    proxyURL.searchParams.set('exp', expiry.toString());

    return proxyURL.toString();
};

export const unwrap = async (url_: string, bindings: Env) => {
    const baseOrigin = getBaseOrigin(bindings);
    const secret = await getSecret(bindings);
    if (!baseOrigin || !secret) {
        throw { status: 404, text: 'content proxying is disabled' };
    }

    const url = new URL(url_);
    const originalURL = url.searchParams.get('url');
    const signature = url.searchParams.get('sig');
    const expiry = url.searchParams.get('exp');

    if (!originalURL || !signature || !expiry) {
        throw 'malformed url';
    }

    await verify(secret, originalURL, expiry, signature);

    if (Util.now() > +expiry) {
        throw { status: 410, text: 'URL expired' };
    }

    return originalURL;
};
