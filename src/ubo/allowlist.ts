

type Path = string;
type sURL = string;

const _paths: Record<Path, sURL[]> = {};
const _parents: Record<string, Path[]> = {};
let loaded = false;
let loadPromise: Promise<void> | null = null;

const persist = (bindings: Env, ctx: ExecutionContext) => {
    ctx.waitUntil(
        bindings.CACHE.put(
            'ubo:allowlist',
            JSON.stringify({ paths: _paths, parents: _parents }),
        ),
    );
};

const ensureLoaded = async (bindings: Env) => {
    if (loaded) {
        return;
    }
    loadPromise ??= (async () => {
        const stored = await bindings.CACHE.get<{
            paths: Record<Path, sURL[]>;
            parents: Record<string, Path[]>;
        }>('ubo:allowlist', 'json');
        if (stored?.paths) {
            Object.assign(_paths, stored.paths);
            Object.assign(_parents, stored.parents ?? {});
        }
        loaded = true;
    })();
    await loadPromise;
};

export const addEntries = async (
    parent: string,
    entries: Record<string, string[]>,
    bindings: Env,
    ctx: ExecutionContext,
) => {
    await ensureLoaded(bindings);

    if (parent in _parents) {
        _parents[parent].forEach((path) => {
            delete _paths[path];
        });
    }

    _parents[parent] = Object.keys(entries);

    for (const [path, urls] of Object.entries(entries)) {
        if (path in _paths) {
            console.warn(JSON.stringify({
                message: 'allowlist path already defined',
                path,
            }));
            continue;
        }
        _paths[path] = [...urls];
    }

    persist(bindings, ctx);
};

export const getURLsForPath = async (
    path: string,
    bindings: Env,
): Promise<readonly string[] | undefined> => {
    await ensureLoaded(bindings);
    return _paths[path];
};
