import crypto from 'crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { env } from './env';

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

export function authenticate(username: string, password: string): AuthUser | null {
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
