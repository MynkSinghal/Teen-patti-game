// Minimal GoTrue stand-in for LOCAL browser tests only (the sandbox cannot reach supabase.co).
import { createServer } from 'node:http';
import { createHmac, randomUUID } from 'node:crypto';

const SECRET = 'local-test-secret';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function jwt(sub) {
  const h = b64({ alg: 'HS256', typ: 'JWT' });
  const p = b64({ sub, role: 'authenticated', aud: 'authenticated', is_anonymous: true, exp: Math.floor(Date.now() / 1000) + 3600 });
  return `${h}.${p}.${createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url')}`;
}
function verify(t) {
  const [h, p, s] = (t ?? '').split('.');
  if (!s || createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url') !== s) return null;
  return JSON.parse(Buffer.from(p, 'base64url').toString());
}
const user = (id) => ({ id, aud: 'authenticated', role: 'authenticated', is_anonymous: true, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() });

createServer((req, res) => {
  const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }); res.end(JSON.stringify(body)); };
  if (req.method === 'OPTIONS') return send(204, {});
  if (req.url?.startsWith('/auth/v1/signup')) {
    const id = randomUUID();
    return send(200, { access_token: jwt(id), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: `r-${id}`, user: user(id) });
  }
  if (req.url?.startsWith('/auth/v1/user')) {
    const c = verify((req.headers.authorization ?? '').slice(7));
    return c ? send(200, user(c.sub)) : send(401, { msg: 'invalid' });
  }
  if (req.url?.startsWith('/auth/v1/token')) {
    return send(400, { msg: 'refresh unsupported in mock' });
  }
  send(404, {});
}).listen(54321, () => console.log('mock auth on 54321'));
