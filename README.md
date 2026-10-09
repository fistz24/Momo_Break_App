# Momo Break

**Soft reminders to pause.**

Momo is a little peach mascot that watches for real active computer time, then peeks in from the corner with a gentle break prompt. She never blocks your screen — just a friendly nudge to drink water, stretch, or tick off a few small care tasks.

![Momo](mascots/momo-default.png)

## What it does

- **Smart timing** — Appears after 25 / 50 / 90 minutes of *active* use (or your own custom interval). Idle time doesn’t count; 5+ minutes idle resets the timer.
- **Non-blocking pop-up** — Corner widget you can close anytime. No full-screen takeover.
- **Short checklist** — 3–4 small actions per break (posture, water, stretch, or tasks you add yourself). Shown one at a time and rotated.
- **Snooze & skip** — Snooze for 10 minutes; after two snoozes in a row, Momo offers a gentler 2-minute version. Three skips in a day and she’s done until tomorrow.
- **Work hours** — Only pings you inside the hours you set (default 9:00–18:00).
- **Your mascots** — Default Momo poses, or upload your own photos/characters to rotate.
- **Daily streak** — Tracks completed breaks for the day.

## Try it

Open the site, leave the tab open while you work, and use **Preview pop-up** to see the flow anytime.

### Settings

| Setting | Description |
|--------|-------------|
| Appear after | 25 / 50 / 90 min, or custom (5–240) |
| Work hours | When pop-ups are allowed |
| Checklist items | Built-in tasks + your own |
| Mascots | Upload images to rotate with Momo |

## Chrome extension

A separate package runs as a browser extension with system-level idle detection and overlays on normal web pages. Load the unpacked extension folder in `chrome://extensions` (Developer mode).

## Stack

Static HTML, CSS, and JavaScript. No backend. Preferences and stats live in the browser’s `localStorage`.

## Deploy

Works on any static host (Vercel, Netlify, GitHub Pages). Point the host at this folder — `index.html` is the entry.

## License

Personal / demo use. Momo character assets included for this project.
