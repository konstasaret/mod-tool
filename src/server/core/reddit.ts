import { context, reddit, settings } from '@devvit/web/server';
import type { MenuItemLocation } from '@devvit/web/shared';
import { getPortalPostId, setPortalPostId } from './state.js';

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
    title: 'World Human Check',
    entry: 'default',
    textFallback: {
      text: 'Open this post in the current Reddit app to complete a community human check.',
    },
  });
  await setPortalPostId(post.id);
  return post.id;
}

export function portalUrl(postId: string): string {
  return `https://www.reddit.com/r/${context.subredditName}/comments/${postId.slice(3)}`;
}

export async function notifyUserOfRequest(username: string, postId: string): Promise<void> {
  const requestMessage =
    (await settings.get<string>('requestMessage'))?.trim() ||
    'A moderator has requested a privacy-preserving human check.';
  await reddit.sendPrivateMessage({
    to: username,
    subject: `Human Check requested in r/${context.subredditName}`,
    text: `${requestMessage}\n\n[Open the World Human Check portal](${portalUrl(postId)})`,
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
