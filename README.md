# World Human Check

> A Reddit moderator tool that asks a user to complete a privacy-preserving World **Selfie Check**, then gives that user verified flair.

## Start here: what is the status?

**The first version is built and installed for testing. It is not ready for a public launch yet.**

| Status     | Item                                                                           |
| ---------- | ------------------------------------------------------------------------------ |
| ✅ Done    | Devvit app built and registered                                                |
| ✅ Done    | First playtest version installed in the private test community                 |
| ✅ Done    | Moderator action, user portal, Redis state, World verification, and flair code |
| ✅ Done    | Privacy and replay-protection tests passing                                    |
| ⏳ Next    | Deploy the verification bridge and add fresh secrets                           |
| 🚧 Blocked | Public launch needs Reddit review and external-service approval                |

**Your next action:** deploy the included verification bridge to one HTTPS address. Then add that exact hostname to `devvit.json`.

---

## What does this tool do?

Imagine a moderator sees a suspicious post and wants to check whether its author is a live person.

1. The moderator clicks **Request Human Check** on the post or comment.
2. The author receives a private Reddit message with a verification link.
3. The author opens the portal and chooses to start a World Selfie Check.
4. World verifies the result; Reddit never receives the selfie.
5. The app records success and gives the user subreddit flair.

That is the whole product loop.

### What Selfie Check means

Selfie Check provides **liveness and bot friction**. It helps show that a live person completed the request.

It does **not** prove that the user is globally unique. Orb-based Proof of Human can be added as the next verification level.

---

## Why build this?

Moderators need a tool that is stronger than a CAPTCHA but does not create a database connecting Reddit usernames to World identities.

This app is designed around one rule:

> Reddit knows the Reddit user. World receives only an opaque verification signal. Neither side needs the other side's identity data.

### Privacy in plain English

| Data                  | Where it goes                                     |
| --------------------- | ------------------------------------------------- |
| Reddit username       | Stays inside Reddit                               |
| Raw Reddit user ID    | Stays inside Reddit                               |
| Selfie                | Handled by the World flow, not stored by this app |
| Opaque derived signal | Sent to the bridge and World for proof binding    |
| Verification status   | Stored in this installation's Reddit Redis        |

The opaque signal is derived using an HMAC over the subreddit, Reddit user ID, and verification action. It cannot be used as a Reddit username and changes across communities/actions.

Users can unlink and delete their app-held verification data.

---

## What did we build?

The project has two small parts:

| Part                    | Job                                                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Devvit app**          | Shows Reddit UI, handles moderator actions, stores state, verifies proofs, and assigns flair                |
| **Verification bridge** | Opens World IDKit outside Reddit's restricted webview and returns the result through a short-lived callback |

```text
Moderator requests check
        ↓
Reddit user opens portal
        ↓
Devvit creates opaque signal + signed request
        ↓
Verification bridge opens World
        ↓
World Selfie Check
        ↓
Devvit verifies proof with World
        ↓
Redis status saved + Reddit flair added
```

### Included in V1

- Verification portal created when the app is installed.
- Moderator actions to request a check or view status.
- Per-community settings for enabling the tool, flair, and message copy.
- Server-side World RP signing and World v4 proof verification.
- Per-install Redis state, replay protection, unlinking, and data deletion.

Also included: Reddit private-message delivery, verified flair assignment, signal/action/environment binding, and a clean credential boundary for adding Orb verification later.

<details>
<summary><strong>Show the detailed verification flow</strong></summary>

| Phase        | What happens                                                                 |
| ------------ | ---------------------------------------------------------------------------- |
| Request      | Devvit saves a pending request in installation-scoped Redis                  |
| Message      | Devvit sends the author a private message containing the Reddit portal link  |
| Consent      | The portal asks the user to explicitly start verification                    |
| Privacy      | Devvit derives `HMAC(subreddit ID + Reddit user ID + action)`                |
| Signing      | Devvit creates the signed World request and one-time callback URL            |
| Selfie Check | The trusted bridge starts IDKit and returns the untouched result             |
| Verification | Devvit calls `POST developer.world.org/api/v4/verify/{rp_id}`                |
| Protection   | Devvit checks the action, environment, signal hash, and nullifier uniqueness |
| Success      | Devvit saves the status and assigns subreddit flair                          |

</details>

---

## What do I need to provide?

### Kept out of this repository

| Input                | Where to configure it                                |
| -------------------- | ---------------------------------------------------- |
| World app ID         | Devvit global developer setting: `worldAppId`        |
| World RP ID          | Devvit global developer setting: `worldRpId`         |
| World RP signing key | Devvit encrypted global setting: `worldRpSigningKey` |
| Test community       | Supply it locally to the Devvit playtest command     |

Concrete app IDs, RP IDs, community names, and secrets are intentionally excluded from this README.

### Still required

| Input                      | What to do                                                  |
| -------------------------- | ----------------------------------------------------------- |
| Fresh World RP signing key | Create or rotate it in the World Developer Portal           |
| Signal HMAC secret         | Generate a new random 32-byte value                         |
| Bridge API token           | Generate another random 32-byte value                       |
| Bridge URL                 | Deploy the bridge to an HTTPS origin                        |
| Reddit approvals           | Request external endpoint, HTTP, and World handoff approval |

**Never paste a signing key into source code, GitHub, an issue, or chat.** Enter it only through Devvit's encrypted settings prompt.

---

## Setup: one checkpoint at a time

### Checkpoint 1 — Confirm accounts

You need:

- A Reddit account connected to [Reddit for Developers](https://developers.reddit.com/).
- Moderator access to the small test subreddit.
- Access to the registered Devvit app.
- Access to the World app/RP in the [World Developer Portal](https://developer.world.org/).
- Selfie Check enabled for that RP.

You do **not** need a traditional Reddit OAuth client ID or client secret.

**Done when:** you can access both developer portals and moderate the private test community.

### Checkpoint 2 — Create fresh secrets

Generate two app-owned secrets locally:

```bash
openssl rand -hex 32  # signalHmacSecret
openssl rand -hex 32  # worldBridgeApiToken / BRIDGE_API_TOKEN
```

Also create or rotate the World RP signing key in the World Developer Portal.

**Done when:** you have three separate secret values stored in a password manager.

### Checkpoint 3 — Deploy the bridge

The bridge needs:

- One HTTPS hostname.
- `BRIDGE_API_TOKEN` set to the bridge API token from Checkpoint 2.
- A single running instance for this narrow V1 playtest.
- The included bridge client and server build.

The current session store is in memory and expires sessions after 10 minutes. Multi-instance production deployment needs shared storage.

Add the bridge's exact hostname—without protocol, wildcard, or path—to `permissions.http.domains` in `devvit.json`.

**Done when:** the bridge is reachable over HTTPS and its hostname is in `devvit.json`.

### Checkpoint 4 — Add Devvit settings

Run these commands one at a time. Each command opens an interactive prompt so the secret does not enter your shell history.

```bash
npx devvit settings set worldAppId
npx devvit settings set worldRpId
npx devvit settings set worldRpSigningKey
npx devvit settings set signalHmacSecret
npx devvit settings set worldBridgeBaseUrl
npx devvit settings set worldBridgeApiToken
```

Keep the default `worldAction` and `worldEnvironment` unless they do not match the World Portal configuration.

**Done when:** all six settings exist and no identifier or secret appears in a tracked file.

### Checkpoint 5 — Test it

```bash
npm install
npm run check
npm run build
npm run login
npx devvit playtest <private-test-subreddit>
```

**Done when:** a moderator can request a check and the user sees the verification portal. The full World round trip also requires the Reddit approvals below.

---

## How a moderator uses it

1. Open a post or comment in the test subreddit.
2. Open the moderation menu.
3. Choose **Request Human Check**.
4. Use **View Human Check status** to inspect progress.
5. After success, confirm the user's verified flair appears.

The mod settings control whether the tool is enabled, the request message, and the flair text.

---

## Why is public launch blocked?

The code is ready for a narrow playtest. Reddit still needs to approve the external parts.

| Blocker             | Approval needed                                                           |
| ------------------- | ------------------------------------------------------------------------- |
| World App handoff   | Written exception for sending the user into an external verification flow |
| External Endpoints  | Allowlisting for the secure callback into Devvit                          |
| HTTP Fetch          | Approval for `developer.world.org` and the exact bridge hostname          |
| Account linking     | Confirmation that the opaque-ID design satisfies Reddit's requirements    |
| Selfie Check access | World must enable this Beta/preview credential for the RP                 |

Reddit review will also need app-owned Terms of Service and Privacy Policy URLs. Depending on Reddit's classification, it may request SOC 2 or penetration-test evidence.

Use [docs/REDDIT_REVIEW_CHECKLIST.md](docs/REDDIT_REVIEW_CHECKLIST.md) for the approval package. Use [docs/PRIVACY_DATA_MAP.md](docs/PRIVACY_DATA_MAP.md) for the exact data flow.

---

## Important V1 limits

- Requests are manual; there is no AutoModerator gating yet.
- Selfie Check shows liveness, not one-person-one-account uniqueness.
- Verified flair may replace the user's existing subreddit flair.
- Bridge sessions are memory-only and intended for a single playtest instance.
- Reddit platform limits can affect private-message delivery.

Public launch remains blocked until Reddit approves the integration and production Terms/Privacy pages are live.

---

## Add Orb / Proof of Human later

The existing Reddit, Redis, callback, and proof-verification path can stay in place.

The next version should:

1. Add a second verification level using World ID 4.0 `proofOfHuman`.
2. Give it a separate World action.
3. Add distinct moderator settings and flair.
4. Keep Selfie Check labeled as liveness—not unique-human proof.

---

## Quick troubleshooting

| Problem                                    | Likely cause                          | Fix                                                         |
| ------------------------------------------ | ------------------------------------- | ----------------------------------------------------------- |
| Portal opens but verification cannot start | Bridge URL or token missing           | Complete Checkpoints 3 and 4                                |
| World verification fails                   | Action/environment/RP mismatch        | Match Devvit settings to the World Portal                   |
| Devvit cannot call World or the bridge     | HTTP hostname not approved            | Update `devvit.json` and request Reddit approval            |
| Result cannot return to Reddit             | External Endpoints unavailable        | Request Devvit limited-access allowlisting                  |
| Flair does not appear                      | App moderation access or flair policy | Check installation permissions and subreddit flair settings |

## Useful project commands

```bash
npm run check          # TypeScript + tests
npm run build          # Devvit app + bridge build
npm run build:bridge   # Bridge only
npm run bridge:start   # Run bridge locally
npm run dev            # Devvit playtest
```

**Best next move:** finish Checkpoint 3 by choosing the bridge's HTTPS hosting location.
