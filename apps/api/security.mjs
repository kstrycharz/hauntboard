import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { CompactEncrypt, compactDecrypt } from 'jose';
export const token = () => randomBytes(32).toString('base64url');
export const hash = (value) => createHash('sha256').update(value).digest('hex');
export const same = (left, right) =>
  typeof left === 'string' &&
  typeof right === 'string' &&
  left.length === right.length &&
  timingSafeEqual(Buffer.from(left), Buffer.from(right));
export function problem(code, status = 400) {
  return Object.assign(new Error(code), { safeCode: code, statusCode: status });
}
export async function rateLimit(db, key, limit, seconds) {
  const result = await db.query(
    `INSERT INTO rate_limits(bucket,count,expires_at) VALUES($1,1,now()+$2*interval '1 second')
    ON CONFLICT(bucket) DO UPDATE SET count=CASE WHEN rate_limits.expires_at<now() THEN 1 ELSE rate_limits.count+1 END,
    expires_at=CASE WHEN rate_limits.expires_at<now() THEN excluded.expires_at ELSE rate_limits.expires_at END RETURNING count`,
    [key, seconds],
  );
  if (result.rows[0].count > limit) throw problem('TRY_AGAIN_LATER', 429);
}
export const privateRateKey = (key, ip, route) =>
  createHmac('sha256', key).update(`${ip}:${route}`).digest('hex');
export async function sealIntent(intent, key) {
  return new CompactEncrypt(new TextEncoder().encode(JSON.stringify(intent)))
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM', typ: 'hauntbox-reward-intent', version: 1 })
    .encrypt(key);
}
export async function openIntent(sealed, key) {
  const { plaintext, protectedHeader } = await compactDecrypt(sealed, key, {
    keyManagementAlgorithms: ['dir'],
    contentEncryptionAlgorithms: ['A256GCM'],
  });
  if (protectedHeader.typ !== 'hauntbox-reward-intent' || protectedHeader.version !== 1)
    throw problem('INVALID_REWARD_INTENT');
  return JSON.parse(new TextDecoder().decode(plaintext));
}
