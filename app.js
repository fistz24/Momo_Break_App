const HEADER = "Let's get you feeling better in 10 minutes!";
const QUICK_IDS = ["water", "posture"];
const ROTATE_MS = 16000;
const DEFAULT_MASCOTS = [
  "mascots/momo-default.png",
  "mascots/momo-shy.png",
  "mascots/momo-cheer.png",
];
const POSES = {
  default: "mascots/momo-default.png",
  shy: "mascots/momo-shy.png",
  cheer: "mascots/momo-cheer.png",
};
const GREETINGS = [
  "Hey, I'm Momo!",
  "Peekaboo!",
  "Your peach is here.",
  "Psst — break time.",
  "Tiny softness!",
  "Just hovering.",
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

const STORAGE_SETTINGS = "momo-settings";
const STORAGE_STATS = "momo-stats";
const ACTIVE_WINDOW_MS = 2 * 60 * 1000;
const IDLE_RESET_MS = 5 * 60 * 1000;
const TYPING_PAUSE_MS = 3000;
const COOLDOWN_MS = 15 * 60 * 1000;
const SNOOZE_MS = 10 * 60 * 1000;
const MAX_POPUPS = 6;
const MAX_SKIPS = 3;

const widget = document.getElementById("widget");
const previewBtn = document.getElementById("preview-btn");
const closeBtn = document.getElementById("close-popup");
const momo = document.getElementById("momo");
const bubble = document.getElementById("bubble");
const titleEl = document.getElementById("popup-title");
const timerPill = document.getElementById("timer-pill");
const promptActions = document.getElementById("prompt-actions");
const startBtn = document.getElementById("start-btn");
const snoozeBtn = document.getElementById("snooze-btn");
const skipBtn = document.getElementById("skip-btn");
const taskWrap = document.getElementById("task-wrap");
const taskRow = document.getElementById("task-row");
const taskCheck = document.getElementById("task-check");
const taskLabel = document.getElementById("task-label");
const taskHint = document.getElementById("task-hint");
const sendoff = document.getElementById("sendoff");
const backBtn = document.getElementById("back-btn");
const dotsEl = document.getElementById("dots");
const streakEl = document.getElementById("streak");
const particles = document.getElementById("particles");
const statusLine = document.getElementById("status-line");
const scheduleHint = document.getElementById("schedule-hint");
const intervalSelect = document.getElementById("interval-select");
const customIntervalWrap = document.getElementById("custom-interval-wrap");
const customIntervalInput = document.getElementById("custom-interval");
const workStart = document.getElementById("work-start");
const workEnd = document.getElementById("work-end");
const mascotUpload = document.getElementById("mascot-upload");
const thumbRow = document.getElementById("thumb-row");
const customListEl = document.getElementById("custom-list");
const customInput = document.getElementById("custom-input");
const addTaskBtn = document.getElementById("add-task");

const PRESET_INTERVALS = new Set([25, 50, 90]);

function clampInterval(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 50;
  return Math.min(240, Math.max(5, v));
}

function applyIntervalUI() {
  const mins = clampInterval(settings.intervalMin);
  settings.intervalMin = mins;
  if (PRESET_INTERVALS.has(mins)) {
    intervalSelect.value = String(mins);
    customIntervalWrap.hidden = true;
  } else {
    intervalSelect.value = "custom";
    customIntervalWrap.hidden = false;
    customIntervalInput.value = String(mins);
  }
}

const chime = new Audio("assets/chimes.mp3");
chime.preload = "auto";

let settings = loadSettings();
let stats = loadStats();
let phase = "idle";
let sessionTasks = [];
let currentIndex = 0;
let done = new Set();
let remaining = 10 * 60;
let duration = 10 * 60;
let spent = 0;
let timerId = null;
let rotateId = null;
let autoHideId = null;
let lastInput = Date.now();
let lastTyped = 0;
let lastMascot = "";
let pendingShow = false;
let snoozeUntil = 0;
let gentleNext = false;
let activeMs = 0;
let tickClock = Date.now();

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function loadSettings() {
  try {
    const raw = {
      intervalMin: 50,
      workStart: "09:00",
      workEnd: "18:00",
      uploads: [],
      customTasks: [],
      ...JSON.parse(localStorage.getItem(STORAGE_SETTINGS) || "{}"),
    };
    raw.intervalMin = Math.min(240, Math.max(5, Math.round(Number(raw.intervalMin) || 50)));
    return raw;
  } catch {
    return { intervalMin: 50, workStart: "09:00", workEnd: "18:00", uploads: [], customTasks: [] };
  }
}

function saveSettings() {
  localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(settings));
}

function freshStats() {
  return {
    date: todayKey(),
    popups: 0,
    skips: 0,
    snoozesInARow: 0,
    completed: 0,
    lastPopup: 0,
    lastComplete: 0,
    completeHours: [],
    skipHours: [],
  };
}

function loadStats() {
  try {
    const data = { ...freshStats(), ...JSON.parse(localStorage.getItem(STORAGE_STATS) || "{}") };
    if (data.date !== todayKey()) {
      return { ...freshStats(), completeHours: data.completeHours || [], skipHours: data.skipHours || [] };
    }
    return data;
  } catch {
    return freshStats();
  }
}

function saveStats() {
  localStorage.setItem(STORAGE_STATS, JSON.stringify(stats));
}

function roll(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function shuffle(list) {
  return [...list].sort(() => Math.random() - 0.5);
}

function inWorkHours(date = new Date()) {
  const [sh, sm] = settings.workStart.split(":").map(Number);
  const [eh, em] = settings.workEnd.split(":").map(Number);
  const mins = date.getHours() * 60 + date.getMinutes();
  return mins >= sh * 60 + sm && mins <= eh * 60 + em;
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

function mascotSet() {
  return settings.uploads.length ? settings.uploads : DEFAULT_MASCOTS;
}

function pickMascot(preferCheer = false) {
  if (!settings.uploads.length && preferCheer) return POSES.cheer;
  const set = mascotSet().filter((src) => src !== lastMascot);
  const src = roll(set.length ? set : mascotSet());
  lastMascot = src;
  return src;
}

function setMascot(src, { bounce = true, wave = false, rare = false } = {}) {
  momo.src = src;
  momo.className = "momo";
  if (rare) momo.classList.add("rare");
  if (wave) momo.classList.add("wave");
  if (bounce) {
    void momo.offsetWidth;
    momo.classList.add("bounce");
  }
}

function playChime() {
  chime.currentTime = 0;
  chime.play().catch(() => {});
}

function playTimerDone() {
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    [523.25, 659.25].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02 + i * 0.16);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28 + i * 0.16);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.16);
      osc.stop(now + 0.32 + i * 0.16);
    });
  } catch {
    /* ignore */
  }
}

function formatTime(seconds) {
  const m = String(Math.floor(Math.max(seconds, 0) / 60)).padStart(2, "0");
  const s = String(Math.max(seconds, 0) % 60).padStart(2, "0");
  return `${m}:${s}`;
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

function renderDots() {
  dotsEl.classList.remove("pulse");
  dotsEl.innerHTML = sessionTasks
    .map((task) => `<span class="${done.has(task.id) ? "done" : ""}"></span>`)
    .join("");
}

function pendingIndexes() {
  return sessionTasks.map((_, i) => i).filter((i) => !done.has(sessionTasks[i].id));
}

function showCurrentTask() {
  const task = sessionTasks[currentIndex];
  if (!task) return;
  taskLabel.textContent = task.label;
  taskHint.textContent = task.hint;
  taskCheck.checked = done.has(task.id);
  taskRow.classList.toggle("checked", done.has(task.id));
  renderDots();
}

function rotateToNext() {
  const pending = pendingIndexes();
  if (!pending.length) {
    completeBreak();
    return;
  }
  const pos = pending.indexOf(currentIndex);
  currentIndex = pending[(pos + 1) % pending.length];
  showCurrentTask();
}

function startRotate() {
  stopRotate();
  rotateId = setInterval(rotateToNext, ROTATE_MS);
}

function stopRotate() {
  clearInterval(rotateId);
  rotateId = null;
}

function stopTimer() {
  clearInterval(timerId);
  timerId = null;
}

function startCountdown() {
  stopTimer();
  timerPill.hidden = false;
  timerPill.classList.remove("done");
  timerPill.textContent = formatTime(remaining);
  timerId = setInterval(() => {
    remaining -= 1;
    spent += 1;
    timerPill.textContent = formatTime(remaining);
    if (remaining <= 0) {
      stopTimer();
      timerPill.textContent = "Time's up";
      bubble.textContent = "No rush. I'm still here.";
      playTimerDone();
    }
  }, 1000);
}

function blockedByContext() {
  return (
    document.hidden ||
    Boolean(document.fullscreenElement) ||
    !inWorkHours() ||
    stats.popups >= MAX_POPUPS ||
    stats.skips >= MAX_SKIPS
  );
}

function canShow({ fromSnooze = false } = {}) {
  const now = Date.now();
  if (phase !== "idle") return false;
  if (blockedByContext()) return false;
  if (snoozeUntil && now < snoozeUntil) return false;
  if (!fromSnooze) {
    if (now - stats.lastPopup < COOLDOWN_MS) return false;
    if (now - stats.lastComplete < COOLDOWN_MS) return false;
    if (now - lastInput > ACTIVE_WINDOW_MS) return false;
    if (activeMs < settings.intervalMin * 60 * 1000 * preferredHourBoost()) return false;
  }
  if (now - lastTyped < TYPING_PAUSE_MS) {
    pendingShow = true;
    return false;
  }
  return true;
}

function recordPopup() {
  stats.popups += 1;
  stats.lastPopup = Date.now();
  saveStats();
}

function openPrompt({ preview = false, gentle = false } = {}) {
  if (!preview && !canShow() && !gentle) return;
  clearTimeout(autoHideId);
  stopTimer();
  stopRotate();
  phase = gentle ? "gentle" : "prompt";
  gentleNext = gentle;
  duration = gentle ? 2 * 60 : 10 * 60;
  remaining = duration;
  spent = 0;
  done = new Set();
  sessionTasks = pickSessionTasks(gentle);
  currentIndex = 0;
  widget.hidden = false;
  promptActions.hidden = false;
  taskWrap.hidden = true;
  sendoff.hidden = true;
  backBtn.hidden = true;
  streakEl.hidden = true;
  timerPill.hidden = false;
  timerPill.classList.remove("done");
  timerPill.textContent = formatTime(remaining);
  titleEl.textContent = gentle ? "Just 2 minutes?" : HEADER;
  startBtn.textContent = gentle ? "Start my 2 minutes" : "Start my 10 minutes";
  bubble.textContent = roll(GREETINGS);
  setMascot(pickMascot());
  renderDots();
  if (!preview) recordPopup();
  pendingShow = false;
}

function startBreak() {
  phase = "break";
  promptActions.hidden = true;
  taskWrap.hidden = false;
  stats.snoozesInARow = 0;
  saveStats();
  showCurrentTask();
  startRotate();
  startCountdown();
}

function snooze() {
  stats.snoozesInARow += 1;
  snoozeUntil = Date.now() + SNOOZE_MS;
  const twoSnoozes = stats.snoozesInARow >= 2;
  saveStats();
  hideWidget();
  if (twoSnoozes) gentleNext = true;
}

function skip() {
  stats.skips += 1;
  stats.snoozesInARow = 0;
  stats.skipHours.push(new Date().getHours());
  stats.skipHours = stats.skipHours.slice(-12);
  saveStats();
  hideWidget();
  maybeScheduleHint();
}

function hideWidget() {
  widget.hidden = true;
  phase = "idle";
  stopTimer();
  stopRotate();
  clearTimeout(autoHideId);
  momo.classList.remove("wave", "rare");
  activeMs = 0;
}

function burstParticles() {
  particles.innerHTML = "";
  const bits = ["✦", "♡", "✧", "♡", "✦", "✧", "♡", "✦"];
  bits.forEach((bit, i) => {
    const el = document.createElement("span");
    el.className = "bit";
    el.textContent = bit;
    el.style.left = `${10 + Math.random() * 180}px`;
    el.style.top = `${20 + Math.random() * 50}px`;
    el.style.animationDelay = `${i * 40}ms`;
    particles.appendChild(el);
  });
  setTimeout(() => {
    particles.innerHTML = "";
  }, 1600);
}

function completeBreak() {
  if (phase === "complete") return;
  phase = "complete";
  stopTimer();
  stopRotate();
  const minutes = Math.max(1, Math.round(spent / 60) || 1);
  timerPill.hidden = false;
  timerPill.classList.add("done");
  timerPill.textContent = Math.random() < 0.5 ? "Break complete" : `${minutes} min for yourself`;
  titleEl.textContent = roll(COMPLETE_HEADERS);
  bubble.textContent = roll(COMPLETE_BUBBLES);
  taskWrap.hidden = true;
  promptActions.hidden = true;
  sendoff.hidden = false;
  backBtn.hidden = false;
  streakEl.hidden = false;
  stats.completed += 1;
  stats.lastComplete = Date.now();
  stats.snoozesInARow = 0;
  stats.completeHours.push(new Date().getHours());
  stats.completeHours = stats.completeHours.slice(-20);
  saveStats();
  streakEl.textContent = `${stats.completed} break${stats.completed === 1 ? "" : "s"} today`;
  const rare = Math.random() < 0.1;
  setMascot(pickMascot(true), { bounce: true, rare });
  if (rare) bubble.textContent = "Rare peach moment unlocked!";
  renderDots();
  dotsEl.classList.add("pulse");
  burstParticles();
  autoHideId = setTimeout(() => {
    momo.classList.add("wave");
    setTimeout(finishAndReset, 900);
  }, 5000);
}

function finishAndReset() {
  hideWidget();
  activeMs = 0;
}

function maybeScheduleHint() {
  const hours = stats.skipHours;
  if (hours.length < 3) return;
  const lastThree = hours.slice(-3);
  if (lastThree.every((h) => h === lastThree[0])) {
    scheduleHint.hidden = false;
    scheduleHint.textContent = `You often skip around ${lastThree[0]}:00. Want to move work hours away from that time?`;
  }
}

function preferredHourBoost() {
  if (stats.completeHours.length < 4) return 1;
  const hour = new Date().getHours();
  const hits = stats.completeHours.filter((h) => Math.abs(h - hour) <= 1).length;
  return hits >= 2 ? 0.8 : 1;
}

function updateStatus() {
  if (stats.skips >= MAX_SKIPS) {
    statusLine.textContent = "Momo is done for today after 3 skips.";
    return;
  }
  if (stats.popups >= MAX_POPUPS) {
    statusLine.textContent = "That's 6 pop-ups today. Momo will see you tomorrow.";
    return;
  }
  const need = settings.intervalMin * 60 * 1000 * preferredHourBoost();
  const mins = Math.max(0, Math.ceil((need - activeMs) / 60000));
  statusLine.textContent = `Active time toward next pop-up: ${Math.min(100, Math.round((activeMs / need) * 100))}% · about ${mins} min · ${stats.completed} breaks today`;
}

function engineTick() {
  const now = Date.now();
  const dt = now - tickClock;
  tickClock = now;
  if (now - lastInput >= IDLE_RESET_MS) activeMs = 0;
  else if (now - lastInput <= ACTIVE_WINDOW_MS) activeMs += dt;

  if (gentleNext && snoozeUntil && now >= snoozeUntil && phase === "idle") {
    openPrompt({ gentle: true });
    snoozeUntil = 0;
  } else if (canShow()) {
    openPrompt();
  } else if (pendingShow && Date.now() - lastTyped >= TYPING_PAUSE_MS) {
    if (canShow()) openPrompt();
  }
  updateStatus();
}

function markInput(isTyping) {
  lastInput = Date.now();
  if (isTyping) lastTyped = Date.now();
}

function renderThumbs() {
  thumbRow.innerHTML = mascotSet()
    .map((src) => `<img src="${src}" alt="">`)
    .join("");
}

function renderCustomList() {
  customListEl.innerHTML = (settings.customTasks || [])
    .map(
      (t, i) => `
      <li>
        <span>${t.label}</span>
        <button type="button" data-i="${i}" aria-label="Remove">×</button>
      </li>`
    )
    .join("");
  customListEl.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      settings.customTasks.splice(Number(btn.dataset.i), 1);
      saveSettings();
      renderCustomList();
    });
  });
}

function syncSettingsForm() {
  applyIntervalUI();
  workStart.value = settings.workStart;
  workEnd.value = settings.workEnd;
  renderThumbs();
  renderCustomList();
}

previewBtn.addEventListener("click", () => openPrompt({ preview: true, gentle: gentleNext }));
closeBtn.addEventListener("click", () => {
  if (phase === "complete") finishAndReset();
  else skip();
});
startBtn.addEventListener("click", startBreak);
snoozeBtn.addEventListener("click", snooze);
skipBtn.addEventListener("click", skip);
backBtn.addEventListener("click", finishAndReset);

taskCheck.addEventListener("change", () => {
  const task = sessionTasks[currentIndex];
  if (!task) return;
  if (taskCheck.checked) {
    done.add(task.id);
    playChime();
    taskRow.classList.add("checked");
    renderDots();
    if (!pendingIndexes().length) {
      setTimeout(completeBreak, 280);
      return;
    }
    setTimeout(() => {
      if (phase === "break") rotateToNext();
    }, 650);
  } else {
    done.delete(task.id);
    taskRow.classList.remove("checked");
    renderDots();
  }
});

intervalSelect.addEventListener("change", () => {
  if (intervalSelect.value === "custom") {
    customIntervalWrap.hidden = false;
    const v = clampInterval(customIntervalInput.value || 40);
    customIntervalInput.value = String(v);
    settings.intervalMin = v;
  } else {
    customIntervalWrap.hidden = true;
    settings.intervalMin = clampInterval(intervalSelect.value);
  }
  saveSettings();
  updateStatus();
});
customIntervalInput.addEventListener("change", () => {
  settings.intervalMin = clampInterval(customIntervalInput.value);
  customIntervalInput.value = String(settings.intervalMin);
  saveSettings();
  updateStatus();
});
workStart.addEventListener("change", () => {
  settings.workStart = workStart.value;
  saveSettings();
});
workEnd.addEventListener("change", () => {
  settings.workEnd = workEnd.value;
  saveSettings();
});
addTaskBtn.addEventListener("click", () => {
  const label = customInput.value.trim();
  if (!label) return;
  if (!settings.customTasks) settings.customTasks = [];
  settings.customTasks.push({
    id: "custom-" + Date.now(),
    label,
    hint: "Your own little break step.",
    quick: false,
  });
  customInput.value = "";
  saveSettings();
  renderCustomList();
});
customInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addTaskBtn.click();
});
mascotUpload.addEventListener("change", async () => {
  const files = [...mascotUpload.files];
  const reads = files.map(
    (file) =>
      new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
      })
  );
  settings.uploads = [...settings.uploads, ...(await Promise.all(reads))].slice(-8);
  saveSettings();
  renderThumbs();
});

["mousemove", "mousedown", "keydown", "scroll", "touchstart"].forEach((eventName) => {
  window.addEventListener(
    eventName,
    () => markInput(eventName === "keydown"),
    { passive: true }
  );
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !widget.hidden) closeBtn.click();
});

document.addEventListener("fullscreenchange", () => {
  if (document.fullscreenElement && !widget.hidden && phase !== "complete") {
    hideWidget();
    pendingShow = true;
  }
});

syncSettingsForm();
maybeScheduleHint();
setInterval(engineTick, 1000);
updateStatus();
