/* Miller Hardware public site: mobile menu, and (when Firebase is configured) live content from the admin page.
   Every page is complete without this file; it only swaps in edits. Content from the database is written with
   textContent and createElement, never as HTML. */
(function () {
  "use strict";

  // ---------- mobile menu ----------
  var btn = document.querySelector(".menu-btn");
  var nav = document.getElementById("site-nav");
  if (btn && nav) {
    var setOpen = function (open) {
      nav.classList.toggle("open", open);
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    };
    btn.addEventListener("click", function () { setOpen(!nav.classList.contains("open")); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") setOpen(false); });
    nav.addEventListener("click", function (e) { if (e.target.closest("a")) setOpen(false); });
  }

  // ---------- reveal on scroll ----------
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if ("IntersectionObserver" in window && !reduce) {
    var els = Array.prototype.slice.call(document.querySelectorAll(".reveal"));
    var vh = window.innerHeight || 800;
    els.forEach(function (el) { if (el.getBoundingClientRect().top < vh * 0.95) el.classList.add("in"); });
    document.documentElement.classList.add("js");
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    els.forEach(function (el) { if (!el.classList.contains("in")) io.observe(el); });
  }

  // ---------- contact form: prefill from the link that brought you here ----------
  var form = document.getElementById("contact-form");
  var formOpened = Date.now();
  var dbReady = null; // set once Firestore loads
  if (form) {
    var q = new URLSearchParams(location.search);
    var topic = q.get("topic"), ref = (q.get("ref") || "").slice(0, 120), st = q.get("store");
    var tSel = document.getElementById("c-topic"), sSel = document.getElementById("c-store");
    if (topic && tSel.querySelector('option[value="' + topic.replace(/[^a-z-]/g, "") + '"]')) tSel.value = topic;
    if (st && /^(harrison|yellville|either)$/.test(st)) sSel.value = st;
    if (ref) { document.getElementById("c-ref-text").textContent = ref; document.getElementById("c-ref-line").hidden = false; }
    var equip = document.getElementById("c-equip"), partField = document.getElementById("c-part-field");
    var syncEquip = function () {
      var t = tSel.value; equip.hidden = !(t === "parts" || t === "saw-shop" || t === "trade");
      partField.hidden = t !== "parts";
      document.getElementById("c-etype-row").hidden = !(t === "saw-shop" || t === "trade");
      document.getElementById("c-drop-field").hidden = t !== "saw-shop";
      document.getElementById("c-trade-row").hidden = t !== "trade";
      document.getElementById("c-serial").closest(".field").hidden = t === "trade";
    };
    tSel.addEventListener("change", syncEquip); syncEquip();
    var status = document.getElementById("c-status");
    var say = function (t, k) { status.textContent = t; status.className = "form-msg" + (k ? " " + k : ""); };
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var v = function (id) { return document.getElementById(id).value.trim(); };
      var name = v("c-name"), phone = v("c-phone"), email = v("c-email"), msg = v("c-msg");
      if (!name) { say("Please add your name.", "err"); document.getElementById("c-name").focus(); return; }
      if (!phone && !email) { say("Please leave a phone number or an email so we can reply.", "err"); document.getElementById("c-phone").focus(); return; }
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { say("That email address doesn't look right.", "err"); document.getElementById("c-email").focus(); return; }
      if (!msg) { say("Please add a message.", "err"); document.getElementById("c-msg").focus(); return; }
      var t = tSel.value;
      if (t === "saw-shop" && !phone) { say("Please leave a phone number so the saw shop can call you.", "err"); document.getElementById("c-phone").focus(); return; }
      var problem = msg;
      if (!document.getElementById("c-equip").hidden) {
        var eq = [["Equipment", (t === "saw-shop" || t === "trade") ? v("c-etype") : ""], ["Brand", v("c-brand")], ["Model", v("c-model")],
          ["Year", t === "trade" ? v("c-year") : ""], ["Hours", t === "trade" ? v("c-hours") : ""],
          ["Serial", t !== "trade" ? v("c-serial") : ""], ["Part needed", t === "parts" ? v("c-part") : ""], ["Drop-off", t === "saw-shop" ? v("c-drop") : ""]]
          .filter(function (p) { return p[1]; }).map(function (p) { return p[0] + ": " + p[1]; });
        if (eq.length) msg = eq.join("\n") + "\n\n" + msg;
      }
      // spam traps: a hidden field people never fill in, and forms sent within 3 seconds of opening
      if (v("c-website") || Date.now() - formOpened < 3000) { form.reset(); say("Thanks. Your message was sent.", "ok"); return; }
      if (!dbReady) { say("Sorry, the form isn't available right now. Please call Harrison 870-741-3493 or Yellville 870-449-4255.", "err"); return; }
      var btnSend = document.getElementById("c-send"); btnSend.disabled = true; say("Sending...");
      var done = function () {
        form.reset(); document.getElementById("c-ref-line").hidden = true; syncEquip();
        say("Thanks, " + name.split(" ")[0] + ". Your message was sent. We'll call or email you back.", "ok"); btnSend.disabled = false;
      };
      if (t === "saw-shop") {
        // Service requests go straight into the Saw Shop app's Web Requests list.
        var storeName = sSel.value === "yellville" ? "Yellville" : "Harrison";
        sawShopDb().then(function (sdb) {
          return sdb.ref("web_requests").push({
            name: name.slice(0, 80), phone: phone.slice(0, 30), email: email.slice(0, 120), store: storeName,
            equipType: v("c-etype"), brand: v("c-brand").slice(0, 40), model: v("c-model").slice(0, 40), serial: v("c-serial").slice(0, 40),
            problem: problem.slice(0, 2000), dropoff: v("c-drop"), status: "new", createdAt: firebase.database.ServerValue.TIMESTAMP
          });
        }).then(done).catch(function () { sendToInbox(); });
        return;
      }
      sendToInbox();
      function sendToInbox() {
      dbReady.collection("messages").add({
        name: name.slice(0, 80), phone: phone.slice(0, 30), email: email.slice(0, 120),
        store: sSel.value, topic: tSel.value, ref: ref, message: msg.slice(0, 2000),
        status: "new", createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }).then(done).catch(function () {
        say("Sorry, that didn't go through. Please call Harrison 870-741-3493 or Yellville 870-449-4255.", "err"); btnSend.disabled = false;
      });
      }
    });
  }

  // The Saw Shop app's own database (a separate Firebase project). The website may only add service requests to it.
  var SAWSHOP_FB = { apiKey: "AIzaSyDNEl1mXtNLGN0nsvr1lZi7SJzsiypJFLM", authDomain: "millersawshop-f716a.firebaseapp.com",
    databaseURL: "https://millersawshop-f716a-default-rtdb.firebaseio.com", projectId: "millersawshop-f716a" };
  var _sawDb = null;
  function sawShopDb() {
    if (_sawDb) return _sawDb;
    _sawDb = new Promise(function (resolve, reject) {
      if (!window.firebase) { reject(new Error("no firebase")); return; }
      var go = function () { try { var app = firebase.apps.filter(function (a) { return a.name === "sawshop"; })[0] || firebase.initializeApp(SAWSHOP_FB, "sawshop"); resolve(app.database()); } catch (e) { reject(e); } };
      if (firebase.database) { go(); return; }
      var s = document.createElement("script"); s.src = "https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js";
      s.onload = go; s.onerror = reject; document.head.appendChild(s);
    });
    _sawDb.catch(function () { _sawDb = null; });
    return _sawDb;
  }

  // ---------- live content ----------
  var cfg = window.MH_FIREBASE;
  var configured = cfg && cfg.apiKey && cfg.projectId && cfg.apiKey.indexOf("REPLACE_ME") === -1 && cfg.projectId.indexOf("REPLACE_ME") === -1;
  if (!configured) return;

  var SDK = "https://www.gstatic.com/firebasejs/10.12.2/";
  function load(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src; s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function get(obj, path) {
    return path.split(".").reduce(function (o, k) { return o && o[k] != null ? o[k] : undefined; }, obj);
  }

  function applyBanner(b) {
    var el = document.getElementById("announce");
    if (!el || !b) return;
    if (b.enabled && b.text) { el.textContent = b.text; el.hidden = false; }
    else { el.hidden = true; }
  }

  function applyStores(stores) {
    if (!stores) return;
    document.querySelectorAll("[data-store][data-f]").forEach(function (el) {
      var v = get(stores[el.getAttribute("data-store")], el.getAttribute("data-f"));
      if (typeof v === "string" && v.trim()) { el.textContent = v; el.classList.remove("fill"); }
    });
  }

  function cell(b) {
    var d = document.createElement("div"); d.className = "brand-cell";
    var n = document.createElement("b"); n.textContent = b.name; d.appendChild(n);
    if (b.label) { var l = document.createElement("span"); l.textContent = b.label; d.appendChild(l); }
    return d;
  }

  function applyBrands(brands) {
    if (!brands) return;
    document.querySelectorAll("[data-brands]").forEach(function (box) {
      var key = box.getAttribute("data-brands"), list = [];
      if (key === "all") {
        var seen = {};
        ["saw", "paint", "lumber", "plumbing", "hardware"].forEach(function (k) {
          (brands[k] || []).forEach(function (b) { if (!seen[b.name]) { seen[b.name] = 1; list.push(b); } });
        });
      } else { list = brands[key] || []; }
      box.textContent = "";
      list.forEach(function (b) { if (b && b.name) box.appendChild(cell(b)); });
    });
    document.querySelectorAll("[data-tag-brands]").forEach(function (el) {
      var list = brands[el.getAttribute("data-tag-brands")];
      if (!list) return;
      var n = parseInt(el.getAttribute("data-n"), 10) || list.length;
      el.textContent = list.slice(0, n).map(function (b) { return b.name; }).join(" · ");
    });
  }

  var money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  function callLine(store) {
    var P = window.MH_PHONES || {};
    var p = document.createElement("p"); p.className = "unit-call";
    function link(label, key) {
      var a = document.createElement("a"); a.href = "tel:" + P[key][1]; a.textContent = P[key][0];
      var s = document.createElement("span"); s.appendChild(document.createTextNode(label + " ")); s.appendChild(a);
      return s;
    }
    if (store === "yellville" || store === "harrison") {
      p.appendChild(document.createTextNode("Call " + (store === "yellville" ? "Yellville" : "Harrison") + " to see it: "));
      var a = document.createElement("a"); a.href = "tel:" + P[store][1]; a.textContent = P[store][0]; p.appendChild(a);
    } else {
      p.appendChild(document.createTextNode("Call to see it: "));
      p.appendChild(link("Harrison", "harrison")); p.appendChild(document.createTextNode(" or "));
      p.appendChild(link("Yellville", "yellville"));
    }
    return p;
  }

  function unitCard(u) {
    var card = document.createElement("article"); card.className = "unit" + (u.clearance ? " is-clearance" : "");
    if (u.clearance) { var rb = document.createElement("span"); rb.className = "ribbon"; rb.textContent = "Clearance"; card.appendChild(rb); }
    var photos = Array.isArray(u.photos) ? u.photos.filter(function (x) { return typeof x === "string" && x.indexOf("data:image/") === 0; }) : [];
    var title = [u.condition === "new" ? "New" : u.year, u.brand, u.model].filter(Boolean).join(" ");
    if (photos.length) {
      var box = document.createElement("div"); box.className = "unit-photo";
      var img = document.createElement("img"); img.src = photos[0]; img.alt = title; img.loading = "lazy";
      box.appendChild(img); card.appendChild(box);
      if (photos.length > 1) {
        var th = document.createElement("div"); th.className = "unit-thumbs";
        photos.forEach(function (src, i) {
          var b = document.createElement("button"); b.type = "button";
          b.setAttribute("aria-label", "Photo " + (i + 1) + " of " + photos.length);
          b.setAttribute("aria-current", i === 0 ? "true" : "false");
          var t = document.createElement("img"); t.src = src; t.alt = ""; b.appendChild(t);
          b.addEventListener("click", function () {
            img.src = src;
            th.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-current", x === b ? "true" : "false"); });
          });
          th.appendChild(b);
        });
        card.appendChild(th);
      }
    }
    var body = document.createElement("div"); body.className = "unit-body";
    var h = document.createElement("h3"); h.textContent = title || "Used unit"; body.appendChild(h);
    var meta = [];
    if (u.hours !== "" && u.hours != null && !isNaN(Number(u.hours))) meta.push(Number(u.hours).toLocaleString("en-US") + " hours");
    if (u.store === "yellville") meta.push("Yellville"); else if (u.store === "harrison") meta.push("Harrison");
    if (meta.length) { var m = document.createElement("p"); m.className = "unit-meta"; m.textContent = meta.join(" · "); body.appendChild(m); }
    var pr = document.createElement("p"); pr.className = "unit-price";
    pr.textContent = (u.price !== "" && u.price != null && !isNaN(Number(u.price))) ? money.format(Number(u.price)) : "Call for price";
    body.appendChild(pr);
    if (u.description) { var d = document.createElement("p"); d.className = "unit-desc"; d.textContent = u.description; body.appendChild(d); }
    body.appendChild(callLine(u.store));
    var ask = document.createElement("a"); ask.className = "unit-ask";
    ask.href = "contact.html?topic=used&store=" + encodeURIComponent(u.store || "either") + "&ref=" + encodeURIComponent((title || "Used unit").slice(0, 120));
    ask.textContent = "Or ask about it online \u2192"; body.appendChild(ask);
    card.appendChild(body);
    return card;
  }

  var STORE_LABEL = { harrison: "Harrison", yellville: "Yellville", both: "Both stores", either: "Both stores" };
  function today() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function niceDate(iso) {
    var p = String(iso).split("-"); if (p.length !== 3) return "";
    return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  function applySpecials(list) {
    var sec = document.getElementById("specials"), grid = document.getElementById("specials-grid");
    if (!sec || !grid) return;
    var t = today();
    var live = list.filter(function (x) { return x && x.active !== false && x.title && (!x.endDate || x.endDate >= t) && (!x.startDate || x.startDate <= t); });
    live.sort(function (a, b) { return (a.sort || 0) - (b.sort || 0) || (b.createdAt || 0) - (a.createdAt || 0); });
    grid.textContent = "";
    live.forEach(function (x) {
      var c = document.createElement("article"); c.className = "special" + (x.clearance ? " is-clearance" : "");
      if (x.clearance) { var rb = document.createElement("span"); rb.className = "ribbon"; rb.textContent = "Clearance"; c.appendChild(rb); }
      if (typeof x.photo === "string" && x.photo.indexOf("data:image/") === 0) {
        var ph = document.createElement("div"); ph.className = "special-photo";
        var im = document.createElement("img"); im.src = x.photo; im.alt = x.title; im.loading = "lazy"; ph.appendChild(im); c.appendChild(ph);
      }
      var b = document.createElement("div"); b.className = "special-body";
      var h = document.createElement("h3"); h.textContent = x.title; b.appendChild(h);
      if ((x.price !== "" && x.price != null && !isNaN(Number(x.price))) || x.priceNote) {
        var pr = document.createElement("p"); pr.className = "special-price";
        if (x.price !== "" && x.price != null && !isNaN(Number(x.price))) pr.textContent = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(x.price));
        if (x.priceNote) { var sm = document.createElement("small"); sm.textContent = x.priceNote; pr.appendChild(sm); }
        b.appendChild(pr);
      }
      if (x.description) { var d = document.createElement("p"); d.textContent = x.description; b.appendChild(d); }
      var m = document.createElement("p"); m.className = "special-meta";
      m.textContent = [STORE_LABEL[x.store] || "Both stores", x.endDate ? "Ends " + niceDate(x.endDate) : "While supplies last"].join(" \u00b7 ");
      b.appendChild(m); c.appendChild(b); grid.appendChild(c);
    });
    sec.hidden = live.length === 0;
  }

  function applyJobs(list) {
    var box = document.getElementById("jobs-list"), empty = document.getElementById("jobs-empty");
    if (!box) return;
    var open = list.filter(function (j) { return j && j.open !== false && j.title; });
    open.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    box.textContent = "";
    open.forEach(function (j) {
      var c = document.createElement("article"); c.className = "job";
      var l = document.createElement("div");
      var h = document.createElement("h3"); h.textContent = j.title; l.appendChild(h);
      var m = document.createElement("p"); m.className = "job-meta"; m.textContent = [STORE_LABEL[j.store] || "Both stores", j.type].filter(Boolean).join(" \u00b7 "); l.appendChild(m);
      if (j.description) { var d = document.createElement("p"); d.textContent = j.description; l.appendChild(d); }
      c.appendChild(l);
      var a = document.createElement("a"); a.className = "btn btn-primary";
      a.href = "contact.html?topic=job&store=" + encodeURIComponent(j.store === "both" ? "either" : (j.store || "either")) + "&ref=" + encodeURIComponent(j.title.slice(0, 120));
      a.textContent = "Apply"; c.appendChild(a);
      box.appendChild(c);
    });
    box.hidden = open.length === 0;
    if (empty) empty.hidden = open.length > 0;
  }

  function fillGrid(gridId, list, emptyId, sectionId) {
    var grid = document.getElementById(gridId); if (!grid) return;
    grid.textContent = "";
    list.forEach(function (u) { grid.appendChild(unitCard(u)); });
    grid.hidden = list.length === 0;
    var empty = emptyId && document.getElementById(emptyId); if (empty) empty.hidden = list.length > 0;
    var sec = sectionId && document.getElementById(sectionId); if (sec) sec.hidden = list.length === 0;
  }
  function applyUnits(units) {
    var live = units.filter(function (u) { return u && !u.sold; });
    live.sort(function (a, b) { return (b.clearance ? 1 : 0) - (a.clearance ? 1 : 0) || (b.createdAt || 0) - (a.createdAt || 0); });
    fillGrid("used-units-grid", live.filter(function (u) { return u.condition !== "new"; }), "used-units-empty");
    fillGrid("new-units-grid", live.filter(function (u) { return u.condition === "new"; }), null, "in-stock");
    fillGrid("clearance-grid", live.filter(function (u) { return u.clearance; }).slice(0, 6), null, "clearance");
  }

  Promise.all([load(SDK + "firebase-app-compat.js"), load(SDK + "firebase-firestore-compat.js")]).then(function () {
    firebase.initializeApp(cfg);
    var db = firebase.firestore();
    dbReady = db;
    if (document.getElementById("specials-grid")) {
      db.collection("specials").get().then(function (qs) { var a = []; qs.forEach(function (d) { a.push(d.data()); }); applySpecials(a); }).catch(function () {});
    }
    if (document.getElementById("jobs-list")) {
      db.collection("jobs").get().then(function (qs) { var a = []; qs.forEach(function (d) { a.push(d.data()); }); applyJobs(a); }).catch(function () {});
    }
    db.collection("site").doc("settings").get().then(function (snap) {
      if (!snap.exists) return;
      var s = snap.data() || {};
      applyBanner(s.banner); applyStores(s.stores); applyBrands(s.brands);
    }).catch(function () { /* keep the built-in content */ });
    if (document.getElementById("used-units-grid") || document.getElementById("clearance-grid")) {
      db.collection("usedUnits").where("sold", "==", false).get().then(function (qs) {
        var units = []; qs.forEach(function (d) { units.push(d.data()); });
        applyUnits(units);
      }).catch(function () { /* keep the empty state */ });
    }
  }).catch(function () { /* offline or blocked: the static content stays */ });
})();
