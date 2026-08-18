# World Human Check — Developer Guide

World Human Check is a Reddit Devvit moderation app that lets a subreddit request a privacy-preserving World Selfie Check, assign community flair after success, and optionally require verification before posts or comments remain visible. Separately, an Orb-verified Reddit user can self-serve a `🌐 human` community badge.

This README is the developer handoff: what exists, how it works, how to run it, and what is still unfinished. It intentionally contains no real app IDs, relying-party IDs, signing keys, API tokens, community names, or deployment URLs.

> **Important:** Devvit normally uploads the root `README.md` as the Reddit app description. Use the protected npm commands in this repository. They substitute `REDDIT_README.md` during Devvit commands and restore this developer guide afterward.

## Current state

V1 is implemented and installed as a private playtest build.

- Moderator menu actions request a Human Check and show its status.
- A Reddit custom post gives users their verification entry point.
- World Selfie Check runs through a separately hosted bridge.
- Successful checks persist per-install verification state and apply Reddit flair.
- Optional post and comment gates hold unverified submissions and restore them after success.
- An optional Orb Proof of Human flow grants a separate human badge without changing the Selfie Check workflow.

The automated gates default to **off**. Joining the subreddit is not restricted.

## User and moderator behavior

### Manual moderator request

1. A moderator opens the menu on a post or comment.
2. **Request Human Check** creates or reuses a pending request.
3. The author receives a private Reddit message with the portal link.
4. The author completes Selfie Check from the portal.
5. **View Human Check status** reports missing, pending, failed, or verified.

### Verified posting mode

Moderators can independently enable gates for posts and comments.

1. An unverified non-moderator submits content.
2. A Devvit submit trigger removes it and records it in the user's held queue.
3. The app sends one private message when it creates the pending request.
4. Successful verification restores held content and assigns flair.
5. Future gated submissions from that verified user remain visible.

Moderators and Devvit app accounts are exempt. The queue holds at most five items per user for 24 hours. When the queue is full or state cannot be saved, the app fails open and re-approves the new submission.

### Orb-verified human badge

1. A signed-in user opens the same community portal and selects **Get human badge**.
2. The bridge requests the user's existing Orb credential; no moderator request is required.
3. Devvit accepts only a World response whose credential identifier is `orb`.
4. Successful verification stores separate badge state and applies the community's `🌐 human` flair.
5. Orb verification also satisfies optional post/comment gates. Removing the badge restores the Selfie Check flair when a separate Selfie Check record exists.

Reddit exposes one user-flair slot per community, so the Orb badge takes visual precedence while both verification records remain independent.

## Architecture

```text
Reddit moderator / submit trigger
            |
            v
     Devvit server routes ---------> Reddit API
            |                         PM, flair, remove/approve
            v
  Per-install Devvit Redis
            |
Reddit verification portal
            |
            v
  Devvit creates signed RP context
            |
            v
   HTTPS verification bridge ------> World App / Selfie Check or Orb proof
            |                              |
            |<--------- proof -------------|
            v
 Devvit external callback
            |
            v
 World verification API
            |
            v
 Save verified state + flair + restore held content
```

### Component responsibilities

| Component | Responsibility |
| --- | --- |
| Devvit client | Displays the community portal, current status, start button, and unlink control. |
| Devvit server | Owns Reddit identity, settings, RP signing, proof validation, Redis state, Reddit actions, and World API verification. |
| Verification bridge | Hosts IDKit, creates short-lived browser sessions, launches the World handoff, and returns the proof to Devvit. |
| World | Performs Selfie Check or proves an existing Orb credential. |
| Reddit | Hosts the app and per-install Redis, sends private messages, moderates submissions, and stores flair. |

## Privacy and trust boundaries

Reddit usernames and raw Reddit user IDs never leave Devvit. The external signal is an HMAC derived from the installation's subreddit ID, the Reddit user ID, and the configured action.

The bridge receives only opaque or public protocol data: a random request ID, public World configuration, the derived signal, signed RP context, environment, and a one-time Devvit callback URL. The browser-facing session omits the request ID and callback URL.

Security controls already implemented:

- Server-only RP signing and HMAC derivation.
- Credential-free HTTPS bridge URL validation.
- Constant-time bridge API-token comparison.
- Devvit callback hostname, path, and token-shape validation.
- Proof action, environment, signal hash, World API result, and nullifier checks.

Never commit real credentials or deployment identifiers. Treat any signing key or API token pasted into chat, an issue, a log, or source control as compromised and rotate it.

## Repository map

```text
src/client/                 Reddit portal UI
src/server/index.ts         Devvit/Hono server entry point
src/server/routes/          Portal API, menus, triggers, callback
src/server/core/            Config, privacy, World, Redis, Reddit, gating
src/bridge/client/          External IDKit browser experience
src/bridge/server.ts        Short-lived verification-session service
src/shared/contracts.ts     Shared Devvit/bridge/client types
scripts/                    Safe developer and Devvit upload helpers
devvit.json                 Permissions, settings, menus, triggers, endpoint
REDDIT_README.md            Public Reddit app description used on upload
```

## Configuration

The repository contains setting names only. Store actual values in Devvit settings or the bridge host's secret manager.

### Devvit global settings

| Setting | Secret? | Purpose |
| --- | --- | --- |
| `worldAppId` | No | World application identifier. |
| `worldRpId` | No | World relying-party identifier. |
| `worldAction` | No | Selfie Check action; defaults to `reddit-human-selfie-v1`. |
| `worldHumanBadgeAction` | No | Orb badge action. The POC defaults to the existing Selfie action, while the callback still requires an `orb` credential response. |
| `worldEnvironment` | No | `production` or `staging`. |
| `worldRpSigningKey` | Yes | Server-only World RP signing key. |
| `signalHmacSecret` | Yes | Random value of at least 32 characters for opaque signals. |
| `worldBridgeBaseUrl` | No | Credential-free HTTPS origin of the bridge. |
| `worldBridgeApiToken` | Yes | Random value of at least 32 characters shared with the bridge. |

Set each value interactively so it does not appear in shell history:

```bash
npx devvit settings set worldAppId
npx devvit settings set worldRpId
npx devvit settings set worldAction
npx devvit settings set worldHumanBadgeAction
npx devvit settings set worldEnvironment
npx devvit settings set worldRpSigningKey
npx devvit settings set signalHmacSecret
npx devvit settings set worldBridgeBaseUrl
npx devvit settings set worldBridgeApiToken
```

### Per-community moderator settings

| Setting | Default | Effect |
| --- | --- | --- |
| Enable World Human Check | On | Master switch for requests and verification. |
| Verified user flair | `🌐 Human Checked` | Flair applied after successful verification. |
| Orb-verified human badge flair | `🌐 human` | Flair applied by the separate Orb Proof of Human flow. |
| Verification request message | Included | Community-specific private-message text. |
| Require Human Check for posts | Off | Holds posts from unverified users. |
| Require Human Check for comments | Off | Holds comments from unverified users. |

Moderators configure these on the installation settings page for their subreddit and app.

### Bridge environment variables

| Variable | Required? | Purpose |
| --- | --- | --- |
| `BRIDGE_API_TOKEN` | Yes | Must exactly match the Devvit `worldBridgeApiToken`. |
| `BRIDGE_PUBLIC_BASE_URL` | Production | Public HTTPS origin used to create launch URLs. |
| `PORT` | Usually host-provided | Listening port; local default is `8787`. |

The bridge is stateless across restarts except for its in-memory active sessions. Do not put secrets in build arguments or committed `.env` files.

## Local setup

Requirements: Node.js 24 or newer, npm, a Reddit account with Devvit access, a small subreddit you moderate, and World developer credentials.

```bash
npm install
npm run login
npm run check
npm run build
```

Start the bridge locally with private environment variables loaded by your shell or secret tool:

```bash
npm run bridge:dev
```

Start the Reddit playtest with the protected public-description wrapper:

```bash
npm run dev
```

A complete local World round trip requires an HTTPS tunnel, that tunnel hostname in Devvit's HTTP domains, and matching Devvit/bridge settings.

## Build and test commands

| Command | What it does |
| --- | --- |
| `npm run check` | Type-checks and runs all tests. |
| `npm run test` | Runs the Node test suite. |
| `npm run build` | Builds both the Devvit app and bridge client. |
| `npm run build:devvit` | Builds only the Reddit-hosted app. |
| `npm run build:bridge` | Builds only the externally hosted bridge client. |

The current suite covers gate decisions, held-item limits and restoration resilience, opaque-signal privacy and scoping, and proof-binding acceptance/rejection.

## Deploying the bridge

Use a Node web-service host with HTTPS.

```text
Build command: npm ci && npm run build
Start command: npm run bridge:start
Health/runtime port: PORT supplied by the host
```

Set `BRIDGE_API_TOKEN` and `BRIDGE_PUBLIC_BASE_URL` in the host's secret/environment settings. The free bridge implementation stores live sessions in memory, so restarts invalidate open verification links and multi-instance deployment is unsafe without shared session storage.

After the bridge is live:

1. Add its hostname—not a full URL—to `permissions.http.domains` in `devvit.json` for upload/review.
2. Set `worldBridgeBaseUrl` privately in Devvit.
3. Set the same API token privately in Devvit and the bridge host.
4. Verify `/api/sessions` rejects requests without the bearer token.
5. Never commit the deployment hostname if the repository must remain deployment-neutral.

## Uploading and installing Devvit

Use the npm commands, not a direct `devvit upload` or `devvit publish`. The wrapper temporarily substitutes the public Reddit description and restores this file afterward.

```bash
npm run upload -- --bump patch
npm run publish
```

Install a private version using the Devvit CLI after upload:

```bash
npx devvit install <subreddit> <app-slug>@<version>
```

Before upload, temporarily add the approved bridge hostname to `permissions.http.domains`. Keep all automated post/comment gates off until the complete verification round trip works in the playtest community.

## Redis model and lifecycle

Redis is isolated per subreddit installation.

| Record | Purpose | Current lifecycle |
| --- | --- | --- |
| Portal post | Reuses one custom verification post | No expiry. |
| Pending request/index | Connects a user to one request | 24-hour expiry while pending. |
| Verified user | Enables flair and gate bypass | Retained until unlink. |
| Human badge request/index | Connects a user to a separate Orb request | 24-hour expiry while pending. |
| Human badge user | Enables the Orb badge and gate bypass | Retained until human-badge unlink. |
| Held content | Tracks removed posts/comments for restoration | Up to five items; 24-hour expiry. |
| Nullifier claim | Prevents credential reuse inside the installation | Retained until verified user unlinks. |

Selfie unlink preserves its existing behavior: it removes Selfie verified state, matching request, held state, nullifier claim, and matching app-managed flair. Human-badge unlink removes only Orb badge state and its nullifier claim; it restores the Selfie flair when a separate Selfie record still exists. A failed-request cleanup policy and a user-facing deletion path for non-verified users remain hardening work.

## Failure behavior

- Missing configuration blocks verification start and gives the user a generic setup message.
- Invalid or expired bridge sessions return `404`; active sessions expire within ten minutes.
- A rejected proof marks the request failed and does not assign flair or restore content.
- Reddit/Redis failures during gating fail open when restoration cannot be guaranteed.
- Flair/restoration errors after a valid proof are logged without undoing verified state.

## Known limitations and review blockers

1. Selfie Check proves liveness, not global uniqueness or one-person-one-account. Orb/Proof of Human is the planned higher-assurance level.
2. Devvit submit triggers run after submission; the app removes content quickly but cannot block the Reddit composer before submission.
3. Bridge sessions are in memory, with no shared persistence, rate limiter, operational dashboard, or retry queue.
4. Post-verification flair/restoration has no automatic retry if Reddit is temporarily unavailable.
5. Public launch needs Reddit review for the external World handoff, bridge HTTP domain, external endpoint access, and accurate app-specific legal pages.

## Recommended next milestones

1. Complete an end-to-end two-account playtest for manual request, gated post, gated comment, success, failure, unlink, and expiry.
2. Add durable bridge-session storage, rate limiting, structured redacted logs, health checks, and retryable post-processing.
3. Add explicit retention cleanup and deletion controls for pending/failed requests.
4. Obtain Reddit's written approval and HTTP/external-endpoint allowlisting before public enforcement.
5. Add Orb/Proof of Human as a separate verification level without changing the Selfie Check flow.

## Safe contribution checklist

1. Keep real IDs, URLs, community names, tokens, keys, proofs, and callback URLs out of commits and test fixtures.
2. Run `npm run check`, `npm run build`, and `git diff --check` before committing.
3. Test gates with a non-moderator account; moderators are intentionally exempt.
4. Keep new enforcement settings off by default and fail open when restoration is uncertain.
5. Use `npm run upload` or `npm run publish` so Reddit receives `REDDIT_README.md`.
