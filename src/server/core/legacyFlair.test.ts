import assert from 'node:assert/strict';
import test from 'node:test';
import { isLegacyHumanBadgeFlair } from './legacyFlair.js';

test('recognizes only flair values previously issued by this app', () => {
  assert.equal(isLegacyHumanBadgeFlair('🌐 Human Checked'), true);
  assert.equal(isLegacyHumanBadgeFlair('🌐 human'), true);
  assert.equal(isLegacyHumanBadgeFlair(':unique_human: human'), true);
  assert.equal(isLegacyHumanBadgeFlair('human'), false);
  assert.equal(isLegacyHumanBadgeFlair(undefined), false);
});
