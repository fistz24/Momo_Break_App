// run-evals.js: evals for the REAL Momo Break extension code. No AI, no cost.
//
//   node run-evals.js                       (expects ../momo-break-extension)
//   node run-evals.js /path/to/extension    (or pass the folder)
//   TZ=America/Los_Angeles node run-evals.js    (re-run in another timezone)
//
// Result labels:
//   PASS   the code does what your spec says
//   FAIL   the code breaks your spec (fix the code, or change the spec on purpose)
//   WARN   a judgment call that needs YOUR decision (see "detail")
// Exit code is 1 if anything FAILs, so you can use it as a release gate.

process.env.TZ = process.env.TZ || "Asia/Jakarta";
const fs = require("fs");
const path = require("path");
const { makeEnv, loadContent } = require("./harness");

const EXT = path.resolve(process.argv[2] || process.env.MOMO_DIR || path.join(__dirname, "..", "momo-break-extension"));
if (!fs.existsSync(path.join(EXT, "background.js"))) {
  console.error(`Can't find background.js in ${EXT}\nPass the extension folder: node run-evals.js /path/to/momo-break-extension`);
  process.exit(2);
}

// ---------------------------------------------------------------
// YOUR SPEC. This is the source of truth the code is graded against.
// Change a number here only when you deliberately change the product.
// ---------------------------------------------------------------
const SPEC = {
  intervalDefault: 50, cooldownMin: 15, snoozeMin: 10, maxPopups: 6, maxSkips: 3,
  idleResetMin: 5, activeWindowSec: 120, typingPauseSec: 3,
  workStart: [9, 0], workEnd: [18, 0],
  checklistMin: 4, checklistMax: 5,
  header: "Let's get you feel better in 10 minutes!",
  maxWordsPerLine: 12,
  guiltWords: ["should", "again", "lazy", "finally", "already", "didn't", "missed", "failed", "must"],
};

const MIN = 60 * 1000;
const local = (h, m) => new Date(2026, 9, 14, h, m).getTime();   // Oct 14 2026, local time
const dayKey = (t) => new Date(t).toISOString().slice(0, 10);
const T0 = local(11, 0);

async function setup({ at = [11, 0], activeMin = 50, stats = {}, settings = {}, runtime = {}, idle = "active", tabs = true, accepts = true } = {}) {
  const t = local(...at);
  const env = makeEnv({ extensionDir: EXT, startTime: t });
  await env.ready();
  env.setTime(t); env.setIdle(idle); env.setTabs(tabs); env.setTabAccepts(accepts);
  env.seed({
    settings,
    stats: { date: dayKey(t), popups: 0, skips: 0, snoozesInARow: 0, completed: 0, lastPopup: 0, lastComplete: 0, completeHours: [], skipHours: [], ...stats },
    runtime: { activeMs: activeMin * MIN, lastTick: t, lastActive: t, snoozeUntil: 0, gentleNext: false, phase: "idle", pendingShow: false, pendingGentle: false, ...runtime },
  });
  return env;
}

const results = [];
function record(group, id, spec, status, detail = "") { results.push({ group, id, spec, status, detail }); }

// Runs one "should a pop-up appear?" scenario.
async function shows(id, spec, opts, expected, { soft = false } = {}) {
  const env = await setup(opts);
  await env.tick();
  const got = env.shows().some(s => s.type === "MOMO_SHOW");
  const ok = got === expected;
  record("Trigger rules", id, spec, ok ? "PASS" : soft ? "WARN" : "FAIL",
    ok ? "" : `expected ${expected ? "pop-up" : "no pop-up"}, got ${got ? "pop-up" : "no pop-up"}`);
}

// Advances time minute by minute (user stays active) until a new pop-up appears.
async function minutesUntilNextShow(env, max = 120) {
  const before = env.shows().length;
  for (let m = 1; m <= max; m++) {
    env.advance(MIN); await env.tick();
    if (env.shows().length > before) return { minutes: m, gentle: env.shows().at(-1).gentle };
  }
  return null;
}

(async () => {
  // =============================================================
  // GROUP 1: trigger rules (scenario tests on the real background.js)
  // =============================================================
  await shows("T01", "Fires after 50 min of active use", {}, true);
  await shows("T02", "Does not fire at 49 min", { activeMin: 49 }, false);
  await shows("T03", "25-min setting fires at 25", { settings: { intervalMin: 25 }, activeMin: 25 }, true);
  await shows("T04", "90-min setting waits at 60", { settings: { intervalMin: 90 }, activeMin: 60 }, false);
  await shows("T05", "6th pop-up of the day is allowed", { stats: { popups: 5 } }, true);
  await shows("T06", "Max 6 pop-ups per day", { stats: { popups: SPEC.maxPopups } }, false);
  await shows("T07", "Cooldown: 14 min after a pop-up blocks", { stats: { lastPopup: T0 - 14 * MIN } }, false);
  await shows("T08", "Cooldown: 15 min after a pop-up allows", { stats: { lastPopup: T0 - 15 * MIN } }, true);
  await shows("T09", "Cooldown: 14 min after a completed break blocks", { stats: { lastComplete: T0 - 14 * MIN } }, false);
  await shows("T10", "Cooldown: 15 min after a completed break allows", { stats: { lastComplete: T0 - 15 * MIN } }, true);
  await shows("T11", "8:59 is before work hours", { at: [8, 59] }, false);
  await shows("T12", "9:00 starts work hours", { at: [9, 0] }, true);
  await shows("T13", "17:59 is inside work hours", { at: [17, 59] }, true);
  await shows("T14", "18:00 is outside work hours (end is exclusive)", { at: [18, 0] }, false, { soft: true });
  await shows("T15", "18:01 is outside work hours", { at: [18, 1] }, false);
  await shows("T16", "2 skips: still shows", { stats: { skips: 2 } }, true);
  await shows("T17", "3 skips: done for the day", { stats: { skips: SPEC.maxSkips } }, false);
  await shows("T18", "Snooze not finished: stays quiet", { runtime: { snoozeUntil: T0 + MIN } }, false);
  await shows("T19", "Snooze finished: can show", { runtime: { snoozeUntil: T0 - MIN } }, true);

  { // idle reset
    const a = await setup({ idle: "idle", activeMin: 49, runtime: { lastActive: T0 - 5 * MIN } });
    await a.tick();
    const reset = a.run("runtime.activeMs") === 0;
    record("Trigger rules", "T20", "5+ min idle resets the timer", reset ? "PASS" : "FAIL", reset ? "" : "activeMs was not reset");
    const b = await setup({ idle: "idle", activeMin: 49, runtime: { lastActive: T0 - 4 * MIN } });
    await b.tick();
    const kept = b.run("runtime.activeMs") > 0;
    record("Trigger rules", "T21", "4 min idle keeps the timer", kept ? "PASS" : "FAIL", kept ? "" : "timer was reset too early");
  }

  { // snooze return time (spec: snooze returns in 10 min)
    const env = await setup({});
    await env.tick();                        // first pop-up
    env.advance(MIN);
    await env.message({ type: "MOMO_SNOOZE" });
    const r = await minutesUntilNextShow(env);
    const ok = r && r.minutes <= SPEC.snoozeMin + 1;
    record("Snooze flow", "S01", "Snooze returns in 10 min", ok ? "PASS" : "FAIL",
      r ? `came back after ${r.minutes} min (spec: ${SPEC.snoozeMin})` : "did not come back within 120 min");
  }

  { // gentle version after 2 snoozes, and it returns in 10 min
    const env = await setup({ stats: { snoozesInARow: 1, popups: 1 }, activeMin: 0, runtime: { phase: "prompt" } });
    await env.message({ type: "MOMO_SNOOZE" });
    const r = await minutesUntilNextShow(env);
    const ok = r && r.gentle === true && r.minutes <= SPEC.snoozeMin + 1;
    record("Snooze flow", "S02", "After 2 snoozes: gentle version returns in 10 min", ok ? "PASS" : "FAIL",
      r ? `after ${r.minutes} min, gentle=${r.gentle}` : "never came back");
  }

  { // gentle must still respect work hours
    const env = await setup({ at: [17, 55], stats: { snoozesInARow: 1, popups: 1 }, activeMin: 0, runtime: { phase: "prompt" } });
    await env.message({ type: "MOMO_SNOOZE" });
    env.advance(11 * MIN);                   // now 18:06
    await env.tick();
    const got = env.shows().length > 0;
    record("Snooze flow", "S03", "Gentle pop-up respects work hours", got ? "FAIL" : "PASS", got ? "gentle pop-up appeared at 18:06, after work hours" : "");
  }
  { // gentle must still respect the 6/day cap
    const env = await setup({ stats: { snoozesInARow: 1, popups: SPEC.maxPopups }, activeMin: 0, runtime: { phase: "prompt" } });
    await env.message({ type: "MOMO_SNOOZE" });
    env.advance(11 * MIN); await env.tick();
    const got = env.shows().length > 0;
    record("Snooze flow", "S04", "Gentle pop-up respects the 6/day cap", got ? "FAIL" : "PASS", got ? "a 7th pop-up appeared" : "");
  }
  { // gentle must still respect the 3-skip stop
    const env = await setup({ stats: { snoozesInARow: 1, popups: 3, skips: SPEC.maxSkips }, activeMin: 0, runtime: { phase: "prompt" } });
    await env.message({ type: "MOMO_SNOOZE" });
    env.advance(11 * MIN); await env.tick();
    const got = env.shows().length > 0;
    record("Snooze flow", "S05", "Gentle pop-up respects the 3-skip stop", got ? "FAIL" : "PASS", got ? "pop-up appeared after 3 skips" : "");
  }
  { // skip counting
    const env = await setup({ stats: { skips: 2 }, runtime: { phase: "prompt" } });
    await env.message({ type: "MOMO_SKIP" });
    const n = env.run("stats.skips");
    record("Snooze flow", "S06", "A skip adds 1 to the skip count", n === 3 ? "PASS" : "FAIL", n === 3 ? "" : `skips = ${n}`);
  }

  { // delivery failure (e.g. fullscreen tab refuses)
    const env = await setup({ accepts: false });
    await env.tick();
    const popups = env.run("stats.popups"), pending = env.run("runtime.pendingShow");
    const notified = env.sent.some(s => s.type === "NOTIFICATION");
    const ok = popups === 0 && pending && notified;
    record("Delivery", "D01", "If the page refuses (fullscreen/hidden), nothing is counted and Momo waits", ok ? "PASS" : "FAIL",
      ok ? "" : `popups=${popups}, pendingShow=${pending}, notified=${notified}`);
  }
  { // no web tab open
    const env = await setup({ tabs: false });
    await env.tick();
    const opened = env.sent.some(s => s.type === "OPENED_NEW_TAB");
    record("Delivery", "D02", "Never opens tabs on its own (\"never blocks your screen\")", opened ? "WARN" : "PASS",
      opened ? "with no web tab open, the extension opens a new google.com tab. Decide if you want this." : "");
  }

  { // learned hours (v2)
    const hist = [11, 11, 12, 10];
    const a = await setup({ activeMin: 40, stats: { completeHours: hist } });
    await a.tick();
    const b = await setup({ activeMin: 40, stats: { completeHours: [] } });
    await b.tick();
    const ok = a.shows().length > 0 && b.shows().length === 0;
    record("Learning (v2)", "L01", "Breaks usually completed around this hour come ~20% sooner", ok ? "PASS" : "FAIL",
      ok ? "" : `with history: ${a.shows().length > 0}, without: ${b.shows().length > 0}`);
  }

  { // active time accumulates, and sleeping doesn't count
    const env = await setup({ activeMin: 0 });
    for (let i = 0; i < 10; i++) { env.advance(MIN); await env.tick(); }
    const ten = env.run("runtime.activeMs");
    const ok1 = Math.abs(ten - 10 * MIN) <= MIN;
    record("Timer", "A01", "10 min of active use counts as ~10 min", ok1 ? "PASS" : "FAIL", ok1 ? "" : `counted ${(ten / MIN).toFixed(1)} min`);
    const before = env.run("runtime.activeMs");
    env.advance(30 * MIN); await env.tick();                 // laptop slept 30 min
    const gain = (env.run("runtime.activeMs") - before) / MIN;
    record("Timer", "A02", "A 30-min gap (sleep) doesn't count as active time", gain <= 1.6 ? "PASS" : "FAIL", `counted ${gain.toFixed(1)} min of a 30-min gap`);
  }

  { // daily reset happens at local midnight
    const bad = [];
    for (const [h, m] of [[0, 30], [3, 0], [8, 0], [12, 0], [17, 30], [23, 30]]) {
      const env = await setup({ at: [h, m] });
      const key = env.run("todayKey()");
      const want = new Date(local(h, m)).toLocaleDateString("en-CA");
      if (key !== want) bad.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
    record("Timer", "A03", `Daily counters reset at local midnight (TZ=${process.env.TZ})`, bad.length ? "FAIL" : "PASS",
      bad.length ? `wrong day at local times: ${bad.join(", ")} (it uses the UTC date)` : "");
  }

  // =============================================================
  // GROUP 2: static spec-coverage checks (is the feature even in the code?)
  // =============================================================
  const bg = fs.readFileSync(path.join(EXT, "background.js"), "utf8");
  const ct = fs.readFileSync(path.join(EXT, "content.js"), "utf8");
  const both = bg + "\n" + ct;
  const cov = (id, spec, ok, detail, status) => record("Spec coverage", id, spec, ok ? "PASS" : (status || "FAIL"), ok ? "" : detail);

  cov("C01", "Never during screen share / calls / presentations",
    /getDisplayMedia|desktopCapture|tabCapture|capturing|audible|mediaDevices/.test(both),
    "no code found that detects screen sharing or calls. A pop-up can appear on top of a Meet/Zoom screen share.");
  cov("C02", "Waits for a 3-second typing pause",
    /keydown|keyup|keypress|typing/i.test(both),
    "no code found that watches typing. A pop-up can appear mid-sentence.");
  const idleSec = Number((bg.match(/queryState\((\d+)\)/) || [])[1]);
  cov("C03", `"Active" = input in the last ${SPEC.activeWindowSec / 60} min`,
    idleSec === SPEC.activeWindowSec, `uses ${idleSec}s idle detection, spec says ${SPEC.activeWindowSec}s`, "WARN");
  cov("C04", "Never during fullscreen apps", /fullscreenElement/.test(ct),
    "no fullscreen check found in content.js");
  cov("C05", "Doesn't steal window focus (\"never blocks your screen\")",
    !/windows\.update\([^)]*focused:\s*true/.test(bg),
    "background.js focuses the browser window and switches tabs to show the pop-up. It can pull you out of another app.", "WARN");

  // =============================================================
  // GROUP 3: generated content (checklist, greetings, mascot) from the real content.js
  // =============================================================
  const RUNS = 2000;
  const m = loadContent({ extensionDir: EXT, seedRandom: 7 });
  m.setSettings({ uploads: [], customTasks: [] });
  const sessions = Array.from({ length: RUNS }, () => m.pickSessionTasks(false));

  const sizes = {}; sessions.forEach(s => { sizes[s.length] = (sizes[s.length] || 0) + 1; });
  const outside = sessions.filter(s => s.length < SPEC.checklistMin || s.length > SPEC.checklistMax).length;
  record("Checklist", "K01", `Checklist has ${SPEC.checklistMin}-${SPEC.checklistMax} items`, outside ? "FAIL" : "PASS",
    outside ? `${outside}/${RUNS} sessions outside range. Sizes seen: ${JSON.stringify(sizes)}` : "");

  const noQuickSpec = sessions.filter(s => !s.some(t => t.id === "water" || t.id === "posture")).length;
  record("Checklist", "K02", "Always includes a quick item: water or posture", noQuickSpec ? "FAIL" : "PASS",
    noQuickSpec ? `${noQuickSpec}/${RUNS} sessions had neither (code treats stretch/window as "quick" too)` : "");

  const noQuickAny = sessions.filter(s => !s.some(t => t.quick)).length;
  record("Checklist", "K03", "Always includes at least one quick item (any)", noQuickAny ? "FAIL" : "PASS", noQuickAny ? `${noQuickAny}/${RUNS} had none` : "");

  const dupes = sessions.filter(s => new Set(s.map(t => t.id)).size !== s.length).length;
  record("Checklist", "K04", "No duplicate items", dupes ? "FAIL" : "PASS", dupes ? `${dupes}/${RUNS} had duplicates` : "");

  const allowed = new Set(m.TASK_POOL.map(t => t.id));
  const strange = sessions.filter(s => s.some(t => !allowed.has(t.id))).length;
  record("Checklist", "K05", "Only items from the allowed list (no custom tasks set)", strange ? "FAIL" : "PASS", strange ? `${strange}/${RUNS}` : "");

  const gentle = m.pickSessionTasks(true);
  const gOk = gentle.length >= 1 && gentle.length <= 2 && gentle.every(t => t.quick);
  record("Checklist", "K06", "Gentle version: 1-2 quick items only", gOk ? "PASS" : "FAIL", gOk ? "" : JSON.stringify(gentle.map(t => t.id)));

  m.setSettings({ uploads: [], customTasks: [{ id: "custom-1", label: "Water the plant", hint: "x", quick: false }] });
  const withCustom = Array.from({ length: RUNS }, () => m.pickSessionTasks(false)).filter(s => s.some(t => t.id === "custom-1")).length;
  record("Checklist", "K07", "Your own custom tasks can appear", withCustom > 0 ? "PASS" : "FAIL", `appeared in ${withCustom}/${RUNS} sessions`);
  m.setSettings({ uploads: [], customTasks: [] });

  // greetings
  let repeats = 0, prev = null;
  for (let i = 0; i < RUNS; i++) { const g = m.roll(m.GREETINGS); if (g === prev) repeats++; prev = g; }
  record("Greetings", "G01", "Greeting changes every time (no back-to-back repeats)", repeats ? "FAIL" : "PASS",
    repeats ? `${repeats}/${RUNS} (${(100 * repeats / RUNS).toFixed(0)}%) of pop-ups repeat the previous greeting. Pool size: ${m.GREETINGS.length}` : "");

  record("Greetings", "G02", "Header matches your spec wording", m.HEADER === SPEC.header ? "PASS" : "WARN",
    m.HEADER === SPEC.header ? "" : `code says "${m.HEADER}" but spec says "${SPEC.header}". Update whichever is wrong.`);

  const pools = { GREETINGS: m.GREETINGS, FUN_BUBBLES: m.FUN_BUBBLES, COMPLETE_HEADERS: m.COMPLETE_HEADERS, COMPLETE_BUBBLES: m.COMPLETE_BUBBLES };
  const flagged = [];
  for (const [name, list] of Object.entries(pools)) {
    list.forEach(line => {
      const words = line.split(/\s+/).length;
      if (words > SPEC.maxWordsPerLine) flagged.push(`${name}: too long "${line}"`);
      const hit = SPEC.guiltWords.find(w => new RegExp(`\\b${w}\\b`, "i").test(line));
      if (hit) flagged.push(`${name}: "${line}" contains "${hit}"`);
    });
    if (new Set(list).size !== list.length) flagged.push(`${name}: duplicate lines`);
  }
  record("Greetings", "G03", "Every line is short, unique, and not guilt-tripping", flagged.length ? "WARN" : "PASS",
    flagged.length ? flagged.join(" | ") + ". Read it as a user would and decide." : "");

  // mascot rotation (3 default poses)
  let mRepeat = 0, lastSrc = null;
  for (let i = 0; i < RUNS; i++) { const s = m.pickMascot(); if (s === lastSrc) mRepeat++; lastSrc = s; }
  record("Mascot", "M01", "Mascot never repeats the same image twice in a row (3 poses)", mRepeat ? "FAIL" : "PASS", mRepeat ? `${mRepeat}/${RUNS} repeats` : "");

  // =============================================================
  // REPORT
  // =============================================================
  const icon = { PASS: "PASS", FAIL: "FAIL", WARN: "WARN" };
  let lastGroup = "";
  console.log(`\nMomo Break evals | extension: ${EXT} | timezone: ${process.env.TZ}\n`);
  for (const r of results) {
    if (r.group !== lastGroup) { console.log(`\n== ${r.group} ==`); lastGroup = r.group; }
    console.log(`${icon[r.status]}  ${r.id}  ${r.spec}${r.detail ? `\n         -> ${r.detail}` : ""}`);
  }
  const count = s => results.filter(r => r.status === s).length;
  console.log(`\n${count("PASS")} pass, ${count("FAIL")} fail, ${count("WARN")} need your decision (${results.length} checks)\n`);
  fs.writeFileSync(path.join(__dirname, "last-results.json"), JSON.stringify({ when: new Date().toISOString(), extension: EXT, tz: process.env.TZ, results }, null, 2));
  process.exit(count("FAIL") ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
