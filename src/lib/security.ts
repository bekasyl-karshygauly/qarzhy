import {randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash} from 'node:crypto';
const scrypt = (password: string, salt: string) => new Promise<Buffer>((resolve, reject) => scryptCallback(password, salt, 64, {N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024}, (error, key) => error ? reject(error) : resolve(key)));
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const newToken = () => randomBytes(32).toString('hex');
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt);
  return `scrypt32768:${salt}:${key.toString('hex')}`;
}
export async function verifyPassword(password: string, encoded: string) {
  const [algorithm, salt, expected] = encoded.split(':');
  if (!['scrypt32768','scrypt'].includes(algorithm) || !salt || expected?.length !== 128) return false;
  // Retain compatibility with accounts created during the initial local pilot.
  const actual = algorithm === 'scrypt32768' ? await scrypt(password, salt) : await new Promise<Buffer>((resolve, reject) => scryptCallback(password, salt, 64, (error, key) => error ? reject(error) : resolve(key)));
  return timingSafeEqual(actual, Buffer.from(expected, 'hex'));
}
export function validOrigin(origin: string | null, appUrl: string) {
  try { return origin !== null && origin === new URL(appUrl).origin; } catch { return false; }
}
