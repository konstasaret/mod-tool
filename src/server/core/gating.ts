import type { VerificationStatus } from '../../shared/contracts.js';

export type GatedContentType = 'post' | 'comment';

export type HeldContent = {
  id: string;
  type: GatedContentType;
  removedAt: string;
};

export function shouldGateContent(input: {
  appEnabled: boolean;
  gateEnabled: boolean;
  verified: boolean;
  exempt: boolean;
}): boolean {
  return input.appEnabled && input.gateEnabled && !input.verified && !input.exempt;
}

export function canHoldContent(input: {
  alreadyHeld: boolean;
  heldCount: number;
  maximum: number;
}): boolean {
  return input.alreadyHeld || input.heldCount < input.maximum;
}

export async function restoreHeldItems(
  held: HeldContent[],
  approve: (content: HeldContent) => Promise<void>,
  finish: (content: HeldContent) => Promise<void>
): Promise<{ restored: number; failed: number; cleanupFailed: number }> {
  let restored = 0;
  let failed = 0;
  let cleanupFailed = 0;
  for (const content of held) {
    try {
      await approve(content);
      restored += 1;
    } catch {
      failed += 1;
    }
    try {
      await finish(content);
    } catch {
      cleanupFailed += 1;
    }
  }
  return { restored, failed, cleanupFailed };
}

export function humanCheckStatusMessage(input: {
  verifiedAt?: string;
  requestStatus?: VerificationStatus;
  requestedAt?: string;
}): string {
  if (input.verifiedAt) {
    return `Verified to post on ${new Date(input.verifiedAt).toLocaleDateString()}.`;
  }
  if (input.requestStatus === 'pending') {
    const suffix = input.requestedAt
      ? ` since ${new Date(input.requestedAt).toLocaleDateString()}`
      : '';
    return `Selfie Check pending${suffix}.`;
  }
  if (input.requestStatus === 'failed') {
    return 'The last Selfie Check failed. Issue a new request to try again.';
  }
  return 'No completed Selfie Check exists for this author in this community.';
}
