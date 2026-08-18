import assert from 'node:assert/strict';
import test from 'node:test';
import { hashSignal } from '@worldcoin/idkit-core/hashing';
import { validateProofBinding } from './world.js';

const signal = 'whc_test-signal';
const proof = {
  action: 'reddit-human-selfie-v1',
  environment: 'staging',
  responses: [{ signal_hash: hashSignal(signal), nullifier: '0x123' }],
};

test('proof binding returns its nullifier when action, signal, and environment match', () => {
  assert.equal(
    validateProofBinding({
      proof,
      expectedAction: 'reddit-human-selfie-v1',
      expectedSignal: signal,
      expectedEnvironment: 'staging',
    }),
    '0x123'
  );
});

test('proof binding rejects another signal', () => {
  assert.throws(() =>
    validateProofBinding({
      proof,
      expectedAction: 'reddit-human-selfie-v1',
      expectedSignal: 'another-user',
      expectedEnvironment: 'staging',
    })
  );
});
