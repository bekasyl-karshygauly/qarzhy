// One-time, non-destructive repair of an empty Windows pilot database.
import pg from 'pg';
import {readFileSync, writeFileSync} from 'node:fs';
const url = new URL(process.env.DATABASE_URL);
if (url.hostname !== '127.0.0.1' || url.pathname !== '/qarzhy') throw new Error('Only the original local pilot is supported.');
const existing = new pg.Client({connectionString: url.href}); await existing.connect();
const counts = await existing.query('SELECT (SELECT count(*) FROM "User") + (SELECT count(*) FROM "Transaction") + (SELECT count(*) FROM "Goal") AS total');
if (Number(counts.rows[0].total) !== 0) throw new Error('Database contains data: refusing automatic repair. Export and migrate instead.');
await existing.end(); url.pathname = '/postgres';
const admin = new pg.Client({connectionString:url.href}); await admin.connect();
await admin.query("CREATE DATABASE qarzhy_utf8 ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C'");
await admin.end();
writeFileSync('.env', readFileSync('.env','utf8').replace('/qarzhy?schema=public','/qarzhy_utf8?schema=public'));
console.log('Empty UTF-8 database created; original database preserved. Restart application and run migrations.');
