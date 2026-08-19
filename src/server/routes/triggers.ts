import { Hono } from 'hono';
import { context, reddit } from '@devvit/web/server';
import type {
  OnPostSubmitRequest,
  TriggerResponse,
  UserV2,
} from '@devvit/web/shared';
import { isEnabled } from '../core/config.js';
import { shouldGateContent, type GatedContentType } from '../core/gating.js';
import {
  ensurePortalPost,
  notifyUserOfRequest,
  type TargetAuthor,
} from '../core/reddit.js';
import { ensureHumanCheckRequest } from '../core/requests.js';
import { getVerifiedUser, holdContent } from '../core/state.js';

export const triggers = new Hono();

async function isExempt(author: UserV2): Promise<boolean> {
  // Devvit app accounts must be exempt so the verification portal stays visible.
  return author.accountType === 3;
}

async function gateSubmission(input: {
  contentId: string;
  contentType: GatedContentType;
  author?: UserV2;
}): Promise<void> {
  const { author, contentId, contentType } = input;
  if (!author?.id || !author.name || !contentId) return;

  const appEnabled = await isEnabled();
  if (!appEnabled) {
    console.log('Post gate skipped because World Human Check is disabled');
    return;
  }

  const [verified, exempt] = await Promise.all([
    getVerifiedUser(author.id),
    isExempt(author),
  ]);
  console.log('Post gate decision', {
    verified: Boolean(verified),
    appAccount: exempt,
  });
  if (
    !shouldGateContent({
      appEnabled,
      gateEnabled: true,
      verified: Boolean(verified),
      exempt,
    })
  ) {
    return;
  }

  const targetAuthor: TargetAuthor = { userId: author.id, username: author.name };
  const { created } = await ensureHumanCheckRequest(targetAuthor, contentId);
  if (created) {
    const portalPostId = await ensurePortalPost();
    await notifyUserOfRequest(author.name, portalPostId, contentType);
  }

  await reddit.remove(contentId as `t1_${string}` | `t3_${string}`, false);
  console.log('Post removed pending World verification');
  try {
    const held = await holdContent(author.id, {
      id: contentId,
      type: contentType,
      removedAt: new Date().toISOString(),
    });
    if (!held) {
      // Fail open once the bounded restore queue is full. Never hide content that
      // the app cannot remember and restore after a successful verification.
      await reddit.approve(contentId as `t1_${string}` | `t3_${string}`);
      console.error('Held-content limit reached; submission was left visible');
    }
  } catch (error) {
    // Fail open if we cannot remember what to restore after verification.
    await reddit.approve(contentId as `t1_${string}` | `t3_${string}`);
    throw error;
  }
}

triggers.post('/on-app-install', async (c) => {
  try {
    const postId = await ensurePortalPost();
    return c.json<TriggerResponse>({
      status: 'success',
      message: `World Human Check portal created (${postId}).`,
    });
  } catch (error) {
    console.error('App install portal creation failed', error);
    return c.json<TriggerResponse>(
      { status: 'error', message: 'Installed, but the verification portal could not be created.' },
      500
    );
  }
});

triggers.post('/on-post-submit', async (c) => {
  try {
    const input = await c.req.json<OnPostSubmitRequest>();
    await gateSubmission({
      contentId: input.post?.id ?? '',
      contentType: 'post',
      author: input.author,
    });
  } catch (error) {
    console.error(`Post gate failed in r/${context.subredditName}`, error);
  }
  return c.json<TriggerResponse>({});
});
