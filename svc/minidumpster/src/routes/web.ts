import { Hono, type MiddlewareHandler } from 'hono';
import { serveStatic } from 'hono/deno';

import * as ui from '../ui.ts';
import { logError, logEvent } from '../log.ts';
import { requireSession } from './auth.ts';
import type { GroupFilter } from '../db.ts';
import type { AppDeps, Env } from '../app.ts';
import type { SymbolicatorResponse } from '../signature.ts';
import { insertReportForStoredDump } from '../reports.ts';
import {
    dumpPath,
    processedPath,
    symbolsDir,
    writeFileWithDirs,
} from '../paths.ts';
import {
    looksLikeAppleCrashReport,
    parseAppleCrashMeta,
} from '../applecrash.ts';

const disablePrivateResponseCaching: MiddlewareHandler<Env> = async (
    c,
    next,
) => {
    await next();
    c.header('cache-control', 'private, no-store');
};

async function readProcessed(
    dataDir: string,
    reportId: string,
): Promise<SymbolicatorResponse | null> {
    try {
        return JSON.parse(
            await Deno.readTextFile(processedPath(dataDir, reportId)),
        ) as SymbolicatorResponse;
    } catch (err) {
        logError('failed_parsing_processed', err, { dataDir, reportId });
        return null;
    }
}

async function installedSymbolBundles(
    dataDir: string,
): Promise<{ id: string; updatedAt: number | null }[]> {
    const dir = `${symbolsDir(dataDir)}/bundles`;
    const bundles: { id: string; updatedAt: number | null }[] = [];
    try {
        for await (const entry of Deno.readDir(dir)) {
            if (!entry.isFile) {
                continue;
            }

            const stat = await Deno.stat(`${dir}/${entry.name}`);
            bundles.push({
                id: entry.name,
                updatedAt: stat.mtime?.getTime() ?? null,
            });
        }
    } catch (err) {
        if (!(err instanceof Deno.errors.NotFound)) {
            logError('symbols_overview_read_error', err, { dir });
        }
    }
    return bundles.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}

export function webRoutes(deps: AppDeps): Hono<Env> {
    const { config, db } = deps;
    const app = new Hono<Env>();

    // Registered before the session gate: login/denied pages use the shared
    // layout, so its static assets must be public.
    app.get('/style.css', serveStatic({ path: './src/static/style.css' }));
    app.get('/favicon.svg', serveStatic({ path: './src/static/favicon.svg' }));
    app.get('/app.js', serveStatic({ path: './src/static/app.js' }));

    app.use('*', requireSession(config));
    app.use('*', disablePrivateResponseCaching);

    app.get('/', (c) => {
        const filter: GroupFilter = {
            product: c.req.query('product'),
            version: c.req.query('version'),
            platform: c.req.query('platform'),
            sort: c.req.query('sort') === 'last_seen' ? 'last_seen' : 'count',
        };

        const groups = db.listGroups(filter);
        const stats = db.reportsPerDay(Date.now() - 14 * 86400_000);
        const options = db.filterOptions();

        return c.html(
            ui.groupsPage(
                { groups, stats, options, filter },
                c.get('session').login,
            ),
        );
    });

    app.get('/search', (c) => {
        const q = (c.req.query('q') ?? '').trim();
        const login = c.get('session').login;
        if (q.length < 4) {
            return c.html(
                ui.messagePage(
                    'Search',
                    'Enter at least 4 characters of a report id or guid.',
                    login,
                ),
                400,
            );
        }

        const results = db.searchReports(q);
        if (results.length === 1) {
            return c.redirect(`/reports/${results[0].id}`);
        }

        return c.html(ui.searchPage(q, results, login));
    });

    app.get('/upload', (c) => c.html(ui.uploadPage(c.get('session').login)));

    app.get('/symbols', async (c) => {
        const artifacts = db.listArtifactIngests();
        const bundles = await installedSymbolBundles(config.dataDir);
        return c.html(
            ui.symbolsPage({ artifacts, bundles }, c.get('session').login),
        );
    });

    app.post('/upload', async (c) => {
        const login = c.get('session').login;
        let form: FormData;
        try {
            form = await c.req.raw.formData();
        } catch {
            return c.html(
                ui.uploadPage(login, 'Could not read the form.'),
                400,
            );
        }

        const file = form.get('file');
        const pasted = form.get('text');
        let text = '';
        if (file instanceof File && file.size > 0) {
            if (file.size > config.maxDumpSizeBytes) {
                return c.html(ui.uploadPage(login, 'File too large.'), 413);
            }
            text = await file.text();
        } else if (typeof pasted === 'string') {
            text = pasted;
        }
        text = text.trim();
        const encoded = new TextEncoder().encode(text);

        if (text === '') {
            return c.html(
                ui.uploadPage(login, 'Paste a crash report or attach a file.'),
                400,
            );
        }
        if (encoded.byteLength > config.maxDumpSizeBytes) {
            return c.html(ui.uploadPage(login, 'Report too large.'), 413);
        }
        if (!looksLikeAppleCrashReport(text)) {
            return c.html(
                ui.uploadPage(
                    login,
                    'That does not look like a macOS crash report. Paste the '
                        + '"Translated Report" text (raw .ips JSON is not supported).',
                ),
                400,
            );
        }

        const meta = parseAppleCrashMeta(text);
        const existing = meta.incidentId
            ? db.findReportByGuid(meta.incidentId)
            : null;
        if (existing) {
            return c.redirect(`/reports/${existing.id}`);
        }

        const annotations: Record<string, string> = {
            source: 'manual-apple-crash-report',
            uploaded_by: login,
        };
        if (meta.identifier) annotations['bundle_id'] = meta.identifier;
        if (meta.osVersion) annotations['os_version'] = meta.osVersion;
        if (meta.hardwareModel) annotations['hw_model'] = meta.hardwareModel;

        const id = crypto.randomUUID();
        await writeFileWithDirs(dumpPath(config.dataDir, id), encoded);
        insertReportForStoredDump(db, config, {
            id,
            kind: 'apple',
            product: meta.process,
            version: meta.version,
            guid: meta.incidentId,
            ptype: null,
            channel: null,
            annotations: JSON.stringify(annotations),
            received_at: Date.now(),
        });

        logEvent('report_received', {
            report_id: id,
            kind: 'apple',
            uploaded_by: login,
            bytes: encoded.byteLength,
        });

        return c.redirect(`/reports/${id}`);
    });

    app.get('/groups/:id', async (c) => {
        const id = Number(c.req.param('id'));
        const group = Number.isInteger(id) ? db.getGroup(id) : null;
        if (!group) {
            return c.html(ui.messagePage('Not found', 'No such group.'), 404);
        }

        const reports = db.reportsForGroup(group.id);

        let latestStack: { reportId: string; html: string } | null = null;
        const latest = db.latestProcessedReport(group.id);
        if (latest) {
            const resp = await readProcessed(config.dataDir, latest.id);
            if (resp) {
                latestStack = {
                    reportId: latest.id,
                    html: ui.stackHtml(resp, false),
                };
            }
        }

        return c.html(
            ui.groupPage(group, reports, latestStack, c.get('session').login),
        );
    });

    app.get('/reports/:id', async (c) => {
        const report = db.getReport(c.req.param('id'));
        if (!report) {
            return c.html(ui.messagePage('Not found', 'No such report.'), 404);
        }

        const group = report.group_id != null
            ? db.getGroup(report.group_id)
            : null;

        let stack: string | null = null;
        if (report.status === 'processed') {
            const resp = await readProcessed(config.dataDir, report.id);
            if (resp) {
                stack = ui.stackHtml(resp, true);
            }
        }

        return c.html(
            ui.reportPage(
                report,
                group,
                stack,
                report.received_at + config.retentionDays * 86_400_000,
                c.get('session').login,
            ),
        );
    });

    app.get('/reports/:id/dump', async (c) => {
        const report = db.getReport(c.req.param('id'));
        if (!report) {
            return c.text('not found\n', 404);
        }

        try {
            const file = await Deno.open(dumpPath(config.dataDir, report.id), {
                read: true,
            });

            const apple = report.kind === 'apple';
            return c.body(file.readable, 200, {
                'content-type': apple
                    ? 'text/plain; charset=utf-8'
                    : 'application/octet-stream',
                'content-disposition': `attachment; filename="${report.id}.${
                    apple ? 'crash.txt' : 'dmp'
                }"`,
            });
        } catch {
            return c.text('not found\n', 404);
        }
    });

    app.get('/reports/:id/json', async (c) => {
        const report = db.getReport(c.req.param('id'));
        if (!report || report.status !== 'processed') {
            return c.text('not found\n', 404);
        }

        try {
            const file = await Deno.open(
                processedPath(config.dataDir, report.id),
                { read: true },
            );

            return c.body(file.readable, 200, {
                'content-type': 'application/json',
                'content-disposition':
                    `attachment; filename="${report.id}.json"`,
            });
        } catch {
            return c.text('not found\n', 404);
        }
    });

    return app;
}
