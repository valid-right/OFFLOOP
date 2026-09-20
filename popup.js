const SITES = { instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube", x: "X", reddit: "Reddit", facebook: "Facebook" };
const DEFAULTS = { threshold: 600, sites: { instagram: true, tiktok: true, youtube: true, x: true, reddit: true, facebook: true } };
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const $ = id => document.getElementById(id);

const dayKeyOf = t => {
  const d = new Date(t);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
};

let settings = JSON.parse(JSON.stringify(DEFAULTS));

function saveSettings() { chrome.storage.local.set({ settings }); }

/* a ring of dots: one dot for each break you completed (up to 30), no decay */
function drawRing(completed) {
  const total = 30, r = 46, cx = 60, cy = 60;
  let out = "";
  for (let i = 0; i < total; i++) {
    const a = (i / total) * Math.PI * 2 - Math.PI / 2;
    const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
    const on = i < Math.min(completed, total);
    out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="${on ? "#7fd6cf" : "none"}" stroke="#7fd6cf" stroke-width="1.5" opacity="${on ? 1 : 0.45}"/>`;
  }
  out += `<text x="60" y="66" text-anchor="middle" font-size="22" font-weight="700" fill="#eef0fc">${completed}</text>`;
  $("ring").innerHTML = out;
}

function render(stats) {
  const days = (stats && stats.days) || {};
  const now = Date.now();
  let int = 0, done = 0, sec = 0, totalDone = 0;
  Object.keys(days).forEach(k => { totalDone += days[k].completed || 0; });
  const per = [];
  for (let i = 6; i >= 0; i--) {
    const t = now - i * 86400000, d = days[dayKeyOf(t)] || {};
    int += d.interruptions || 0; done += d.completed || 0; sec += d.secondsAway || 0;
    per.push({ label: WEEKDAYS[new Date(t).getDay()], n: d.interruptions || 0 });
  }
  $("n-int").textContent = int;
  $("n-done").textContent = done;
  $("n-min").textContent = Math.round(sec / 60);
  drawRing(totalDone);
  $("ringlabel").textContent = totalDone === 1 ? "1 break completed so far" : totalDone + " breaks completed so far";
  const max = Math.max(1, ...per.map(p => p.n));
  $("bars").innerHTML = per.map(p => `<div><i style="height:${Math.round((p.n / max) * 44)}px"></i>${p.label}</div>`).join("");
}

function buildSites() {
  $("sites").innerHTML = Object.keys(SITES).map(k =>
    `<label><input type="checkbox" data-k="${k}" ${settings.sites[k] !== false ? "checked" : ""}>${SITES[k]}</label>`).join("");
  $("sites").querySelectorAll("input").forEach(el => {
    el.onchange = () => { settings.sites[el.dataset.k] = el.checked; saveSettings(); };
  });
}

chrome.storage.local.get(["settings", "stats"], r => {
  if (r.settings) settings = { threshold: r.settings.threshold || 600, sites: Object.assign({}, DEFAULTS.sites, r.settings.sites || {}) };
  $("threshold").value = String(settings.threshold);
  if ($("threshold").value !== String(settings.threshold)) $("threshold").value = "600";
  buildSites();
  render(r.stats);
});

$("threshold").onchange = e => { settings.threshold = Number(e.target.value); saveSettings(); };

document.querySelectorAll(".preview button").forEach(b => {
  b.onclick = () => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (!tabs[0]) return;
      chrome.tabs.sendMessage(tabs[0].id, { type: "preview", level: Number(b.dataset.l) }, () => {
        if (chrome.runtime.lastError) $("previewnote").textContent = "Open Instagram, YouTube, TikTok, X, Reddit or Facebook in this tab first, then refresh it.";
        else window.close();
      });
    });
  };
});
