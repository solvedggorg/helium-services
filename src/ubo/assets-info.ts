import { uboEnv } from './env.ts';

const VERSION_HELIUM = '1.71.0';
const VERSION_VANILLA = '1.71.0';

const CSUM_HELIUM =
    '38252894162bf0cc9ed682669760922c17af67d9a1bd27b082997d732895afd0';
const CSUM_VANILLA =
    '5107ce702293e110ce6cc6467a51e689e919eed4382650c354c1d66db2aacc3d';

export const assetsInfo = (bindings: Env) => {
    const env = uboEnv(bindings);
    const VERSION = env.useHeliumAssets ? VERSION_HELIUM : VERSION_VANILLA;
    const REPO = env.useHeliumAssets ? 'imputnet/uBlock' : 'gorhill/uBlock';

    const fileChecksum = env.customAssetsChecksum
        || (env.useHeliumAssets ? CSUM_HELIUM : CSUM_VANILLA);

    const assetsUrl = env.customAssetsUrl
        || (`https://raw.githubusercontent.com/${REPO}/refs/tags/`
            + `${VERSION}/assets/assets.json`);

    return { fileChecksum, assetsUrl };
};
