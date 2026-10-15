(() => {
  if (window.__momoBreakLoaded) return;
  window.__momoBreakLoaded = true;

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
  const TASK_POOL = [
    { id: "posture", label: "Check your posture", hint: "Unhunch. Soften your shoulders.", quick: true },
    { id: "coffee", label: "Go make some coffee", hint: "Make it, don't buy it.", quick: false },
    { id: "water", label: "Drink some water", hint: "A full glass, not a sip.", quick: true },
    { id: "pet", label: "Play with your pet for a bit", hint: "Even 30 seconds of fussing counts.", quick: false },
    { id: "duolingo", label: "Play a little Duolingo", hint: "One lesson is enough.", quick: false },
    { id: "stretch", label: "Stretch for a moment", hint: "Arms up, roll your neck.", quick: true },
    { id: "window", label: "Look out the window", hint: "Find one far-away thing.", quick: true },
  ];

  function asset(path) {
    try {
      return chrome.runtime.getURL(path);
    } catch {
      return path;
    }
  }

  const DEFAULT_MASCOTS = [
    asset("mascots/momo-default.png"),
    asset("mascots/momo-shy.png"),
    asset("mascots/momo-cheer.png"),
  ];
  const POSES = {
    default: asset("mascots/momo-default.png"),
    shy: asset("mascots/momo-shy.png"),
    cheer: asset("mascots/momo-cheer.png"),
  };

  let host = null;
  let shadow = null;
  let phase = "idle";
  let sessionTasks = [];
  let done = new Set();
  let remaining = 600;
  let spent = 0;
  let timerId = null;
  let autoHideId = null;
  let lastMascot = "";
  let settings = { uploads: [], customTasks: [] };
  let chime = null;

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
    return [...TASK_POOL, ...custom];
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
        const must = quick.find((t) => QUICK_IDS.includes(t.id));
    if (must) chosen.push(must);
    const leftover = shuffle([...quick.filter((t) => t !== must), ...rest]);
    while (chosen.length < count && leftover.length) chosen.push(leftover.shift());
    return shuffle(chosen);
  }

  function mascotSet() {
    const uploads = settings.uploads || [];
    return uploads.length ? uploads : DEFAULT_MASCOTS;
  }

  function pickMascot(preferCheer = false) {
    if (!(settings.uploads || []).length && preferCheer) return POSES.cheer;
    const set = mascotSet().filter((src) => src !== lastMascot);
    const src = roll(set.length ? set : mascotSet());
    lastMascot = src;
    return src;
  }

  function el(id) {
    return shadow ? shadow.getElementById(id) : null;
  }

  const SHADOW_CSS = `
    :host {
      all: initial;
      position: fixed !important;
      top: 28px !important;
      right: 22px !important;
      width: 280px !important;
      z-index: 2147483646 !important;
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif !important;
      color: #4a2f2a !important;
      line-height: 1.4 !important;
    }
    :host([data-hidden="true"]) { display: none !important; }
    * { box-sizing: border-box; font-family: inherit; }
    .widget {
      position: relative;
      pointer-events: auto;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
    }
    .float {
      position: relative;
      width: 100%;
      max-width: 240px;
      pointer-events: none;
      text-align: center;
      z-index: 2;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }
    .momo {
      width: 88px; height: 88px; object-fit: contain; display: block;
      margin: 0 auto;
      filter: drop-shadow(0 10px 12px rgba(244,160,144,.35));
      pointer-events: auto !important;
      cursor: pointer !important;
      transition: transform 0.15s ease;
      order: 2;
    }
    .momo:hover { transform: scale(1.06) rotate(-3deg); }
    .momo.spin {
      animation: momo-spin 0.45s ease;
    }
    @keyframes momo-spin {
      0% { transform: scale(1) rotate(0deg); }
      40% { transform: scale(1.12) rotate(-12deg); }
      100% { transform: scale(1) rotate(0deg); }
    }
    .bubble {
      position: relative;
      order: 1;
      left: auto; right: auto; top: auto;
      margin: 0 auto 2px;
      background: #fff; font-weight: 700; font-size: 11px; line-height: 1.3;
      padding: 7px 10px; border-radius: 12px 12px 12px 12px;
      box-shadow: 0 8px 16px rgba(74,47,42,.12);
      width: max-content; max-width: 200px; pointer-events: none;
      text-align: center;
    }
    .popup {
      position: relative;
      z-index: 3;
      width: 100%;
      background: #fffdfb; border-radius: 18px;
      padding: 14px 14px 12px; border: 1px solid #ffe4d8;
      box-shadow: 0 14px 30px rgba(90,40,30,.18);
      pointer-events: auto !important;
    }
    button {
      pointer-events: auto !important;
      cursor: pointer !important;
      font-family: inherit !important;
      position: relative;
      z-index: 10;
    }
    .close {
      position: absolute; top: 4px; right: 8px; border: 0; background: transparent;
      font-size: 20px; color: #8a6a64; line-height: 1; padding: 4px 8px;
    }
    .timer {
      display: inline-flex; margin: 0 0 8px; background: #fff6ef;
      font-weight: 800; font-size: 13px; border-radius: 999px; padding: 4px 10px;
    }
    .timer.done { background: #eef8f1; color: #2f6b4d; }
    h2 {
      font-size: 15px; line-height: 1.3; margin: 0 0 12px; font-weight: 800;
      padding-right: 18px; color: #4a2f2a;
    }
    .actions { display: grid; gap: 6px; }
    .primary {
      border: 0; background: #4a2f2a; color: #fff8f4;
      padding: 10px 12px; border-radius: 999px; font-weight: 800; font-size: 13px; width: 100%;
    }
    .ghost {
      border: 0; background: #fff6ef; color: #4a2f2a;
      font-weight: 800; border-radius: 999px; padding: 8px 12px; font-size: 13px; width: 100%;
    }
    .task-list { display: grid; gap: 6px; }
    .item {
      display: flex; gap: 8px; align-items: flex-start; background: #fff6ef;
      border-radius: 12px; padding: 8px 9px; cursor: pointer; pointer-events: auto !important;
    }
    .item input { position: absolute; opacity: 0; width: 0; height: 0; }
    .mark {
      width: 16px; height: 16px; min-width: 16px; margin-top: 2px;
      border: 1.5px solid #d7b6aa; border-radius: 5px; background: #fff;
    }
    .item.checked { background: #eef8f1; }
    .item.checked .mark {
      border-color: #6faf8c; background: #6faf8c
        url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='none' stroke='white' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round' d='M3.5 8.5 6.5 11.5 12.5 4.5'/%3E%3C/svg%3E")
        center / 12px no-repeat;
    }
    .item strong, .done-list strong { display: block; font-size: 13px; font-weight: 800; color: #4a2f2a; }
    .item small { display: block; color: #8a6a64; font-weight: 600; font-size: 11px; margin-top: 2px; }
    .done-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
    .done-list li {
      display: flex; gap: 8px; align-items: center; background: #eef8f1;
      border-radius: 10px; padding: 7px 8px;
    }
    .sendoff, .streak {
      text-align: center; font-size: 12px; font-weight: 700; color: #3f7a5a; margin: 8px 0 0;
    }
    #momo-back { margin-top: 8px; }
    .dots { display: flex; justify-content: center; gap: 5px; margin-top: 10px; }
    .dots span {
      width: 6px; height: 6px; border-radius: 50%; background: #ead2c8; display: inline-block;
    }
    .dots span.done { background: #6faf8c; }
    .particles { position: absolute; inset: 0; pointer-events: none; overflow: visible; }
    .bit { position: absolute; font-size: 12px; animation: spark 1.5s ease-out forwards; }
    @keyframes spark {
      0% { opacity: 0; transform: translateY(8px) scale(.6); }
      20% { opacity: 1; }
      100% { opacity: 0; transform: translateY(-36px) scale(1); }
    }
  `;

  function ensureRoot() {
    if (host && shadow) return host;

    host = document.getElementById("momo-break-host");
    if (host && host.shadowRoot) {
      shadow = host.shadowRoot;
      return host;
    }

    host = document.createElement("div");
    host.id = "momo-break-host";
    host.setAttribute("data-hidden", "true");
    host.style.cssText =
      "all:initial;position:fixed;top:28px;right:22px;width:280px;z-index:2147483646;pointer-events:none;";

    shadow = host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = SHADOW_CSS;

    const wrap = document.createElement("div");
    wrap.className = "widget";
    wrap.style.pointerEvents = "auto";
    wrap.innerHTML = `
      <div class="particles" id="momo-particles" aria-hidden="true"></div>
      <div class="float">
        <p class="bubble" id="momo-bubble">Hey, I'm Momo!</p>
        <img id="momo-img" class="momo" src="${POSES.default}" alt="" />
      </div>
      <section class="popup" role="dialog">
        <button type="button" class="close" id="momo-close" aria-label="Close">×</button>
        <p class="timer" id="momo-timer">10:00</p>
        <h2 id="momo-title">${HEADER}</h2>
        <div id="momo-actions" class="actions">
          <button type="button" class="primary" id="momo-start">Start my 10 minutes</button>
          <button type="button" class="ghost" id="momo-snooze">Snooze</button>
          <button type="button" class="ghost" id="momo-skip">Skip</button>
        </div>
        <div id="momo-tasks" class="task-list" hidden></div>
        <ul class="done-list" id="momo-done" hidden></ul>
        <p class="sendoff" id="momo-sendoff" hidden>Come back when your brain feels loud again.</p>
        <button type="button" class="primary" id="momo-back" hidden>Back to it</button>
        <div class="dots" id="momo-dots" aria-hidden="true"></div>
        <p class="streak" id="momo-streak" hidden></p>
      </section>
    `;

    shadow.appendChild(style);
    shadow.appendChild(wrap);

    // Capture-phase clicks inside shadow root
    wrap.addEventListener(
      "click",
      (e) => {
        // Mascot poke — fun reaction
        const mascot = e.target.closest("img.momo, #momo-img");
        if (mascot) {
          e.preventDefault();
          e.stopPropagation();
          pokeMascot();
          return;
        }
        const btn = e.target.closest("button");
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        const id = btn.id;
        if (id === "momo-close") {
          if (phase === "complete") finishAndReset();
          else skip();
        } else if (id === "momo-start") {
          startBreak();
        } else if (id === "momo-snooze") {
          snooze();
        } else if (id === "momo-skip") {
          skip();
        } else if (id === "momo-back") {
          finishAndReset();
        }
      },
      true
    );

    document.documentElement.appendChild(host);
    host.style.pointerEvents = "none";
    wrap.style.pointerEvents = "auto";

    try {
      chime = new Audio(asset("assets/chimes.mp3"));
      chime.preload = "auto";
    } catch {
      chime = null;
    }

    return host;
  }

  function setMascot(src) {
    const img = el("momo-img");
    if (!img) return;
    img.src = src || pickMascot();
  }

  function pokeMascot() {
    const img = el("momo-img");
    const bubble = el("momo-bubble");
    if (!img) return;
    // New expression (avoid repeating the same src when possible)
    const next = pickMascot();
    img.src = next;
    img.classList.remove("spin");
    void img.offsetWidth;
    img.classList.add("spin");
    if (bubble) {
      let text = roll(FUN_BUBBLES);
      // avoid identical consecutive bubble when possible
      if (bubble.textContent === text && FUN_BUBBLES.length > 1) {
        text = roll(FUN_BUBBLES.filter((s) => s !== bubble.textContent));
      }
      bubble.textContent = text;
    }
    try {
      playChime();
    } catch {
      /* ignore */
    }
  }

  function playChime() {
    try {
      if (!chime) chime = new Audio(asset("assets/chimes.mp3"));
      chime.currentTime = 0;
      chime.play().catch(() => {});
    } catch {
      /* ignore */
    }
  }

  function stopTimer() {
    clearInterval(timerId);
    timerId = null;
  }

  function startCountdown() {
    stopTimer();
    const pill = el("momo-timer");
    if (!pill) return;
    pill.hidden = false;
    pill.classList.remove("done");
    pill.textContent = formatTime(remaining);
    timerId = setInterval(() => {
      remaining -= 1;
      spent += 1;
      pill.textContent = formatTime(remaining);
      if (remaining <= 0) {
        stopTimer();
        pill.textContent = "Time's up";
        const b = el("momo-bubble");
        if (b) b.textContent = "No rush. I'm still here.";
      }
    }, 1000);
  }

  function renderDots() {
    const dots = el("momo-dots");
    if (!dots) return;
    dots.innerHTML = sessionTasks
      .map((t) => `<span class="${done.has(t.id) ? "done" : ""}"></span>`)
      .join("");
  }

  function renderTaskList() {
    const list = el("momo-tasks");
    if (!list) return;
    list.hidden = false;
    list.innerHTML = sessionTasks
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

    list.querySelectorAll(".item").forEach((row) => {
      row.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = row.dataset.id;
        const input = row.querySelector("input");
        const nowChecked = !done.has(id);
        if (nowChecked) {
          done.add(id);
          row.classList.add("checked");
          if (input) input.checked = true;
          playChime();
        } else {
          done.delete(id);
          row.classList.remove("checked");
          if (input) input.checked = false;
        }
        renderDots();
        if (done.size >= sessionTasks.length) setTimeout(completeBreak, 280);
      });
    });
    renderDots();
  }

  function showPrompt({ gentle = false, preview = false } = {}) {
    ensureRoot();
    clearTimeout(autoHideId);
    stopTimer();
    phase = gentle ? "gentle" : "prompt";
    remaining = gentle ? 2 * 60 : 10 * 60;
    spent = 0;
    done = new Set();
    sessionTasks = pickSessionTasks(gentle);

    host.setAttribute("data-hidden", "false");
    host.style.display = "block";
    host.style.pointerEvents = "none";

    const actions = el("momo-actions");
    const tasks = el("momo-tasks");
    const doneList = el("momo-done");
    const sendoff = el("momo-sendoff");
    const back = el("momo-back");
    const streak = el("momo-streak");
    const timer = el("momo-timer");
    const title = el("momo-title");
    const start = el("momo-start");
    const bubble = el("momo-bubble");

    if (actions) actions.hidden = false;
    if (tasks) {
      tasks.hidden = true;
      tasks.innerHTML = "";
    }
    if (doneList) doneList.hidden = true;
    if (sendoff) sendoff.hidden = true;
    if (back) back.hidden = true;
    if (streak) streak.hidden = true;
    if (timer) {
      timer.hidden = false;
      timer.classList.remove("done");
      timer.textContent = formatTime(remaining);
    }
    if (title) title.textContent = gentle ? "Just 2 minutes?" : HEADER;
    if (start) start.textContent = gentle ? "Start my 2 minutes" : "Start my 10 minutes";
    if (bubble) bubble.textContent = roll(GREETINGS);
    setMascot(pickMascot());
    renderDots();
  }

  function startBreak() {
    phase = "break";
    const actions = el("momo-actions");
    if (actions) actions.hidden = true;
    try {
      chrome.runtime.sendMessage({ type: "MOMO_STARTED" });
    } catch {
      /* ignore */
    }
    renderTaskList();
    startCountdown();
  }

  function snooze() {
    try {
      chrome.runtime.sendMessage({ type: "MOMO_SNOOZE" });
    } catch {
      /* ignore */
    }
    hideWidget();
  }

  function skip() {
    try {
      chrome.runtime.sendMessage({ type: "MOMO_SKIP" });
    } catch {
      /* ignore */
    }
    hideWidget();
  }

  function hideWidget() {
    if (host) {
      host.setAttribute("data-hidden", "true");
      host.style.display = "none";
    }
    phase = "idle";
    stopTimer();
    clearTimeout(autoHideId);
  }

  function completeBreak() {
    if (phase === "complete") return;
    phase = "complete";
    stopTimer();
    const minutes = Math.max(1, Math.round(spent / 60) || 1);
    const timer = el("momo-timer");
    const title = el("momo-title");
    const bubble = el("momo-bubble");
    const tasks = el("momo-tasks");
    const actions = el("momo-actions");
    const doneList = el("momo-done");
    const sendoff = el("momo-sendoff");
    const back = el("momo-back");
    const streak = el("momo-streak");
    const dots = el("momo-dots");

    // Hide checklist entirely — celebrate with mascot only (no crowded done-list)
    if (tasks) {
      tasks.hidden = true;
      tasks.innerHTML = "";
    }
    if (doneList) {
      doneList.hidden = true;
      doneList.innerHTML = "";
    }
    if (actions) actions.hidden = true;
    if (dots) dots.hidden = true;

    if (timer) {
      timer.classList.add("done");
      timer.textContent =
        Math.random() < 0.5 ? "Break complete" : `${minutes} min for yourself`;
    }
    if (title) title.textContent = roll(COMPLETE_HEADERS);
    if (bubble) bubble.textContent = roll(COMPLETE_BUBBLES);
    if (sendoff) sendoff.hidden = false;
    if (back) back.hidden = false;
    if (streak) streak.hidden = false;

    // Happy mascot focus
    setMascot(POSES.cheer);
    const img = el("momo-img");
    if (img) {
      img.classList.remove("spin");
      void img.offsetWidth;
      img.classList.add("spin");
    }

    // Little sparkle bits near mascot
    const particles = el("momo-particles");
    if (particles) {
      particles.innerHTML = "";
      ["✦", "♡", "✧", "♡", "✦"].forEach((bit, i) => {
        const span = document.createElement("span");
        span.className = "bit";
        span.textContent = bit;
        span.style.left = `${10 + Math.random() * 80}px`;
        span.style.top = `${10 + Math.random() * 40}px`;
        span.style.animationDelay = `${i * 40}ms`;
        particles.appendChild(span);
      });
      setTimeout(() => {
        particles.innerHTML = "";
      }, 1600);
    }

    try {
      chrome.runtime.sendMessage({ type: "MOMO_COMPLETE" }, (res) => {
        const n = res?.stats?.completed || 1;
        if (streak) streak.textContent = `${n} break${n === 1 ? "" : "s"} today`;
      });
    } catch {
      /* ignore */
    }

    playChime();
  }

  function finishAndReset() {
    try {
      chrome.runtime.sendMessage({ type: "MOMO_CLOSED" });
    } catch {
      /* ignore */
    }
    hideWidget();
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === "MOMO_SHOW") {
      if (msg.settings) settings = { ...settings, ...msg.settings };
      if (document.hidden && !msg.preview) {
        sendResponse({ shown: false });
        return true;
      }
      if (document.fullscreenElement && !msg.preview) {
        sendResponse({ shown: false });
        return true;
      }
      showPrompt({ gentle: !!msg.gentle, preview: !!msg.preview });
      sendResponse({ shown: true });
      return true;
    }
    if (msg.type === "MOMO_HIDE") {
      hideWidget();
      sendResponse({ ok: true });
      return true;
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      try {
        chrome.runtime.sendMessage({ type: "MOMO_TAB_VISIBLE" });
      } catch {
        /* ignore */
      }
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureRoot);
  } else {
    ensureRoot();
  }
})();
