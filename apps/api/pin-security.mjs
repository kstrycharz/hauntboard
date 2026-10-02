import { scrypt } from 'node:crypto';
import { promisify } from 'node:util';
import { problem } from './security.mjs';
const derive = promisify(scrypt);
let active = 0;
export async function pinHash(pin, salt) {
  if (active >= 2) throw problem('SIGN_IN_BUSY', 429);
  active++;
  try {
    return (
      await derive(pin, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })
    ).toString('base64url');
  } finally {
    active--;
  }
}
