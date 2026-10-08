importScripts("defaults.js");

const ALARM = "cu-fly";
const TIMING_KEYS = ["enabled", "frequencyMode", "everyMinutes", "randomMin", "randomMax"];

async function getSettings() {
  return chrome.storage.sync.get(self.CU_DEFAULTS);
}

const ALL_SITES = { origins: ["<all_urls>"] };

// Random flights need the optional "all sites" permission, granted from the popup.
function hasAllSites() {
  return chrome.permissions.contains(ALL_SITES);
}

async function schedule() {
  await chrome.alarms.clear(ALARM);
  const s = await getSettings();
  if (!s.enabled) return;
  if (!(await hasAllSites())) return;
  let minutes;
  if (s.frequencyMode === "fixed") {
    minutes = Math.max(1, Number(s.everyMinutes) || 5);
  } else {
    const lo = Math.max(1, Number(s.randomMin) || 2);
    const hi = Math.max(lo, Number(s.randomMax) || 15);
    minutes = lo + Math.random() * (hi - lo);
  }
  chrome.alarms.create(ALARM, { delayInMinutes: minutes });
}

async function flyOnActiveTab(force = false) {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab || tab.id == null) return { ok: false, reason: "no-tab" };
  const msg = { type: "CU_FLY", force };
  try {
    await chrome.tabs.sendMessage(tab.id, msg);
    return { ok: true };
  } catch (e) {
    // Script not in this tab yet. Inject it: allowed by activeTab after a click
    // on the toolbar icon, or by the optional all-sites permission for random flights.
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["defaults.js", "content.js"]
      });
      await chrome.tabs.sendMessage(tab.id, msg);
      return { ok: true };
    } catch (err) {
      // Chrome blocks extensions on chrome:// pages and the Web Store.
      return { ok: false, reason: "blocked-page" };
    }
  }
}

chrome.runtime.onInstalled.addListener(schedule);
chrome.runtime.onStartup.addListener(schedule);
chrome.permissions.onAdded.addListener(schedule);
chrome.permissions.onRemoved.addListener(schedule);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && TIMING_KEYS.some((k) => k in changes)) schedule();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM) return;
  await flyOnActiveTab(false);
  await schedule();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "CU_FLY_NOW") {
    flyOnActiveTab(true).then(sendResponse);
    return true;
  }
});
