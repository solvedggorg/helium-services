// Secrets are not declared in wrangler.jsonc. Merge them onto the generated Env.
interface Env {
    HMAC_SECRET?: string;
    UBO_ASSETS_JSON_URL?: string;
    UBO_ASSETS_JSON_SHA256?: string;
}
