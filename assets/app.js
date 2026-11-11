/* Flapjack Recipe — shared behaviour
   Timers (multiple, named, persistent), serving scaler, FAQ accordion,
   cook mode with wake lock, print, cookie choices, mailto contact form.
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

  /* ---------- Timers ---------- */
  var LS_KEY = "fr-timers";
  var timers = [];
  try { timers = JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch (e) { timers = []; }
  var dock = document.querySelector(".timer-dock");
  var audioCtx = null;

  function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(timers)); } catch (e) {} }
  function beep() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
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
  function render() {
    if (!dock) return;
    var now = Date.now();
    timers = timers.filter(function (t) { return !t.done || now - t.doneAt < 60000; });
    if (!timers.length) { dock.classList.remove("show"); dock.innerHTML = ""; return; }
    dock.classList.add("show");
    dock.innerHTML = "";
    timers.forEach(function (t, i) {
      var row = document.createElement("div");
      var remain = t.running ? t.endAt - now : t.remain;
      var name = document.createElement("div"); name.className = "t-name"; name.textContent = t.name;
      var time = document.createElement("div"); time.className = "t-time";
      time.textContent = t.done ? "Time's up!" : fmtTime(remain);
      row.appendChild(name); row.appendChild(time);
      if (!t.done) {
        var toggle = document.createElement("button");
        toggle.textContent = t.running ? "Pause" : "Resume";
        toggle.addEventListener("click", function () {
          if (t.running) { t.remain = Math.max(0, t.endAt - Date.now()); t.running = false; }
          else { t.endAt = Date.now() + t.remain; t.running = true; }
          save(); render();
        });
        var cancel = document.createElement("button");
        cancel.className = "alt"; cancel.textContent = "Cancel";
        cancel.addEventListener("click", function () { timers.splice(i, 1); save(); render(); });
        row.appendChild(toggle); row.appendChild(cancel);
      } else {
        var ok = document.createElement("button"); ok.textContent = "OK";
        ok.addEventListener("click", function () { timers.splice(i, 1); save(); render(); });
        row.appendChild(ok);
      }
      dock.appendChild(row);
    });
  }
  setInterval(function () {
    var now = Date.now(), changed = false;
    timers.forEach(function (t) {
      if (t.running && !t.done && t.endAt <= now) { t.done = true; t.doneAt = now; t.running = false; beep(); changed = true; }
    });
    if (timers.length) render();
    if (changed) save();
  }, 500);
  document.querySelectorAll(".step-timer").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var mins = parseFloat(btn.getAttribute("data-minutes"));
      if (isNaN(mins)) return;
      var step = btn.closest("li");
      var titleEl = step ? (step.querySelector("strong") || step.querySelector("h4")) : null;
      var title = titleEl ? titleEl.textContent : "Timer";
      timers.push({ name: title.trim(), endAt: Date.now() + mins * 60000, remain: mins * 60000, running: true, done: false, doneAt: 0 });
      save(); render();
      if (dock) dock.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  });
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
      var r = document.querySelector("#recipe");
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

  /* ---------- Cookie choices (this site sets no tracking cookies) ---------- */
  var bar = document.querySelector(".cookie-bar");
  if (bar) {
    var choice = null;
    try { choice = localStorage.getItem("fr-cookie-choice"); } catch (e) {}
    if (!choice) bar.classList.add("show");
    bar.querySelectorAll("button[data-choice]").forEach(function (b) {
      b.addEventListener("click", function () {
        try { localStorage.setItem("fr-cookie-choice", b.getAttribute("data-choice")); } catch (e) {}
        bar.classList.remove("show");
      });
    });
  }
  var reset = document.querySelector(".cookie-reset");
  if (reset) {
    reset.addEventListener("click", function () {
      try { localStorage.removeItem("fr-cookie-choice"); } catch (e) {}
      if (bar) bar.classList.add("show");
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

