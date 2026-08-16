import { any, ms, now } from './util.ts';

const UPDATE_INFO_URL =
    'https://chromiumdash.appspot.com/fetch_releases?channel=Stable&platform=Windows&num=5&offset=0';
const VERSION_REGEX = /^((\d+)\.)+\d+$/;
const KV_KEY = 'chromium:stable-versions';

type CacheData = { versions: string[]; cachedAt: number };

const memory: CacheData = {
    versions: [],
    cachedAt: -1,
};

const fetchVersions = async () => {
    const response = await fetch(UPDATE_INFO_URL);
    if (!response.ok) {
        throw 'response is not ok';
    }

    const data: unknown = await response.json();
    if (!Array.isArray(data)) {
        throw 'invalid response';
    }

    return data.map((o: unknown) => {
        if (!(o instanceof Object && 'version' in o)) {
            throw 'invalid response';
        }

        const version = o.version;
        if (typeof version !== 'string' || !VERSION_REGEX.test(version)) {
            throw 'missing/invalid version in response';
        }

        return version;
    });
};

const loadFromKv = async (bindings: Env) => {
    if (memory.versions.length > 0 && memory.cachedAt + ms.hours(1) >= now()) {
        return;
    }

    const stored = await bindings.CACHE.get<CacheData>(KV_KEY, 'json');
    if (stored?.versions?.length) {
        memory.versions = stored.versions;
        memory.cachedAt = stored.cachedAt;
    }
};

export const getRandomVersion = async (bindings: Env) => {
    await loadFromKv(bindings);

    if (memory.cachedAt + ms.hours(1) < now()) {
        try {
            const newVersions = await fetchVersions();
            memory.cachedAt = now();
            memory.versions = newVersions;
            await bindings.CACHE.put(KV_KEY, JSON.stringify(memory), {
                expirationTtl: 60 * 60 * 2,
            });
        } catch (e) {
            console.error(JSON.stringify({
                message: 'failed to fetch Chromium versions',
                error: e instanceof Error ? e.message : String(e),
            }));
        }
    }

    if (memory.versions.length === 0) {
        throw 'could not get random chrome version';
    }

    return any(memory.versions);
};
