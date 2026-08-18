import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { context } from '@devvit/web/server';
import type { MenuItemRequest, UiResponse } from '@devvit/web/shared';
import { isEnabled } from '../core/config.js';
import {
  ensurePortalPost,
  getTargetAuthor,
  notifyUserOfRequest,
  portalUrl,
} from '../core/reddit.js';
import { getVerifiedUser, saveRequest } from '../core/state.js';

export const menu = new Hono();

menu.post('/open-portal', async (c) => {
  try {
    const postId = await ensurePortalPost();
    return c.json<UiResponse>({ navigateTo: portalUrl(postId) });
  } catch (error) {
    console.error('Portal creation failed', error);
    return c.json<UiResponse>({ showToast: 'Could not create the verification portal.' }, 500);
  }
});

menu.post('/request-human-check', async (c) => {
  try {
    if (!(await isEnabled())) {
      return c.json<UiResponse>({ showToast: 'World Human Check is disabled in app settings.' }, 400);
    }
    const input = await c.req.json<MenuItemRequest>();
    if (input.location === 'subreddit') {
      return c.json<UiResponse>({ showToast: 'Choose a post or comment author.' }, 400);
    }
    const author = await getTargetAuthor(input.targetId, input.location);
    const existing = await getVerifiedUser(author.userId);
    if (existing) {
      return c.json<UiResponse>({ showToast: 'This author is already Human Checked.' });
    }

    const requestId = randomUUID();
    await saveRequest({
      id: requestId,
      redditUserId: author.userId,
      redditUsername: author.username,
      sourceId: input.targetId,
      status: 'pending',
      level: 'selfie',
      requestedAt: new Date().toISOString(),
    });
    const portalPostId = await ensurePortalPost();
    await notifyUserOfRequest(author.username, portalPostId);

    return c.json<UiResponse>({
      showToast: 'Human Check requested. The author received a private Reddit message.',
    });
  } catch (error) {
    console.error('Human Check request failed', error);
    return c.json<UiResponse>({ showToast: 'Could not request a Human Check.' }, 500);
  }
});

menu.post('/view-status', async (c) => {
  try {
    const input = await c.req.json<MenuItemRequest>();
    if (input.location === 'subreddit') {
      return c.json<UiResponse>({ showToast: 'Choose a post or comment author.' }, 400);
    }
    const author = await getTargetAuthor(input.targetId, input.location);
    const verified = await getVerifiedUser(author.userId);
    return c.json<UiResponse>({
      showToast: verified
        ? `Human Checked on ${new Date(verified.verifiedAt).toLocaleDateString()}.`
        : 'No completed Human Check exists for this author in this community.',
    });
  } catch (error) {
    console.error('Human Check status lookup failed', error);
    return c.json<UiResponse>({ showToast: 'Could not load Human Check status.' }, 500);
  }
});
