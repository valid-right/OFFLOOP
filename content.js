/* OFFLOOP content script
   Runs on the social sites listed in manifest.json.
   1. Counts how long you have been actively scrolling (wheel, touch, scroll, keys).
   2. When the limit is reached, shows a calm overlay that asks you to look away.
   3. Escalates if you keep coming back: gentle -> direct -> quiet screen.
   4. Saves simple counts (never page content) so the popup can show time given back.
   Nothing leaves your browser. */
(() => {
  if (window.__offloop) return;
  window.__offloop = true;

  const SITE_KEYS = {
    "instagram.com": "instagram", "tiktok.com": "tiktok", "youtube.com": "youtube",
    "x.com": "x", "twitter.com": "x", "reddit.com": "reddit", "facebook.com": "facebook"
  };
  const DEFAULTS = {
    threshold: 600, // seconds of active scrolling before the first interruption
    sites: { instagram: true, tiktok: true, youtube: true, x: true, reddit: true, facebook: true }
  };

  const host = location.hostname;
  const domain = Object.keys(SITE_KEYS).find(d => host === d || host.endsWith("." + d));
  const siteKey = domain ? SITE_KEYS[domain] : null;

  let settings = JSON.parse(JSON.stringify(DEFAULTS));
  let lastInput = 0;      // time of the last scroll-like action
  let active = 0;         // seconds of continuous scrolling in this session
  let snoozeUntil = 0;
  let isOpen = false;
  let root = null;
  let timer = null;
  let prevOverflow = "";

  /* ---------- settings + stats (chrome.storage, local only) ---------- */
  function mergeSettings(s) {
    settings = {
      threshold: (s && s.threshold) || DEFAULTS.threshold,
      sites: Object.assign({}, DEFAULTS.sites, (s && s.sites) || {})
    };
  }
  try {
    chrome.storage.local.get("settings", r => mergeSettings(r.settings));
    chrome.storage.onChanged.addListener(ch => { if (ch.settings) mergeSettings(ch.settings.newValue); });
  } catch (e) { /* extension was reloaded: this page needs a refresh */ }

  const dayKey = () => {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  };
  async function bump(field, n) {
    try {
      const { stats } = await chrome.storage.local.get("stats");
      const s = stats || { days: {} };
      const k = dayKey();
      const d = s.days[k] || (s.days[k] = { interruptions: 0, completed: 0, dismissed: 0, secondsAway: 0 });
      d[field] = (d[field] || 0) + (n || 1);
      await chrome.storage.local.set({ stats: s });
    } catch (e) { /* ignore */ }
  }
  /* how many interruptions in the last hour decides how firm this one is */
  async function nextLevel() {
    try {
      const { recent } = await chrome.storage.local.get("recent");
      const now = Date.now();
      const list = (recent || []).filter(t => now - t < 3600000);
      list.push(now);
      await chrome.storage.local.set({ recent: list });
      return Math.min(3, list.length);
    } catch (e) { return 1; }
  }

  /* ---------- detect scrolling ---------- */
  const mark = () => { lastInput = Date.now(); };
  window.addEventListener("wheel", mark, { passive: true, capture: true });
  window.addEventListener("touchmove", mark, { passive: true, capture: true });
  window.addEventListener("scroll", mark, { passive: true, capture: true });
  window.addEventListener("keydown", e => {
    if (["ArrowDown", "PageDown", " ", "j", "J", "ArrowUp", "PageUp"].includes(e.key)) mark();
  }, { capture: true });

  const enabled = () => siteKey && settings.sites[siteKey] !== false;

  setInterval(() => {
    if (isOpen || !enabled() || document.visibilityState !== "visible") return;
    const now = Date.now();
    if (now - lastInput < 4000) active++;          // scrolled in the last 4 seconds
    else if (now - lastInput > 30000) active = 0;  // a real pause: the session starts over
    if (active >= settings.threshold && now > snoozeUntil) trigger();
  }, 1000);

  async function trigger() {
    const level = await nextLevel();
    bump("interruptions");
    open(level);
  }

  /* ---------- the overlay (shadow DOM so the site's CSS cannot touch it) ---------- */
  const CSS = `
    :host { all: initial; }
    .wrap { position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center; padding: 24px;
      background: rgba(12, 14, 28, 0.94); color: #f2f4ff; font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
      animation: fade 0.35s ease; }
    @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
    .box { max-width: 440px; width: 100%; text-align: center; }
    .ring { width: 84px; height: 84px; margin: 0 auto 18px; color: #7fd6cf; }
    h1 { font-size: 1.7rem; line-height: 1.2; margin: 0 0 10px; font-weight: 700; letter-spacing: -0.01em; }
    p { color: #b9bedb; line-height: 1.5; margin: 0 0 18px; font-size: 1.05rem; }
    .task { font-size: 1.25rem; color: #f2f4ff; }
    button { font: inherit; border: 0; border-radius: 999px; padding: 12px 26px; margin: 5px; cursor: pointer; background: #f2f4ff; color: #12142a; font-weight: 600; }
    button.ghost { background: transparent; color: #a9afcf; border: 1.5px solid #3a4070; font-weight: 500; }
    button:disabled { opacity: 0.35; cursor: default; }
    .bar { height: 8px; border-radius: 99px; background: #2a2f57; overflow: hidden; margin: 6px auto 20px; max-width: 320px; }
    .bar i { display: block; height: 100%; width: 0; background: #7fd6cf; border-radius: 99px; transition: width 1s linear; }
    textarea { width: 100%; min-height: 70px; border-radius: 16px; border: 1.5px solid #3a4070; background: #1a1e3c; color: #f2f4ff; padding: 12px; font: inherit; margin-bottom: 14px; resize: none; }
    .big { font-size: 3rem; font-weight: 700; letter-spacing: 0.04em; margin: 8px 0 18px; }
    .small { font-size: 0.85rem; color: #8a90b4; }
  `;
  const RING = '<svg class="ring" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="17" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-dasharray="0 7.63"/><circle cx="24" cy="24" r="6" fill="currentColor" opacity="0.4"/></svg>';

  const TASKS = [
    { text: "Find something blue in the room and look at it.", s: 10 },
    { text: "Look out of a window. Find the farthest thing you can see.", s: 20 },
    { text: "Stand up, walk to the door and back.", s: 30 },
    { text: "Take five slow breaths. In through the nose, out through the mouth.", s: 30 },
    { text: "Drink some water.", s: 20 },
    { text: "Roll your shoulders and unclench your jaw.", s: 15 },
    { text: "Type the first thought in your head. Nobody will see it.", s: 15, input: true }
  ];
  const NIGHT_TASKS = [TASKS[3], TASKS[4], TASKS[1]]; // late at night: breathe, water, look away
  function pickTask() {
    const h = new Date().getHours();
    const list = (h >= 23 || h < 5) ? NIGHT_TASKS : TASKS;
    return list[Math.floor(Math.random() * list.length)];
  }

  function pauseVideos() { document.querySelectorAll("video").forEach(v => { try { v.pause(); } catch (e) {} }); }

  function open(level) {
    if (isOpen) return;
    isOpen = true;
    pauseVideos();
    prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    root = document.createElement("div");
    root.id = "offloop-root";
    const shadow = root.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>${CSS}</style><div class="wrap" role="dialog" aria-modal="true"><div class="box" id="box"></div></div>`;
    document.documentElement.appendChild(root);
    const box = shadow.getElementById("box");
    if (level === 1) gentle(box);
    else if (level === 2) taskScreen(box, true);
    else quiet(box);
  }

  function close() {
    clearInterval(timer);
    if (root) root.remove();
    root = null; isOpen = false;
    document.documentElement.style.overflow = prevOverflow;
    active = 0; lastInput = 0;
  }
  function snooze() {
    bump("dismissed");
    snoozeUntil = Date.now() + 5 * 60000;
    const keep = active; close(); active = keep;
  }
  function done(seconds, box) {
    bump("completed"); bump("secondsAway", seconds);
    box.innerHTML = `${RING}<h1>Cool. Go.</h1>`;
    setTimeout(close, 2000);
  }

  function gentle(box) {
    box.innerHTML = `${RING}<h1>You've been scrolling for a while.</h1>
      <p>Want to look away for a few seconds?</p>
      <button id="go">Look away</button><button class="ghost" id="later">5 more minutes</button>`;
    box.querySelector("#go").onclick = () => taskScreen(box, false);
    box.querySelector("#later").onclick = snooze;
  }

  function taskScreen(box, direct) {
    const t = pickTask();
    let left = t.s;
    box.innerHTML = `${RING}<h1>${direct ? "You're not really looking for anything anymore." : "Look away."}</h1>
      <p class="task">${t.text}</p>
      ${t.input ? '<textarea placeholder="Type it here"></textarea>' : ""}
      <div class="bar"><i id="fill"></i></div>
      <button id="done" disabled>Done</button>
      <div><button class="ghost" id="later">5 more minutes</button></div>`;
    const doneBtn = box.querySelector("#done"), fill = box.querySelector("#fill");
    box.querySelector("#later").onclick = snooze;
    requestAnimationFrame(() => { fill.style.transitionDuration = t.s + "s"; fill.style.width = "100%"; });
    timer = setInterval(() => {
      left--;
      if (left <= 0) { clearInterval(timer); doneBtn.disabled = false; doneBtn.textContent = "Done"; }
    }, 1000);
    doneBtn.onclick = () => done(t.s, box);
  }

  function quiet(box) {
    // a short countdown while testing (threshold under 30 s), two minutes for real
    let left = settings.threshold <= 30 ? 15 : 120;
    const total = left;
    const fmt = n => Math.floor(n / 60) + ":" + String(n % 60).padStart(2, "0");
    box.innerHTML = `${RING}<h1>Put the screen down.</h1>
      <p>I'll be here in ${total >= 60 ? total / 60 + " minutes" : total + " seconds"}.</p>
      <div class="big" id="clock">${fmt(left)}</div>
      <button id="back" disabled>I'm back</button>
      <div><button class="ghost" id="skip" style="visibility:hidden">Skip</button></div>`;
    const clock = box.querySelector("#clock"), back = box.querySelector("#back"), skip = box.querySelector("#skip");
    skip.onclick = snooze;
    let shown = 0;
    timer = setInterval(() => {
      left--; shown++;
      clock.textContent = fmt(Math.max(0, left));
      if (shown >= 10) skip.style.visibility = "visible";
      if (left <= 0) { clearInterval(timer); back.disabled = false; }
    }, 1000);
    back.onclick = () => done(total, box);
  }

  /* the popup's preview buttons use this to show each screen without waiting */
  try {
    chrome.runtime.onMessage.addListener(msg => {
      if (msg && msg.type === "preview" && !isOpen) open(msg.level || 1);
    });
  } catch (e) { /* ignore */ }
})();
