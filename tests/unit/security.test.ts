import {describe, expect, it} from 'vitest';
import {hash, hashPassword, newToken, validOrigin, verifyPassword} from '../../src/lib/security';
describe('authentication primitives', () => {
  it('uses salted password hashes and rejects incorrect passwords', async () => {const a = await hashPassword('a-test-password-123'); const b = await hashPassword('a-test-password-123'); expect(a).not.toBe(b); expect(await verifyPassword('a-test-password-123',a)).toBe(true); expect(await verifyPassword('wrong',a)).toBe(false); expect(await verifyPassword('anything','corrupt')).toBe(false);});
  it('generates high entropy opaque session tokens', () => {const token = newToken(); expect(token).toMatch(/^[a-f0-9]{64}$/); expect(newToken()).not.toBe(token); expect(hash(token)).not.toBe(token);});
  it.each([null, 'null', 'https://evil.example', 'https://qarzhy.kz.evil.example', 'http://qarzhy.kz'])('rejects cross origin %s', origin => expect(validOrigin(origin, 'https://qarzhy.kz')).toBe(false));
  it('accepts the exact configured origin only', () => expect(validOrigin('https://qarzhy.kz','https://qarzhy.kz')).toBe(true));
});
