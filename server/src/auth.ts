import crypto from 'crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { env } from './env';
import { pool } from './db';

export type Role = 'admin' | 'operator' | 'viewer';
export type AuthUser = { username: string; role: Role };

type Credential = {
  username: string;
  password: string;
  role: Role;
};

const credentials: Credential[] = [
  { username: env.ADMIN_USER, password: env.ADMIN_PASS, role: 'admin' },
  ...(env.OPERATOR_USER && env.OPERATOR_PASS
    ? [{ username: env.OPERATOR_USER, password: env.OPERATOR_PASS, role: 'operator' as Role }]
    : []),
  ...(env.VIEWER_USER && env.VIEWER_PASS
    ? [{ username: env.VIEWER_USER, password: env.VIEWER_PASS, role: 'viewer' as Role }]
    : [])
];

function timingSafeEqual(a: string, b: string) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(password, salt, 64).toString('hex');
  return timingSafeEqual(hash, test);
}

export async function authenticate(username: string, password: string): Promise<AuthUser | null> {
  // 1. Try database users first
  try {
    const { rows } = await pool.query(
      'SELECT username, password_hash, role FROM users WHERE username = $1 AND enabled = true',
      [username]
    );
    if (rows.length > 0) {
      const row = rows[0];
      if (verifyPassword(password, row.password_hash)) {
        return { username: row.username, role: row.role as Role };
      }
      return null;
    }
  } catch {
    // Table may not exist yet during migration; fall through to env credentials
  }

  // 2. Fallback to environment credentials (bootstrap/recovery)
  const match = credentials.find((cred) => cred.username === username);
  if (!match) {
    return null;
  }
  if (!timingSafeEqual(match.password, password)) {
    return null;
  }
  return { username: match.username, role: match.role };
}

function base64url(input: string) {
  return Buffer.from(input).toString('base64url');
}

function sign(data: string) {
  return crypto.createHmac('sha256', env.AUTH_SECRET).update(data).digest('base64url');
}

export function createToken(user: AuthUser) {
  const payload = {
    sub: user.username,
    role: user.role,
    exp: Date.now() + env.AUTH_TOKEN_TTL_HOURS * 60 * 60 * 1000
  };
  const payloadStr = JSON.stringify(payload);
  const body = base64url(payloadStr);
  const signature = sign(body);
  return `${body}.${signature}`;
}

export function verifyToken(token: string): AuthUser | null {
  const [body, signature] = token.split('.');
  if (!body || !signature) {
    return null;
  }
  const expected = sign(body);
  if (!timingSafeEqual(expected, signature)) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8')) as {
      sub: string;
      role: Role;
      exp: number;
    };
    if (!payload?.sub || !payload?.role || !payload?.exp) {
      return null;
    }
    if (Date.now() > payload.exp) {
      return null;
    }
    return { username: payload.sub, role: payload.role };
  } catch {
    return null;
  }
}

export function requireRole(roles: Role[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const user = token ? verifyToken(token) : null;
    if (!user || !roles.includes(user.role)) {
      reply.code(401).send({ error: 'unauthorized' });
      return;
    }
    (req as any).user = user;
  };
}
