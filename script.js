/* RESTEMAD – funktionalitet */
(function () {
  "use strict";
  var CATS = window.CATEGORIES, RECIPES = window.RECIPES;
  var SMALL = {
    frugt: ["🍎", "🍇"], groentsager: ["🍅", "🥒"], broed: ["🥐", "🌾"],
    kod: ["🥓", "🧅"], mejeri: ["🧀", "🍓"], faerdigretter: ["🥬", "🍅"]
  };
  var FAV_KEY = "restemad-favoritter";
  var state = { q: "", cat: "alle" };

  function $(s, el) { return (el || document).querySelector(s); }
  function $$(s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); }
  function esc(t) { return String(t).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function catById(id) { return CATS.filter(function (c) { return c.id === id; })[0]; }
  function recipeById(id) { return RECIPES.filter(function (r) { return r.id === id; })[0]; }
  function norm(s) { return String(s).toLowerCase(); }

  /* ---------- Favoritter (gemmes i browseren) ---------- */
  var favs = [];
  try { favs = JSON.parse(localStorage.getItem(FAV_KEY) || "[]"); if (!Array.isArray(favs)) favs = []; } catch (e) { favs = []; }
  function isFav(id) { return favs.indexOf(id) > -1; }
  function saveFavs() { try { localStorage.setItem(FAV_KEY, JSON.stringify(favs)); } catch (e) { /* privat tilstand: virker kun mens siden er åben */ } }
  function toggleFav(id) {
    var i = favs.indexOf(id);
    if (i > -1) favs.splice(i, 1); else favs.push(id);
    saveFavs();
    $$('[data-fav="' + id + '"]').forEach(syncFavButton);
    if (state.cat === "favoritter" && !$("#view-home").hidden) renderRecipes();
  }
  function syncFavButton(btn) {
    var on = isFav(btn.getAttribute("data-fav"));
    btn.classList.toggle("on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    if (btn.classList.contains("fav-btn")) {
      btn.innerHTML = (on ? "♥" : "♡") + " " + (on ? "Gemt som favorit" : "Gem som favorit");
      btn.setAttribute("aria-label", on ? "Fjern fra favoritter" : "Gem som favorit");
    } else {
      btn.textContent = on ? "♥" : "♡";
      btn.setAttribute("aria-label", on ? "Fjern fra favoritter" : "Gem som favorit");
    }
  }

  /* ---------- Hjælpere til visning ---------- */
  /* Billede: lægger du et foto i mappen "images" med samme navn som id (fx images/bananpandekager.jpg),
     vises det automatisk. Findes det ikke, vises den pæne illustration i stedet. */
  function art(emoji, c1, c2, cls, cat, photoId) {
    var s = SMALL[cat] || ["", ""];
    var img = photoId ? '<img class="photo" src="images/' + photoId + '.jpg" alt="" loading="lazy" onerror="this.remove()">' : "";
    return '<div class="art ' + (cls || "") + '" style="--c1:' + c1 + ";--c2:" + c2 + '" aria-hidden="true">' +
      '<span class="sm a">' + s[0] + '</span><span class="sm b">' + s[1] + '</span><span class="big">' + emoji + "</span>" + img + "</div>";
  }

  function renderCategories() {
    $("#catGrid").innerHTML = CATS.map(function (c) {
      return '<a class="cat-card reveal" href="#/kategori/' + c.id + '" aria-label="' + esc(c.name) + ' – se opskrifter">' +
        art(c.emoji, c.c1, c.c2, "", c.id) +
        '<div class="cat-body"><h3>' + esc(c.name) + "</h3><p>" + esc(c.desc) + '</p><span class="go">Se opskrifter <i>→</i></span></div></a>';
    }).join("");
  }

  function recipeCard(r) {
    var c = catById(r.cat);
    return '<article class="recipe-card reveal in">' +
      '<button class="fav" type="button" data-fav="' + r.id + '"></button>' +
      '<a class="rc-link" href="#/opskrift/' + r.id + '" aria-label="Åbn opskrift: ' + esc(r.title) + '">' +
      art(r.emoji, c.c1, c.c2, "", r.cat) +
      '<div class="rc-body"><span class="tag">' + esc(c.name) + "</span><h3>" + esc(r.title) + "</h3>" +
      '<div class="rc-meta"><span>⏱ ' + esc(r.time) + "</span><span>👥 " + r.servings + " pers.</span><span>⭐ " + esc(r.level) + "</span></div>" +
      '<span class="go">Se opskrift <i>→</i></span></div></a></article>';
  }

  /* ---------- Søgning og filtrering ---------- */
  function matches(r) {
    if (state.cat === "favoritter" && !isFav(r.id)) return false;
    if (state.cat !== "alle" && state.cat !== "favoritter" && r.cat !== state.cat) return false;
    if (!state.q) return true;
    var hay = norm([r.title, r.intro, catById(r.cat).name, r.ingredients.join(" ")].join(" "));
    return norm(state.q).split(/\s+/).filter(Boolean).every(function (w) { return hay.indexOf(w) > -1; });
  }

  function renderChips() {
    var items = [{ id: "alle", name: "Alle" }].concat(CATS.map(function (c) { return { id: c.id, name: c.name }; }), [{ id: "favoritter", name: "♥ Favoritter" }]);
    $("#chips").innerHTML = items.map(function (i) {
      return '<button type="button" class="chip' + (state.cat === i.id ? " active" : "") + '" data-cat="' + i.id + '" aria-pressed="' + (state.cat === i.id) + '">' + esc(i.name) + "</button>";
    }).join("");
  }

  function renderRecipes() {
    var list = RECIPES.filter(matches);
    var grid = $("#recipeGrid"), empty = $("#emptyState");
    grid.innerHTML = list.map(recipeCard).join("");
    $$("[data-fav]", grid).forEach(syncFavButton);
    empty.hidden = list.length > 0;
    grid.hidden = list.length === 0;
    $("#resultCount").textContent = list.length ? list.length + (list.length === 1 ? " opskrift" : " opskrifter") + " fundet" : "";
    if (!list.length) {
      $("#emptyText").textContent = state.cat === "favoritter" && !state.q
        ? "Du har ikke gemt nogen favoritter endnu. Tryk på hjertet på en opskrift for at gemme den."
        : "Prøv et andet søgeord, eller vælg en anden kategori.";
    }
    $("#clearSearch").hidden = !state.q;
    renderChips();
  }

  /* ---------- Kategoriside ---------- */
  function renderCategoryPage(id) {
    var c = catById(id), view = $("#view-category");
    var list = RECIPES.filter(function (r) { return r.cat === id; });
    view.innerHTML = '<div class="wrap page fade-in">' +
      '<a class="back" href="#/">← Tilbage til forsiden</a>' +
      art(c.emoji, c.c1, c.c2, "hero-size", c.id) +
      '<h1 class="page-title">' + esc(c.name) + '</h1><p class="page-intro lead">' + esc(c.intro) + "</p>" +
      '<div class="recipe-grid">' + list.map(recipeCard).join("") + "</div>" +
      '<div class="bottom-nav"><a class="btn btn-ghost" href="#/s/opskrifter">Se alle opskrifter</a></div></div>';
    $$("[data-fav]", view).forEach(syncFavButton);
    document.title = c.name + " – RESTEMAD";
  }

  /* ---------- Opskriftsside ---------- */
  function renderRecipePage(id) {
    var r = recipeById(id), c = catById(r.cat), view = $("#view-recipe");
    view.innerHTML = '<div class="wrap page fade-in" style="max-width:980px">' +
      '<a class="back" href="#/kategori/' + c.id + '">← Tilbage til ' + esc(c.name) + "</a>" +
      art(r.emoji, c.c1, c.c2, "recipe-size", r.cat) +
      '<div class="recipe-top"><div><span class="tag">' + esc(c.name) + '</span><h1 class="page-title" style="margin-top:12px">' + esc(r.title) + "</h1></div>" +
      '<div class="rbtns"><button type="button" class="fav-btn" data-fav="' + r.id + '"></button><button type="button" class="fav-btn" data-share="recipe">↗ Del</button></div></div>' +
      '<p class="page-intro lead" style="margin-bottom:0">' + esc(r.intro) + "</p>" +
      '<div class="rmeta"><div><b>⏱ ' + esc(r.time) + "</b><span>Tilberedningstid</span></div><div><b>👥 " + r.servings + "</b><span>Portioner</span></div><div><b>⭐ " + esc(r.level) + "</b><span>Sværhedsgrad</span></div></div>" +
      '<div class="rcols"><section class="box"><h2>🛒 Ingredienser</h2><ul class="ing">' +
      r.ingredients.map(function (t, i) { return '<li><label><input type="checkbox" aria-label="' + esc(t) + '"><span>' + esc(t) + "</span></label></li>"; }).join("") +
      '</ul></section><section class="box"><h2>👩‍🍳 Fremgangsmåde</h2><ol class="steps">' +
      r.steps.map(function (t) { return "<li><span>" + esc(t) + "</span></li>"; }).join("") +
      '</ol></section></div><div class="tipbox"><b>♻️ Tip mod madspild</b><p>' + esc(r.tip) + "</p></div>" +
      '<div class="bottom-nav"><a class="btn btn-primary" href="#/s/opskrifter">Tilbage til opskrifter</a></div></div>';
    $$("[data-fav]", view).forEach(syncFavButton);
    document.title = r.title + " – RESTEMAD";
  }

  /* ---------- Rute-håndtering ---------- */
  function show(name) {
    ["home", "category", "recipe"].forEach(function (v) { $("#view-" + v).hidden = v !== name; });
  }
  function closeMenu() {
    $("#navLinks").classList.remove("open");
    var b = $("#menuBtn"); b.classList.remove("open"); b.setAttribute("aria-expanded", "false");
  }
  function route() {
    var h = (location.hash || "#/").replace(/^#\/?/, "");
    var parts = h.split("/");
    closeMenu();
    if (parts[0] === "kategori" && catById(parts[1])) {
      renderCategoryPage(parts[1]); show("category"); window.scrollTo(0, 0);
    } else if (parts[0] === "opskrift" && recipeById(parts[1])) {
      renderRecipePage(parts[1]); show("recipe"); window.scrollTo(0, 0);
    } else if (parts[0] === "s" && parts[1] && document.getElementById(parts[1])) {
      show("home"); document.title = "RESTEMAD – Mad fortjener en chance til";
      renderRecipes();
      setTimeout(function () { document.getElementById(parts[1]).scrollIntoView({ behavior: "smooth", block: "start" }); }, 40);
    } else {
      show("home"); document.title = "RESTEMAD – Mad fortjener en chance til";
      renderRecipes();
      window.scrollTo(0, 0);
    }
    observeReveals();
  }

  /* ---------- Scroll-animationer ---------- */
  var io = null;
  function observeReveals() {
    var els = $$(".reveal:not(.in)");
    if (!("IntersectionObserver" in window)) { els.forEach(function (e) { e.classList.add("in"); }); return; }
    if (!io) io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    els.forEach(function (e) { io.observe(e); });
  }

  window.RESTEMAD_UI = { art: art, catById: catById };

  /* ---------- Opstart ---------- */
  function init() {
    renderCategories();
    renderChips();

    $("#searchInput").addEventListener("input", function (e) { state.q = e.target.value.trim(); renderRecipes(); });
    $("#clearSearch").addEventListener("click", function () { $("#searchInput").value = ""; state.q = ""; renderRecipes(); $("#searchInput").focus(); });
    $("#resetBtn").addEventListener("click", function () { $("#searchInput").value = ""; state.q = ""; state.cat = "alle"; renderRecipes(); });
    $("#chips").addEventListener("click", function (e) {
      var b = e.target.closest(".chip"); if (!b) return;
      state.cat = b.getAttribute("data-cat"); renderRecipes();
    });
    document.addEventListener("click", function (e) {
      var f = e.target.closest("[data-fav]");
      if (f) { e.preventDefault(); toggleFav(f.getAttribute("data-fav")); f.classList.remove("pop"); void f.offsetWidth; f.classList.add("pop"); }
    });

    $("#menuBtn").addEventListener("click", function () {
      var open = $("#navLinks").classList.toggle("open");
      this.classList.toggle("open", open); this.setAttribute("aria-expanded", open ? "true" : "false");
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeMenu(); });

    var nav = $("#nav"), top = $("#toTop");
    function onScroll() {
      nav.classList.toggle("scrolled", window.scrollY > 10);
      top.hidden = window.scrollY < 500;
    }
    window.addEventListener("scroll", onScroll, { passive: true }); onScroll();
    top.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: "smooth" }); });

    window.addEventListener("hashchange", route);
    route();

    var loader = $("#loader");
    function hideLoader() { loader.classList.add("done"); }
    if (document.readyState === "complete") setTimeout(hideLoader, 350);
    else { window.addEventListener("load", function () { setTimeout(hideLoader, 350); }); setTimeout(hideLoader, 2500); }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
