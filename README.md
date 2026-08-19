# Reddit World Selfie Check POC

This branch implements the Phase 1 demo: users may submit a post, but an unverified user's post is immediately removed and held until that user completes World Selfie Check.

## Demo behavior

1. A non-moderator submits a post.
2. The Devvit post-submit trigger removes it and stores the post ID in per-install Redis.
3. The app creates a pending Selfie Check request and sends the author a Reddit private message linking to the community portal.
4. The portal creates a short-lived session on the external bridge and opens the Selfie Check page.
5. The external page runs IDKit and sends the user to World.
6. The Reddit portal polls its own Devvit API; Devvit polls the bridge for the completed proof.
7. Devvit validates the proof binding, verifies it with World, stores the community-scoped result, and restores the held post.
8. Later posts from that verified user remain visible.

Moderators are included in the POC gate so the flow can be tested with a moderator account. Devvit app accounts remain exempt so the verification portal stays visible. The trigger runs after submission, so this is enforced by quickly removing and restoring posts; Devvit cannot disable Reddit's composer before submission.

## Architecture

```text
Reddit post -> Devvit trigger -> remove post + Redis pending request + private message
                                      |
                                      v
Reddit portal -> Devvit API -> external bridge -> IDKit / World Selfie Check
      ^                                |
      |-------- Devvit polling --------|
                       |
                       v
             World proof verification
                       |
                       v
             verified state + approve held post
```

The user's Reddit username and raw user ID remain inside Devvit. World receives an opaque HMAC-derived signal scoped to the subreddit installation and action.

## Components

| Path | Responsibility |
| --- | --- |
| `src/client/` | Reddit-hosted status and verification portal. |
| `src/server/routes/triggers.ts` | Automatic post gate. |
| `src/server/routes/api.ts` | Bridge session creation, polling, proof verification, and completion. |
| `src/server/core/` | Settings, Redis state, privacy binding, Reddit actions, and World verification. |
| `src/bridge/` | Externally hosted IDKit page and short-lived in-memory sessions. |
| `devvit.json` | Devvit permissions, settings, menus, and post trigger. |

## Configuration

Devvit global settings:

- `worldAppId`
- `worldRpId`
- `worldAction` (defaults to `reddit-human-selfie-v1`)
- `worldEnvironment`
- `worldRpSigningKey` (secret)
- `signalHmacSecret` (secret, at least 32 characters)

The post gate is always active while Selfie Check is enabled. Moderators can customize the private-message copy.

The bridge uses `BRIDGE_PUBLIC_BASE_URL`, `BRIDGE_API_TOKEN`, and the host-provided `PORT`. The token remains required for compatibility with older callback sessions; this POC's polling session route does not use it.

## Validation

```bash
npm ci
npm run check
npm run build
```

## Deployment boundary

The app requires outbound access from Devvit to:

- `mod-tool.onrender.com` for bridge session creation and polling.
- `developer.world.org` for final proof verification.

The external browser handoff still requires Reddit approval/allowlisting for a real installation. The bridge stores live sessions in memory, so a restart expires active verification attempts; that is acceptable for this POC but not production-ready.

### Extension-only fallback

Until Reddit approves the two outbound domains, the POC detects Devvit's exact `PERMISSION_DENIED` response and returns the signed session to the Reddit client. The temporary Chrome extension then permits the client to create and poll the Render session directly. If Devvit also blocks the final World verification request, the POC accepts only the locally action/signal/environment-bound IDKit result and emits an explicit warning log. This fallback is intentionally not production-safe and must be removed after domain approval.

Do not upload a Devvit version, deploy the bridge, push the branch, or open a PR without explicit approval.
