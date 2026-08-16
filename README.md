# helium services

Public Helium endpoints for **https://services1.iresolvedllc.com**, deployed
as a Cloudflare Worker (`helium-services`).

The Worker replaces the previous nginx + Deno container edge:

| Path | Service |
|------|---------|
| `/` | Redirect to https://helium.computer |
| `/robots.txt` | Disallow crawlers |
| `/connectivitycheck` | `204` |
| `/bangs.json` | DuckDuckGo-style bangs |
| `/dict/*` | Hunspell dictionaries (R2, filled from Chromium on demand) |
| `/ext/*`, `/com` | Chrome Web Store / Omaha extension proxy |
| `/ubo/*` | uBlock Origin list mirror |

`minidumpster` and `minipush` stay on Docker; they need a filesystem,
Symbolicator, and long-lived WebSockets.

Also available at `https://helium-services.solvedgg.workers.dev`.

## Deploy

```sh
npm install
npx wrangler types
npx wrangler secret put HMAC_SECRET   # >= 32 chars; already set in prod
npm run deploy
```

`wrangler.jsonc` binds the Worker to `services1.iresolvedllc.com`. KV
(`CACHE`) and R2 (`DICTS`) are already provisioned.

If `node` on this machine is Bun, run Wrangler with a real Node 22+
binary. Bun hangs in `wrangler dev`.

## Local

```sh
cp .dev.vars.example .dev.vars
npm run dev
```

## Docker (optional)

The original compose stack is still here. See [setup.sh](setup.sh) and
[.env.example](.env.example).
