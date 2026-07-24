import { assertEquals } from '@std/assert';

import { processedPath, writeFileWithDirs } from '../src/paths.ts';
import { backfillReportSearch } from '../src/report-search.ts';
import type { SymbolicatorResponse } from '../src/signature.ts';
import { makeTestEnv } from './helpers.ts';

Deno.test('report search backfills existing processed responses', async () => {
    const env = await makeTestEnv();
    try {
        const id = crypto.randomUUID();
        const response: SymbolicatorResponse = {
            status: 'completed',
            stacktraces: [{
                frames: [{
                    function: 'blink::LocalFrame::Navigate()',
                    symbol: 'LocalFrame_Navigate',
                }],
            }],
        };
        env.db.insertReport({
            id,
            product: 'Helium',
            version: '1.0',
            guid: null,
            ptype: null,
            channel: null,
            annotations: '{}',
            received_at: Date.now(),
        });
        const groupId = env.db.upsertGroup(
            'backfill-search',
            'blink::LocalFrame::Navigate()',
            Date.now(),
        );
        env.db.markProcessed(id, groupId, 'Windows', Date.now(), true, 1);
        await writeFileWithDirs(
            processedPath(env.dir, id),
            JSON.stringify(response),
        );

        assertEquals(env.db.searchReports('LocalFrame'), []);
        assertEquals(
            await backfillReportSearch(env.db, env.dir),
            { indexed: 1, failed: 0 },
        );
        assertEquals(
            env.db.searchReports('LocalFrame').map((report) => report.id),
            [id],
        );
        assertEquals(
            env.db.searchReports('LocalFrame_Navigate').map((report) =>
                report.id
            ),
            [id],
        );
        assertEquals(
            await backfillReportSearch(env.db, env.dir),
            { indexed: 0, failed: 0 },
        );

        env.db.deleteReport(id);
        assertEquals(env.db.searchReports('LocalFrame'), []);
    } finally {
        await env.cleanup();
    }
});
