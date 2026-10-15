# Momo Break evals: do-it-yourself guide

Cost: **$0**. No AI, no API keys. Time: about 2 hours for the first pass.

You get three kinds of evals, because Momo has three kinds of behavior:

| Layer | What it tests | How | File |
|---|---|---|---|
| **A. Automated** | Trigger rules, snooze, limits, timer, checklist, greetings | Runs your real `background.js` and `content.js` in Node with a fake Chrome and a fake clock | `run-evals.js` |
| **B. Human read-through** | Does the wording feel right? Anything annoying? | You read 30 generated pop-ups and mark them | `sample-outputs.js` → `samples.csv` |
| **C. Real-browser checks** | Fullscreen, screen share, typing, focus stealing | You do 12 short manual tests in Chrome | Part 7 below + `eval-log.csv` |

---

## 1. Setup (10 minutes)

1. Install Node.js (LTS version) from nodejs.org. Check it worked: open a terminal and run `node -v`.
2. Put the `momo-evals` folder **next to** your extension folder:
   ```
   my-stuff/
     momo-break-extension/     <- your extension (has manifest.json)
     momo-evals/               <- this folder
   ```
3. In the terminal: `cd momo-evals` then `node run-evals.js`.
   If it says it can't find `background.js`, pass the path: `node run-evals.js ../path/to/momo-break-extension`.

You should see a list of checks ending with a line like `33 pass, 10 fail, 6 need your decision`.

## 2. Read the results

Every line is one sentence from your spec turned into a test.

- **PASS**: the code does what your spec says.
- **FAIL**: the code breaks your spec. Either the code is wrong or the spec is wrong. You decide which.
- **WARN**: a judgment call only you can make (for example, "18:00 exactly: inside or outside work hours?").

The "spec" lives in the `SPEC` block at the top of `run-evals.js`. Change a number there only when you deliberately change the product.

### What the first run found on your v1.3.4 zip

| ID | Finding | Why it matters |
|---|---|---|
| S01 | A normal snooze comes back after **50 min**, not 10 | The pop-up resets your active timer when it shows, so snoozing means waiting a whole new cycle |
| S03 | The "gentle" pop-up can appear at 18:06, after work hours | The gentle path skips all the safety checks |
| S04 | The gentle pop-up can be a 7th pop-up of the day | Same cause |
| S05 | The gentle pop-up can appear after 3 skips | Same cause |
| A03 | Daily counters reset at 7am (Jakarta), not midnight | The code uses the UTC date. Harmless with 9-18 work hours, but wrong for anyone far west of UTC |
| C01 | No code detects screen sharing or calls | Momo can pop up over a Meet/Zoom share |
| C02 | No code waits for a typing pause | Momo can pop up mid-sentence |
| K01 | Checklist has 3-4 items, spec says 4-5 | Spec or code is wrong |
| K02 | 14% of checklists have neither water nor posture | The code counts stretch/window as "quick" too |
| G01 | 16% of pop-ups repeat the previous greeting | Only 6 greetings and nothing prevents repeats |
| WARN | 18:00 boundary, `Again?` bubble, header wording ("feel" vs "feeling"), new Google tab opened when no tab is open, 60s vs 2-min "active", window focus stealing | Your call |

Notice that most of these are **specs that were never implemented or edge cases between two features**. That's the typical output of a first eval run, and it's the story to tell in your portfolio.

## 3. Triage (30 minutes)

Make a tiny table for every FAIL and WARN. Use one of three decisions:

1. **Fix the code** (the spec is right).
2. **Fix the spec** (the code is right; edit the `SPEC` block and your notes).
3. **Won't fix** (write down why).

Suggested order: S03/S04/S05 first (one root cause), then S01, then K01/K02, then G01, then C01/C02 (bigger features).

Hints, not full solutions, so you still do the learning:
- **S03/S04/S05**: in `onTick()`, the `gentleNext` branch calls `queueOrShowPopup` directly. Normal pop-ups go through `canShow()`. What checks should the gentle path share?
- **S01**: `markPopupShown()` sets `activeMs = 0`. After a snooze, should Momo restore the timer, or schedule a return at `snoozeUntil`? Remember the 15-minute cooldown also applies.
- **K02**: look at `QUICK_IDS` and the `quick` flags in `TASK_POOL`. Spec says the guaranteed item is water or posture.
- **G01**: pick a greeting that differs from the last one (store the last one, like `lastMascot` does for mascots).

## 4. The fix loop (red → green)

Do this for one bug first, for example S03:

1. Run `node run-evals.js` and confirm S03 says FAIL. (Red.)
2. Change `background.js` to fix it.
3. Run again. S03 should be PASS and **no other line should get worse**. (Green.)
4. Write one line in a changelog: "Fixed gentle pop-up bypassing work hours (S03)."

If another test turns red after your fix, you just caught a regression. That's the point of the harness.

## 5. Does my eval actually catch bugs? (15 minutes)

```
node mutation-check.js
```

It makes 9 deliberate bugs one at a time (cooldown 15→5, max pop-ups 6→7, and so on) and checks whether any test noticed. Right now all 9 are caught. Add 3 mutations of your own to the `MUTATIONS` list (copy a line, change `from`/`to`). A bug that shows `MISSED` means you need a new test.

This is the same idea as validating an LLM judge: before you trust a grader, prove it can fail.

## 6. Human read-through: error analysis (30 minutes)

```
node sample-outputs.js
```

Open `samples.csv` in Google Sheets.

1. **Read all 30 rows once, fast**, as if you were the user at 3pm in the middle of work.
2. In the **annoying?** column, put `y` or `n`. Gut feel only.
3. For every `y`, write a short **failure category**. Reuse the same words so they group, for example: `repetitive`, `too many tasks`, `tone too cute`, `guilt`, `task doesn't fit` (coffee at 5pm?), `wrong length`.
4. Count the categories. The top 2 are your next checks.
5. Turn each into a rule in `run-evals.js` (see how G03 or K02 are written) so it's tested automatically from now on.

Run `sample-outputs.js` again after each change and repeat 10 rows to see if the categories shrank.

## 7. Real-browser checks (about 45 minutes)

The harness can't test what Chrome itself does. These 12 need you.

**Load the extension:** `chrome://extensions` → turn on Developer mode → Load unpacked → pick the extension folder.

**Fast-forward trick (so you don't wait 50 minutes):**
1. On `chrome://extensions`, find Momo Break → click **service worker** (opens DevTools).
2. In the Console, paste:
   ```js
   runtime.activeMs = 60*60*1000; await saveRuntime(); await onTick();
   ```
   That makes Momo think you've worked for an hour. (If the Console is empty or says `runtime` is not defined, click the **service worker** link again to wake it up.)
3. **Pop up again without losing your counters** (skips, completions), use this instead:
   ```js
   await loadAll(); stats.lastPopup = 0; stats.lastComplete = 0; await saveStats(); runtime.snoozeUntil = 0; runtime.activeMs = 60*60*1000; await saveRuntime(); await onTick();
   ```
4. **Start completely fresh:** `await chrome.storage.local.clear();`

Record each result in `eval-log.csv` (Pass / Fail / Warn + a note). **Write your prediction first**, then test. Being surprised is the signal.

| ID | Test | Steps | Expected |
|---|---|---|---|
| M01 | Fullscreen video | Open a YouTube video, press `F`, fast-forward | No pop-up while fullscreen. A notification appears. Pop-up shows within ~1 min after exiting fullscreen |
| M02 | Screen share | Start a Google Meet, share a window, fast-forward | No pop-up (spec). Predicted: **it appears** (C01) |
| M03 | Typing | Type continuously in a Google Doc, fast-forward | Waits until you pause 3 seconds. Predicted: **interrupts** (C02) |
| M04 | No web tab | Close all tabs except a `chrome://` page, fast-forward | Observe: does a Google tab open? Does it feel okay? |
| M05 | Focus stealing | Work in another app (Notes, Word) with Chrome behind it, fast-forward | Chrome should not jump in front. Predicted: **it does** (C05) |
| M06 | Full break flow | Start → tick every task | Celebration, cheer pose, "N breaks today", chime plays, no new pop-up for 15 min |
| M07 | Skips | Click × three times (use the "pop up again" snippet between), then open the toolbar popup | Counts as skips. After 3: "Done for today" |
| M08 | Custom task safety | In Options add a task named `<b>Bold</b> test` | It should show as literal text. Predicted: **renders bold** (it uses `innerHTML`) |
| M09 | Mascot uploads | Upload 1 photo, then 9, then one 6 MB photo | Max 8 kept. Large photo either works or fails clearly, not silently |
| M10 | Many tabs | Open 3 windows, fast-forward, then Snooze | Pop-up appears once, in the active tab, and disappears everywhere on snooze |
| M11 | Busy sites | Trigger on Gmail, Notion, YouTube | Visible, clickable, doesn't cover important buttons |
| M12 | Restart | Complete a break, quit Chrome, reopen | "N breaks today" still correct, timer resumes |

## 8. Make it a habit

- Run `node run-evals.js` before every version bump in `manifest.json`. Treat any FAIL you haven't triaged as a blocked release. The script exits with code 1 when something fails.
- Re-run with another timezone to check the A03 type of bug: `TZ=America/Los_Angeles node run-evals.js`
- Every time you find a bug by hand, add a test for it **first**, watch it fail, then fix it.

## 9. Turn it into a portfolio piece (20 minutes)

One page, with real numbers from your runs:

1. **The product and the risk**: "A break reminder must be reliable and never interrupt the wrong moment."
2. **The method**: spec → executable checks → harness on the real code → human read-through → manual browser checks.
3. **First-run results**: "49 checks, 10 failed, 6 needed decisions." Show 2 or 3 concrete bugs (S01 and S03 are great: the gentle path bypassed every safety rule).
4. **What you changed**: before/after counts, and which items you decided *not* to fix and why.
5. **Proof the eval works**: "9/9 deliberate bugs caught by the mutation check", plus the 3 you added.
6. **The decision**: "Added AI greetings or not?" Use this suite as the baseline any AI feature must beat.

## Limits to be honest about

- The harness fakes Chrome. It proves your logic is right, not that Chrome behaves the same. That's why Part 7 exists.
- `C01`-`C05` are "is the feature in the code at all?" checks based on searching the source. They can be fooled by a feature written in an unusual way. Confirm with M01-M05.
- Passing 100% means your spec is satisfied, not that people like Momo. Real-user signals (completion, skip, snooze rates) are the next layer once others use it.
