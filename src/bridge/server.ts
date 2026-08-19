import { randomBytes, timingSafeEqual } from 'node:crypto';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type {
  BridgePublicSession,
  BridgeSessionInput,
  DirectVerificationSession,
  IdKitResponse,
} from '../shared/contracts.js';

type StoredSession = Omit<BridgeSessionInput, 'callbackUrl'> & {
  callbackUrl?: string;
  expiresAt: number;
  completed: boolean;
  idkitResponse?: IdKitResponse;
};
const sessions = new Map<string, StoredSession>();
const app = new Hono();
const port = Number(process.env.PORT || 8787);
const publicBaseUrl = (process.env.BRIDGE_PUBLIC_BASE_URL || `http://localhost:${port}`).replace(/\/$/, '');
const apiToken = process.env.BRIDGE_API_TOKEN || '';

if (!apiToken) throw new Error('BRIDGE_API_TOKEN is required');
const publicUrl = new URL(publicBaseUrl);
if (publicUrl.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(publicUrl.hostname)) {
  throw new Error('BRIDGE_PUBLIC_BASE_URL must use HTTPS outside local development');
}

function authenticated(header: string | undefined): boolean {
  const supplied = header?.replace(/^Bearer\s+/i, '') ?? '';
  if (!apiToken || supplied.length !== apiToken.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(apiToken));
}

function validDevvitCallback(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname.endsWith('.devvit.net') &&
      url.pathname.startsWith('/external/') &&
      url.searchParams.get('externalToken')?.startsWith('devvit_at_') === true
    );
  } catch {
    return false;
  }
}

function validSession(input: Omit<BridgeSessionInput, 'callbackUrl'>): boolean {
  return Boolean(
    input.requestId &&
      input.appId?.startsWith('app_') &&
      input.rpId?.startsWith('rp_') &&
      input.action &&
      input.signal?.startsWith('whc_') &&
      ['production', 'staging'].includes(input.environment) &&
      input.rpContext?.rp_id === input.rpId &&
      Number.isFinite(input.rpContext?.expires_at) &&
      (input.verificationLevel === undefined ||
        ['selfie', 'orb'].includes(input.verificationLevel))
  );
}

function allowedBrowserOrigin(origin: string): string {
  try {
    const url = new URL(origin);
    if (
      url.protocol === 'https:' &&
      (url.hostname.endsWith('.devvit.net') || url.hostname === 'developers.reddit.com')
    ) {
      return origin;
    }
    if (
      url.protocol === 'http:' &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
    ) {
      return origin;
    }
  } catch {
    // The CORS middleware will omit access for malformed origins.
  }
  return '';
}

const browserSessionCors = cors({
  origin: allowedBrowserOrigin,
  allowHeaders: ['Content-Type'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  maxAge: 600,
});
app.use('/api/polling-sessions/*', browserSessionCors);

function publicSession(session: StoredSession): BridgePublicSession {
  return {
    appId: session.appId,
    rpId: session.rpId,
    action: session.action,
    signal: session.signal,
    rpContext: session.rpContext,
    environment: session.environment,
    verificationLevel: session.verificationLevel,
    expiresAt: session.expiresAt,
  };
}

app.post('/api/sessions', async (c) => {
  if (!authenticated(c.req.header('authorization'))) return c.json({ error: 'Unauthorized' }, 401);
  const input = await c.req.json<BridgeSessionInput>();
  if (
    !validSession(input) ||
    !validDevvitCallback(input.callbackUrl)
  ) {
    return c.json({ error: 'Invalid session request' }, 400);
  }
  const id = randomBytes(24).toString('base64url');
  const expiresAt = Math.min(input.rpContext.expires_at * 1000, Date.now() + 10 * 60 * 1000);
  sessions.set(id, { ...input, expiresAt, completed: false });
  return c.json({ launchUrl: `${publicBaseUrl}/verify/${id}`, expiresAt }, 201);
});

app.post('/api/polling-sessions', async (c) => {
  const input = await c.req.json<DirectVerificationSession>();
  if (!validSession(input)) return c.json({ error: 'Invalid session request' }, 400);

  const id = randomBytes(24).toString('base64url');
  const expiresAt = Math.min(input.rpContext.expires_at * 1000, Date.now() + 10 * 60 * 1000);
  sessions.set(id, { ...input, expiresAt, completed: false });
  return c.json(
    { sessionId: id, launchUrl: `${publicBaseUrl}/verify/${id}`, expiresAt },
    201
  );
});

app.get('/api/polling-sessions/:id/result', (c) => {
  const session = sessions.get(c.req.param('id'));
  if (!session || session.callbackUrl || session.expiresAt <= Date.now()) {
    return c.json({ error: 'Session not found' }, 404);
  }
  if (!session.completed || !session.idkitResponse) {
    return c.json({ status: 'pending' }, 202);
  }
  return c.json({
    status: 'complete',
    requestId: session.requestId,
    idkitResponse: session.idkitResponse,
  });
});

app.get('/api/sessions/:id', (c) => {
  const session = sessions.get(c.req.param('id'));
  if (!session || session.completed || session.expiresAt <= Date.now()) {
    return c.json({ error: 'Session not found' }, 404);
  }
  return c.json(publicSession(session));
});

app.post('/api/sessions/:id/complete', async (c) => {
  const id = c.req.param('id');
  const session = sessions.get(id);
  if (!session || session.completed || session.expiresAt <= Date.now()) {
    return c.json({ error: 'Session not found' }, 404);
  }
  const body = await c.req.json<{ idkitResponse?: IdKitResponse }>();
  if (!body.idkitResponse || typeof body.idkitResponse !== 'object') {
    return c.json({ error: 'Missing World proof' }, 400);
  }
  if (session.callbackUrl) {
    const callback = await fetch(session.callbackUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ requestId: session.requestId, idkitResponse: body.idkitResponse }),
    });
    if (!callback.ok) return c.json({ error: 'Reddit callback rejected the proof' }, 400);
    session.completed = true;
    sessions.delete(id);
  } else {
    session.idkitResponse = body.idkitResponse;
    session.completed = true;
  }
  return c.json({ ok: true });
});

app.get('/verify/:id', serveStatic({ path: './dist/bridge-client/index.html' }));
app.use('/*', serveStatic({ root: './dist/bridge-client' }));

const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (session.completed || session.expiresAt <= now) sessions.delete(id);
  }
}, 60_000);
cleanup.unref();

serve({ fetch: app.fetch, port }, ({ port: listeningPort }) => {
  console.log(`World Human Check bridge listening on ${listeningPort}`);
});
