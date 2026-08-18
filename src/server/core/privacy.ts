import { createHmac } from 'node:crypto';

/**
 * Produces an installation- and action-scoped pseudonymous signal.
 * Reddit usernames and raw user IDs never leave Devvit.
 */
export function deriveOpaqueSignal(input: {
  secret: string;
  subredditId: string;
  redditUserId: string;
  action: string;
}): string {
  const material = ['world-human-check', 'v1', input.subredditId, input.redditUserId, input.action].join('\0');
  const digest = createHmac('sha256', input.secret).update(material).digest('hex');
  return `whc_${digest}`;
}
