const interval = document.getElementById("interval");
const customIntervalWrap = document.getElementById("custom-interval-wrap");
const customIntervalInput = document.getElementById("custom-interval");
const workStart = document.getElementById("work-start");
const workEnd = document.getElementById("work-end");
const customList = document.getElementById("custom-list");
const customInput = document.getElementById("custom-input");
const addTaskBtn = document.getElementById("add-task");
const mascotUpload = document.getElementById("mascot-upload");
const thumbs = document.getElementById("thumbs");
const savedEl = document.getElementById("saved");

const PRESET_INTERVALS = new Set([25, 50, 90]);

let settings = {
  intervalMin: 50,
  workStart: "09:00",
  workEnd: "18:00",
  uploads: [],
  customTasks: [],
};

function clampInterval(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 50;
  return Math.min(240, Math.max(5, v));
}

function flashSaved() {
  savedEl.classList.add("show");
  setTimeout(() => savedEl.classList.remove("show"), 1200);
}

function save() {
  settings.intervalMin = clampInterval(settings.intervalMin);
  chrome.runtime.sendMessage(
    { type: "MOMO_SAVE_SETTINGS", settings },
    () => flashSaved()
  );
}

function applyIntervalUI() {
  const mins = clampInterval(settings.intervalMin);
  settings.intervalMin = mins;
  if (PRESET_INTERVALS.has(mins)) {
    interval.value = String(mins);
    customIntervalWrap.hidden = true;
  } else {
    interval.value = "custom";
    customIntervalWrap.hidden = false;
    customIntervalInput.value = String(mins);
  }
}

function renderCustom() {
  customList.innerHTML = (settings.customTasks || [])
    .map(
      (t, i) => `
      <li>
        <span>${t.label}</span>
        <button type="button" data-i="${i}" aria-label="Remove">×</button>
      </li>`
    )
    .join("");
  customList.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      settings.customTasks.splice(Number(btn.dataset.i), 1);
      renderCustom();
      save();
    });
  });
}

function renderThumbs() {
  const srcs = settings.uploads?.length
    ? settings.uploads
    : [
        chrome.runtime.getURL("mascots/momo-default.png"),
        chrome.runtime.getURL("mascots/momo-shy.png"),
        chrome.runtime.getURL("mascots/momo-cheer.png"),
      ];
  thumbs.innerHTML = srcs.map((s) => `<img src="${s}" alt="">`).join("");
}

function load() {
  chrome.runtime.sendMessage({ type: "MOMO_GET_STATE" }, (state) => {
    if (!state?.settings) return;
    settings = {
      intervalMin: 50,
      workStart: "09:00",
      workEnd: "18:00",
      uploads: [],
      customTasks: [],
      ...state.settings,
    };
    settings.intervalMin = clampInterval(settings.intervalMin);
    applyIntervalUI();
    workStart.value = settings.workStart;
    workEnd.value = settings.workEnd;
    renderCustom();
    renderThumbs();
  });
}

interval.addEventListener("change", () => {
  if (interval.value === "custom") {
    customIntervalWrap.hidden = false;
    const v = clampInterval(customIntervalInput.value || 40);
    customIntervalInput.value = String(v);
    settings.intervalMin = v;
  } else {
    customIntervalWrap.hidden = true;
    settings.intervalMin = clampInterval(interval.value);
  }
  save();
});

customIntervalInput.addEventListener("change", () => {
  settings.intervalMin = clampInterval(customIntervalInput.value);
  customIntervalInput.value = String(settings.intervalMin);
  save();
});

workStart.addEventListener("change", () => {
  settings.workStart = workStart.value;
  save();
});
workEnd.addEventListener("change", () => {
  settings.workEnd = workEnd.value;
  save();
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
  renderCustom();
  save();
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
  settings.uploads = [...(settings.uploads || []), ...(await Promise.all(reads))].slice(-8);
  renderThumbs();
  save();
});

load();
