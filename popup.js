const statusEl = document.getElementById("status");
const previewBtn = document.getElementById("preview");
const optionsBtn = document.getElementById("options");

function refresh() {
  chrome.runtime.sendMessage({ type: "MOMO_GET_STATE" }, (state) => {
    if (!state || chrome.runtime.lastError) {
      statusEl.textContent = "Momo is waking up…";
      return;
    }
    const { stats, activeMs, need, settings } = state;
    if (stats.skips >= 3) {
      statusEl.textContent = "Done for today after 3 skips.";
      return;
    }
    if (stats.popups >= 6) {
      statusEl.textContent = "6 pop-ups today. See you tomorrow.";
      return;
    }
    if (state.pendingShow) {
      statusEl.textContent = `Break is due! Open any website tab to see Momo.\n${stats.completed} break${stats.completed === 1 ? "" : "s"} today`;
      return;
    }
    const pct = Math.min(100, Math.round((activeMs / need) * 100));
    const mins = Math.max(0, Math.ceil((need - activeMs) / 60000));
    statusEl.textContent = `Active toward next break: ${pct}% · ~${mins} min\n${stats.completed} break${stats.completed === 1 ? "" : "s"} today · every ${settings.intervalMin} min`;
  });
}

previewBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "MOMO_PREVIEW" }, () => {
    window.close();
  });
});

optionsBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

refresh();
setInterval(refresh, 2000);
