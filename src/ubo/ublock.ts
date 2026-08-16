import * as Util from './util.ts';
import * as Cache from './cache.ts';
import * as Allowlist from './allowlist.ts';
import { assetsInfo } from './assets-info.ts';
import { uboEnv } from './env.ts';
import * as Path from '../posix.ts';

type Asset = {
    content: 'internal' | 'filters';
    group?: string;
    parent?: string;
    title?: string;
    tags?: string;
    updateAfter?: number;
    contentURL: string | string[];
    cdnURLs?: string[];
    patchURLs?: string[];
};

type Filename = string;
type AssetFile = Record<Filename, Asset>;

const loadManifestFromGithub = async (bindings: Env) => {
    const info = assetsInfo(bindings);
    const assetList = await fetch(info.assetsUrl).then((a) => a.text());
    const checksum = await Util.digest(assetList);
    if (checksum !== info.fileChecksum) {
        console.warn(JSON.stringify({
            message: 'assets.json checksum mismatch',
            checksum,
            expected: info.fileChecksum,
        }));
        throw `checksum does not match: ${checksum}`;
    }

    return JSON.parse(assetList) as AssetFile;
};

const prepareAssetString = async (bindings: Env, ctx: ExecutionContext) => {
    const manifest = await loadManifestFromGithub(bindings);
    const manifestId = 'assets.json';
    const assetURLs: Record<string, string[]> = {};
    const { baseURL } = uboEnv(bindings);

    for (const [id, asset] of Object.entries(manifest)) {
        const allUrls = [asset.contentURL, asset.cdnURLs || []].flat();

        delete asset.cdnURLs;

        if (id === manifestId) {
            asset.contentURL = new URL('assets.json', baseURL).toString();
            continue;
        }

        const sourceURLs = allUrls.filter(Util.isValidUrl);
        const locals = allUrls.filter((u) => u?.startsWith('assets/'));

        if (!sourceURLs.length) {
            throw `no source for ${asset.title}`;
        }

        const filename = (() => {
            const fn = Path.basename(new URL(sourceURLs[0]!).pathname);
            if (fn.endsWith('.txt') || fn.endsWith('.dat')) {
                return fn;
            }
            return 'filters.txt';
        })();

        const reprHash = [
            ...new Uint32Array(
                await crypto.subtle.digest(
                    { name: 'SHA-256' },
                    new TextEncoder().encode(sourceURLs[0]),
                ),
            ),
        ];

        const key = [
            id,
            reprHash[0]!.toString(16),
            reprHash[1]!.toString(16),
            filename,
        ].join('/');
        const proxyURL = new URL(key, baseURL).toString();

        if (locals.length) {
            asset.contentURL = [proxyURL, ...locals];
        } else {
            asset.contentURL = proxyURL;
        }

        if (asset.patchURLs) {
            asset.patchURLs = [
                new URL(Path.dirname(key), baseURL).toString(),
            ];
        }

        assetURLs[key] = sourceURLs;
    }

    await Allowlist.addEntries(manifestId, assetURLs, bindings, ctx);

    return JSON.stringify(manifest, null, 4);
};

const INCLUDE_REGEX = /^!#include +(\S+)[^\n\r]*(?:[\n\r]+|$)/;

const prepareFilterlist = async (path: string, bindings: Env, ctx: ExecutionContext) => {
    const urls = await Allowlist.getURLsForPath(path, bindings);
    if (!urls) {
        throw { status: 404, text: 'Not Found' };
    }

    const response = await Util.shotgunFetch(urls);
    const text = await response.text();

    const parentId = path.split('/')[0];
    const toAllowlist: Record<string, string[]> = {};

    const addToAllowlist = (relativePath: string) => {
        return (base: string) => {
            const url = new URL(relativePath, base);
            url.hash = '';
            return url.toString();
        };
    };

    const handleInclude = (line: string) => {
        const includeMatch = INCLUDE_REGEX.exec(line);
        if (includeMatch === null || !includeMatch[1]) {
            console.warn(JSON.stringify({
                message: 'erroneous include',
                path,
                line,
            }));
            return;
        }

        const includePath = includeMatch[1];
        const absoluteIncludePath = Path.join(Path.dirname(path), includePath);

        if (
            URL.canParse(includePath)
            || absoluteIncludePath.split('/')[0] !== parentId
        ) {
            console.warn(JSON.stringify({
                message: 'erroneous include',
                path,
                line,
            }));
            return;
        }

        toAllowlist[absoluteIncludePath] ??= urls.map(addToAllowlist(includePath));
    };

    const handleDiff = (line: string) => {
        const diffPath = line.split('! Diff-Path:')[1]!.trim();
        const absoluteDiffPath = Path.join(Path.dirname(path), diffPath).split('#')[0]!;

        if (
            URL.canParse(absoluteDiffPath)
            || absoluteDiffPath.split('/')[0] !== parentId
        ) {
            console.warn(JSON.stringify({
                message: 'unsupported diff',
                path,
                line,
            }));
            return;
        }

        toAllowlist[absoluteDiffPath] ??= urls.map(addToAllowlist(diffPath));
    };

    for (const line of text.split('\n')) {
        if (line.startsWith('!#include')) {
            handleInclude(line);
        } else if (line.startsWith('! Diff-Path')) {
            handleDiff(line);
        }
    }

    await Allowlist.addEntries(path, toAllowlist, bindings, ctx);

    return text;
};

export const handleAssets = (bindings: Env, ctx: ExecutionContext) => {
    return Cache.materialize(
        bindings,
        'assets.json',
        { type: 'application/json; charset=utf-8', expiry_seconds: 86400 },
        () => prepareAssetString(bindings, ctx),
    );
};

export const handleFilterlist = (path: string, bindings: Env, ctx: ExecutionContext) => {
    if (path.startsWith('/')) {
        path = path.substring(1);
    }

    return Cache.materialize(
        bindings,
        path,
        { expiry_seconds: 3600 },
        () => prepareFilterlist(path, bindings, ctx),
    );
};
