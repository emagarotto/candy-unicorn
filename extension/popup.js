const D = self.CU_DEFAULTS;
const $ = (id) => document.getElementById(id);
let settings = { ...D };
let currentHost = "";
let allSites = false;
const ALL_SITES = { origins: ["<all_urls>"] };

function save(patch) {
  settings = { ...settings, ...patch };
  chrome.storage.sync.set(patch);
  render();
}

// Speed slider runs slow-to-fast left-to-right; stored value is seconds.
const SPEED_MIN = 3, SPEED_MAX = 14;
const toUi = (sec) => SPEED_MIN + SPEED_MAX - sec;
const fromUi = (v) => SPEED_MIN + SPEED_MAX - v;

function render() {
  const s = settings;
  $("enabled").checked = s.enabled;
  $("settings").classList.toggle("off", !s.enabled);

  document.querySelectorAll(".segmented button").forEach((b) => {
    b.setAttribute("aria-checked", String(b.dataset.mode === s.frequencyMode));
  });
  $("randomRow").hidden = s.frequencyMode !== "random";
  $("randomRow").textContent = `Any time between ${s.randomMin} and ${s.randomMax} minutes`;
  $("fixedRow").hidden = s.frequencyMode !== "fixed";
  $("everyMinutes").value = s.everyMinutes;
  $("everyLabel").textContent = s.everyMinutes === 1 ? "1 min" : `${s.everyMinutes} min`;

  $("size").value = s.size;
  $("sizeLabel").textContent = `${s.size} px`;
  $("speedUi").value = toUi(s.speed);
  $("speedLabel").textContent = `${s.speed} sec across`;
  $("trail").checked = s.trail;

  $("fireworks").checked = s.fireworks;
  $("countRow").hidden = !s.fireworks;
  $("fireworkCount").value = s.fireworkCount;
  $("countLabel").textContent = s.fireworkCount;

  const list = $("siteList");
  list.textContent = "";
  s.excluded.forEach((host) => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = host;
    const x = document.createElement("button");
    x.type = "button";
    x.textContent = "×";
    x.title = `Allow on ${host}`;
    x.addEventListener("click", () => save({ excluded: settings.excluded.filter((h) => h !== host) }));
    chip.append(x);
    list.append(chip);
  });
  const skip = $("skipThis");
  skip.disabled = !currentHost || s.excluded.includes(currentHost);
  skip.textContent = !currentHost ? "Skip this site" : s.excluded.includes(currentHost) ? `${currentHost} is skipped` : `Skip ${currentHost}`;

  $("permBox").hidden = allSites;
  $("revoke").hidden = !allSites;

  $("nextNote").textContent = !s.enabled
    ? "Turned off"
    : !allSites
      ? "Press Fly now for a show"
      : s.frequencyMode === "random"
      ? "Flies in at random"
      : `Flies in every ${s.everyMinutes} min`;
}

async function init() {
  settings = await chrome.storage.sync.get(D);
  allSites = await chrome.permissions.contains(ALL_SITES);
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && /^https?:/.test(tab.url)) currentHost = new URL(tab.url).hostname.replace(/^www\./, "");
  } catch (e) { /* no host for this tab */ }
  render();

  $("enabled").addEventListener("change", (e) => save({ enabled: e.target.checked }));
  document.querySelectorAll(".segmented button").forEach((b) =>
    b.addEventListener("click", () => save({ frequencyMode: b.dataset.mode }))
  );
  // Live label updates while dragging; save once on release.
  const slider = (id, key, map = Number) => {
    const el = $(id);
    el.addEventListener("input", () => { settings[key] = map(Number(el.value)); render(); });
    el.addEventListener("change", () => save({ [key]: map(Number(el.value)) }));
  };
  slider("everyMinutes", "everyMinutes");
  slider("size", "size");
  slider("speedUi", "speed", fromUi);
  slider("fireworkCount", "fireworkCount");
  $("trail").addEventListener("change", (e) => save({ trail: e.target.checked }));
  $("fireworks").addEventListener("change", (e) => save({ fireworks: e.target.checked }));
  $("skipThis").addEventListener("click", () => {
    if (currentHost && !settings.excluded.includes(currentHost)) save({ excluded: [...settings.excluded, currentHost] });
  });

  // Chrome shows its own prompt. The request must run inside this click.
  $("allowAll").addEventListener("click", async () => {
    allSites = await chrome.permissions.request(ALL_SITES);
    render();
  });
  $("revoke").addEventListener("click", async () => {
    if (await chrome.permissions.remove(ALL_SITES)) allSites = false;
    render();
  });

  $("flyNow").addEventListener("click", async () => {
    $("status").textContent = "";
    const res = await chrome.runtime.sendMessage({ type: "CU_FLY_NOW" });
    if (res && res.ok) {
      window.close();
    } else {
      $("status").textContent = "Chrome blocks extensions on this page. Try a regular website.";
    }
  });
}

init();
