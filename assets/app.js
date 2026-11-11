/* Flapjack Recipe — shared behaviour
   Timers (multiple, named, persistent), serving scaler, FAQ accordion,
   cook mode with wake lock, print, header timer pill, mailto contact form.
   No analytics, no marketing cookies, no tracking. */
(function () {
  "use strict";
  var SITE_EMAIL = "flapjackrecipe@gmail.com"; // contact inbox (set up at launch)

  /* ---------- FAQ accordion ---------- */
  document.querySelectorAll(".faq-btn").forEach(function (btn) {
    btn.setAttribute("aria-expanded", "false");
    btn.addEventListener("click", function () {
      var panel = btn.parentElement.nextElementSibling;
      var open = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", String(!open));
      if (panel && panel.classList.contains("faq-panel")) {
        panel.classList.toggle("open", !open);
      }
    });
  });

  /* ---------- Reveal on scroll ---------- */
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, { threshold: 0.08 });
    document.querySelectorAll(".reveal").forEach(function (el) { io.observe(el); });
  } else {
    document.querySelectorAll(".reveal").forEach(function (el) { el.classList.add("in"); });
  }

  /* ---------- Serving scaler ---------- */
  function fmt(val, base) {
    if (base >= 20) return String(Math.round(val / 5) * 5);
    var r = Math.round(val * 2) / 2;
    return (r % 1 === 0) ? String(r) : String(r);
  }
  document.querySelectorAll(".recipe-card").forEach(function (card) {
    var btns = card.querySelectorAll(".scaler button[data-scale]");
    if (!btns.length) return;
    btns.forEach(function (b) {
      b.addEventListener("click", function () {
        var scale = parseFloat(b.getAttribute("data-scale"));
        btns.forEach(function (x) { x.setAttribute("aria-pressed", "false"); });
        b.setAttribute("aria-pressed", "true");
        card.querySelectorAll(".amt").forEach(function (el) {
          var base = parseFloat(el.getAttribute("data-amt"));
          if (!isNaN(base)) el.textContent = fmt(base * scale, base);
        });
      });
    });
  });

  /* ---------- Timers: the cottage-pattern tool, for these recipes ---------- */
  var LS_KEY = "fr-timers";
  var timers = [];
  try { timers = JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch (e) { timers = []; }
  (function () {
    var now0 = Date.now();
    timers = timers.filter(function (t) { return !t.done || (!t.ack && now0 - (t.doneAt || 0) < 86400000); });
    timers.forEach(function (t) { if (!t.total) t.total = t.remain || 1; });
  })();
  var dock = document.getElementById("dock");
  var audioCtx = null, soundOn = false, ringing = false, ringTimer = null;

  function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(timers)); } catch (e) {} }
  function beep() {
    if (!soundOn) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume();
      var t = audioCtx.currentTime;
      [0, 0.35, 0.7].forEach(function (off) {
        var o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.connect(g); g.connect(audioCtx.destination);
        o.frequency.value = 880; g.gain.setValueAtTime(0.22, t + off);
        g.gain.exponentialRampToValueAtTime(0.001, t + off + 0.3);
        o.start(t + off); o.stop(t + off + 0.32);
      });
    } catch (e) {}
  }
  function fmtTime(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    var mm = (h > 0 && m < 10) ? "0" + m : String(m);
    var sss = ss < 10 ? "0" + ss : String(ss);
    return (h > 0 ? h + ":" : "") + mm + ":" + sss;
  }
  function remainOf(t, now) { return t.done ? 0 : (t.running ? t.endAt - now : t.remain); }
  function soonest(now) {
    var best = null;
    timers.forEach(function (t) {
      if (t.done) return;
      var r = remainOf(t, now);
      if (best === null || r < best.r) best = { t: t, r: r };
    });
    return best;
  }
  function syncAlarmButtons() {
    document.querySelectorAll("[data-stop-alarm]").forEach(function (b) {
      b.style.display = ringing ? "" : "none";
    });
  }
  function startRinging() {
    if (ringing) return;
    ringing = true;
    beep();
    ringTimer = setInterval(beep, 2500);
    syncAlarmButtons();
  }
  function stopRinging() {
    ringing = false;
    if (ringTimer) { clearInterval(ringTimer); ringTimer = null; }
    syncAlarmButtons();
  }
  function mkBtn(label, cls, fn) {
    var b = document.createElement("button");
    b.type = "button"; b.className = cls; b.textContent = label;
    b.addEventListener("click", fn);
    return b;
  }
  function itemFor(t, i, now) {
    var item = document.createElement("div");
    item.className = "timer-item" + (t.done ? " done" : "");
    item.setAttribute("data-idx", String(i));
    var row = document.createElement("div"); row.className = "row";
    var left = document.createElement("div");
    var nm = document.createElement("div"); nm.style.fontWeight = "700"; nm.textContent = t.name;
    var tm = document.createElement("div"); tm.className = "bigtime";
    tm.style.fontFamily = "var(--font-display)"; tm.style.fontSize = "1.4rem";
    tm.textContent = t.done ? "Time's up!" : fmtTime(remainOf(t, now));
    left.appendChild(nm); left.appendChild(tm); row.appendChild(left);
    var ctr = document.createElement("div"); ctr.className = "tcontrols";
    if (!t.done) {
      ctr.appendChild(mkBtn(t.running ? "Pause" : "Resume", "tbtn alt", function () {
        if (t.running) { t.remain = Math.max(0, t.endAt - Date.now()); t.running = false; }
        else { t.endAt = Date.now() + t.remain; if ((t.total || 0) < t.remain) t.total = t.remain; t.running = true; }
        save(); render();
      }));
      ctr.appendChild(mkBtn("+1 min", "tbtn alt", function () {
        if (t.running) { t.endAt += 60000; } else { t.remain += 60000; }
        t.total = (t.total || 0) + 60000; save(); render();
      }));
      ctr.appendChild(mkBtn("Cancel", "tbtn alt", function () { timers.splice(i, 1); save(); render(); }));
    } else {
      ctr.appendChild(mkBtn("OK", "tbtn", function () {
        timers.splice(i, 1);
        if (!timers.some(function (x) { return x.done; })) stopRinging();
        save(); render();
      }));
    }
    row.appendChild(ctr); item.appendChild(row);
    return item;
  }
  function render() {
    var now = Date.now();
    document.querySelectorAll("[data-timer-list]").forEach(function (list) {
      list.innerHTML = "";
      if (!timers.length) {
        if (list.closest(".timer-panel")) {
          var p = document.createElement("p");
          p.style.margin = "0";
          p.textContent = "No timers yet. Set a label and time above, then choose \u201CAdd & Start\u201D.";
          list.appendChild(p);
        }
        return;
      }
      timers.forEach(function (t, i) { list.appendChild(itemFor(t, i, now)); });
    });
    tickFaces(now);
  }
  function tickFaces(now) {
    var s = soonest(now);
    var anyDone = timers.some(function (t) { return t.done; });
    document.querySelectorAll("[data-ring]").forEach(function (fg) {
      var C = 326.7;
      if (anyDone || !s) fg.style.strokeDashoffset = "0";
      else {
        var f = Math.max(0, Math.min(1, s.r / (s.t.total || s.r || 1)));
        fg.style.strokeDashoffset = String(C * (1 - f));
      }
    });
    document.querySelectorAll("[data-ring-time]").forEach(function (el) {
      el.textContent = anyDone ? "0:00" : (s ? fmtTime(s.r) : "00:00");
    });
    var pillStatus = document.getElementById("headTimerStatus");
    if (pillStatus) pillStatus.textContent = anyDone ? "a timer has finished" : (s ? fmtTime(s.r) + " left" : "none running");
    var sum = document.getElementById("dockSummary");
    if (sum) sum.textContent = anyDone ? "Time's up!" : (s ? fmtTime(s.r) + " remaining" : "No timer running");
    document.querySelectorAll(".timer-item .bigtime").forEach(function (el) {
      var item = el.closest(".timer-item");
      if (!item) return;
      var t = timers[parseInt(item.getAttribute("data-idx"), 10)];
      if (t) el.textContent = t.done ? "Time's up!" : fmtTime(remainOf(t, now));
    });
  }
  setInterval(function () {
    var now = Date.now(), changed = false;
    timers.forEach(function (t) {
      if (t.running && !t.done && t.endAt <= now) { t.done = true; t.doneAt = now; t.running = false; changed = true; }
    });
    if (changed) {
      save();
      if (timers.some(function (t) { return t.done; })) startRinging();
      render();
    } else if (timers.length) {
      tickFaces(now);
    }
  }, 500);

  /* Panel creator controls (the dock panel has none — it only mirrors) */
  document.querySelectorAll("[data-timer-panel]").forEach(function (panel) {
    var nameEl = panel.querySelector("[data-tname]");
    if (!nameEl) return;
    var hEl = panel.querySelector("[data-th]"), mEl = panel.querySelector("[data-tm]"), sEl = panel.querySelector("[data-ts]");
    var status = panel.querySelector("[data-sound-status]");
    function soundReady(note) {
      try {
        audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === "suspended") audioCtx.resume();
      } catch (e) {}
      soundOn = true;
      if (status && note) status.textContent = note;
    }
    panel.querySelectorAll("[data-preset]").forEach(function (b) {
      b.addEventListener("click", function () {
        var sec = parseInt(b.getAttribute("data-preset"), 10) || 0;
        hEl.value = Math.floor(sec / 3600);
        mEl.value = Math.floor((sec % 3600) / 60);
        sEl.value = sec % 60;
      });
    });
    panel.querySelector("[data-enable-sound]").addEventListener("click", function () {
      soundReady("Sound is on. The alarm will ring here while this page stays open.");
    });
    panel.querySelector("[data-test-alarm]").addEventListener("click", function () {
      soundReady("Sound is on. The alarm will ring here while this page stays open.");
      beep();
    });
    panel.querySelector("[data-stop-alarm]").addEventListener("click", function () {
      timers = timers.filter(function (t) { return !t.done; });
      stopRinging(); save(); render();
    });
    panel.querySelector("[data-add-timer]").addEventListener("click", function () {
      var secs = (parseInt(hEl.value, 10) || 0) * 3600 + (parseInt(mEl.value, 10) || 0) * 60 + (parseInt(sEl.value, 10) || 0);
      if (secs <= 0) { mEl.focus(); return; }
      var name = (nameEl.value || "").trim() || "Timer";
      timers.push({ name: name, endAt: Date.now() + secs * 1000, remain: secs * 1000, total: secs * 1000, running: true, done: false, doneAt: 0, ack: false });
      save(); render();
    });
  });

  /* Step timers feed the same tool */
  document.querySelectorAll(".step-timer").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var mins = parseFloat(btn.getAttribute("data-minutes"));
      if (isNaN(mins)) return;
      var step = btn.closest("li");
      var titleEl = step ? (step.querySelector("strong") || step.querySelector("h4")) : null;
      var title = titleEl ? titleEl.textContent : "Timer";
      timers.push({ name: title.trim(), endAt: Date.now() + mins * 60000, remain: mins * 60000, total: mins * 60000, running: true, done: false, doneAt: 0, ack: false });
      save(); render();
      if (dock) dock.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  });

  /* Dock open/close + header pill */
  var dockHead = document.getElementById("dockHead");
  if (dockHead && dock) {
    dockHead.addEventListener("click", function () {
      var open = dock.classList.toggle("open");
      dockHead.setAttribute("aria-expanded", String(open));
      var ch = document.getElementById("dockChev");
      if (ch) ch.textContent = open ? "\u25BC Close" : "\u25B2 Open";
    });
  }
  var pillBtn = document.getElementById("headTimerBtn");
  if (pillBtn && dock) {
    pillBtn.addEventListener("click", function () {
      if (!dock.classList.contains("open") && dockHead) dockHead.click();
      dock.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }
  render();

  /* ---------- Cook mode (wake lock) ---------- */
  var wakeLock = null;
  document.querySelectorAll(".cook-mode-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var on = document.body.classList.toggle("cook-mode");
      btn.setAttribute("aria-pressed", String(on));
      btn.textContent = on ? "Cooking Mode On" : "Cooking Mode";
      if (on && "wakeLock" in navigator) {
        navigator.wakeLock.request("screen").then(function (wl) { wakeLock = wl; }).catch(function () {});
      } else if (!on && wakeLock) { wakeLock.release(); wakeLock = null; }
    });
  });

  /* ---------- Recipe-only view ---------- */
  document.querySelectorAll(".recipe-only-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var on = document.body.classList.toggle("recipe-only");
      btn.setAttribute("aria-pressed", String(on));
      btn.textContent = on ? "Full View" : "Recipe-Only View";
      if (on) {
        var card = document.querySelector(".recipe-card");
        if (card) card.scrollIntoView({ block: "start" });
      }
    });
  });

  /* ---------- Keep screen awake (standalone toggle) ---------- */
  var wakeLock2 = null;
  document.querySelectorAll(".wake-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var on = btn.getAttribute("aria-pressed") !== "true";
      btn.setAttribute("aria-pressed", String(on));
      btn.textContent = on ? "Screen Awake: On" : "Keep Screen Awake";
      if (on && "wakeLock" in navigator) {
        navigator.wakeLock.request("screen").then(function (wl) { wakeLock2 = wl; }).catch(function () {});
      } else if (!on && wakeLock2) { wakeLock2.release(); wakeLock2 = null; }
    });
  });

  /* ---------- Hero timer button: go to the recipe's timers ---------- */
  document.querySelectorAll(".hero-timer-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var r = document.querySelector("#timer-panel") || document.querySelector("#recipe");
      if (r) r.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  /* ---------- Header More dropdown (touch/click) ---------- */
  document.querySelectorAll(".drop-btn").forEach(function (btn) {
    btn.addEventListener("click", function (ev) {
      ev.stopPropagation();
      var li = btn.closest(".has-drop");
      var open = li.classList.toggle("open");
      btn.setAttribute("aria-expanded", String(open));
    });
  });
  document.addEventListener("click", function () {
    document.querySelectorAll(".has-drop.open").forEach(function (li) {
      li.classList.remove("open");
      var b = li.querySelector(".drop-btn");
      if (b) b.setAttribute("aria-expanded", "false");
    });
  });

  /* ---------- Print ---------- */
  document.querySelectorAll(".print-btn").forEach(function (btn) {
    btn.addEventListener("click", function () { window.print(); });
  });

  /* ---------- Mobile menu ---------- */
  var menuBtn = document.querySelector(".menu-btn");
  var mainNav = document.getElementById("main-nav");
  if (menuBtn && mainNav) {
    menuBtn.addEventListener("click", function () {
      var open = mainNav.classList.toggle("open");
      menuBtn.setAttribute("aria-expanded", String(open));
    });
  }

  /* ---------- Contact form: prepares an email in the visitor's own app ---------- */
  var form = document.querySelector(".contact-form");
  if (form) {
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var name = (form.querySelector('[name="name"]') || {}).value || "";
      var email = (form.querySelector('[name="email"]') || {}).value || "";
      var type = (form.querySelector('[name="type"]') || {}).value || "General";
      var page = (form.querySelector('[name="page"]') || {}).value || "";
      var msg = (form.querySelector('[name="message"]') || {}).value || "";
      var subject = encodeURIComponent("Website enquiry: " + type);
      var body = encodeURIComponent("Name: " + name + "\nEmail: " + email + (page ? "\nPage: " + page : "") + "\n\n" + msg);
      window.location.href = "mailto:" + SITE_EMAIL + "?subject=" + subject + "&body=" + body;
      var note = form.querySelector(".form-note");
      if (note) note.hidden = false;
    });
  }
})();

