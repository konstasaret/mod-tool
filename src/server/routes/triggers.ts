import { Hono } from 'hono';
import type { TriggerResponse } from '@devvit/web/shared';
import { ensurePortalPost } from '../core/reddit.js';

export const triggers = new Hono();

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
