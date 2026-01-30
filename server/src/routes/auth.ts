import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, createToken, verifyToken } from '../auth';

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post('/api/auth/login', async (req, reply) => {
    const body = z
      .object({
        username: z.string().min(1),
        password: z.string().min(1)
      })
      .parse(req.body);
    const user = authenticate(body.username, body.password);
    if (!user) {
      reply.code(401).send({ error: 'invalid credentials' });
      return;
    }
    const token = createToken(user);
    reply.send({ token, user });
  });

  app.get('/api/auth/me', async (req) => {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const user = token ? verifyToken(token) : null;
    return { user };
  });
}
