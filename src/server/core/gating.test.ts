import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canHoldContent,
  humanCheckStatusMessage,
  restoreHeldItems,
  shouldGateContent,
  type HeldContent,
} from './gating.js';

test('gates only unverified, non-exempt submissions when enabled', () => {
  assert.equal(
    shouldGateContent({ appEnabled: true, gateEnabled: true, verified: false, exempt: false }),
    true
  );
  assert.equal(
    shouldGateContent({ appEnabled: true, gateEnabled: true, verified: true, exempt: false }),
    false
  );
  assert.equal(
    shouldGateContent({ appEnabled: true, gateEnabled: true, verified: false, exempt: true }),
    false
  );
  assert.equal(
    shouldGateContent({ appEnabled: true, gateEnabled: false, verified: false, exempt: false }),
    false
  );
  assert.equal(
    shouldGateContent({ appEnabled: false, gateEnabled: true, verified: false, exempt: false }),
    false
  );
});

test('reports verified, pending, failed, and missing status clearly', () => {
  assert.match(humanCheckStatusMessage({ verifiedAt: '2026-08-18T00:00:00.000Z' }), /Human Checked/);
  assert.match(
    humanCheckStatusMessage({ requestStatus: 'pending', requestedAt: '2026-08-18T00:00:00.000Z' }),
    /pending/
  );
  assert.match(humanCheckStatusMessage({ requestStatus: 'failed' }), /failed/);
  assert.match(humanCheckStatusMessage({}), /No completed/);
});

test('caps held submissions while allowing an existing item to be refreshed', () => {
  assert.equal(canHoldContent({ alreadyHeld: false, heldCount: 4, maximum: 5 }), true);
  assert.equal(canHoldContent({ alreadyHeld: false, heldCount: 5, maximum: 5 }), false);
  assert.equal(canHoldContent({ alreadyHeld: true, heldCount: 5, maximum: 5 }), true);
});

test('restores every available item and clears failures without blocking the rest', async () => {
  const held: HeldContent[] = [
    { id: 't3_first', type: 'post', removedAt: '2026-08-18T00:00:00.000Z' },
    { id: 't1_missing', type: 'comment', removedAt: '2026-08-18T00:00:01.000Z' },
    { id: 't1_last', type: 'comment', removedAt: '2026-08-18T00:00:02.000Z' },
  ];
  const approved: string[] = [];
  const finished: string[] = [];
  const result = await restoreHeldItems(
    held,
    async (content) => {
      if (content.id === 't1_missing') throw new Error('deleted');
      approved.push(content.id);
    },
    async (content) => {
      finished.push(content.id);
    }
  );

  assert.deepEqual(result, { restored: 2, failed: 1, cleanupFailed: 0 });
  assert.deepEqual(approved, ['t3_first', 't1_last']);
  assert.deepEqual(finished, ['t3_first', 't1_missing', 't1_last']);
});

test('a cleanup failure does not prevent later submissions from being restored', async () => {
  const held: HeldContent[] = [
    { id: 't3_first', type: 'post', removedAt: '2026-08-18T00:00:00.000Z' },
    { id: 't1_last', type: 'comment', removedAt: '2026-08-18T00:00:01.000Z' },
  ];
  const approved: string[] = [];
  const result = await restoreHeldItems(
    held,
    async (content) => {
      approved.push(content.id);
    },
    async (content) => {
      if (content.id === 't3_first') throw new Error('temporary Redis failure');
    }
  );

  assert.deepEqual(result, { restored: 2, failed: 0, cleanupFailed: 1 });
  assert.deepEqual(approved, ['t3_first', 't1_last']);
});
