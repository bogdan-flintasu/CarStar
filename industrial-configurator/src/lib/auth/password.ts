import { timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';

// bcrypt hash of a random throwaway string. Compared against when the username
// is wrong or auth is not configured, so every failure path costs one bcrypt run.
const DUMMY_HASH = '$2b$12$ZotQUp7MsFlktlQgFFEI8u/gFbzmud6ySwPrb4fRpLUUy3bs.c9LC';

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) {
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

const BCRYPT_HASH = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;
let warned = false;

/**
 * Check credentials against ADMIN_USERNAME and ADMIN_PASSWORD_HASH (bcrypt).
 * Fails closed when either env var is missing or the hash is malformed.
 *
 * Next.js expands `$VAR` in .env files, so the hash must be written with every
 * `$` escaped: ADMIN_PASSWORD_HASH=\$2b\$12\$...  (platform env vars need no escaping).
 */
export async function verifyAdminCredentials(username: string, password: string): Promise<boolean> {
  const expectedUser = process.env.ADMIN_USERNAME;
  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (!expectedUser || !hash || !BCRYPT_HASH.test(hash)) {
    if (!warned) {
      warned = true;
      console.error(
        'Admin login disabled: ADMIN_USERNAME or ADMIN_PASSWORD_HASH missing or not a bcrypt hash ' +
          '(in .env, escape each $ as \\$).',
      );
    }
    await bcrypt.compare(password, DUMMY_HASH);
    return false;
  }
  const userOk = safeEqual(username, expectedUser);
  const passOk = await bcrypt.compare(password, userOk ? hash : DUMMY_HASH);
  return userOk && passOk;
}
