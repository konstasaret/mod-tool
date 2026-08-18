# World Human Check

> A simple, privacy-conscious human-check tool for Reddit moderators and their communities.

World Human Check helps moderators ask the author of a post or comment to complete a World Selfie Check. It also lets an Orb-verified user add a separate `🌐 human` badge in the community.

It gives moderators an additional liveness signal when reviewing suspicious activity, bots, spam, or other behavior that may need a human check.

After a successful check, the app can add a verified flair to the Reddit user in that community.

The Orb badge is an optional, self-service feature. It does not replace or change moderator-requested Selfie Check.

---

## How it works

1. A moderator requests a human check on a post or comment.
2. The author receives a private message explaining the request.
3. The author chooses to start a World Selfie Check.
4. The app records whether the check was completed.
5. The moderator can view the result and the user can receive verified flair.

The process is user-initiated. A check does not begin until the Reddit user chooses to start it.

---

## How moderators use it

1. Install World Human Check in your community.
2. Open the moderation menu on a post or comment.
3. Select **Request Human Check**.
4. Select **View Human Check status** to see the result.
5. Confirm that verified flair appears after a successful check.

Moderators can also open the community's World Human Check portal from the subreddit menu.

### Verified posting mode

Communities can require a successful Human Check for posts, comments, or both. When this mode is enabled, an unverified submission is temporarily removed and the author receives a verification request.

After the author completes the check, the app restores the held submission, applies verified flair, and allows future posts or comments normally.

An Orb-verified human badge also satisfies verified posting mode.

### Orb-verified human badge

An Orb-verified user can open the community portal and select **Get human badge**. World proves the user's existing Orb credential, and the app adds a `🌐 human` flair for that community. A moderator does not need to request this flow.

Selfie Check state and Orb badge state are stored separately. Because Reddit has one user-flair slot per community, the Orb badge is shown when both are present. Removing the Orb badge restores the Selfie Check flair if the user completed that check too.

### Community settings

Moderators can:

- enable or disable human checks,
- require Human Check for posts or comments,
- choose the verified flair text, and
- choose the Orb-verified human badge flair text, and
- customize the message sent with each request.

Each community manages its own settings and verification records.

---

## What Reddit users see

The Reddit user receives a clear private message explaining that a moderator requested a human check.

The user opens the community verification portal, chooses whether to continue, and completes the World Selfie Check. When the check succeeds, the app updates their community verification status and can apply verified flair. Orb-verified users can independently choose to prove that credential and receive the human badge.

---

## Privacy

- Reddit usernames are not sent to World.
- The app does not store selfies.
- The app stores only the verification information needed for the community experience.
- Users can unlink their verification and delete app-held verification data.
- Orb badge records are separate from Selfie Check records and can be unlinked independently.

---

## What Selfie Check means

World Selfie Check helps confirm that a live person completed the request. It adds useful bot friction without asking moderators to collect identity documents.

Selfie Check is a liveness check. It does not prove that a person is globally unique or that they have only one Reddit account.
