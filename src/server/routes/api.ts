import { Hono } from 'hono';
import { context, externalEndpoints, reddit, settings } from '@devvit/web/server';
import type {
  BridgeSessionInput,
  DirectVerificationSession,
  IdKitResponse,
  PortalState,
  StartVerificationResponse,
  VerificationLevel,
} from '../../shared/contracts.js';
import { getAppConfig, isConfigured, isEnabled, type AppConfig } from '../core/config.js';
import { deriveOpaqueSignal } from '../core/privacy.js';
import {
  assignHumanBadgeFlair,
  assignVerifiedFlair,
  getHumanBadgeFlairText,
  restoreHeldContent,
} from '../core/reddit.js';
import { ensureHumanBadgeRequest } from '../core/requests.js';
import {
  claimHumanBadgeNullifier,
  completeHumanBadgeRequest,
  failHumanBadgeRequest,
  getHumanBadgeRequest,
  getHumanBadgeUser,
  getPendingHumanBadgeRequestForUser,
  getPendingRequestForUser,
  getVerifiedUser,
  unlinkHumanBadge,
  unlinkUser,
  type VerificationRequest,
} from '../core/state.js';
import { createRpContext, validateProofBinding, verifyProofWithWorld } from '../core/world.js';

export const api = new Hono();

async function createBridgeLaunch(input: {
  request: VerificationRequest;
  config: AppConfig;
  action: string;
  verificationLevel?: VerificationLevel;
}): Promise<{ launchUrl: string; expiresAt: number }> {
  const signal = deriveOpaqueSignal({
    secret: input.config.signalSecret,
    subredditId: context.subredditId,
    redditUserId: input.request.redditUserId,
    action: input.action,
  });
  const rpContext = createRpContext({
    signingKey: input.config.signingKey,
    rpId: input.config.rpId,
    action: input.action,
  });
  const callbackUrl = await externalEndpoints.getCallbackUrl('worldVerificationCompleted');
  const bridgeSession: BridgeSessionInput = {
    requestId: input.request.id,
    appId: input.config.appId,
    rpId: input.config.rpId,
    action: input.action,
    signal,
    rpContext,
    environment: input.config.environment,
    callbackUrl,
    verificationLevel: input.verificationLevel,
  };
  const response = await fetch(`${input.config.bridgeBaseUrl}/api/sessions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${input.config.bridgeApiToken}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(bridgeSession),
  });
  if (!response.ok) throw new Error(`Bridge rejected session creation (${response.status})`);
  const result = (await response.json()) as { launchUrl?: string; expiresAt?: number };
  if (!result.launchUrl || !result.expiresAt) throw new Error('Bridge returned an invalid session');
  return { launchUrl: result.launchUrl, expiresAt: result.expiresAt };
}

function createDirectVerificationSession(input: {
  request: VerificationRequest;
  config: AppConfig;
  action: string;
  verificationLevel: VerificationLevel;
}): DirectVerificationSession {
  const signal = deriveOpaqueSignal({
    secret: input.config.signalSecret,
    subredditId: context.subredditId,
    redditUserId: input.request.redditUserId,
    action: input.action,
  });
  const rpContext = createRpContext({
    signingKey: input.config.signingKey,
    rpId: input.config.rpId,
    action: input.action,
  });
  return {
    requestId: input.request.id,
    appId: input.config.appId,
    rpId: input.config.rpId,
    action: input.action,
    signal,
    rpContext,
    environment: input.config.environment,
    verificationLevel: input.verificationLevel,
    expiresAt: rpContext.expires_at * 1000,
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
      humanBadgeStatus: 'none',
    });
  }
  const [verified, pending, humanBadge, pendingHumanBadge] = await Promise.all([
    getVerifiedUser(userId),
    getPendingRequestForUser(userId),
    getHumanBadgeUser(userId),
    getPendingHumanBadgeRequestForUser(userId),
  ]);
  const humanBadgeState = humanBadge
    ? {
        humanBadgeStatus: 'verified' as const,
        humanBadgeVerifiedAt: humanBadge.verifiedAt,
      }
    : pendingHumanBadge
      ? {
          humanBadgeStatus: pendingHumanBadge.status,
          humanBadgeRequestedAt: pendingHumanBadge.requestedAt,
        }
      : { humanBadgeStatus: 'none' as const };
  if (verified) {
    return c.json<PortalState>({
      signedIn: true,
      enabled,
      setupComplete,
      status: 'verified',
      level: verified.level,
      verifiedAt: verified.verifiedAt,
      message: 'Your Human Check is complete for this community.',
      ...humanBadgeState,
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
          : 'A moderator requested a Selfie Check for your account in this community.',
      ...humanBadgeState,
    });
  }
  return c.json<PortalState>({
    signedIn: true,
    enabled,
    setupComplete,
    status: 'none',
    message: 'No Human Check is currently requested for your account.',
    ...humanBadgeState,
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
    const result = await createBridgeLaunch({ request, config, action: config.action });
    return c.json<StartVerificationResponse>({ ok: true, ...result });
  } catch (error) {
    console.error('Verification start failed', error);
    return c.json<StartVerificationResponse>(
      { ok: false, error: 'Verification could not start. Ask a moderator to check app setup.' },
      500
    );
  }
});

api.post('/human-badge/start', async (c) => {
  try {
    if (!(await isEnabled())) {
      return c.json<StartVerificationResponse>({ ok: false, error: 'Human Check is disabled.' }, 400);
    }
    if (!context.userId) {
      return c.json<StartVerificationResponse>({ ok: false, error: 'Sign in to Reddit first.' }, 401);
    }
    if (await getHumanBadgeUser(context.userId)) {
      return c.json<StartVerificationResponse>({ ok: false, error: 'Your human badge is already verified.' }, 409);
    }
    const user = await reddit.getUserById(context.userId);
    if (!user) {
      return c.json<StartVerificationResponse>({ ok: false, error: 'Reddit account could not be loaded.' }, 404);
    }
    const { request } = await ensureHumanBadgeRequest({
      userId: context.userId,
      username: user.username,
    });
    const config = await getAppConfig();
    const session = createDirectVerificationSession({
      request,
      config,
      action: config.humanBadgeAction,
      verificationLevel: 'orb',
    });
    return c.json<StartVerificationResponse>({ ok: true, session });
  } catch (error) {
    console.error('Human badge verification start failed', error);
    return c.json<StartVerificationResponse>(
      { ok: false, error: 'Human badge verification could not start. Ask a moderator to check app setup.' },
      500
    );
  }
});

api.post('/human-badge/complete', async (c) => {
  let requestId: string | undefined;
  try {
    if (!context.userId) return c.json({ ok: false, error: 'Sign in to Reddit first.' }, 401);
    const body = await c.req.json<{ requestId?: string; idkitResponse?: IdKitResponse }>();
    requestId = body.requestId;
    if (!requestId || !body.idkitResponse) throw new Error('Missing completion payload');

    const request = await getHumanBadgeRequest(requestId);
    if (!request || request.status !== 'pending') throw new Error('Verification request is not pending');
    if (request.redditUserId !== context.userId) throw new Error('Reddit user does not match');

    const config = await getAppConfig();
    const action = config.humanBadgeAction;
    const signal = deriveOpaqueSignal({
      secret: config.signalSecret,
      subredditId: context.subredditId,
      redditUserId: request.redditUserId,
      action,
    });
    const nullifier = validateProofBinding({
      proof: body.idkitResponse,
      expectedAction: action,
      expectedSignal: signal,
      expectedEnvironment: config.environment,
      expectedIdentifier: 'orb',
    });
    await verifyProofWithWorld({ rpId: config.rpId, proof: body.idkitResponse });
    if (!(await claimHumanBadgeNullifier(action, nullifier, request.id, request.redditUserId))) {
      throw new Error('This World credential already completed this community action');
    }
    await completeHumanBadgeRequest(request, action, nullifier);

    const postProcessing = await Promise.allSettled([
      assignHumanBadgeFlair(request.redditUsername),
      restoreHeldContent(request.redditUserId),
    ]);
    for (const result of postProcessing) {
      if (result.status === 'rejected') {
        console.error('Human badge completed, but post-processing failed', result.reason);
      }
    }
    return c.json({ ok: true });
  } catch (error) {
    console.error(`Human badge completion failed for request ${requestId ?? 'unknown'}`, error);
    if (requestId) {
      const request = await getHumanBadgeRequest(requestId);
      if (request?.status === 'pending') {
        await failHumanBadgeRequest(request, 'verification_failed');
      }
    }
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

api.post('/human-badge/unlink', async (c) => {
  if (!context.userId) return c.json({ ok: false, error: 'Sign in to Reddit first.' }, 401);
  const [verifiedHumanBadge, verifiedHumanCheck] = await Promise.all([
    unlinkHumanBadge(context.userId),
    getVerifiedUser(context.userId),
  ]);
  if (verifiedHumanBadge) {
    if (verifiedHumanCheck) {
      await assignVerifiedFlair(verifiedHumanBadge.redditUsername);
    } else {
      const humanBadgeFlairText = await getHumanBadgeFlairText();
      const user = await reddit.getUserById(context.userId);
      const flair = await user?.getUserFlairBySubreddit(context.subredditName);
      if (flair?.flairText === humanBadgeFlairText) {
        await reddit.removeUserFlair(context.subredditName, verifiedHumanBadge.redditUsername);
      }
    }
  }
  return c.json({ ok: true });
});
