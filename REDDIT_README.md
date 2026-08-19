# World Verification

World Verification lets a community require a privacy-preserving Proof of Human check before a user's posts remain visible.

When an unverified user submits a post, the app temporarily removes it and sends the author a Reddit message. The author opens the community verification portal and completes the check through World. After World verifies the result, the app restores the held post and allows later posts from that user.

The process is user-initiated: the check does not begin until the Reddit user opens the verification link and continues with World.

## Privacy

- Reddit usernames are not sent to World.
- The app does not receive or store selfies.
- The app stores only the community-scoped verification and held-post state needed for this experience.
- Users can unlink and delete their app-held verification state.

The POC uses World Proof of Human to decide posting eligibility. It does not issue Reddit flair or a badge.
