# Orb Human Badge — Developer Guide

Orb Human Badge is a standalone Reddit Devvit app that gives an Orb-verified user a `🌐 human` community flair. It uses a dedicated World relying party and a secret-free static IDKit bridge, while its Reddit app identity, settings, Redis records, portal, and flair lifecycle remain independent from `world-app`.

> Devvit uploads the root `README.md` as the app description. The protected npm commands temporarily substitute `REDDIT_README.md` during Devvit commands and restore this developer guide afterward.

## User flow

1. The app-install trigger creates one custom portal post.
2. A signed-in user starts Orb verification from that portal.
3. Devvit derives an opaque community-scoped signal and signs an RP context server-side.
4. The GitHub Pages bridge launches IDKit with `orbLegacy`, renders the connector QR, and returns the proof to the originating WebView with a nonce-bound `postMessage`.
5. Devvit validates action, environment, signal hash, and `identifier === "orb"`, then calls World's verification API.
6. A successful proof stores installation-scoped badge/nullifier state and applies `🌐 human` flair.
7. Unlink removes only this app's badge state, nullifier claim, and matching flair.

The app exposes no Selfie Check request menus and no submission-gating triggers.

## Components

| Component | Responsibility |
| --- | --- |
| `src/client` | Reddit-hosted badge portal. |
| `src/server` | Reddit identity, settings, RP signing, proof validation, Redis, and flair. |
| [`reddit-orb-human-badge-bridge`](https://github.com/mustafakuloglu/reddit-orb-human-badge-bridge) | Static IDKit UI, connector QR, and proof handoff. |
| `src/shared` | Contracts shared across clients and servers. |

## Private configuration

The new Devvit app needs these global settings:

| Setting | Secret? | Purpose |
| --- | --- | --- |
| `worldAppId` | No | Existing World application ID. |
| `worldRpId` | No | Existing World relying-party ID. |
| `worldHumanBadgeAction` | No | Orb badge action. The POC can reuse `reddit-human-selfie-v1`. |
| `worldEnvironment` | No | `production` or `staging`. |
| `worldRpSigningKey` | Yes | Private key corresponding to the RP signer address. |
| `signalHmacSecret` | Yes | Random value of at least 32 characters. |
| `worldBridgeBaseUrl` | No | Legacy Selfie Check bridge origin; not used by the Orb badge. |
| `worldBridgeApiToken` | Yes | Legacy Selfie Check bridge token; not used by the Orb badge. |

The signer address alone is insufficient: IDKit requires a signed RP context, so the corresponding private signing key must be configured in Devvit.

## Development

```bash
npm ci
npm run check
npm run build
```

Upload the private app with:

```bash
npm run upload -- --bump patch
```

The Orb bridge is deployed separately on GitHub Pages. It is entirely static and receives its short-lived request through the URL fragment, which is not sent to the Pages server.

## Security boundaries

- No Reddit username or raw user ID leaves Devvit.
- RP signing and HMAC derivation remain server-side.
- The bridge contains no signing key, callback token, or persistent storage. Its proof handoff is bound to the opener, exact origins, request ID, and a random nonce.
- The callback requires a World-verified proof bound to the expected action, signal, environment, and Orb credential identifier.
- Nullifiers prevent one Orb credential from claiming this badge for multiple Reddit users inside an installation.

Never commit signing keys, HMAC secrets, bridge tokens, or deployment-hook credentials.
