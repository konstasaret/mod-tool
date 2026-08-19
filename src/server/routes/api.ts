import { Hono } from 'hono';
import { context, reddit, settings } from '@devvit/web/server';
import type {
  DirectVerificationSession,
  IdKitResponse,
  PortalState,
  StartVerificationResponse,
} from '../../shared/contracts.js';
import { getAppConfig, isConfigured, isEnabled } from '../core/config.js';
import { deriveOpaqueSignal } from '../core/privacy.js';
import { isDevvitDomainPermissionDenied } from '../core/pocFallback.js';
import { assignVerifiedFlair, restoreHeldContent } from '../core/reddit.js';
import {
  claimNullifier,
  clearBridgeSession,
  completeRequest,
  getPendingRequestForUser,
  getRequest,
  getVerifiedUser,
  saveBridgeSession,
  unlinkUser,
} from '../core/state.js';
import { createRpContext, validateProofBinding, verifyProofWithWorld } from '../core/world.js';

const WORLD_BRIDGE_ORIGIN = 'https://mod-tool.onrender.com';

type PollBody = { bridgeSessionId?: string; requestId?: string };
type CompletionBody = { requestId?: string; idkitResponse?: IdKitResponse };
type BridgeLaunch = { sessionId: string; launchUrl: string; expiresAt: number };

export const api = new Hono();

async function createBridgeLaunch(session: DirectVerificationSession): Promise<BridgeLaunch> {
  const response = await fetch(`${WORLD_BRIDGE_ORIGIN}/api/polling-sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(session),
  });
  if (!response.ok) throw new Error(`Bridge rejected session creation (${response.status})`);
  const result = (await response.json()) as Partial<BridgeLaunch>;
  if (!result.sessionId || !result.launchUrl || !Number.isFinite(result.expiresAt)) {
    throw new Error('Bridge returned an invalid session');
  }
  const launchUrl = new URL(result.launchUrl);
  if (launchUrl.origin !== WORLD_BRIDGE_ORIGIN) {
    throw new Error('Bridge returned an unexpected launch origin');
  }
  return {
    sessionId: result.sessionId,
    launchUrl: launchUrl.toString(),
    expiresAt: result.expiresAt as number,
  };
}

api.get('/init', async (c) => {
  const enabled = await isEnabled();
  const setupComplete = await isConfigured();
  const userId = context.userId;
  if (!userId) {
    return c.json<PortalState>({
      signedIn: false,
      enabled,
      setupComplete,
      status: 'none',
      message: 'Sign in to Reddit to use this community verification portal.',
    });
  }
  const [verified, pending] = await Promise.all([
    getVerifiedUser(userId),
    getPendingRequestForUser(userId),
  ]);
  if (verified) {
    return c.json<PortalState>({
      signedIn: true,
      enabled,
      setupComplete,
      status: 'verified',
      level: verified.level,
      verifiedAt: verified.verifiedAt,
      message: 'Your Selfie Check is complete for this community.',
    });
  }
  if (pending) {
    return c.json<PortalState>({
      signedIn: true,
      enabled,
      setupComplete,
      status: pending.status,
      level: pending.level,
      requestedAt: pending.requestedAt,
      message:
        pending.status === 'failed'
          ? 'The last verification did not complete. Ask a moderator to issue a new request.'
          : 'Complete Selfie Check to publish your held post in this community.',
    });
  }
  return c.json<PortalState>({
    signedIn: true,
    enabled,
    setupComplete,
    status: 'none',
    message: 'No Selfie Check is currently requested for your account.',
  });
});

api.post('/verification/start', async (c) => {
  try {
    if (!(await isEnabled())) {
      return c.json<StartVerificationResponse>({ ok: false, error: 'Human Check is disabled.' }, 400);
    }
    if (!context.userId) {
      return c.json<StartVerificationResponse>({ ok: false, error: 'Sign in to Reddit first.' }, 401);
    }
    const request = await getPendingRequestForUser(context.userId);
    if (!request || request.status !== 'pending') {
      return c.json<StartVerificationResponse>(
        { ok: false, error: 'No pending Selfie Check was found.' },
        404
      );
    }
    if (request.bridgeSession && request.bridgeSession.expiresAt > Date.now() + 5_000) {
      return c.json<StartVerificationResponse>({
        ok: true,
        transport: 'server',
        bridgeSessionId: request.bridgeSession.sessionId,
        requestId: request.id,
        launchUrl: request.bridgeSession.launchUrl,
        expiresAt: request.bridgeSession.expiresAt,
      });
    }

    const config = await getAppConfig();
    const signal = deriveOpaqueSignal({
      secret: config.signalSecret,
      subredditId: context.subredditId,
      redditUserId: request.redditUserId,
      action: config.action,
    });
    const rpContext = createRpContext({
      signingKey: config.signingKey,
      rpId: config.rpId,
      action: config.action,
    });
    const directSession: DirectVerificationSession = {
      requestId: request.id,
      appId: config.appId,
      rpId: config.rpId,
      action: config.action,
      signal,
      rpContext,
      environment: config.environment,
      verificationLevel: 'selfie',
      expiresAt: rpContext.expires_at * 1000,
    };
    let bridge: BridgeLaunch;
    try {
      bridge = await createBridgeLaunch(directSession);
    } catch (error) {
      if (isDevvitDomainPermissionDenied(error, 'mod-tool.onrender.com')) {
        console.warn('Using extension-only browser bridge fallback for POC');
        return c.json<StartVerificationResponse>({
          ok: true,
          transport: 'browser',
          session: directSession,
        });
      }
      throw error;
    }
    await saveBridgeSession(request, bridge);
    return c.json<StartVerificationResponse>({
      ok: true,
      transport: 'server',
      bridgeSessionId: bridge.sessionId,
      requestId: request.id,
      launchUrl: bridge.launchUrl,
      expiresAt: bridge.expiresAt,
    });
  } catch (error) {
    console.error('Verification start failed', error);
    return c.json<StartVerificationResponse>(
      { ok: false, error: 'Selfie Check could not start. Ask a moderator to check app setup.' },
      500
    );
  }
});

api.post('/verification/poll', async (c) => {
  if (!context.userId) return c.json({ status: 'error', error: 'Sign in to Reddit first.' }, 401);
  const body = await c.req.json<PollBody>();
  if (!body.requestId || !body.bridgeSessionId) {
    return c.json({ status: 'error', error: 'Missing verification session.' }, 400);
  }
  const request = await getPendingRequestForUser(context.userId);
  if (
    !request ||
    request.id !== body.requestId ||
    request.status !== 'pending' ||
    request.bridgeSession?.sessionId !== body.bridgeSessionId
  ) {
    return c.json({ status: 'error', error: 'Verification session does not match this user.' }, 403);
  }

  const response = await fetch(
    `${WORLD_BRIDGE_ORIGIN}/api/polling-sessions/${encodeURIComponent(body.bridgeSessionId)}/result`,
    { headers: { accept: 'application/json' } }
  );
  if (response.status === 202) return c.json({ status: 'pending' }, 202);
  if (!response.ok) {
    await clearBridgeSession(request);
    return c.json({ status: 'error', error: 'Verification session expired. Start again.' }, 410);
  }
  const result = (await response.json()) as CompletionBody & { status?: string };
  if (result.status !== 'complete' || result.requestId !== request.id || !result.idkitResponse) {
    await clearBridgeSession(request);
    return c.json({ status: 'error', error: 'Bridge returned an invalid proof.' }, 502);
  }
  return c.json({ status: 'complete', requestId: request.id, idkitResponse: result.idkitResponse });
});

api.post('/verification/complete', async (c) => {
  let requestId: string | undefined;
  try {
    if (!context.userId) return c.json({ ok: false, error: 'Sign in to Reddit first.' }, 401);
    const body = await c.req.json<CompletionBody>();
    requestId = body.requestId;
    if (!requestId || !body.idkitResponse) throw new Error('Missing completion payload');
    const request = await getRequest(requestId);
    if (!request || request.status !== 'pending') throw new Error('Verification request is not pending');
    if (request.redditUserId !== context.userId) throw new Error('Verification request belongs to another user');

    const config = await getAppConfig();
    const signal = deriveOpaqueSignal({
      secret: config.signalSecret,
      subredditId: context.subredditId,
      redditUserId: request.redditUserId,
      action: config.action,
    });
    const nullifier = validateProofBinding({
      proof: body.idkitResponse,
      expectedAction: config.action,
      expectedSignal: signal,
      expectedEnvironment: config.environment,
    });
    try {
      await verifyProofWithWorld({ rpId: config.rpId, proof: body.idkitResponse });
    } catch (error) {
      if (!isDevvitDomainPermissionDenied(error, 'developer.world.org')) throw error;
      console.warn(
        'POC ONLY: World remote verification skipped because Devvit blocked developer.world.org'
      );
    }
    if (!(await claimNullifier(config.action, nullifier, request.id, request.redditUserId))) {
      throw new Error('This World credential already completed this community action');
    }
    await completeRequest(request, config.action, nullifier);
    const postProcessing = await Promise.allSettled([
      assignVerifiedFlair(request.redditUsername),
      restoreHeldContent(request.redditUserId),
    ]);
    for (const result of postProcessing) {
      if (result.status === 'rejected') {
        console.error('Verification completed, but post-processing failed', result.reason);
      }
    }
    return c.json({ ok: true });
  } catch (error) {
    console.error(`Verification completion failed for request ${requestId ?? 'unknown'}`, error);
    return c.json({ ok: false, error: 'Verification was not accepted.' }, 400);
  }
});

api.post('/unlink', async (c) => {
  if (!context.userId) return c.json({ ok: false, error: 'Sign in to Reddit first.' }, 401);
  const verified = await unlinkUser(context.userId);
  if (verified) {
    const flairText = (await settings.get<string>('flairText'))?.trim() || '🌐 Human Checked';
    const user = await reddit.getUserById(context.userId);
    const flair = await user?.getUserFlairBySubreddit(context.subredditName);
    if (flair?.flairText === flairText) {
      await reddit.removeUserFlair(context.subredditName, verified.redditUsername);
    }
  }
  return c.json({ ok: true });
});
