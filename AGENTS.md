# Selfie Check POC agent notes

## Scope

This repository contains a demo-only Reddit Devvit POC. Its single supported flow is:

1. An unverified user submits a post.
2. Devvit removes and records the post.
3. The user completes World Selfie Check through the bridge.
4. Devvit verifies the result, restores the post, and remembers that the user may post.

Do not add Human badge or user-flair issuance to this flow. The only flair code retained is narrowly scoped cleanup for legacy badge values issued by older POC versions.

## Architecture

- `src/server`: Reddit identity, post gating, installation-scoped Redis state, opaque-signal derivation, World proof verification, and post restoration.
- `src/client`: Reddit-hosted portal. Production-compatible code should call only its own `/api/*` routes.
- `src/bridge`: short-lived external verification sessions and the IDKit Selfie Check QR experience. It must never receive a Reddit username or raw Reddit user ID.
- `tools/reddit-devvit-world-id-unblocker`: local Chrome extension used only to demonstrate the POC while Reddit HTTP Fetch domain exceptions are rejected.

The bridge session is held in memory and expires after ten minutes. A bridge restart invalidates active sessions. That is acceptable only for this POC.

## Temporary fallback

The Reddit client currently contains an external-fetch fallback for the local Chrome-extension demo. Reddit documentation does not permit external client-side WebView fetches, so this fallback and the extension are not production architecture and must not be presented as such.

Before a real Reddit review, remove the fallback and use only:

```text
Reddit WebView -> Devvit /api
Devvit server -> approved bridge domain
Devvit server -> developer.world.org
```

As of 2026-08-24, Reddit shows the requested domains as rejected. Recheck live Developer Settings rather than assuming this status is permanent.

## Configuration

Public app, RP, and action identifiers are Devvit settings. RP signing keys, bridge tokens, opaque-signal secrets, and deploy hooks must remain outside Git. Never copy values from dashboards, shell history, or chat into tracked files.

## Validation

Run before handing off a change:

```bash
npm ci
npm run check
npm run build
```

Keep these release boundaries explicit: Git push, Devvit upload, subreddit installation, and bridge deployment are four separate operations. Install only on `r/orb_human_badge_dev` unless the user explicitly names another subreddit.
