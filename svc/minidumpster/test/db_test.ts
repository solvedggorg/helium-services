import { assertEquals } from '@std/assert';
import { join } from '@std/path';
import { DatabaseSync } from 'node:sqlite';

import { Db } from '../src/db.ts';
import { makeTestEnv } from './helpers.ts';

Deno.test('database migration removes the legacy dump_deleted column', async () => {
    const dir = await Deno.makeTempDir();
    const path = join(dir, 'db.sqlite');
    try {
        const legacy = new DatabaseSync(path);
        try {
            legacy.exec(`
                CREATE TABLE reports (
                    id TEXT PRIMARY KEY,
                    group_id INTEGER,
                    product TEXT,
                    version TEXT,
                    platform TEXT,
                    guid TEXT,
                    ptype TEXT,
                    channel TEXT,
                    annotations TEXT NOT NULL DEFAULT '{}',
                    status TEXT NOT NULL DEFAULT 'pending',
                    error TEXT,
                    attempts INTEGER NOT NULL DEFAULT 0,
                    next_attempt_at INTEGER NOT NULL DEFAULT 0,
                    received_at INTEGER NOT NULL,
                    processed_at INTEGER,
                    dump_deleted INTEGER NOT NULL DEFAULT 0,
                    kind TEXT NOT NULL DEFAULT 'minidump',
                    symbolicated INTEGER NOT NULL DEFAULT 1
                );
                CREATE INDEX idx_reports_status ON reports(status);
                INSERT INTO reports (id, status, received_at, dump_deleted)
                VALUES ('legacy-report', 'processed', 1234, 1);
            `);
        } finally {
            legacy.close();
        }

        const db = new Db(path);
        try {
            assertEquals(db.getReport('legacy-report')?.status, 'processed');
        } finally {
            db.close();
        }

        const migrated = new DatabaseSync(path);
        try {
            const legacyColumn = migrated.prepare(`
                SELECT 1
                FROM pragma_table_info('reports')
                WHERE name = 'dump_deleted'
            `).get();
            assertEquals(legacyColumn, undefined);
        } finally {
            migrated.close();
        }
    } finally {
        await Deno.remove(dir, { recursive: true }).catch(() => {});
    }
});

Deno.test('groups can be filtered by process type', async () => {
    const env = await makeTestEnv();
    try {
        const addReport = (
            signature: string,
            ptype: string,
            receivedAt: number,
        ) => {
            const id = crypto.randomUUID();
            env.db.insertReport({
                id,
                product: 'Helium',
                version: '1.0',
                guid: null,
                ptype,
                channel: null,
                annotations: '{}',
                received_at: receivedAt,
            });
            const groupId = env.db.upsertGroup(
                signature,
                `${ptype} crash`,
                receivedAt,
            );
            env.db.markProcessed(
                id,
                groupId,
                'Linux',
                receivedAt,
                true,
                1,
            );
            env.db.recountGroups([groupId]);
            return groupId;
        };

        const browserGroup = addReport('browser-signature', 'browser', 1);
        const rendererGroup = addReport('renderer-signature', 'renderer', 2);

        assertEquals(
            env.db.listGroups({ ptype: 'renderer' }).map((group) => group.id),
            [rendererGroup],
        );
        assertEquals(
            env.db.listGroups({ ptype: 'browser' }).map((group) => group.id),
            [browserGroup],
        );
        assertEquals(env.db.filterOptions().ptypes, ['browser', 'renderer']);
    } finally {
        await env.cleanup();
    }
});
