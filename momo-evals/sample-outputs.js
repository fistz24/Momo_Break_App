// sample-outputs.js: makes samples.csv, 30 realistic pop-ups for YOU to read and mark (human eval).
//   node sample-outputs.js [path/to/extension]
const fs = require("fs"), path = require("path");
const { loadContent } = require("./harness");
const EXT = path.resolve(process.argv[2] || path.join(__dirname, "..", "momo-break-extension"));
const m = loadContent({ extensionDir: EXT, seedRandom: Date.now() % 100000 });
m.setSettings({ uploads: [], customTasks: [] });

const q = s => `"${String(s).replace(/"/g, '""')}"`;
const rows = [["#", "version", "bubble greeting", "title", "checklist", "mascot", "after-break message", "annoying? (y/n)", "failure category", "notes"]];
for (let i = 1; i <= 30; i++) {
  const gentle = i % 5 === 0;
  const tasks = m.pickSessionTasks(gentle).map(t => `${t.label} (${t.hint})`).join("  |  ");
  rows.push([i, gentle ? "gentle" : "normal", m.roll(m.GREETINGS), gentle ? "Just 2 minutes?" : m.HEADER, tasks,
    path.basename(m.pickMascot()), `${m.roll(m.COMPLETE_HEADERS)} / ${m.roll(m.COMPLETE_BUBBLES)}`, "", "", ""]);
}
fs.writeFileSync(path.join(__dirname, "samples.csv"), rows.map(r => r.map(q).join(",")).join("\n"));
console.log("Wrote samples.csv. Open it in Google Sheets or Excel and fill the last 3 columns.");
