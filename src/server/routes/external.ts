import { Hono } from 'hono';
import { context } from '@devvit/web/server';
import type { IdKitResponse } from '../../shared/contracts.js';
import { getAppConfig } from '../core/config.js';
import { deriveOpaqueSignal } from '../core/privacy.js';
import { assignHumanBadgeFlair, assignVerifiedFlair, restoreHeldContent } from '../core/reddit.js';
import {
  claimHumanBadgeNullifier,
  claimNullifier,
  completeHumanBadgeRequest,
  completeRequest,
  failHumanBadgeRequest,
  failRequest,
  getHumanBadgeRequest,
  getHumanBadgeUser,
  getRequest,
} from '../core/state.js';
import { validateProofBinding, verifyProofWithWorld } from '../core/world.js';

type CompletionBody = { requestId?: string; idkitResponse?: IdKitResponse };

export const external = new Hono();

external.post('/world/verification-completed', async (c) => {
  let requestId: string | undefined;
  let requestKind: 'selfie' | 'orb' | undefined;
  try {
    const body = await c.req.json<CompletionBody>();
    requestId = body.requestId;
    if (!requestId || !body.idkitResponse) throw new Error('Missing completion payload');
    const selfieRequest = await getRequest(requestId);
    const humanBadgeRequest = selfieRequest ? undefined : await getHumanBadgeRequest(requestId);
    const request = selfieRequest ?? humanBadgeRequest;
    requestKind = selfieRequest ? 'selfie' : humanBadgeRequest ? 'orb' : undefined;
    if (!request || request.status !== 'pending') throw new Error('Verification request is not pending');
    if (context.userId !== request.redditUserId) throw new Error('Restored Reddit user does not match');

    const config = await getAppConfig();
    const action = requestKind === 'orb' ? config.humanBadgeAction : config.action;
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
      expectedIdentifier: requestKind === 'orb' ? 'orb' : undefined,
    });
    await verifyProofWithWorld({ rpId: config.rpId, proof: body.idkitResponse });
    const claimed =
      requestKind === 'orb'
        ? await claimHumanBadgeNullifier(action, nullifier, request.id, request.redditUserId)
        : await claimNullifier(action, nullifier, request.id, request.redditUserId);
    if (!claimed) {
      throw new Error('This World credential already completed this community action');
    }
    if (requestKind === 'orb') {
      await completeHumanBadgeRequest(request, action, nullifier);
    } else {
      await completeRequest(request, action, nullifier);
    }
    const shouldShowHumanBadge =
      requestKind === 'orb' || Boolean(await getHumanBadgeUser(request.redditUserId));
    const postProcessing = await Promise.allSettled([
      shouldShowHumanBadge
        ? assignHumanBadgeFlair(request.redditUsername)
        : assignVerifiedFlair(request.redditUsername),
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
    if (requestId) {
      const selfieRequest = requestKind === 'orb' ? undefined : await getRequest(requestId);
      const humanBadgeRequest = requestKind === 'selfie' ? undefined : await getHumanBadgeRequest(requestId);
      if (selfieRequest?.status === 'pending') {
        await failRequest(selfieRequest, 'verification_failed');
      } else if (humanBadgeRequest?.status === 'pending') {
        await failHumanBadgeRequest(humanBadgeRequest, 'verification_failed');
      }
    }
    return c.json({ ok: false, error: 'Verification was not accepted.' }, 400);
  }
});
