import { Hono } from 'hono';
import { context } from '@devvit/web/server';
import type { IdKitResponse } from '../../shared/contracts.js';
import { getAppConfig } from '../core/config.js';
import { deriveOpaqueSignal } from '../core/privacy.js';
import { assignVerifiedFlair, restoreHeldContent } from '../core/reddit.js';
import {
  claimNullifier,
  completeRequest,
  failRequest,
  getRequest,
} from '../core/state.js';
import { validateProofBinding, verifyProofWithWorld } from '../core/world.js';

type CompletionBody = { requestId?: string; idkitResponse?: IdKitResponse };

export const external = new Hono();

external.post('/world/verification-completed', async (c) => {
  let requestId: string | undefined;
  try {
    const body = await c.req.json<CompletionBody>();
    requestId = body.requestId;
    if (!requestId || !body.idkitResponse) throw new Error('Missing completion payload');
    const request = await getRequest(requestId);
    if (!request || request.status !== 'pending') throw new Error('Verification request is not pending');
    if (context.userId !== request.redditUserId) throw new Error('Restored Reddit user does not match');

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
      expectedIdentifier: 'orb',
    });
    await verifyProofWithWorld({ rpId: config.rpId, proof: body.idkitResponse });
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
    if (requestId) {
      const request = await getRequest(requestId);
      if (request?.status === 'pending') await failRequest(request, 'verification_failed');
    }
    return c.json({ ok: false, error: 'Verification was not accepted.' }, 400);
  }
});
