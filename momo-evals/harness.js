// harness.js: loads YOUR real background.js into a sandbox with a fake Chrome and a fake clock.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function makeEnv({ extensionDir, startTime, tz }) {
  let nowMs = startTime;
  const store = {};
  const sent = [];            // every message the extension sends to tabs
  let idleState = "active";
  let tabsAvailable = true;   // is there a normal http(s) tab to draw the pop-up on?
  let tabAccepts = true;      // does the content script accept (false = fullscreen / hidden tab)
  const listeners = { msg: null };

  class FakeDate extends Date {
    constructor(...a) { if (a.length) super(...a); else super(nowMs); }
    static now() { return nowMs; }
  }

  const chrome = {
    storage: { local: {
      async get(keys) { const o = {}; (Array.isArray(keys) ? keys : [keys]).forEach(k => { if (k in store) o[k] = JSON.parse(JSON.stringify(store[k])); }); return o; },
      async set(obj) { Object.entries(obj).forEach(([k, v]) => { store[k] = JSON.parse(JSON.stringify(v)); }); },
    } },
    idle: { setDetectionInterval() {}, async queryState() { return idleState; }, onStateChanged: { addListener() {} } },
    alarms: { create() {}, onAlarm: { addListener() {} } },
    notifications: { async create() { sent.push({ type: "NOTIFICATION" }); }, async clear() {}, onClicked: { addListener() {} } },
    scripting: { async insertCSS() {}, async executeScript() {} },
    windows: { async update() {} },
    tabs: {
      async query() { return tabsAvailable ? [{ id: 1, windowId: 1, url: "https://example.com/" }] : []; },
      async create() { sent.push({ type: "OPENED_NEW_TAB" }); return { id: 2 }; },
      async get() { return { status: "complete" }; },
      async update() {},
      async sendMessage(_id, payload) {
        if (payload.type === "MOMO_SHOW") { sent.push({ type: "MOMO_SHOW", gentle: !!payload.gentle }); return { shown: tabAccepts }; }
        return { ok: true };
      },
    },
    runtime: { onInstalled: { addListener() {} }, onStartup: { addListener() {} },
      onMessage: { addListener(fn) { listeners.msg = fn; } } },
  };

  // Short delays inside background.js (150-250ms waits) resolve immediately; the 2s boot tick is skipped.
  const fastTimeout = (fn, ms) => { if (ms <= 1000) setImmediate(fn); return 0; };
  const ctx = vm.createContext({ chrome, Date: FakeDate, console, setTimeout: fastTimeout, clearTimeout() {}, Promise, Math, JSON });
  const code = fs.readFileSync(path.join(extensionDir, "background.js"), "utf8");
  vm.runInContext(code, ctx);

  return {
    ctx, sent, store,
    ready: () => new Promise(r => setImmediate(r)),
    setTime(ms) { nowMs = ms; },
    advance(ms) { nowMs += ms; },
    now: () => nowMs,
    setIdle(s) { idleState = s; },
    setTabs(v) { tabsAvailable = v; },
    setTabAccepts(v) { tabAccepts = v; },
    seed({ settings, stats, runtime }) {
      if (settings) store["momo-settings"] = settings;
      if (stats) store["momo-stats"] = stats;
      if (runtime) store["momo-runtime"] = runtime;
    },
    async tick() { await ctx.onTick(); },
    async message(msg) {
      return new Promise(res => { listeners.msg(msg, {}, res); });
    },
    shows() { return sent.filter(s => s.type === "MOMO_SHOW"); },
    clearSent() { sent.length = 0; },
    run: (code) => vm.runInContext(code, ctx),
  };
}

// Loads YOUR real content.js (greetings, checklist, mascot picker) with a stub browser.
function loadContent({ extensionDir, seedRandom = 1 }) {
  let a = seedRandom;
  const rnd = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const M = Object.create(Math); M.random = rnd;
  const noop = () => {};
  const sandbox = {
    Math: M, console, setTimeout: noop, clearTimeout: noop, setInterval: noop, clearInterval: noop,
    window: {}, Audio: function () {},
    document: { readyState: "loading", addEventListener: noop, hidden: false, getElementById: () => null },
    chrome: { runtime: { getURL: (p) => p, onMessage: { addListener: noop }, sendMessage: noop } },
  };
  const ctx = vm.createContext(sandbox);
  let code = fs.readFileSync(path.join(extensionDir, "content.js"), "utf8");
  const i = code.lastIndexOf("})();");
  code = code.slice(0, i) +
    "window.__momo = { pickSessionTasks, pickMascot, roll, fullPool, TASK_POOL, GREETINGS, FUN_BUBBLES, COMPLETE_HEADERS, COMPLETE_BUBBLES, HEADER, setSettings: (s) => { settings = s; } };\n" +
    code.slice(i);
  vm.runInContext(code, ctx);
  return sandbox.window.__momo;
}
module.exports = { makeEnv, loadContent };
