import { Hono, type Context } from 'hono';
import { context, reddit, settings } from '@devvit/web/server';
import type {
  OnCommentSubmitRequest,
  OnPostSubmitRequest,
  TriggerResponse,
  UserV2,
} from '@devvit/web/shared';
import { isEnabled } from '../core/config.js';
import { shouldGateContent, type GatedContentType } from '../core/gating.js';
import {
  ensureHumanBadgeFlairTemplate,
  ensurePortalPost,
  isSubredditModerator,
  notifyUserOfRequest,
  type TargetAuthor,
} from '../core/reddit.js';
import { ensureHumanCheckRequest } from '../core/requests.js';
import { getHumanBadgeUser, getVerifiedUser, holdContent } from '../core/state.js';

export const triggers = new Hono();

async function isExempt(author: UserV2): Promise<boolean> {
  // Devvit app accounts must be exempt so the verification portal stays visible.
  if (author.accountType === 3) return true;
  return isSubredditModerator(author.name);
}

async function gateSubmission(input: {
  contentId: string;
  contentType: GatedContentType;
  author?: UserV2;
}): Promise<void> {
  const { author, contentId, contentType } = input;
  if (!author?.id || !author.name || !contentId) return;

  const settingName =
    contentType === 'post' ? 'requireVerificationForPosts' : 'requireVerificationForComments';
  const [appEnabled, gateEnabled] = await Promise.all([
    isEnabled(),
    settings.get<boolean>(settingName).then((value) => value ?? false),
  ]);
  if (!appEnabled || !gateEnabled) return;

  const [verified, humanBadge, exempt] = await Promise.all([
    getVerifiedUser(author.id),
    getHumanBadgeUser(author.id),
    isExempt(author),
  ]);
  if (
    !shouldGateContent({
      appEnabled,
      gateEnabled,
      verified: Boolean(verified || humanBadge),
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

async function configureInstallation(): Promise<{ postId: string; flairReady: boolean }> {
  const postId = await ensurePortalPost();
  try {
    await ensureHumanBadgeFlairTemplate();
    return { postId, flairReady: true };
  } catch (error) {
    console.error('Human badge flair template setup failed', error);
    return { postId, flairReady: false };
  }
}

async function handleInstallation(c: Context) {
  try {
    const { postId, flairReady } = await configureInstallation();
    return c.json<TriggerResponse>({
      status: 'success',
      message: `Orb Human Badge portal ready (${postId}); flair template ${flairReady ? 'ready' : 'will be retried on first verification'}.`,
    });
  } catch (error) {
    console.error('App installation configuration failed', error);
    return c.json<TriggerResponse>(
      {
        status: 'success',
        message: 'App ready; portal setup will be retried from the moderator menu.',
      }
    );
  }
}

triggers.post('/on-app-install', handleInstallation);

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

triggers.post('/on-comment-submit', async (c) => {
  try {
    const input = await c.req.json<OnCommentSubmitRequest>();
    await gateSubmission({
      contentId: input.comment?.id ?? '',
      contentType: 'comment',
      author: input.author,
    });
  } catch (error) {
    console.error(`Comment gate failed in r/${context.subredditName}`, error);
  }
  return c.json<TriggerResponse>({});
});
