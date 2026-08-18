# World Human Check

> A privacy-preserving human-check tool developed for Reddit moderators and their communities.

## Start here

**World Human Check lets a moderator ask the author of a post or comment to complete a World Selfie Check.**

After a successful check, the app records the result for that community and can give the Reddit user a verified flair.

**Current status:** V1 is ready for private-community playtesting. Public release is waiting for Reddit review of the external verification flow.

---

## What problem does it solve?

Moderators sometimes need more confidence that a live person is behind an account without collecting identity documents or building a database that connects Reddit accounts to external identities.

World Human Check adds a voluntary, moderator-requested liveness check directly to Reddit's moderation workflow.

### Important: what Selfie Check means

Selfie Check provides **liveness and bot friction**. It helps show that a live person completed the request.

It does **not** prove that the person is globally unique or that they have only one Reddit account. Orb-based Proof of Human can be added as a separate verification level later.

---

## How moderators use it

1. Open the moderation menu on a post or comment.
2. Select **Request Human Check**.
3. The author receives a private message with the community verification entry point.
4. Use **View Human Check status** to see whether the request is pending or complete.
5. After success, confirm that the community's verified flair appears.

Moderators can also open the community verification portal from the subreddit menu.

### Community controls

Each installation has its own settings. Moderators can:

- enable or disable the tool,
- choose the verified flair text, and
- customize the verification-request message.

One community cannot read another community's verification records.

---

## What the Reddit user sees

1. A moderator requests a check.
2. The user opens the verification entry point from Reddit.
3. The user chooses whether to begin the World Selfie Check.
4. World completes the liveness flow outside Reddit.
5. Reddit receives the verification result—not the selfie.

The check is not silently triggered. The user must choose to start it.

---

## Privacy in plain English

| Data | Handling |
| --- | --- |
| Reddit username | Remains inside Reddit |
| Raw Reddit user ID | Remains inside Reddit |
| Selfie | Handled by the World verification flow and not stored by this app |
| Opaque verification signal | Used to bind the check without exposing a Reddit username |
| Verification status | Stored in the app installation's community-scoped Redis storage |

The opaque signal is derived from community, user, and action data using a server-side secret. It is not a Reddit username and changes across communities and verification actions.

Users can unlink their verification and delete app-held verification data.

---

## What is included in V1?

### Reddit moderation experience

- Subreddit installation and per-community settings
- **Request Human Check** action on posts and comments
- **View Human Check status** action
- User-facing verification portal
- Private-message delivery and verified flair assignment

### Verification and privacy protection

- World Selfie Check request and proof-verification plumbing
- Opaque, community-scoped signals instead of external Reddit usernames
- Per-install Redis state and short-lived verification requests
- Replay and duplicate-proof protection
- User unlinking and data deletion

### Hosted verification bridge

The app uses a small HTTPS bridge to open the World verification experience outside Reddit's restricted webview and return the result through a short-lived callback.

The bridge receives the opaque signal required for proof binding. It does not need a Reddit username.

---

## Project status

| Status | Milestone |
| --- | --- |
| ✅ Complete | Devvit app, install flow, moderator menus, and community settings |
| ✅ Complete | User portal, private messages, Redis state, and flair assignment |
| ✅ Complete | Hosted verification bridge and authenticated server-to-server connection |
| ✅ Complete | Encrypted platform configuration, proof checks, and privacy tests |
| ⏳ Pending | Reddit approval for the external World handoff and requested network domains |

All deployment-specific identifiers, community names, private endpoints, and credentials are intentionally excluded from this README and repository configuration. Secrets are stored only in the relevant hosted platform's protected settings.

---

## What remains before public release?

Reddit must review and approve the parts of the flow that leave or call into Reddit:

- the external World App verification handoff,
- outbound HTTP access to the verification services,
- the secure callback into the Devvit app, and
- the privacy-preserving account-linking design.

Production Terms of Service and Privacy Policy pages are also required before a public directory release.

Until those reviews are complete, use the app only for a narrow playtest in a private community. The Reddit menus and portal can be tested now; the complete World round trip may remain blocked by pending platform approval.

---

## V1 limits

- Requests are manual; the app does not automatically gate every post.
- Selfie Check indicates liveness, not one-person-one-account uniqueness.
- Applying verified flair may replace a user's existing community flair.
- The current bridge session store is intended for a single-instance playtest.
- Reddit platform limits can affect private-message delivery.

---

## Planned next: Orb / Proof of Human

The architecture keeps verification levels separate. A future version can add Orb-based Proof of Human for moderators who need stronger uniqueness assurance while keeping Selfie Check clearly labeled as a liveness check.

The existing Reddit menus, community storage, callback path, and flair workflow can be reused.

---

## For reviewers and contributors

This repository contains two components:

| Component | Purpose |
| --- | --- |
| Devvit app | Reddit UI, moderator actions, installation settings, storage, proof checks, and flair |
| Verification bridge | Short-lived external verification launch and secure callback handoff |

Review resources:

- [Reddit review checklist](docs/REDDIT_REVIEW_CHECKLIST.md)
- [Privacy data map](docs/PRIVACY_DATA_MAP.md)

Useful local checks:

```bash
npm run check
npm run build
```

**Security rule:** never place platform credentials, signing keys, private deployment identifiers, community names, or private service endpoints in source control, issues, screenshots, or documentation.
