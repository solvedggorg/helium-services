import type { Db } from './db.ts';
import { logError, logEvent } from './log.ts';
import { readProcessedResponse } from './reports.ts';
import type { SymbolicatorResponse } from './signature.ts';

function functionSearchText(response: SymbolicatorResponse): string {
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
    db.prepareReportSearchBackfill();
    let indexed = 0;
    let failed = 0;
    let cursor = 0;

    while (true) {
        const reports = db.reportSearchIndexCandidates(cursor);
        if (reports.length === 0) {
            break;
        }

        for (const report of reports) {
            cursor = report.rowId;
            if (!report.needsIndex) {
                continue;
            }
            try {
                const response = await readProcessedResponse(
                    dataDir,
                    report.id,
                );
                indexReportResponse(db, report.id, response);
                indexed++;
            } catch (err) {
                failed++;
                logError('report_search_backfill_error', err, {
                    report_id: report.id,
                });
            }
        }
    }

    if (indexed > 0 || failed > 0) {
        logEvent('report_search_backfilled', { indexed, failed });
    }

    return { indexed, failed };
}
