import assert from 'node:assert/strict';
import test from 'node:test';
import { isDevvitDomainPermissionDenied } from './pocFallback.js';

test('recognizes the Devvit blocked-domain error used by the extension fallback', () => {
  assert.equal(
    isDevvitDomainPermissionDenied(
      new Error(
        '7 PERMISSION_DENIED: HTTP request to domain: mod-tool.onrender.com is not allowed'
      ),
      'mod-tool.onrender.com'
    ),
    true
  );
});

test('does not hide ordinary bridge or World failures', () => {
  assert.equal(
    isDevvitDomainPermissionDenied(
      new Error('World verification rejected (400)'),
      'developer.world.org'
    ),
    false
  );
});
