const STORAGE_SETTINGS = "momo-settings";
const STORAGE_STATS = "momo-stats";
const STORAGE_RUNTIME = "momo-runtime";
const IDLE_RESET_MS = 5 * 60 * 1000;
const COOLDOWN_MS = 15 * 60 * 1000;
const SNOOZE_MS = 10 * 60 * 1000;
const MAX_POPUPS = 6;
const MAX_SKIPS = 3;
const TICK_CAP_MS = 90 * 1000;

const defaults = {
  intervalMin: 50,
  workStart: "09:00",
  workEnd: "18:00",
  uploads: [],
  customTasks: [],
};

let settings = { ...defaults };
let stats = null;

let runtime = {
  activeMs: 0,
  lastTick: Date.now(),
  lastActive: Date.now(),
  snoozeUntil: 0,
  gentleNext: false,
  phase: "idle",
  pendingShow: false,
  pendingGentle: false,
};

function todayKey() {
  return new Date().toISOString().slice(0, 10);
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

async function loadAll() {
  const data = await chrome.storage.local.get([
    STORAGE_SETTINGS,
    STORAGE_STATS,
    STORAGE_RUNTIME,
  ]);
  settings = { ...defaults, ...(data[STORAGE_SETTINGS] || {}) };
  settings.intervalMin = Math.min(
    240,
    Math.max(5, Math.round(Number(settings.intervalMin) || 50))
  );

  const raw = data[STORAGE_STATS] || {};
  if (raw.date !== todayKey()) {
    stats = {
      ...freshStats(),
      completeHours: raw.completeHours || [],
      skipHours: raw.skipHours || [],
    };
  } else {
    stats = { ...freshStats(), ...raw };
  }

  runtime = {
    activeMs: 0,
    lastTick: Date.now(),
    lastActive: Date.now(),
    snoozeUntil: 0,
    gentleNext: false,
    phase: "idle",
    pendingShow: false,
    pendingGentle: false,
    ...(data[STORAGE_RUNTIME] || {}),
  };
}

async function saveSettings() {
  await chrome.storage.local.set({ [STORAGE_SETTINGS]: settings });
}

async function saveStats() {
  await chrome.storage.local.set({ [STORAGE_STATS]: stats });
}

async function saveRuntime() {
  await chrome.storage.local.set({ [STORAGE_RUNTIME]: runtime });
}

function inWorkHours(date = new Date()) {
  const [sh, sm] = settings.workStart.split(":").map(Number);
  const [eh, em] = settings.workEnd.split(":").map(Number);
  const mins = date.getHours() * 60 + date.getMinutes();
  return mins >= sh * 60 + sm && mins <= eh * 60 + em;
}

function preferredHourBoost() {
  if (!stats || stats.completeHours.length < 4) return 1;
  const hour = new Date().getHours();
  const hits = stats.completeHours.filter((h) => Math.abs(h - hour) <= 1).length;
  return hits >= 2 ? 0.8 : 1;
}

function canShow() {
  const now = Date.now();
  if (runtime.phase !== "idle" && !runtime.pendingShow) return false;
  if (!inWorkHours()) return false;
  if (stats.popups >= MAX_POPUPS) return false;
  if (stats.skips >= MAX_SKIPS) return false;
  if (runtime.snoozeUntil && now < runtime.snoozeUntil) return false;
  if (now - stats.lastPopup < COOLDOWN_MS) return false;
  if (now - stats.lastComplete < COOLDOWN_MS) return false;
  const need = settings.intervalMin * 60 * 1000 * preferredHourBoost();
  if (runtime.activeMs < need && !runtime.pendingShow) return false;
  return true;
}

async function notifyBreakDue() {
  try {
    await chrome.notifications.create("momo-break-due", {
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: "Momo Break",
      message: "Time for a soft break — open any website tab to see Momo.",
      priority: 2,
    });
  } catch {
    /* notifications may be blocked */
  }
}



async function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Show the corner pop-up inside a normal webpage (not a separate window). */
async function showInPagePopup({ gentle = false, preview = false } = {}) {
  const payload = {
    type: "MOMO_SHOW",
    gentle,
    preview,
    settings,
    stats,
  };

  async function tryTab(tabId) {
    // Message existing content script
    try {
      const res = await chrome.tabs.sendMessage(tabId, payload);
      if (res && res.shown) return true;
    } catch {
      /* not injected yet */
    }
    // Inject, then message
    try {
      await chrome.scripting.insertCSS({ target: { tabId }, files: ["content.css"] });
    } catch {
      /* may already be there */
    }
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    } catch {
      /* may already be there or restricted page */
    }
    await delay(150);
    try {
      const res = await chrome.tabs.sendMessage(tabId, payload);
      return !!(res && res.shown);
    } catch {
      return false;
    }
  }

  function isHttpTab(tab) {
    const u = tab.url || "";
    return u.startsWith("http://") || u.startsWith("https://");
  }

  // 1) Active tab in last focused window
  try {
    const active = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    for (const tab of active) {
      if (!tab.id || !isHttpTab(tab)) continue;
      try {
        if (tab.windowId) await chrome.windows.update(tab.windowId, { focused: true });
        await chrome.tabs.update(tab.id, { active: true });
      } catch {
        /* ignore */
      }
      if (await tryTab(tab.id)) return true;
    }
  } catch {
    /* ignore */
  }

  // 2) Any open http(s) tab
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (!tab.id || !isHttpTab(tab)) continue;
      try {
        if (tab.windowId) await chrome.windows.update(tab.windowId, { focused: true });
        await chrome.tabs.update(tab.id, { active: true });
      } catch {
        /* ignore */
      }
      await delay(100);
      if (await tryTab(tab.id)) return true;
    }
  } catch {
    /* ignore */
  }

  // 3) Open a simple page so we have somewhere to draw the corner pop-up
  try {
    const tab = await chrome.tabs.create({ url: "https://www.google.com/", active: true });
    // wait for load
    for (let i = 0; i < 20; i++) {
      await delay(250);
      try {
        const t = await chrome.tabs.get(tab.id);
        if (t.status === "complete") break;
      } catch {
        break;
      }
    }
    await delay(200);
    if (tab.id && (await tryTab(tab.id))) return true;
  } catch {
    /* ignore */
  }

  return false;
}

async function sendShowToTabs({ gentle = false, preview = false } = {}) {
  const payload = {
    type: "MOMO_SHOW",
    gentle,
    preview,
    settings,
    stats,
  };

  let delivered = false;
  try {
    const activeTabs = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    for (const tab of activeTabs) {
      if (!tab.id || !tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://") || tab.url.startsWith("edge://")) continue;
      try {
        const res = await chrome.tabs.sendMessage(tab.id, payload);
        if (res && res.shown) {
          delivered = true;
          break;
        }
      } catch {
        /* no content script */
      }
    }
  } catch {
    /* ignore */
  }

  if (delivered) return true;

  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (!tab.id || !tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://") || tab.url.startsWith("edge://")) continue;
      try {
        const res = await chrome.tabs.sendMessage(tab.id, payload);
        if (res && res.shown) {
          delivered = true;
          break;
        }
      } catch {
        /* no content script */
      }
    }
  } catch {
    /* ignore */
  }

  return delivered;
}

async function markPopupShown(gentle) {
  runtime.phase = "prompt";
  runtime.pendingShow = false;
  runtime.pendingGentle = false;
  runtime.gentleNext = false;
  runtime.activeMs = 0;
  stats.popups += 1;
  stats.lastPopup = Date.now();
  await saveStats();
  await saveRuntime();
}

async function queueOrShowPopup({ gentle = false } = {}) {
  if (runtime.phase === "prompt" || runtime.phase === "break" || runtime.phase === "complete") {
    return;
  }

  // Corner pop-up only (injected into a webpage — no separate Chrome window)
  const shown = await showInPagePopup({ gentle, preview: false });
  if (shown) {
    await markPopupShown(gentle);
    try {
      await chrome.notifications.clear("momo-break-due");
    } catch {
      /* ignore */
    }
    return;
  }

  runtime.pendingShow = true;
  runtime.pendingGentle = gentle;
  await saveRuntime();
  await notifyBreakDue();
}

async function tryShowPopup() {
  if (runtime.pendingShow) {
    const shown = await showInPagePopup({
      gentle: runtime.pendingGentle,
      preview: false,
    });
    if (shown) {
      await markPopupShown(runtime.pendingGentle);
      try {
        await chrome.notifications.clear("momo-break-due");
      } catch {
        /* ignore */
      }
    }
    return;
  }

  if (!canShow()) return;
  await queueOrShowPopup({ gentle: runtime.gentleNext });
}

async function onTick() {
  await loadAll();
  const now = Date.now();

  let systemState = "active";
  try {
    systemState = await chrome.idle.queryState(60);
  } catch {
    systemState = "active";
  }

  const rawDt = now - (runtime.lastTick || now);
  const dt = Math.min(Math.max(rawDt, 0), TICK_CAP_MS);

  if (systemState === "active") {
    if (!runtime.pendingShow) {
      runtime.activeMs += dt;
    }
    runtime.lastActive = now;
  } else if (systemState === "idle" || systemState === "locked") {
    if (now - runtime.lastActive >= IDLE_RESET_MS) {
      if (!runtime.pendingShow) runtime.activeMs = 0;
    }
  }

  runtime.lastTick = now;
  await saveRuntime();

  if (
    runtime.gentleNext &&
    runtime.snoozeUntil &&
    now >= runtime.snoozeUntil &&
    runtime.phase === "idle" &&
     !runtime.pendingShow &&
     inWorkHours() &&
     stats.popups < MAX_POPUPS &&
     stats.skips < MAX_SKIPS
  ) {
    runtime.snoozeUntil = 0;
    await saveRuntime();
    await queueOrShowPopup({ gentle: true });
    return;
  }

  await tryShowPopup();
}

function ensureAlarm() {
  chrome.alarms.create("momo-tick", { periodInMinutes: 1 });
}

chrome.runtime.onInstalled.addListener(async () => {
  await loadAll();
  chrome.idle.setDetectionInterval(60);
  ensureAlarm();
  await saveRuntime();
});

chrome.runtime.onStartup.addListener(async () => {
  await loadAll();
  chrome.idle.setDetectionInterval(60);
  ensureAlarm();
});

ensureAlarm();
chrome.idle.setDetectionInterval(60);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "momo-tick") onTick();
});

chrome.idle.onStateChanged.addListener(async (state) => {
  await loadAll();
  const now = Date.now();
  if (state === "idle" || state === "locked") {
    if (now - runtime.lastActive >= IDLE_RESET_MS && !runtime.pendingShow) {
      runtime.activeMs = 0;
      await saveRuntime();
    }
  } else if (state === "active") {
    runtime.lastActive = now;
    runtime.lastTick = now;
    await saveRuntime();
  }
});

chrome.notifications.onClicked.addListener(async (id) => {
  if (id !== "momo-break-due") return;
  await loadAll();
  try {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const tab = tabs[0];
    if (tab?.id) {
      await chrome.tabs.update(tab.id, { active: true });
      if (tab.windowId) await chrome.windows.update(tab.windowId, { focused: true });
    }
  } catch {
    /* ignore */
  }
  await tryShowPopup();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    await loadAll();

    if (msg.type === "MOMO_GET_STATE") {
      const need = settings.intervalMin * 60 * 1000 * preferredHourBoost();
      sendResponse({
        settings,
        stats,
        activeMs: runtime.activeMs,
        need,
        phase: runtime.phase,
        pendingShow: runtime.pendingShow,
        snoozeUntil: runtime.snoozeUntil,
        gentleNext: runtime.gentleNext,
      });
      return;
    }

    if (msg.type === "MOMO_SAVE_SETTINGS") {
      settings = { ...settings, ...msg.settings };
      settings.intervalMin = Math.min(
        240,
        Math.max(5, Math.round(Number(settings.intervalMin) || 50))
      );
      await saveSettings();
      sendResponse({ ok: true });
      return;
    }

    if (msg.type === "MOMO_STARTED") {
      runtime.phase = "break";
      stats.snoozesInARow = 0;
      await saveStats();
      await saveRuntime();
      sendResponse({ ok: true });
      return;
    }

    if (msg.type === "MOMO_SNOOZE") {
      stats.snoozesInARow += 1;
      runtime.snoozeUntil = Date.now() + SNOOZE_MS;
      runtime.activeMs = settings.intervalMin * 60 * 1000; // come back after the snooze, not after a whole new cycle
         stats.lastPopup = 0; // the 15-min cooldown shouldn't delay a snoozed pop-up
      if (stats.snoozesInARow >= 2) runtime.gentleNext = true;
      runtime.phase = "idle";
      runtime.pendingShow = false;
      await saveStats();
      await saveRuntime();
      await broadcastHide();
      sendResponse({ ok: true });
      return;
    }

    if (msg.type === "MOMO_SKIP") {
      stats.skips += 1;
      stats.snoozesInARow = 0;
      stats.skipHours.push(new Date().getHours());
      stats.skipHours = stats.skipHours.slice(-12);
      runtime.phase = "idle";
      runtime.pendingShow = false;
      runtime.activeMs = 0;
      await saveStats();
      await saveRuntime();
      await broadcastHide();
      sendResponse({ ok: true });
      return;
    }

    if (msg.type === "MOMO_COMPLETE") {
      stats.completed += 1;
      stats.lastComplete = Date.now();
      stats.snoozesInARow = 0;
      stats.completeHours.push(new Date().getHours());
      stats.completeHours = stats.completeHours.slice(-20);
      runtime.phase = "idle";
      runtime.pendingShow = false;
      runtime.activeMs = 0;
      await saveStats();
      await saveRuntime();
      sendResponse({ ok: true, stats });
      return;
    }

    if (msg.type === "MOMO_CLOSED") {
      runtime.phase = "idle";
      runtime.pendingShow = false;
      await saveRuntime();
      sendResponse({ ok: true });
      return;
    }

    if (msg.type === "MOMO_TAB_VISIBLE") {
      if (runtime.pendingShow && runtime.phase === "idle") {
        const shown = await showInPagePopup({
          gentle: runtime.pendingGentle,
          preview: false,
        });
        if (shown) await markPopupShown(runtime.pendingGentle);
      }
      sendResponse({ ok: true });
      return;
    }

    if (msg.type === "MOMO_PREVIEW") {
      await showInPagePopup({ gentle: !!msg.gentle, preview: true });
      sendResponse({ ok: true });
      return;
    }

    sendResponse({ ok: false });
  })();
  return true;
});

async function broadcastHide() {
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (!tab.id) continue;
      try {
        await chrome.tabs.sendMessage(tab.id, { type: "MOMO_HIDE" });
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

loadAll().then(() => {
  setTimeout(() => onTick(), 2000);
});


