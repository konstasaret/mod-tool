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
import { humanCheckStatusMessage } from '../core/gating.js';
import { ensureHumanCheckRequest } from '../core/requests.js';
import { getPendingRequestForUser, getVerifiedUser, unlinkUser } from '../core/state.js';

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
      return c.json<UiResponse>({ showToast: 'This author is already verified to post.' });
    }

    const { created } = await ensureHumanCheckRequest(author, input.targetId);
    const portalPostId = await ensurePortalPost();
    await notifyUserOfRequest(author.username, portalPostId);

    return c.json<UiResponse>({
      showToast: created
        ? 'Human Check requested. The author received a private Reddit message.'
        : 'Human Check is already pending. A reminder was sent to the author.',
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
    const [verified, pending] = await Promise.all([
      getVerifiedUser(author.userId),
      getPendingRequestForUser(author.userId),
    ]);
    return c.json<UiResponse>({
      showToast: humanCheckStatusMessage({
        verifiedAt: verified?.verifiedAt,
        requestStatus: pending?.status,
        requestedAt: pending?.requestedAt,
      }),
    });
  } catch (error) {
    console.error('Human Check status lookup failed', error);
    return c.json<UiResponse>({ showToast: 'Could not load Human Check status.' }, 500);
  }
});

menu.post('/reset-my-verification', async (c) => {
  try {
    if (!context.userId) {
      return c.json<UiResponse>({ showToast: 'Sign in to Reddit first.' }, 401);
    }
    const removed = Boolean(await unlinkUser(context.userId));
    console.log('Moderator verification reset', { removed });
    return c.json<UiResponse>({
      showToast: removed
        ? 'Your verification was reset. Your next post will require verification.'
        : 'No verification was stored for this Reddit account.',
    });
  } catch (error) {
    console.error('Moderator verification reset failed', error);
    return c.json<UiResponse>({ showToast: 'Verification could not be reset.' }, 500);
  }
});
