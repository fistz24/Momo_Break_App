# Momo Break

**Soft reminders to pause.**

Momo is a small break companion that watches for real active time, then peeks in from the corner of your browser. She never blocks the screen. You can always close her.

![Momo](mascots/momo-default.png)

## What it does

- Appears after **active** computer use (default 50 minutes; adjustable 25 / 50 / 90 or custom 5–240)
- Idle time does not count; longer idle resets the timer
- Corner pop-up with a short checklist (water, posture, stretch, or your own tasks)
- **Start** a 10-minute break, **Snooze**, or **Skip**
- After two snoozes in a row, offers a gentler 2-minute version
- After three skips in a day, rests until tomorrow
- Max 6 pop-ups per day; cooldown after a break or pop-up
- Work hours (default 9:00–18:00)
- Click the mascot to change expression and speech bubble
- Optional: upload your own photos (pet, family, etc.) as the mascot

## Install (Chrome / Edge / Brave)

1. Download or clone this repo
2. Open `chrome://extensions` (or `edge://extensions`)
3. Turn on **Developer mode**
4. Click **Load unpacked**
5. Select the folder that contains `manifest.json` (this project root)

Pin the extension from the toolbar puzzle icon for easy access.

### After updating files

Reload the extension on `chrome://extensions`, then **hard-refresh** any open website tabs (`Cmd+Shift+R` / `Ctrl+Shift+R`).

## Usage

1. Keep the browser open while you work
2. Open normal websites (not only `chrome://` pages)
3. Click the Momo icon → **Preview pop-up** to try the flow anytime
4. Open **Options** to change interval, work hours, checklist, and mascots

Progress toward the next break is shown in the toolbar popup.

## Options

| Setting | Description |
|--------|-------------|
| Appear after | 25 / 50 / 90 min, or custom minutes |
| Work hours | When automatic pop-ups are allowed |
| Checklist | Built-in tasks + your own items |
| Mascots | Default poses, or upload your own images |

## How the timer works

- Uses Chrome’s idle API so activity can count while you use the computer (Chrome must stay open)
- Pop-up is drawn as a corner widget on a normal webpage
- If no suitable tab is visible when a break is due, a notification may appear; open a website tab to see Momo

**Limits:** Works while the browser is running, on normal `http`/`https` pages. It does not overlay other desktop apps when Chrome is closed. That would need a separate desktop app.

## Project structure

```
momo-break-extension/
  manifest.json      # Chrome extension manifest (MV3)
  background.js      # Timer, idle tracking, messaging
  content.js         # Corner pop-up UI (Shadow DOM)
  content.css
  popup.html / js    # Toolbar popup
  options.html / js  # Settings page
  mascots/           # Default mascot images
  assets/            # Sounds
  icons/             # Extension icons
```

## Privacy

- No account required
- Settings and stats stay in the browser (`chrome.storage.local`)
- No analytics backend in this version

## Development

No build step. Edit the files, reload the extension, hard-refresh the page.

Optional local UI check: serve the folder and open `test-ui.html` (mocks extension APIs for button tests).

## License

Personal / demo use. Mascot assets included for this project.

---

*We all need to take a break — Momo just knocks softly.*
