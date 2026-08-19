# Privacy data map

## Design rule

The Devvit installation is the only component that knows both the Reddit account and the verification state. World and the verification bridge do not receive a Reddit username or raw Reddit user ID.

## Data by component

| Component | Receives/stores | Retention |
|---|---|---|
| Devvit Redis (installation-scoped) | Reddit user ID, Reddit username, source post/comment ID, request status/time, verification level, World nullifier, portal post ID | Pending requests: 24 hours. Verified state/nullifier: until the user unlinks or app data is removed. |
| Verification bridge | Random request ID, opaque HMAC signal, public `app_id`/`rp_id`/action/environment, signed RP context, one-time Devvit callback URL, returned IDKit proof | In memory for at most 10 minutes; deleted immediately after successful callback. No Reddit identifiers. |
| World | Public RP/action context, opaque HMAC signal, World proof request | Per World platform policy. No Reddit username or raw Reddit ID is sent by this app. |
| Reddit API | Username for Reddit private-message delivery and removal of legacy app-issued flair | Remains inside Reddit/Devvit. |

## Opaque signal

The server computes:

```text
HMAC-SHA256(
  app-owned secret,
  "world-human-check" + version + subreddit ID + Reddit user ID + World action
)
```

Properties:

- Deterministic for one Reddit user, subreddit installation, and action.
- Changes across subreddits or actions.
- Cannot be reversed without the app-owned secret.
- Contains no username or raw Reddit identifier.

The secret is an encrypted Devvit global setting and is never sent to the browser, bridge, or World.

## Proof acceptance

Devvit accepts a result only after all of these checks succeed:

1. The payload action and environment equal the server configuration.
2. The proof's signal hash equals the hash of the expected opaque signal.
3. World's `POST /api/v4/verify/{rp_id}` endpoint accepts the untouched IDKit payload.
4. The action/nullifier has not been linked to a different Reddit account in this installation.

## User control

The portal includes **Remove verification**. It deletes the per-install request, verified state, and nullifier mapping immediately. It also removes a flair only when its text exactly matches a legacy badge value previously issued by this app.

There is no long-lived Reddit mapping in the bridge. Expired bridge sessions are purged automatically.

## Logging

Production logs must not contain:

- World RP signing keys or bridge API tokens;
- Devvit callback URLs/tokens;
- Reddit usernames or raw Reddit user IDs;
- full IDKit proofs or nullifiers.

The code logs operation names and random request IDs for failures, but not proof bodies or Reddit identities.
