import { Hono, type MiddlewareHandler } from 'hono';

import type { Db } from './db.ts';
import type { Config } from './config.ts';
import type { SessionPayload } from './session.ts';
import * as Auth from './routes/auth.ts';
import * as Ingest from './routes/ingest.ts';
import * as Web from './routes/web.ts';

export interface AppDeps {
    config: Config;
    db: Db;
    githubFetch?: typeof fetch;
    symsorterBin?: string;
    webAuth?: MiddlewareHandler<Env>;
}

export type Env = {
    Variables: {
        session: SessionPayload;
        token: { token: string; expires_in?: number } | undefined;
        'user-github': { login?: string } | undefined;
    };
};

function securityHeaders(config: Config): MiddlewareHandler<Env> {
    return async (c, next) => {
        await next();
        c.header(
            'content-security-policy',
            "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
        );
        c.header('cross-origin-opener-policy', 'same-origin');
        c.header('cross-origin-resource-policy', 'same-origin');
        c.header('referrer-policy', 'no-referrer');
        c.header('x-content-type-options', 'nosniff');
        c.header('x-frame-options', 'DENY');
        if (config.publicBaseUrl.startsWith('https://')) {
            c.header(
                'strict-transport-security',
                'max-age=63072000; includeSubDomains',
            );
        }
    };
}

export function buildApp(deps: AppDeps): Hono<Env> {
    const app = new Hono<Env>();

    app.use('*', securityHeaders(deps.config));
    app.use('/auth/*', async (c, next) => {
        await next();
        c.header('cache-control', 'no-store');
    });

    app.route('/', Ingest.ingestRoutes(deps));
    app.route('/', Auth.authRoutes(deps));
    app.route('/', Web.webRoutes(deps));

    return app;
}
