# Reddit review checklist

## Approval requests

Submit these before a public pilot:

- App review for `world-human-check` as a subreddit-installed moderation tool.
- Written exception for the explicit user-initiated handoff from Reddit to the World verification experience and back.
- HTTP Fetch allowlisting for `developer.world.org` and the bridge's exact production hostname.
- Limited-access enablement for Devvit External Endpoints.
- A written classification decision on whether this proof-only flow is an account-linked service.

## Reviewer explanation

`world-human-check` lets a moderator manually request a low-assurance liveness/Selfie Check from a post or comment author. The user must opt in from a community portal. The app does not send Reddit content, usernames, profile images, or raw Reddit user IDs to an external service. It sends an installation-scoped HMAC value that cannot be reversed without a Devvit-held secret. World returns a cryptographic proof; Devvit verifies it server-side, stores state in installation-scoped Redis, and assigns subreddit user flair.

The external bridge exists because Devvit webviews cannot make external client requests. Devvit sends its one-time callback URL to the trusted bridge server-to-server; the callback token is never exposed in the Reddit webview or to the user. Bridge sessions expire after 10 minutes and are deleted after use.

## Questions requiring written answers

1. Is the World App / World invite-code handoff approved as an exception to the external-app linking rule for this moderation function?
2. May the app use `developer.world.org` for proof verification and the named bridge hostname for short-lived session creation?
3. Can External Endpoints be enabled for the app's single installation-scoped proof callback?
4. Does Reddit classify a zero-knowledge human proof with no external profile/login as an account-linked service?
5. If yes, which SOC 2 Type II and recent penetration-test evidence must be supplied, and can TFH submit it privately?

## Submission attachments

- Working private-subreddit playtest recording.
- Architecture diagram and this repository revision.
- App-owned Terms of Service URL.
- App-owned Privacy Policy URL matching `PRIVACY_DATA_MAP.md`.
- Exact fetch domains and justification.
- Data deletion/unlink demonstration.
- TFH security/compliance evidence if Reddit requests it.

## Do not claim

- Selfie Check proves one-person-one-account.
- Reddit endorses, partners with, or officially integrates World.
- The flair is portable outside the installing subreddit.
- Public launch is approved before the written decisions above are received.
