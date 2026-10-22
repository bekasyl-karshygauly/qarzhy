import {describe, expect, it} from 'vitest';
import {containsSecret, privatePublishPath} from '../../scripts/check-publish.mjs';

describe('source publication boundaries', () => {
  it.each(['.env', '.env.production', '.ENV.VERCEL', '.local-db/data/base/1', '.design/account.png', '.superdesign/resume.json', '.vercel/.env.production.local', 'backups/finance.sql', 'docs/PROJECT-STATUS.md', '.pgpass', 'host.key', '.local-db\\data\\base'])('blocks local private material: %s', name => expect(privatePublishPath(name)).toBe(true));
  it.each(['.env.example', '.env.production.example', '.env.vercel.example', '.github/workflows/verify.yml', 'prisma/migrations/initial/migration.sql', 'src/lib/security.ts', 'public/icon-512.png'])('keeps safe source and migration files: %s', name => expect(privatePublishPath(name)).toBe(false));
  it('detects a known value even in binary content and does not serialize it', () => {
    const secret = 'fixture-local-private-value';
    expect(containsSecret(Buffer.from([0, 1, ...Buffer.from(secret)]), [secret])).toBe(true);
    expect(containsSecret('ordinary source', [secret])).toBe(false);
  });
  it('detects Google-key shaped values including a final hyphen', () => {
    expect(containsSecret('AIza' + 'a'.repeat(35))).toBe(true);
    expect(containsSecret('AIza' + 'a'.repeat(34) + '-')).toBe(true);
    expect(containsSecret('AI_API_KEY=')).toBe(false);
  });
  it('detects private key headers without treating public source as a key', () => {
    expect(containsSecret('-----BEGIN ' + 'OPENSSH PRIVATE KEY-----')).toBe(true);
    expect(containsSecret('-----BEGIN PUBLIC KEY-----')).toBe(false);
  });
});
