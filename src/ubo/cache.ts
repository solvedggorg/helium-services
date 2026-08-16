import * as Resource from './util.ts';

type PositiveCacheEntry = {
    expiry?: number;
    text: string;
    type: string;
    tag: string;
};

type NegativeCacheEntry = {
    expiry?: number;
    missing: true;
};

type CacheEntry = PositiveCacheEntry | NegativeCacheEntry;
type Producent = () => Promise<string>;
type Options = Partial<{
    type: string;
    expiry_seconds: number;
}>;

const _prpr: Record<string, ReturnType<Producent>> = {};

const kvKey = (key: string) => `ubo:asset:${key}`;

const readEntry = async (bindings: Env, key: string) => {
    return bindings.CACHE.get<CacheEntry>(kvKey(key), 'json');
};

const writeEntry = async (
    bindings: Env,
    key: string,
    value: CacheEntry,
    ttlSeconds?: number,
) => {
    const options = ttlSeconds && ttlSeconds >= 60
        ? { expirationTtl: ttlSeconds }
        : undefined;
    await bindings.CACHE.put(kvKey(key), JSON.stringify(value), options);
};

const isFresh = (entry: CacheEntry | null) => {
    return !!entry && (typeof entry.expiry === 'undefined' || entry.expiry > Date.now());
};

async function set(bindings: Env, key: string, value: string, options: Options) {
    const data: PositiveCacheEntry = {
        type: options.type ?? 'text/plain; charset=utf-8',
        tag: await Resource.tag(value),
        text: value,
    };

    if (typeof options.expiry_seconds !== 'undefined') {
        data.expiry = Date.now() + options.expiry_seconds * 1000;
    }

    await writeEntry(bindings, key, data, options.expiry_seconds);
}

export async function materialize(
    bindings: Env,
    key: string,
    options: Options,
    source: Producent,
) {
    const existing = await readEntry(bindings, key);
    if (isFresh(existing)) {
        if ('missing' in existing!) {
            throw { status: 404, text: 'Not Found' };
        }
        const { type, tag, text } = existing as PositiveCacheEntry;
        return [new Blob([text], { type }), tag] as const;
    }

    let data: string;
    try {
        data = await (_prpr[key] ??= source());
    } catch (e) {
        await writeEntry(bindings, key, {
            missing: true,
            expiry: Date.now() + 30_000,
        }, 60);
        throw e;
    } finally {
        delete _prpr[key];
    }

    await set(bindings, key, data, options);
    const stored = await readEntry(bindings, key);
    if (!stored || 'missing' in stored) {
        throw 'something went very wrong';
    }
    return [new Blob([stored.text], { type: stored.type }), stored.tag] as const;
}
