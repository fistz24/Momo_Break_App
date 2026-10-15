const HEADER = "Let's get you feeling better in 10 minutes!";
const QUICK_IDS = ["water", "posture"];
const GREETINGS = [
  "Hey, I'm Momo!",
  "Peekaboo!",
  "Your peach is here.",
  "Psst — break time.",
  "Tiny softness!",
  "Just hovering.",
];
const FUN_BUBBLES = [
  "Boop!",
  "Hehe!",
  "Again?",
  "I'm soft.",
  "Hi hi!",
  "Don't mind me.",
  "Peach mode.",
  "Still here!",
  "Click me more!",
  "Okay okay!",
  "You found me.",
  "That tickles!",
  "I like you.",
  "Break buddy!",
  "Wiggle!",
];
const COMPLETE_HEADERS = [
  "You really took care of yourself.",
  "That's a real break. Well done.",
  "Look at you, choosing softness.",
];
const COMPLETE_BUBBLES = [
  "Hehe, I'm so proud!",
  "Look at you!",
  "Big peach energy.",
  "I knew you could pause.",
];
const BUILTIN_TASKS = [
  { id: "posture", label: "Check your posture", hint: "Unhunch. Soften your shoulders.", quick: true },
  { id: "coffee", label: "Go make some coffee", hint: "Make it, don't buy it.", quick: false },
  { id: "water", label: "Drink some water", hint: "A full glass, not a sip.", quick: true },
  { id: "pet", label: "Play with your pet for a bit", hint: "Even 30 seconds of fussing counts.", quick: false },
  { id: "duolingo", label: "Play a little Duolingo", hint: "One lesson is enough.", quick: false },
  { id: "stretch", label: "Stretch for a moment", hint: "Arms up, roll your neck.", quick: true },
  { id: "window", label: "Look out the window", hint: "Find one far-away thing.", quick: true },
];

const params = new URLSearchParams(location.search);
const isGentle = params.get("gentle") === "1";
const isPreview = params.get("preview") === "1";

let settings = { uploads: [], customTasks: [] };
let phase = "prompt";
let sessionTasks = [];
let done = new Set();
let remaining = isGentle ? 120 : 600;
let spent = 0;
let timerId = null;
let chime = null;

const bubble = document.getElementById("bubble");
const momo = document.getElementById("momo");
const timer = document.getElementById("timer");
const title = document.getElementById("title");
const actions = document.getElementById("actions");
const startBtn = document.getElementById("start");
const snoozeBtn = document.getElementById("snooze");
const skipBtn = document.getElementById("skip");
const tasksEl = document.getElementById("tasks");
const doneEl = document.getElementById("done");
const sendoff = document.getElementById("sendoff");
const backBtn = document.getElementById("back");
const dotsEl = document.getElementById("dots");
const streakEl = document.getElementById("streak");
const particles = document.getElementById("particles");
const closeBtn = document.getElementById("close");

function roll(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function shuffle(list) {
  return [...list].sort(() => Math.random() - 0.5);
}

function formatTime(seconds) {
  const m = String(Math.floor(Math.max(seconds, 0) / 60)).padStart(2, "0");
  const s = String(Math.max(seconds, 0) % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function fullPool() {
  const custom = (settings.customTasks || []).map((t) => ({
    id: t.id,
    label: t.label,
    hint: t.hint || "Your own little break step.",
    quick: !!t.quick,
  }));
  return [...BUILTIN_TASKS, ...custom];
}

function pickSessionTasks(gentle) {
  const pool = fullPool();
  if (gentle) {
    const quick = pool.filter((t) => QUICK_IDS.includes(t.id) || t.quick);
    return (quick.length ? quick : pool).slice(0, 2);
  }
  const count = Math.random() < 0.5 ? 3 : 4;
  const quick = shuffle(pool.filter((t) => t.quick || QUICK_IDS.includes(t.id)));
  const rest = shuffle(pool.filter((t) => !t.quick && !QUICK_IDS.includes(t.id)));
  const chosen = [];
  if (quick.length) chosen.push(quick[0]);
  const leftover = shuffle([...quick.slice(1), ...rest]);
  while (chosen.length < count && leftover.length) chosen.push(leftover.shift());
  return shuffle(chosen);
}

function setMascot(src, bounce = true) {
  const set = settings.uploads?.length
    ? settings.uploads
    : [
        "mascots/momo-default.png",
        "mascots/momo-shy.png",
        "mascots/momo-cheer.png",
      ];
  momo.src = src || roll(set);
  momo.className = "momo";
  if (bounce) {
    void momo.offsetWidth;
    momo.classList.add("bounce");
  }
}

function pokeMascot() {
  const set = settings.uploads?.length
    ? settings.uploads
    : [
        "mascots/momo-default.png",
        "mascots/momo-shy.png",
        "mascots/momo-cheer.png",
      ];
  const next = roll(set.filter((s) => s !== momo.src) || set);
  momo.src = next;
  momo.classList.remove("bounce");
  void momo.offsetWidth;
  momo.classList.add("bounce");
  let text = roll(FUN_BUBBLES);
  if (bubble.textContent === text) text = roll(FUN_BUBBLES);
  bubble.textContent = text;
  playChime();
}

function playChime() {
  try {
    if (!chime) chime = new Audio("assets/chimes.mp3");
    chime.currentTime = 0;
    chime.play().catch(() => {});
  } catch {
    /* ignore */
  }
}

function renderDots() {
  dotsEl.innerHTML = sessionTasks
    .map((t) => `<span class="${done.has(t.id) ? "done" : ""}"></span>`)
    .join("");
}

function renderTasks() {
  tasksEl.hidden = false;
  tasksEl.innerHTML = sessionTasks
    .map((task) => {
      const checked = done.has(task.id);
      return `
        <label class="item${checked ? " checked" : ""}" data-id="${task.id}">
          <input type="checkbox" ${checked ? "checked" : ""} />
          <span class="mark" aria-hidden="true"></span>
          <span>
            <strong>${task.label}</strong>
            <small>${task.hint}</small>
          </span>
        </label>`;
    })
    .join("");

  tasksEl.querySelectorAll(".item").forEach((row) => {
    const input = row.querySelector("input");
    input.addEventListener("change", () => {
      const id = row.dataset.id;
      if (input.checked) {
        done.add(id);
        row.classList.add("checked");
        playChime();
      } else {
        done.delete(id);
        row.classList.remove("checked");
      }
      renderDots();
      if (done.size >= sessionTasks.length) setTimeout(completeBreak, 280);
    });
  });
  renderDots();
}

function startCountdown() {
  clearInterval(timerId);
  timer.hidden = false;
  timer.classList.remove("done");
  timer.textContent = formatTime(remaining);
  timerId = setInterval(() => {
    remaining -= 1;
    spent += 1;
    timer.textContent = formatTime(remaining);
    if (remaining <= 0) {
      clearInterval(timerId);
      timer.textContent = "Time's up";
      bubble.textContent = "No rush. I'm still here.";
    }
  }, 1000);
}

function startBreak() {
  phase = "break";
  actions.hidden = true;
  chrome.runtime.sendMessage({ type: "MOMO_STARTED" });
  renderTasks();
  startCountdown();
}

function snooze() {
  chrome.runtime.sendMessage({ type: "MOMO_SNOOZE" }, () => window.close());
}

function skip() {
  if (isPreview) {
    chrome.runtime.sendMessage({ type: "MOMO_CLOSED" }, () => window.close());
    return;
  }
  chrome.runtime.sendMessage({ type: "MOMO_SKIP" }, () => window.close());
}

function completeBreak() {
  if (phase === "complete") return;
  phase = "complete";
  clearInterval(timerId);
  const minutes = Math.max(1, Math.round(spent / 60) || 1);
  timer.classList.add("done");
  timer.textContent = Math.random() < 0.5 ? "Break complete" : `${minutes} min for yourself`;
  title.textContent = roll(COMPLETE_HEADERS);
  bubble.textContent = roll(COMPLETE_BUBBLES);
  // No crowded list of ticked boxes — celebrate with mascot only
  tasksEl.hidden = true;
  tasksEl.innerHTML = "";
  actions.hidden = true;
  doneEl.hidden = true;
  doneEl.innerHTML = "";
  dotsEl.hidden = true;
  sendoff.hidden = false;
  backBtn.hidden = false;
  streakEl.hidden = false;
  setMascot("mascots/momo-cheer.png");
  chrome.runtime.sendMessage({ type: "MOMO_COMPLETE" }, (res) => {
    const n = res?.stats?.completed || 1;
    streakEl.textContent = `${n} break${n === 1 ? "" : "s"} today`;
  });
  particles.innerHTML = "";
  ["✦", "♡", "✧", "♡", "✦"].forEach((bit, i) => {
    const el = document.createElement("span");
    el.className = "bit";
    el.textContent = bit;
    el.style.left = `${20 + Math.random() * 200}px`;
    el.style.top = `${40 + Math.random() * 40}px`;
    el.style.animationDelay = `${i * 40}ms`;
    particles.appendChild(el);
  });
  playChime();
}

function finish() {
  chrome.runtime.sendMessage({ type: "MOMO_CLOSED" }, () => window.close());
}

momo.style.cursor = "pointer";
momo.addEventListener("click", pokeMascot);
startBtn.addEventListener("click", startBreak);
snoozeBtn.addEventListener("click", snooze);
skipBtn.addEventListener("click", skip);
closeBtn.addEventListener("click", () => {
  if (phase === "complete") finish();
  else skip();
});
backBtn.addEventListener("click", finish);

chrome.runtime.sendMessage({ type: "MOMO_GET_STATE" }, (state) => {
  if (state?.settings) settings = state.settings;
  sessionTasks = pickSessionTasks(isGentle);
  remaining = isGentle ? 120 : 600;
  title.textContent = isGentle ? "Just 2 minutes?" : HEADER;
  startBtn.textContent = isGentle ? "Start my 2 minutes" : "Start my 10 minutes";
  timer.textContent = formatTime(remaining);
  bubble.textContent = roll(GREETINGS);
  setMascot();
  renderDots();
  if (!isPreview) {
    chrome.runtime.sendMessage({ type: "MOMO_BREAK_WINDOW_OPEN" });
  }
});
