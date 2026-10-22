import EmbeddedPostgres from 'embedded-postgres';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const url = new URL(process.env.DATABASE_URL);
if (!['127.0.0.1', 'localhost'].includes(url.hostname) || !/^\/qarzhy(_utf8)?$/.test(url.pathname)) throw new Error('Локальный помощник допускает только localhost/qarzhy или qarzhy_utf8.');
const database = url.pathname.slice(1);
const pg = new EmbeddedPostgres({databaseDir: path.resolve('.local-db'), user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), port: Number(url.port), persistent: true, authMethod: 'scram-sha-256', initdbFlags: ['--encoding=UTF8', '--locale=C'], postgresFlags: ['-h', '127.0.0.1'], onLog: () => {}, onError: message => {if (String(message).includes('FATAL')) console.error('PostgreSQL reported an error.');}});
if (!existsSync('.local-db/PG_VERSION')) await pg.initialise();
const windows = process.platform === 'win32';
const pgCtl = path.resolve('node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe');
// pg_ctl uses a restricted Windows token, including when the parent user is an administrator.
if (windows) execFileSync(pgCtl, ['start', '-D', path.resolve('.local-db'), '-l', path.resolve('local-postgres.log'), '-o', `-p ${Number(url.port)} -h 127.0.0.1`, '-w'], {windowsHide: true, stdio: 'ignore'});
else await pg.start();
const client = pg.getPgClient('postgres', '127.0.0.1'); await client.connect();
const result = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);
if (!result.rowCount) await client.query(`CREATE DATABASE "${database}" ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C'`);
await client.end();
console.log(`PostgreSQL готов на 127.0.0.1:${url.port}. Данные: .local-db. Ctrl+C для остановки.`);
let stopping = false;
async function stop() {if (stopping) return; stopping = true; if (windows) execFileSync(pgCtl, ['stop', '-D', path.resolve('.local-db'), '-m', 'fast', '-w'], {windowsHide: true, stdio: 'pipe'}); else await pg.stop(); process.exit(0);}
process.on('SIGINT', stop); process.on('SIGTERM', stop);
setInterval(() => {}, 60000);
