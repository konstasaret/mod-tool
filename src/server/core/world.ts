import { hashSignal } from '@worldcoin/idkit-core/hashing';
import { signRequest } from '@worldcoin/idkit-core/signing';
import type { IdKitResponse, RpContext, WorldEnvironment } from '../../shared/contracts.js';

export function createRpContext(input: {
  signingKey: string;
  rpId: string;
  action: string;
}): RpContext {
  const signed = signRequest({
    signingKeyHex: input.signingKey,
    action: input.action,
    ttl: 10 * 60,
  });
  return {
    rp_id: input.rpId,
    nonce: signed.nonce,
    created_at: signed.createdAt,
    expires_at: signed.expiresAt,
    signature: signed.sig,
  };
}

export function validateProofBinding(input: {
  proof: IdKitResponse;
  expectedAction: string;
  expectedSignal: string;
  expectedEnvironment: WorldEnvironment;
  expectedIdentifier: string;
}): string {
  if (input.proof.action !== input.expectedAction) throw new Error('World proof action mismatch');
  if (input.proof.environment !== input.expectedEnvironment) {
    throw new Error('World proof environment mismatch');
  }
  const response = input.proof.responses?.[0];
  if (!response?.nullifier) throw new Error('World proof has no nullifier');
  if (response.identifier !== input.expectedIdentifier) {
    throw new Error('World proof credential mismatch');
  }
  if (response.signal_hash !== hashSignal(input.expectedSignal)) {
    throw new Error('World proof signal mismatch');
  }
  return response.nullifier;
}

export async function verifyProofWithWorld(input: {
  rpId: string;
  proof: IdKitResponse;
}): Promise<void> {
  const response = await fetch(`https://developer.world.org/api/v4/verify/${input.rpId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(input.proof),
  });
  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`World verification rejected (${response.status}): ${errorBody.slice(0, 200)}`);
  }
}
