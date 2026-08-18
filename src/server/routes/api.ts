import { Hono } from 'hono';
import { context, externalEndpoints, reddit, settings } from '@devvit/web/server';
import type {
  BridgeSessionInput,
  PortalState,
  StartVerificationResponse,
} from '../../shared/contracts.js';
import { getAppConfig, isConfigured, isEnabled } from '../core/config.js';
import { deriveOpaqueSignal } from '../core/privacy.js';
import { getPendingRequestForUser, getVerifiedUser, unlinkUser } from '../core/state.js';
import { createRpContext } from '../core/world.js';

export const api = new Hono();

api.get('/init', async (c) => {
  const enabled = await isEnabled();
  const setupComplete = await isConfigured();
  const userId = context.userId;
  if (!userId) {
    return c.json<PortalState>({
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
      enabled,
      setupComplete,
      status: 'verified',
      level: verified.level,
      verifiedAt: verified.verifiedAt,
      message: 'Your Human Check is complete for this community.',
    });
  }
  if (pending) {
    return c.json<PortalState>({
      enabled,
      setupComplete,
      status: pending.status,
      level: pending.level,
      requestedAt: pending.requestedAt,
      message:
        pending.status === 'failed'
          ? 'The last verification did not complete. Ask a moderator to issue a new request.'
          : 'A moderator requested an Orb-backed Proof of Human for your account in this community.',
    });
  }
  return c.json<PortalState>({
    enabled,
    setupComplete,
    status: 'none',
    message: 'No Human Check is currently requested for your account.',
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
        { ok: false, error: 'No pending Human Check was found.' },
        404
      );
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
    const callbackUrl = await externalEndpoints.getCallbackUrl('worldVerificationCompleted');
    const bridgeSession: BridgeSessionInput = {
      requestId: request.id,
      appId: config.appId,
      rpId: config.rpId,
      action: config.action,
      signal,
      rpContext,
      environment: config.environment,
      callbackUrl,
    };
    const response = await fetch(`${config.bridgeBaseUrl}/api/sessions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.bridgeApiToken}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(bridgeSession),
    });
    if (!response.ok) throw new Error(`Bridge rejected session creation (${response.status})`);
    const result = (await response.json()) as { launchUrl?: string; expiresAt?: number };
    if (!result.launchUrl || !result.expiresAt) throw new Error('Bridge returned an invalid session');
    return c.json<StartVerificationResponse>({
      ok: true,
      launchUrl: result.launchUrl,
      expiresAt: result.expiresAt,
    });
  } catch (error) {
    console.error('Verification start failed', error);
    return c.json<StartVerificationResponse>(
      { ok: false, error: 'Verification could not start. Ask a moderator to check app setup.' },
      500
    );
  }
});

api.post('/unlink', async (c) => {
  if (!context.userId) return c.json({ ok: false, error: 'Sign in to Reddit first.' }, 401);
  const verified = await unlinkUser(context.userId);
  if (verified) {
    const flairText = (await settings.get<string>('flairText'))?.trim() || '🌐 human';
    const user = await reddit.getUserById(context.userId);
    const flair = await user?.getUserFlairBySubreddit(context.subredditName);
    if (flair?.flairText === flairText) {
      await reddit.removeUserFlair(context.subredditName, verified.redditUsername);
    }
  }
  return c.json({ ok: true });
});
