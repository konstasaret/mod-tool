import { context, reddit, settings } from '@devvit/web/server';
import type { MenuItemLocation } from '@devvit/web/shared';
import { restoreHeldItems } from './gating.js';
import {
  getHeldContent,
  getPortalPostId,
  removeHeldContent,
  setPortalPostId,
} from './state.js';

export type TargetAuthor = {
  userId: string;
  username: string;
};

export async function getTargetAuthor(
  targetId: string,
  location: MenuItemLocation
): Promise<TargetAuthor> {
  const target =
    location === 'post'
      ? await reddit.getPostById(targetId as `t3_${string}`)
      : location === 'comment'
        ? await reddit.getCommentById(targetId as `t1_${string}`)
        : undefined;
  if (!target?.authorId || !target.authorName || target.authorName === '[deleted]') {
    throw new Error('The target author is unavailable');
  }
  return { userId: target.authorId, username: target.authorName };
}

export async function ensurePortalPost(): Promise<string> {
  const existing = await getPortalPostId();
  if (existing) return existing;
  const post = await reddit.submitCustomPost({
    subredditName: context.subredditName,
    title: 'Orb Human Badge',
    entry: 'default',
    textFallback: {
      text: 'Open this post in the current Reddit app to prove an Orb credential and receive a community human badge.',
    },
  });
  await setPortalPostId(post.id);
  return post.id;
}

export function portalUrl(postId: string): string {
  return `https://www.reddit.com/r/${context.subredditName}/comments/${postId.slice(3)}`;
}

export async function notifyUserOfRequest(
  username: string,
  postId: string,
  heldContentType?: 'post' | 'comment'
): Promise<void> {
  const requestMessage =
    (await settings.get<string>('requestMessage'))?.trim() ||
    'A moderator has requested a privacy-preserving human check.';
  const gateNotice = heldContentType
    ? `Your recent ${heldContentType} is temporarily hidden because this community requires a Human Check before posting or commenting. It will be restored automatically after a successful check.\n\n`
    : '';
  await reddit.sendPrivateMessage({
    to: username,
    subject: `Human Check requested in r/${context.subredditName}`,
    text: `${gateNotice}${requestMessage}\n\n[Open the World Human Check portal](${portalUrl(postId)})`,
  });
}

export async function assignVerifiedFlair(username: string): Promise<void> {
  const flairText = (await settings.get<string>('flairText'))?.trim() || '🌐 Human Checked';
  await reddit.setUserFlair({
    subredditName: context.subredditName,
    username,
    text: flairText,
    backgroundColor: '#2B6FF7',
    textColor: 'light',
  });
}

export async function assignHumanBadgeFlair(username: string): Promise<void> {
  const flairText = (await settings.get<string>('humanBadgeFlairText'))?.trim() || '🌐 human';
  await reddit.setUserFlair({
    subredditName: context.subredditName,
    username,
    text: flairText,
    backgroundColor: '#000000',
    textColor: 'light',
  });
}

export async function isSubredditModerator(username: string): Promise<boolean> {
  const moderators = await reddit
    .getModerators({
      subredditName: context.subredditName,
      username,
      limit: 1,
      pageSize: 1,
    })
    .all();
  return moderators.length > 0;
}

export async function restoreHeldContent(userId: string): Promise<void> {
  const held = await getHeldContent(userId);
  const result = await restoreHeldItems(
    held,
    async (content) => {
      await reddit.approve(content.id as `t1_${string}` | `t3_${string}`);
    },
    async (content) => {
      await removeHeldContent(userId, [content.id]);
    }
  );
  if (result.failed > 0) {
    console.error(`Could not restore ${result.failed} held submission(s) for a verified user`);
  }
  if (result.cleanupFailed > 0) {
    console.error(`Could not clear ${result.cleanupFailed} restored submission(s) from temporary state`);
  }
}
