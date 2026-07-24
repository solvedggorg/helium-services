import type { Db } from './db.ts';
import { logError, logEvent } from './log.ts';
import { processedPath } from './paths.ts';
import type { SymbolicatorResponse } from './signature.ts';

export function functionSearchText(response: SymbolicatorResponse): string {
    const names = new Set<string>();

    for (const trace of response.stacktraces ?? []) {
        for (const frame of trace.frames) {
            for (const name of [frame.function, frame.symbol]) {
                const normalized = name?.trim();
                if (normalized) {
                    names.add(normalized);
                }
            }
        }
    }

    return [...names].join('\n');
}

export function indexReportResponse(
    db: Db,
    reportId: string,
    response: SymbolicatorResponse,
): void {
    db.indexReportFunctions(reportId, functionSearchText(response));
}

export async function backfillReportSearch(
    db: Db,
    dataDir: string,
) {
    let indexed = 0;
    let failed = 0;

    for (const reportId of db.reportsMissingSearchIndex()) {
        try {
            const response = JSON.parse(
                await Deno.readTextFile(processedPath(dataDir, reportId)),
            ) as SymbolicatorResponse;
            indexReportResponse(db, reportId, response);
            indexed++;
        } catch (err) {
            failed++;
            logError('report_search_backfill_error', err, {
                report_id: reportId,
            });
        }
    }

    if (indexed > 0 || failed > 0) {
        logEvent('report_search_backfilled', { indexed, failed });
    }

    return { indexed, failed };
}
