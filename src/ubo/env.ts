const getBool = (value: string | undefined) => {
    const val = value || '';
    return ['true', 'yes', 'on', 't', 'y', '1'].includes(val.toLowerCase());
};

const getUrl = (value: string | undefined) => {
    if (value) {
        return new URL(value);
    }
};

export const uboEnv = (env: Env) => {
    const rawBase = env.UBO_PROXY_BASE_URL;
    if (!rawBase) {
        throw new Error('env UBO_PROXY_BASE_URL is missing');
    }
    const baseURL = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;

    const useHeliumAssets = !getBool(env.UBO_USE_ORIGINAL_UBLOCK_ASSETS);
    const customAssetsUrl = getUrl(env.UBO_ASSETS_JSON_URL);
    const customAssetsChecksum = env.UBO_ASSETS_JSON_SHA256;

    if (!useHeliumAssets && customAssetsChecksum) {
        throw 'USE_ORIGINAL_UBLOCK_ASSETS and UBO_ASSETS_JSON_* '
            + 'cannot be set at the same time';
    }

    if (!!customAssetsUrl !== !!customAssetsChecksum) {
        throw 'one of UBO_ASSETS_JSON_{URL,SHA256} is defined, but other'
            + 'is missing';
    }

    return {
        baseURL,
        useHeliumAssets,
        customAssetsUrl,
        customAssetsChecksum,
    };
};
