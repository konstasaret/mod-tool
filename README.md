# world-human-check

Minimal Reddit Devvit moderation tool for requesting a privacy-preserving World **Selfie Check**, recording the result per subreddit installation, and assigning verified user flair.

Current playtest target: Devvit app slug `world-app`, World app `app_8ce3b1f93924b643d6ff8225fffdbbf5`, RP `rp_a3400196197df1cd`, and `r/Onlyhumanshere`. These values are public configuration; no signing key is committed.

This repository contains two deployable pieces:

1. `Devvit app` — moderation actions, portal post, Reddit-only user mapping, Redis state, World proof verification, replay protection, and flair.
2. `Verification bridge` — a small external page/server that runs IDKit outside Reddit's CSP-restricted webview and returns the proof through a short-lived Devvit callback.

## V1 flow

```text
Moderator selects “Request Human Check” on a post/comment
  → Devvit stores a pending request in installation-scoped Redis
  → app sends the author a Reddit private message with the portal link
  → author opens the portal and explicitly starts verification
  → Devvit derives HMAC(subreddit ID + Reddit user ID + action)
  → Devvit creates a signed World request and one-time callback URL
  → server sends those to the trusted verification bridge
  → user completes Selfie Check through World
  → bridge returns the untouched IDKit result to Devvit
  → Devvit calls POST developer.world.org/api/v4/verify/{rp_id}
  → Devvit enforces action, environment, signal hash, and nullifier uniqueness
  → per-install status is saved and Reddit flair is assigned
```

Reddit usernames and raw Reddit user IDs are never sent to the bridge or World. The bridge receives only a random request ID, an opaque HMAC-derived signal, public World configuration, signed RP context, and a one-time callback URL.

## What is implemented

- Automatic verification portal creation on subreddit install.
- Moderator post/comment actions to request or inspect a Human Check.
- App settings for enabling the tool, flair text, and request copy.
- Server-side World RP signing and `/api/v4/verify/{rp_id}` plumbing.
- Per-install Redis request, user, nullifier, and portal state.
- Signal/action/environment binding plus nullifier replay protection.
- Reddit private-message request and verified user flair assignment.
- User-controlled unlink/data deletion.
- Selfie Check as the only V1 credential; the credential boundary is isolated so Proof of Human can be added next.

## Required user inputs

### Reddit account/setup

- A Reddit account connected at [Reddit for Developers](https://developers.reddit.com/).
- Moderator access to a private test subreddit.
- The existing Devvit app registration with slug `world-app`.
- Limited-access approval for **External Endpoints**.
- HTTP Fetch approval for `developer.world.org` and the bridge's exact hostname.
- Written Reddit approval for the Reddit → external World verification → Reddit handoff before public launch.
- App-owned Terms of Service and Privacy Policy URLs for Reddit review.

No traditional Reddit OAuth client ID or client secret is required.

### World account/setup

- A dedicated app/RP in the [World Developer Portal](https://developer.world.org/).
- Selfie Check access enabled for that app (currently a Beta/preview credential in the public docs).
- `app_id` — public, shaped like `app_...`.
- `rp_id` — public, shaped like `rp_...`.
- `signing_key` — secret; it is only read by the Devvit server.
- An enabled action, defaulted in this code to `reddit-human-selfie-v1`.
- A choice of `staging` or `production`; the proof and configured environment must match.

Do not paste production signing keys into source files, GitHub issues, or chat.

### Verification bridge/setup

- An HTTPS hostname for the bridge, such as a TFH-controlled service origin.
- A randomly generated server-to-server API token.
- A single-instance or shared-state runtime for V1. The included bridge uses an in-memory, 10-minute session store and is intended for a narrow playtest, not multi-instance production.
- Add the bridge's **exact hostname** (no protocol, wildcard, or path) to `permissions.http.domains` in `devvit.json` before upload.

## Secrets and settings

The following are Devvit **global developer settings**, not per-subreddit moderator settings:

| Setting | Secret | Source |
|---|---:|---|
| `worldAppId` | No | World Developer Portal `app_id` (public default configured) |
| `worldRpId` | No | World Developer Portal `rp_id` (public default configured) |
| `worldAction` | No | Dedicated action name |
| `worldEnvironment` | No | `staging` or `production` |
| `worldRpSigningKey` | **Yes** | World RP signing key |
| `signalHmacSecret` | **Yes** | New random 32+ byte secret |
| `worldBridgeBaseUrl` | No | Bridge HTTPS origin |
| `worldBridgeApiToken` | **Yes** | Same value as bridge `BRIDGE_API_TOKEN` |

Generate the two app-owned random secrets locally; do not reuse an existing credential:

```bash
openssl rand -hex 32  # signalHmacSecret
openssl rand -hex 32  # worldBridgeApiToken / BRIDGE_API_TOKEN
```

After the app is installed once, set values interactively so secrets do not enter shell history:

```bash
npx devvit settings set worldRpSigningKey
npx devvit settings set signalHmacSecret
npx devvit settings set worldBridgeBaseUrl
npx devvit settings set worldBridgeApiToken
```

Set `worldAction` and `worldEnvironment` only if their defaults are not correct.

## Local development

Requires Node.js 24+.

```bash
npm install
npm run check
npm run build
```

Bridge smoke test:

```bash
cp .env.example .env
# Fill BRIDGE_API_TOKEN; keep .env uncommitted.
npm run build:bridge
set -a; source .env; set +a
npm run bridge:start
```

Devvit playtest:

```bash
npm run login
npm run dev
```

The default playtest subreddit is `r/Onlyhumanshere`. The real end-to-end World flow cannot run until the bridge is on an approved HTTPS origin and Reddit enables External Endpoints for this app.

## Fetch Domains

The app requests these server-side fetch domains:

- `developer.world.org` — forwards the untouched IDKit result to World's documented v4 proof verification endpoint.
- `<exact bridge hostname>` — creates a short-lived Selfie Check session. Replace this placeholder in `devvit.json` with the deployed hostname before upload/review.

The Devvit webview itself makes no external network requests.

## Current policy/review blockers

1. **External World handoff:** Devvit Rules say apps should not link to external apps and written approval is required for exceptions. The World App/invite-code handoff must be pre-cleared.
2. **External Endpoints:** the secure return path depends on a limited-access Devvit feature that requires allowlisting.
3. **HTTP Fetch:** `developer.world.org` and the exact bridge host need app-specific approval; fetching also requires app-owned Terms and Privacy Policy.
4. **Account-linking classification:** the design sends only an opaque ID and supports unlinking, but Reddit should confirm whether it treats World verification as an “account-linked service” and whether SOC 2 / penetration-test evidence is required.
5. **Selfie Check access:** the credential is marked Beta/preview in current World documentation and must be enabled for the RP.

See [docs/REDDIT_REVIEW_CHECKLIST.md](docs/REDDIT_REVIEW_CHECKLIST.md) for the approval package and [docs/PRIVACY_DATA_MAP.md](docs/PRIVACY_DATA_MAP.md) for precise data handling.

## V1 limitations

- Manual moderator request only; there is no AutoModerator gating yet.
- Selfie Check means liveness/bot friction, **not one-person-one-account**.
- User flair is subreddit-scoped and may replace an existing user flair; use a dedicated flair policy in the test subreddit.
- The bridge session store is memory-only and should run as one instance for playtesting.
- Private-message delivery can be affected by Reddit platform limits.
- Public launch is blocked until Reddit review/approvals and production privacy/terms pages are complete.

## Adding Orb / Proof of Human next

Keep the same Reddit, Redis, callback, and proof-verification path. Add a second verification level and use the World ID 4.0 `proofOfHuman` preset in the bridge. Use a separate action and flair, then expose the level in moderator settings. Do not label Selfie Check users as unique humans.
