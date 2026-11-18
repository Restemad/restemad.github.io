/* RESTEMAD – ekstra funktioner: mørkt tema, del-knap, dagens opskrift, quiz, "om os" */
(function () {
  "use strict";
  var SITE = window.SITE || {}, RECIPES = window.RECIPES || [], QUIZ = window.QUIZ || [];
  var UI = window.RESTEMAD_UI || {};

  function $(s, el) { return (el || document).querySelector(s); }
  function esc(t) { return String(t).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  /* ---------- Mørkt tema ---------- */
  var root = document.documentElement;
  var themeBtn = $("#themeBtn");
  function applyTheme(t) {
    root.setAttribute("data-theme", t);
    if (themeBtn) {
      themeBtn.textContent = t === "dark" ? "☀️" : "🌙";
      themeBtn.setAttribute("aria-label", t === "dark" ? "Skift til lyst tema" : "Skift til mørkt tema");
    }
    var m = $('meta[name="theme-color"]'); if (m) m.setAttribute("content", t === "dark" ? "#111C16" : "#234B36");
  }
  applyTheme(root.getAttribute("data-theme") === "dark" ? "dark" : "light");
  if (themeBtn) themeBtn.addEventListener("click", function () {
    var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(next);
    try { localStorage.setItem("restemad-tema", next); } catch (e) { /* ingen lagring tilladt */ }
  });

  /* ---------- Besked (toast) ---------- */
  var toastEl = $("#toast"), toastTimer;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg; toastEl.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { toastEl.classList.remove("show"); }, 2600);
  }

  /* ---------- Del-knap ---------- */
  function copyText(text) {
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;opacity:0;top:0;left:0";
      document.body.appendChild(ta); ta.select();
      var ok = false; try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      toast(ok ? "Link kopieret ✓" : "Kopiér linket i adressefeltet");
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast("Link kopieret ✓"); }, fallback);
    } else fallback();
  }
  function share(kind, customText) {
    var url = location.href, title = "RESTEMAD – Mad fortjener en chance til", text = "Tjek RESTEMAD: opskrifter mod madspild.";
    if (kind === "recipe") { title = document.title; text = "Se den her opskrift mod madspild på RESTEMAD."; }
    else if (kind === "quiz" && customText) { text = customText; url = location.href.split("#")[0] + "#/s/quiz"; }
    else if (kind === "site") { url = location.href.split("#")[0]; }
    if (navigator.share) {
      navigator.share({ title: title, text: text, url: url }).catch(function (err) { if (!err || err.name !== "AbortError") copyText(url); });
    } else copyText(url);
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-share]"); if (!b) return;
    share(b.getAttribute("data-share"), b.getAttribute("data-share-text"));
  });

  /* ---------- Dagens opskrift og "Overrask mig" ---------- */
  function dailyIndex() {
    var d = new Date();
    return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000) % RECIPES.length;
  }
  var box = $("#dailyBox");
  if (box && RECIPES.length && UI.art && UI.catById) {
    var r = RECIPES[dailyIndex()], c = UI.catById(r.cat);
    box.innerHTML = UI.art(r.emoji, c.c1, c.c2, "", r.cat) +
      '<div class="daily-body"><span class="tag">' + esc(c.name) + "</span><h3>" + esc(r.title) + "</h3><p>" + esc(r.intro) + "</p>" +
      '<div class="rc-meta"><span>⏱ ' + esc(r.time) + "</span><span>👥 " + r.servings + " pers.</span><span>⭐ " + esc(r.level) + "</span></div>" +
      '<a class="btn btn-primary" href="#/opskrift/' + r.id + '">Se opskrift</a></div>';
  }
  var rnd = $("#randomBtn");
  if (rnd) rnd.addEventListener("click", function () {
    if (RECIPES.length) location.hash = "#/opskrift/" + RECIPES[Math.floor(Math.random() * RECIPES.length)].id;
  });

  /* ---------- Om os: skole og navne fra config.js ---------- */
  var made = $("#madeBy");
  if (made) {
    var h = '<p class="made-school">🏫 Et skoleprojekt fra <b>' + esc(SITE.school || "vores skole") + "</b>" + (SITE.year ? " · " + esc(SITE.year) : "") + "</p>";
    if (SITE.className) h += '<p class="made-class">Klasse: ' + esc(SITE.className) + "</p>";
    if (SITE.authors && SITE.authors.length) {
      h += '<p class="made-label">Lavet af</p><div class="names">' + SITE.authors.map(function (n) { return "<span>" + esc(n) + "</span>"; }).join("") + "</div>";
    }
    made.innerHTML = h;
  }
  var fs = $("#footerSchool");
  if (fs) fs.textContent = "Skoleprojekt fra " + (SITE.school || "vores skole") + (SITE.year ? " · " + SITE.year : "") + " · Opskrifter er til inspiration";

  /* ---------- Quiz ---------- */
  var qbox = $("#quizBox");
  var qi = 0, score = 0;
  function renderQuestion() {
    var q = QUIZ[qi], pct = Math.round(qi / QUIZ.length * 100);
    qbox.innerHTML =
      '<div class="quiz-top"><span>Spørgsmål ' + (qi + 1) + " af " + QUIZ.length + "</span><span>⭐ " + score + " point</span></div>" +
      '<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><i style="width:' + pct + '%"></i></div>' +
      '<h3 class="q">' + esc(q.q) + '</h3><div class="opts">' +
      q.o.map(function (t, i) { return '<button type="button" class="opt" data-i="' + i + '">' + esc(t) + "</button>"; }).join("") +
      '</div><div class="feedback" id="qFeedback" hidden></div>' +
      '<button type="button" class="btn btn-primary next" id="qNext" hidden>' + (qi === QUIZ.length - 1 ? "Se resultat" : "Næste spørgsmål →") + "</button>";
  }
  function renderResult() {
    var n = QUIZ.length, emoji, title, text;
    if (score >= n - 1) { emoji = "🏆"; title = "Madspild-mester!"; text = "Wow, du kan næsten det hele. Del quizzen med en ven, og se om de kan slå dig."; }
    else if (score >= Math.ceil(n * 0.6)) { emoji = "🌟"; title = "Rigtig godt gået!"; text = "Du ved allerede meget om at undgå madspild. Prøv opskrifterne for at lære endnu mere."; }
    else { emoji = "🌱"; title = "Godt begyndt!"; text = "Du har lært noget nyt. Læs tipsene og prøv quizzen igen."; }
    qbox.innerHTML =
      '<div class="quiz-result"><div class="big-emoji" aria-hidden="true">' + emoji + "</div><h3>" + title + "</h3>" +
      '<p class="score-line">Du fik <b>' + score + "</b> ud af <b>" + n + "</b> rigtige</p><p>" + text + "</p>" +
      '<div class="btn-row" style="justify-content:center"><button type="button" class="btn btn-primary" id="qAgain">Prøv igen</button>' +
      '<button type="button" class="btn btn-ghost" data-share="quiz" data-share-text="Jeg fik ' + score + " ud af " + n + ' i RESTEMADs madspild-quiz. Hvor mange får du?">↗ Del resultat</button>' +
      '<a class="btn btn-ghost" href="#/s/opskrifter">Find opskrifter</a></div></div>';
  }
  if (qbox && QUIZ.length) {
    renderQuestion();
    qbox.addEventListener("click", function (e) {
      var opt = e.target.closest(".opt");
      if (opt && !opt.disabled) {
        var q = QUIZ[qi], pick = +opt.getAttribute("data-i"), ok = pick === q.a;
        if (ok) score++;
        var all = qbox.querySelectorAll(".opt");
        for (var i = 0; i < all.length; i++) {
          all[i].disabled = true;
          if (i === q.a) all[i].classList.add("ok"); else if (i === pick) all[i].classList.add("bad");
        }
        var fb = $("#qFeedback");
        fb.innerHTML = "<b>" + (ok ? "✅ Rigtigt!" : "❌ Ikke helt.") + "</b> " + esc(q.e);
        fb.hidden = false;
        var nx = $("#qNext"); nx.hidden = false; nx.focus();
        return;
      }
      if (e.target.closest("#qNext")) { qi++; if (qi < QUIZ.length) renderQuestion(); else renderResult(); return; }
      if (e.target.closest("#qAgain")) { qi = 0; score = 0; renderQuestion(); }
    });
  }
})();
