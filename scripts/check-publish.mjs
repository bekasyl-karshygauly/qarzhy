import {existsSync, lstatSync, readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync, spawnSync} from 'node:child_process';
import {parseEnv} from 'node:util';

export function privatePublishPath(file) {
  const name = file.replaceAll('\\', '/').toLowerCase();
  const examples = ['.env.example', '.env.production.example', '.env.vercel.example'];
  return (/^\.env(?:\.|$)/.test(name) && !examples.includes(name))
    || /^(?:\.local-db|\.design|\.superdesign|\.vercel|\.codex|\.agents|node_modules|\.next|backups|test-results|playwright-report)\//.test(name)
    || ['docs/project-status.md', '.pgpass'].includes(name)
    || /\.(?:dump|backup|pem|key|p12|pfx)$/.test(name);
}

export function containsSecret(bytes, known = []) {
  const data = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const text = data.toString('utf8');
  return known.some(value => value.length >= 12 && data.includes(Buffer.from(value)))
    || /-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/.test(text)
    || /(?<![0-9A-Za-z_-])AIza[0-9A-Za-z_-]{35}(?![0-9A-Za-z_-])/.test(text);
}

function main() {
  const git = args => execFileSync('git', args, {encoding: 'utf8'});
  const files = [...new Set(git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean))];
  // Values are read only for local comparison and are never logged or exported.
  const env = existsSync('.env') ? parseEnv(readFileSync('.env', 'utf8')) : {};
  // CI's checked-in disposable service password is not a production secret.
  const known = [env.AI_API_KEY, env.POSTGRES_PASSWORD, env.DATABASE_URL, process.env.AI_API_KEY].filter(Boolean);
  try {known.push(decodeURIComponent(new URL(env.DATABASE_URL || '').password));} catch {}
  const violations = [];
  for (const file of files) {
    if (privatePublishPath(file)) {violations.push(file); continue;}
    const absolute = resolve(file);
    if (!existsSync(absolute) || !lstatSync(absolute).isFile()) continue;
    if (containsSecret(readFileSync(absolute), known)) violations.push(file);
  }
  for (const file of ['.env', '.env.production', '.env.vercel', '.local-db/', '.design/', '.superdesign/', '.vercel/', 'backups/']) {
    if (spawnSync('git', ['check-ignore', '--quiet', file]).status !== 0) violations.push(`Missing ignore rule: ${file}`);
  }
  if (violations.length) {
    console.error('Do not publish. Review these paths (secret values are not printed):\n' + [...new Set(violations)].join('\n'));
    process.exitCode = 1;
  } else {
    console.log(`Publish preflight passed for ${files.length} source files. No detected private paths or known key matches. This does not audit Git history or provide a complete secret-scanner guarantee.`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
