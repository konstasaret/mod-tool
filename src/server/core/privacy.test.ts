import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveOpaqueSignal } from './privacy.js';

test('opaque signal is deterministic and contains no Reddit identifier', () => {
  const input = {
    secret: 'test-secret',
    subredditId: 't5_example',
    redditUserId: 't2_private-user-id',
    action: 'reddit-human-selfie-v1',
  };
  const first = deriveOpaqueSignal(input);
  const second = deriveOpaqueSignal(input);

  assert.equal(first, second);
  assert.match(first, /^whc_[a-f0-9]{64}$/);
  assert.equal(first.includes(input.redditUserId), false);
  assert.equal(first.includes(input.subredditId), false);
});

test('opaque signal is scoped to subreddit and action', () => {
  const base = { secret: 'test-secret', redditUserId: 't2_user' };
  const a = deriveOpaqueSignal({ ...base, subredditId: 't5_a', action: 'one' });
  const b = deriveOpaqueSignal({ ...base, subredditId: 't5_b', action: 'one' });
  const c = deriveOpaqueSignal({ ...base, subredditId: 't5_a', action: 'two' });

  assert.notEqual(a, b);
  assert.notEqual(a, c);
});
