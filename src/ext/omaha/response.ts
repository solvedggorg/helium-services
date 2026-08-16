import type { OmahaResponse, ProtocolVersion, ResponseType } from './types.ts';
import * as V3 from './v3/index.ts';
import * as V4 from './v4/index.ts';

export const makeHeaders = ({ response }: V3.OmahaResponse | V4.OmahaResponse) => {
    return {
        'x-daynum': String(response.daystart.elapsed_days),
        'x-daystart': String(response.daystart.elapsed_seconds),
        'cache-control': 'no-cache, no-store, max-age=0, must-revalidate',
        'accept-ranges': 'none',
        pragma: 'no-cache',
    };
};

export function createResponse(
    responseType: ResponseType,
    version: ProtocolVersion,
    data: OmahaResponse,
    bindings: Env,
) {
    if (version === 3) {
        return V3.createResponse(responseType, data as V3.OmahaResponse, bindings);
    } else if (version === 4) {
        return V4.createResponse(responseType, data as V4.OmahaResponse, bindings);
    } else throw `unknown omaha version: ${version}`;
}
