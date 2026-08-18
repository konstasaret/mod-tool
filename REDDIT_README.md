# Orb Human Badge

> A privacy-preserving `🌐 human` community badge for Orb-verified Reddit users.

Orb Human Badge lets a Reddit user prove that they already hold a World Orb credential and receive a visible flair in the subreddit where the app is installed.

This is a separate, self-service app. It does not replace or modify moderator-requested Selfie Check functionality in other apps.

## How it works

1. A moderator installs the app and opens **Orb Human Badge portal** from the subreddit menu.
2. A user opens the portal and selects **Verify with World**.
3. World proves the user's existing Orb credential.
4. The app accepts only an `orb` credential response and assigns `🌐 human` flair.
5. The user can unlink the badge and its app-held verification state.

No new Orb visit is required for someone who is already Orb verified.

## Privacy

- Reddit usernames are not sent to World.
- The app does not receive or store biometric images.
- World receives an opaque signal scoped to this app installation and community.
- Verification and nullifier state are isolated to the app installation.
- Users can remove their badge data from the portal.

## Community settings

Moderators can disable the app or customize the human-badge flair text. The default flair is `🌐 human`.
