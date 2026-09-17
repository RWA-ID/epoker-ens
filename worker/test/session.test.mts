/**
 * SIWE sign-in and session tokens (src/session.ts) against a fake D1.
 *
 *   npm run test:session
 */
import { privateKeyToAccount } from 'viem/accounts';
import { createSiweMessage } from 'viem/siwe';
import { issueNonce, issueToken, verifySiwe, verifyToken, SESSION_TTL_MS } from '../src/session';

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures++;
}

function fakeDb() {
  const nonces = new Map<string, number>();
  const prepare = (sql: string) => {
    let args: any[] = [];
    const stmt = {
      bind(...a: any[]) { args = a; return stmt; },
      async run() {
        if (sql.startsWith('INSERT INTO auth_nonces')) { nonces.set(args[0], args[1]); return { meta: { changes: 1 } }; }
        if (sql.startsWith('DELETE FROM auth_nonces WHERE nonce')) {
          const exp = nonces.get(args[0]);
          if (exp === undefined || exp < args[1]) return { meta: { changes: 0 } };
          nonces.delete(args[0]);
          return { meta: { changes: 1 } };
        }
        if (sql.startsWith('DELETE FROM auth_nonces WHERE expires_at')) {
          for (const [n, e] of nonces) if (e < args[0]) nonces.delete(n);
        }
        return { meta: { changes: 0 } };
      },
    };
    return stmt;
  };
  return { nonces, prepare, async batch(stmts: any[]) { for (const s of stmts) await s.run(); } };
}

const ORIGIN = 'https://epoker.eth.limo';
const env: any = {
  DB: fakeDb(),
  SESSION_SECRET: 'test-secret-0123456789abcdef',
  ALLOWED_ORIGINS: `${ORIGIN},http://localhost:3000`,
};
const account = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');

async function signed(overrides: Partial<Parameters<typeof createSiweMessage>[0]> = {}) {
  const nonce = await issueNonce(env);
  const message = createSiweMessage({
    address: account.address,
    domain: 'epoker.eth.limo',
    uri: ORIGIN,
    chainId: 4663,
    version: '1',
    nonce,
    issuedAt: new Date(),
    expirationTime: new Date(Date.now() + 10 * 60_000),
    statement: 'Sign in to HoodPoker.',
    ...overrides,
  });
  return { message, signature: await account.signMessage({ message }) };
}

{
  const { message, signature } = await signed();
  const r = await verifySiwe(env, message, signature, ORIGIN);
  check('siwe: valid message accepted', r.ok && r.address === account.address.toLowerCase(), JSON.stringify(r));
  const again = await verifySiwe(env, message, signature, ORIGIN);
  check('siwe: replay rejected (nonce single-use)', !again.ok && /nonce/.test((again as any).error));
}
{
  const { message, signature } = await signed();
  const r = await verifySiwe(env, message, signature, 'https://evil.example');
  check('siwe: mismatched Origin rejected', !r.ok);
  const ok = await verifySiwe(env, message, signature, ORIGIN);
  check('siwe: a rejected attempt does not burn the nonce', ok.ok);
}
{
  const { message, signature } = await signed({ domain: 'evil.example', uri: 'https://evil.example' });
  check('siwe: unlisted domain rejected', !(await verifySiwe(env, message, signature, null)).ok);
}
{
  const { message, signature } = await signed({ chainId: 1 });
  check('siwe: wrong chain rejected', !(await verifySiwe(env, message, signature, ORIGIN)).ok);
}
{
  const { message, signature } = await signed({ expirationTime: new Date(Date.now() - 1000) });
  check('siwe: expired message rejected', !(await verifySiwe(env, message, signature, ORIGIN)).ok);
}
{
  const { message } = await signed();
  const other = privateKeyToAccount('0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a');
  const signature = await other.signMessage({ message });
  check('siwe: signature from another wallet rejected', !(await verifySiwe(env, message, signature, ORIGIN)).ok);
}
{
  const nonce = 'neverissued123';
  const message = createSiweMessage({
    address: account.address, domain: 'epoker.eth.limo', uri: ORIGIN, chainId: 4663, version: '1', nonce,
  });
  const signature = await account.signMessage({ message });
  check('siwe: unissued nonce rejected', !(await verifySiwe(env, message, signature, ORIGIN)).ok);
}
{
  const addr = account.address.toLowerCase();
  const { token } = await issueToken(env, addr);
  check('token: verifies to its address', (await verifyToken(env, token)) === addr);
  const [a, e, mac] = token.split('.');
  check('token: tampered address rejected',
    (await verifyToken(env, `0x${'1'.repeat(40)}.${e}.${mac}`)) === null);
  check('token: extended expiry rejected', (await verifyToken(env, `${a}.${Number(e) + 1}.${mac}`)) === null);
  const old = await issueToken(env, addr, Date.now() - SESSION_TTL_MS - 1000);
  check('token: expired rejected', (await verifyToken(env, old.token)) === null);
  check('token: other secret rejected',
    (await verifyToken({ ...env, SESSION_SECRET: 'different-secret' }, token)) === null);
  check('token: garbage rejected', (await verifyToken(env, 'a.b.c')) === null);
}

console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
process.exit(failures ? 1 : 0);
