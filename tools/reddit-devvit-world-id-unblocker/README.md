# Reddit Devvit World ID POC Unblocker

Temporary local Chrome extension for the Reddit Selfie Check POC.

It removes `Content-Security-Policy` and `Content-Security-Policy-Report-Only` response headers only from Reddit and Devvit page documents. This lets the existing POC fallback contact the verification bridge from the Reddit WebView. It does not approve domains in Devvit or represent a production solution.

## Install

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose this directory.
5. Confirm the extension badge says **ON**.
6. Close every Reddit tab, then reopen the `orb_human_badge_dev` verification post.

Click the extension icon to toggle it. Keep it disabled outside POC testing: removing CSP weakens browser protections on Reddit and Devvit pages.

## Boundary

This extension is a local demo aid. It does not change Reddit or Devvit permissions, and it must not be included in the production architecture or app-review justification.
