// mutation-check.js: "Does my eval notice when I break the code?"
//   node mutation-check.js [path/to/extension]
// Copies your extension to a temp folder, makes ONE small bug at a time, runs the evals,
// and reports whether any check changed. A bug nobody notices = a missing test.
const fs = require("fs"), os = require("os"), path = require("path");
const { spawnSync } = require("child_process");

const EXT = path.resolve(process.argv[2] || path.join(__dirname, "..", "momo-break-extension"));
const MUTATIONS = [
  { name: "Cooldown shortened 15 -> 5 min",        file: "background.js", from: "COOLDOWN_MS = 15 * 60 * 1000", to: "COOLDOWN_MS = 5 * 60 * 1000" },
  { name: "Max pop-ups raised 6 -> 7",             file: "background.js", from: "MAX_POPUPS = 6",               to: "MAX_POPUPS = 7" },
  { name: "Max skips off by one (>= becomes >)",   file: "background.js", from: "stats.skips >= MAX_SKIPS",     to: "stats.skips > MAX_SKIPS" },
  { name: "Idle reset shortened 5 -> 3 min",       file: "background.js", from: "IDLE_RESET_MS = 5 * 60 * 1000", to: "IDLE_RESET_MS = 3 * 60 * 1000" },
  { name: "Work start off by one (>= becomes >)",  file: "background.js", from: "mins >= sh * 60 + sm",         to: "mins > sh * 60 + sm" },
  { name: "Sleep gap no longer capped",            file: "background.js", from: "TICK_CAP_MS = 90 * 1000",      to: "TICK_CAP_MS = 24 * 60 * 60 * 1000" },
  { name: "Learned-hours boost removed",           file: "background.js", from: "hits >= 2 ? 0.8 : 1",          to: "hits >= 2 ? 1 : 1" },
  { name: "Checklist always 2-3 items",            file: "content.js",    from: "Math.random() < 0.5 ? 3 : 4",  to: "Math.random() < 0.5 ? 2 : 3" },
  { name: "Quick item no longer guaranteed",       file: "content.js",    from: "if (quick.length) chosen.push(quick[0]);", to: "" },
];

function run(dir) {
  const r = spawnSync("node", [path.join(__dirname, "run-evals.js"), dir], { encoding: "utf8", env: process.env });
  const file = path.join(__dirname, "last-results.json");
  return Object.fromEntries(JSON.parse(fs.readFileSync(file, "utf8")).results.map(x => [x.id, x.status + "|" + x.detail]));
}
function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const f of fs.readdirSync(src)) {
    const s = path.join(src, f), d = path.join(dst, f);
    fs.statSync(s).isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
  }
}

const baseline = run(EXT);
console.log("\nMutation check (each row = one deliberate bug)\n");
let missed = 0;
for (const m of MUTATIONS) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "momo-mut-"));
  copyDir(EXT, tmp);
  const p = path.join(tmp, m.file);
  const src = fs.readFileSync(p, "utf8");
  if (!src.includes(m.from)) { console.log(`SKIP    ${m.name}  (line not found in ${m.file}; you may have changed it)`); continue; }
  fs.writeFileSync(p, src.replace(m.from, m.to));
  const after = run(tmp);
  const changed = Object.keys(baseline).filter(id => baseline[id] !== after[id]);
  if (changed.length) console.log(`CAUGHT  ${m.name}\n         by: ${changed.join(", ")}`);
  else { missed++; console.log(`MISSED  ${m.name}\n         no check noticed. Add a test for this.`); }
}
console.log(`\n${missed ? missed + " bug(s) went unnoticed: write tests for them." : "Every deliberate bug was caught."}\n`);
// restore the real results file
run(EXT);
