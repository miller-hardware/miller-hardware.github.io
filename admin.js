/* Miller Hardware staff admin. Firebase Auth (email and password) + Firestore, no Storage.
   Writes are only accepted by Firestore for accounts listed in the admins collection (see firestore.rules). */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var DEF = window.MH_DEFAULTS || {};
  var PHONES = window.MH_PHONES || {};
  var cfg = window.MH_FIREBASE;
  var configured = cfg && cfg.apiKey && cfg.projectId && String(cfg.apiKey).indexOf("REPLACE_ME") === -1 && String(cfg.projectId).indexOf("REPLACE_ME") === -1;

  function show(id, on) { $(id).classList.toggle("hidden", !on); }
  function say(id, text, kind) { var el = $(id); el.textContent = text || ""; el.className = "msg" + (kind ? " " + kind : ""); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function friendly(e) {
    var c = e && e.code || "";
    if (c === "auth/invalid-credential" || c === "auth/wrong-password" || c === "auth/user-not-found" || c === "auth/invalid-email") return "That email or password did not work.";
    if (c === "auth/too-many-requests") return "Too many tries. Wait a few minutes and try again.";
    if (c === "auth/network-request-failed" || c === "unavailable") return "Could not reach the internet. Check the connection and try again.";
    if (c === "permission-denied") return "This account is not allowed to save changes.";
    return (e && e.message) ? e.message : "Something went wrong. Try again.";
  }

  if (!configured) { show("s-setup", true); return; }

  var SDK = "https://www.gstatic.com/firebasejs/10.12.2/";
  function load(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script"); s.src = src; s.onload = resolve; s.onerror = reject; document.head.appendChild(s);
    });
  }

  var auth, db, user = null;
  var settings = { banner: clone(DEF.banner || {}), stores: clone(DEF.stores || {}), brands: clone(DEF.brands || {}) };
  var units = [];

  Promise.all([load(SDK + "firebase-app-compat.js"), load(SDK + "firebase-auth-compat.js"), load(SDK + "firebase-firestore-compat.js")])
    .then(start)
    .catch(function () { show("s-login", true); say("login-msg", "Could not load Firebase. Check the internet connection and reload.", "err"); });

  function start() {
    firebase.initializeApp(cfg);
    auth = firebase.auth(); db = firebase.firestore();
    auth.onAuthStateChanged(function (u) {
      user = u;
      show("s-login", false); show("s-noadmin", false); show("s-app", false); show("signout", !!u);
      $("who").textContent = u ? u.email : "";
      if (!u) { show("s-login", true); return; }
      db.collection("admins").doc(u.uid).get().then(function (snap) {
        if (snap.exists) { show("s-app", true); boot(); } else { show("s-noadmin", true); }
      }).catch(function () { show("s-noadmin", true); });
    });
    $("signout").addEventListener("click", function () { auth.signOut(); });
    $("login").addEventListener("submit", function (e) {
      e.preventDefault(); say("login-msg", "");
      auth.signInWithEmailAndPassword($("email").value.trim(), $("pw").value).catch(function (err) { say("login-msg", friendly(err), "err"); });
    });
  }

  var booted = false;
  function boot() {
    if (booted) return; booted = true;
    setupTabs(); setupUnits(); setupStores(); setupBrands(); setupBanner(); setupInbox(); setupSpecials(); setupJobs();
    db.collection("site").doc("settings").get().then(function (snap) {
      if (snap.exists) {
        var s = snap.data() || {};
        if (s.banner) settings.banner = s.banner;
        if (s.stores) settings.stores = merge(clone(DEF.stores), s.stores);
        if (s.brands) settings.brands = merge(clone(DEF.brands), s.brands);
      }
      fillStores(); fillBrands(); fillBanner();
    }).catch(function (e) { say("stores-msg", friendly(e), "err"); fillStores(); fillBrands(); fillBanner(); });
    loadUnits(); loadInbox(); loadSpecials(); loadJobs();
  }

  function merge(base, over) {
    Object.keys(over || {}).forEach(function (k) {
      if (over[k] && typeof over[k] === "object" && !Array.isArray(over[k]) && base[k] && typeof base[k] === "object" && !Array.isArray(base[k])) merge(base[k], over[k]);
      else base[k] = over[k];
    });
    return base;
  }

  // ---------- tabs ----------
  function setupTabs() {
    var tabs = ["inbox", "units", "specials", "jobs", "stores", "brands", "banner"];
    tabs.forEach(function (k) {
      $("t-" + k).addEventListener("click", function () {
        tabs.forEach(function (j) { $("t-" + j).setAttribute("aria-selected", j === k ? "true" : "false"); show("p-" + j, j === k); });
      });
    });
  }

  // ---------- photos ----------
  var MAX_PHOTOS = 3, PHOTO_BYTES = 120000;
  function shrink(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var dim = 900, q = 0.78, out = "";
        for (var i = 0; i < 14; i++) {
          var r = Math.min(1, dim / Math.max(img.width, img.height));
          var c = document.createElement("canvas"); c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          out = c.toDataURL("image/jpeg", q);
          if (out.length <= PHOTO_BYTES) break;
          q -= 0.08; if (q < 0.45) { q = 0.75; dim = Math.round(dim * 0.82); }
        }
        URL.revokeObjectURL(url); resolve(out);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("That photo could not be read. Try a JPG or PNG.")); };
      img.src = url;
    });
  }

  // ---------- used units ----------
  var form = { id: null, photos: [] };
  var money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  function unitCard(u) {
    var card = document.createElement("article"); card.className = "unit" + (u.clearance ? " is-clearance" : "");
    if (u.clearance) { var rb = document.createElement("span"); rb.className = "ribbon"; rb.textContent = "Clearance"; card.appendChild(rb); }
    var title = [u.year, u.brand, u.model].filter(Boolean).join(" ");
    if (u.photos && u.photos.length) {
      var box = document.createElement("div"); box.className = "unit-photo";
      var img = document.createElement("img"); img.src = u.photos[0]; img.alt = title; box.appendChild(img); card.appendChild(box);
    }
    var body = document.createElement("div"); body.className = "unit-body";
    var h = document.createElement("h3"); h.textContent = title || "Year Brand Model"; body.appendChild(h);
    var meta = [];
    if (u.hours !== "" && u.hours != null && !isNaN(Number(u.hours))) meta.push(Number(u.hours).toLocaleString("en-US") + " hours");
    if (u.store === "yellville") meta.push("Yellville"); else if (u.store === "harrison") meta.push("Harrison");
    if (meta.length) { var m = document.createElement("p"); m.className = "unit-meta"; m.textContent = meta.join(" · "); body.appendChild(m); }
    var pr = document.createElement("p"); pr.className = "unit-price";
    pr.textContent = (u.price !== "" && u.price != null && !isNaN(Number(u.price))) ? money.format(Number(u.price)) : "Call for price";
    body.appendChild(pr);
    if (u.description) { var d = document.createElement("p"); d.className = "unit-desc"; d.textContent = u.description; body.appendChild(d); }
    var call = document.createElement("p"); call.className = "unit-call";
    var s = u.store;
    if (s === "yellville" || s === "harrison") call.textContent = "Call " + (s === "yellville" ? "Yellville" : "Harrison") + " to see it: " + (PHONES[s] ? PHONES[s][0] : "");
    else call.textContent = "Call to see it: Harrison " + (PHONES.harrison ? PHONES.harrison[0] : "") + " or Yellville " + (PHONES.yellville ? PHONES.yellville[0] : "");
    body.appendChild(call); card.appendChild(body);
    return card;
  }

  function readForm() {
    return {
      brand: $("u-brand").value.trim(), model: $("u-model").value.trim(),
      year: $("u-year").value === "" ? "" : Number($("u-year").value),
      hours: $("u-hours").value === "" ? "" : Number($("u-hours").value),
      price: $("u-price").value === "" ? "" : Number($("u-price").value),
      store: $("u-store").value, description: $("u-desc").value.trim(),
      photos: form.photos.slice(), sold: $("u-sold").checked,
      condition: $("u-cond").value, clearance: $("u-clear").checked
    };
  }

  function renderPreview() {
    var p = $("u-preview"); p.textContent = ""; p.appendChild(unitCard(readForm()));
    var t = $("u-thumbs"); t.textContent = "";
    form.photos.forEach(function (src, i) {
      var d = document.createElement("div"); d.className = "thumb";
      var im = document.createElement("img"); im.src = src; im.alt = "Photo " + (i + 1); d.appendChild(im);
      var b = document.createElement("button"); b.type = "button"; b.textContent = "×"; b.setAttribute("aria-label", "Remove photo " + (i + 1));
      b.addEventListener("click", function () { form.photos.splice(i, 1); renderPreview(); });
      d.appendChild(b); t.appendChild(d);
    });
  }

  function resetForm() {
    form = { id: null, photos: [] };
    ["u-brand", "u-model", "u-year", "u-hours", "u-price", "u-desc"].forEach(function (id) { $(id).value = ""; });
    $("u-store").value = "yellville"; $("u-sold").checked = false; $("u-photos").value = "";
    $("u-cond").value = "used"; $("u-clear").checked = false;
    $("unit-form-title").textContent = "Add a unit"; $("u-save").textContent = "Save unit"; show("u-cancel", false);
    renderPreview();
  }

  function editUnit(u) {
    form = { id: u.id, photos: (u.photos || []).slice() };
    $("u-brand").value = u.brand || ""; $("u-model").value = u.model || "";
    $("u-year").value = u.year === "" || u.year == null ? "" : u.year;
    $("u-hours").value = u.hours === "" || u.hours == null ? "" : u.hours;
    $("u-price").value = u.price === "" || u.price == null ? "" : u.price;
    $("u-store").value = u.store || "yellville"; $("u-desc").value = u.description || ""; $("u-sold").checked = !!u.sold;
    $("u-cond").value = u.condition === "new" ? "new" : "used"; $("u-clear").checked = !!u.clearance;
    $("unit-form-title").textContent = "Edit unit"; $("u-save").textContent = "Save changes"; show("u-cancel", true);
    renderPreview(); say("u-msg", "");
    $("unit-form-title").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function loadUnits() {
    db.collection("usedUnits").get().then(function (qs) {
      units = []; qs.forEach(function (d) { var x = d.data(); x.id = d.id; units.push(x); });
      units.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
      renderList(); say("list-msg", "");
    }).catch(function (e) { say("list-msg", friendly(e), "err"); });
  }

  function renderList() {
    var ul = $("unit-list"); ul.textContent = "";
    if (!units.length) { var li = document.createElement("li"); li.textContent = "No units yet. Add the first one above."; ul.appendChild(li); return; }
    units.forEach(function (u) {
      var li = document.createElement("li");
      var pic = document.createElement("div"); pic.className = "pic";
      if (u.photos && u.photos[0]) { var im = document.createElement("img"); im.src = u.photos[0]; im.alt = ""; pic.appendChild(im); }
      li.appendChild(pic);
      var info = document.createElement("div"); info.className = "info";
      var b = document.createElement("b"); b.textContent = [u.year, u.brand, u.model].filter(Boolean).join(" ") || "Unit";
      var badge = document.createElement("span"); badge.className = "badge" + (u.sold ? " sold" : ""); badge.textContent = u.sold ? "Sold" : "Listed";
      b.appendChild(badge);
      var cb = document.createElement("span"); cb.className = "badge"; cb.textContent = u.condition === "new" ? "New" : "Used"; b.appendChild(cb);
      if (u.clearance && !u.sold) { var cl = document.createElement("span"); cl.className = "badge new"; cl.textContent = "Clearance"; b.appendChild(cl); } info.appendChild(b);
      var sp = document.createElement("span");
      sp.textContent = ((u.price !== "" && u.price != null) ? money.format(u.price) : "Call for price") + " · " + (u.store === "either" ? "Either store" : u.store === "harrison" ? "Harrison" : "Yellville");
      info.appendChild(sp); li.appendChild(info);
      var acts = document.createElement("div"); acts.className = "acts";
      function mk(label, cls, fn) { var x = document.createElement("button"); x.type = "button"; x.className = "btn btn-sm " + cls; x.textContent = label; x.addEventListener("click", fn); acts.appendChild(x); return x; }
      mk("Edit", "btn-line", function () { editUnit(u); });
      mk(u.sold ? "Mark available" : "Mark sold", "btn-line", function () {
        db.collection("usedUnits").doc(u.id).update({ sold: !u.sold, updatedAt: Date.now() })
          .then(function () { u.sold = !u.sold; renderList(); say("list-msg", u.sold ? "Marked sold. It is off the website." : "Back on the website.", "ok"); })
          .catch(function (e) { say("list-msg", friendly(e), "err"); });
      });
      mk("Delete", "btn-line", function () {
        acts.textContent = "";
        var q = document.createElement("span"); q.textContent = "Delete this unit for good?"; q.style.fontWeight = "700"; acts.appendChild(q);
        mk("Yes, delete", "btn-danger", function () {
          db.collection("usedUnits").doc(u.id).delete().then(function () {
            units = units.filter(function (x) { return x.id !== u.id; }); if (form.id === u.id) resetForm(); renderList(); say("list-msg", "Deleted.", "ok");
          }).catch(function (e) { say("list-msg", friendly(e), "err"); });
        });
        mk("Keep it", "btn-line", renderList);
      });
      li.appendChild(acts); ul.appendChild(li);
    });
  }

  function setupUnits() {
    ["u-brand", "u-model", "u-year", "u-hours", "u-price", "u-store", "u-desc", "u-sold", "u-cond", "u-clear"].forEach(function (id) {
      $(id).addEventListener("input", renderPreview); $(id).addEventListener("change", renderPreview);
    });
    $("u-photos").addEventListener("change", function () {
      var files = Array.prototype.slice.call(this.files || []), room = MAX_PHOTOS - form.photos.length;
      if (!files.length) return;
      if (files.length > room) say("u-msg", "Only " + MAX_PHOTOS + " photos per unit. Extra photos were skipped.");
      files = files.slice(0, Math.max(room, 0));
      say("u-msg", "Preparing photos...");
      files.reduce(function (p, f) { return p.then(function () { return shrink(f).then(function (d) { form.photos.push(d); renderPreview(); }); }); }, Promise.resolve())
        .then(function () { if (files.length) say("u-msg", ""); }).catch(function (e) { say("u-msg", e.message, "err"); });
      this.value = "";
    });
    $("u-cancel").addEventListener("click", function () { resetForm(); say("u-msg", ""); });
    $("unit-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var d = readForm();
      if (!d.brand || !d.model) { say("u-msg", "Add at least the brand and the model.", "err"); return; }
      var size = JSON.stringify(d).length;
      if (size > 950000) { say("u-msg", "The photos are too large together. Remove one and try again.", "err"); return; }
      say("u-msg", "Saving...");
      var col = db.collection("usedUnits"), now = Date.now(), p;
      if (form.id) { d.updatedAt = now; p = col.doc(form.id).update(d); }
      else { d.createdAt = now; d.updatedAt = now; p = col.add(d); }
      p.then(function () { say("u-msg", "Saved. It is on the website now.", "ok"); resetForm(); loadUnits(); })
        .catch(function (err) { say("u-msg", friendly(err), "err"); });
    });
    resetForm();
  }

  // ---------- stores ----------
  var STORE_NAMES = { harrison: "Harrison", yellville: "Yellville" };
  function fillStores() {
    var host = $("stores-fields"); host.textContent = "";
    Object.keys(STORE_NAMES).forEach(function (k) {
      var s = settings.stores[k] || {}, h = s.hours || {};
      var box = document.createElement("div"); box.className = "box";
      var t = document.createElement("h2"); t.textContent = STORE_NAMES[k]; box.appendChild(t);
      [["street", "Street address", s.street], ["csz", "City, state ZIP", s.csz],
       ["hours.weekdays", "Hours, Monday to Friday", h.weekdays], ["hours.saturday", "Hours, Saturday", h.saturday], ["hours.sunday", "Hours, Sunday", h.sunday]
      ].forEach(function (f) {
        var w = document.createElement("div"); w.className = "field";
        var l = document.createElement("label"); l.htmlFor = "s-" + k + "-" + f[0]; l.textContent = f[1];
        var i = document.createElement("input"); i.type = "text"; i.id = l.htmlFor; i.value = f[2] || ""; i.setAttribute("data-store", k); i.setAttribute("data-f", f[0]);
        if (f[0].indexOf("hours") === 0) i.placeholder = f[0].indexOf("sunday") > -1 ? "Closed, or 12 to 5" : "7:30 AM to 5:30 PM";
        w.appendChild(l); w.appendChild(i); box.appendChild(w);
      });
      host.appendChild(box);
    });
  }
  function setupStores() {
    $("stores-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var stores = { yellville: { hours: {} }, harrison: { hours: {} } };
      document.querySelectorAll("#stores-fields input").forEach(function (i) {
        var k = i.getAttribute("data-store"), f = i.getAttribute("data-f").split(".");
        if (f.length === 2) stores[k][f[0]][f[1]] = i.value.trim(); else stores[k][f[0]] = i.value.trim();
      });
      say("stores-msg", "Saving...");
      db.collection("site").doc("settings").set({ stores: stores }, { merge: true })
        .then(function () { settings.stores = stores; say("stores-msg", "Saved. The site shows the new addresses and hours.", "ok"); })
        .catch(function (err) { say("stores-msg", friendly(err), "err"); });
    });
  }

  // ---------- brands ----------
  var DEPT_NAMES = { saw: "Saw shop", paint: "Paint", lumber: "Lumber", plumbing: "Plumbing", hardware: "Hardware and tools" };
  var brandState = {};
  function fillBrands() {
    brandState = {};
    Object.keys(DEPT_NAMES).forEach(function (k) { brandState[k] = clone((settings.brands && settings.brands[k]) || []); });
    renderBrands();
  }
  function renderBrands() {
    var host = $("brands-fields"); host.textContent = "";
    Object.keys(DEPT_NAMES).forEach(function (k) {
      var sec = document.createElement("div"); sec.className = "box brand-edit";
      var h = document.createElement("h3"); h.textContent = DEPT_NAMES[k]; sec.appendChild(h);
      brandState[k].forEach(function (b, i) {
        var row = document.createElement("div"); row.className = "brow";
        var n = document.createElement("input"); n.type = "text"; n.value = b.name || ""; n.placeholder = "Brand name"; n.setAttribute("aria-label", DEPT_NAMES[k] + " brand " + (i + 1) + " name");
        n.addEventListener("input", function () { b.name = n.value; });
        var l = document.createElement("input"); l.type = "text"; l.value = b.label || ""; l.placeholder = "Small line (optional)"; l.setAttribute("aria-label", DEPT_NAMES[k] + " brand " + (i + 1) + " small line");
        l.addEventListener("input", function () { b.label = l.value; });
        var m = document.createElement("div"); m.className = "mini";
        function mk(t, label, fn) { var x = document.createElement("button"); x.type = "button"; x.textContent = t; x.setAttribute("aria-label", label); x.addEventListener("click", fn); m.appendChild(x); }
        mk("↑", "Move up", function () { if (i > 0) { var t = brandState[k][i - 1]; brandState[k][i - 1] = b; brandState[k][i] = t; renderBrands(); } });
        mk("↓", "Move down", function () { if (i < brandState[k].length - 1) { var t = brandState[k][i + 1]; brandState[k][i + 1] = b; brandState[k][i] = t; renderBrands(); } });
        mk("×", "Remove " + (b.name || "brand"), function () { brandState[k].splice(i, 1); renderBrands(); });
        row.appendChild(n); row.appendChild(l); row.appendChild(m); sec.appendChild(row);
      });
      var add = document.createElement("button"); add.type = "button"; add.className = "btn btn-line btn-sm"; add.style.marginTop = "12px"; add.textContent = "Add a brand";
      add.addEventListener("click", function () { brandState[k].push({ name: "", label: "" }); renderBrands(); });
      sec.appendChild(add); host.appendChild(sec);
    });
  }
  function setupBrands() {
    $("brands-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var out = {};
      Object.keys(brandState).forEach(function (k) {
        out[k] = brandState[k].map(function (b) { return { name: (b.name || "").trim(), label: (b.label || "").trim() }; }).filter(function (b) { return b.name; });
      });
      say("brands-msg", "Saving...");
      db.collection("site").doc("settings").set({ brands: out }, { merge: true })
        .then(function () { settings.brands = out; fillBrands(); say("brands-msg", "Saved. The department pages show the new lists.", "ok"); })
        .catch(function (err) { say("brands-msg", friendly(err), "err"); });
    });
  }

  // ---------- banner ----------
  function fillBanner() {
    var b = settings.banner || {};
    $("b-on").checked = !!b.enabled; $("b-text").value = b.text || ""; prevBanner();
  }
  function prevBanner() { $("b-prev").textContent = $("b-text").value || "Your message shows here."; }
  function setupBanner() {
    $("b-text").addEventListener("input", prevBanner);
    $("banner-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var b = { enabled: $("b-on").checked && !!$("b-text").value.trim(), text: $("b-text").value.trim() };
      say("b-msg", "Saving...");
      db.collection("site").doc("settings").set({ banner: b }, { merge: true })
        .then(function () { settings.banner = b; say("b-msg", b.enabled ? "Saved. The banner is showing on every page." : "Saved. The banner is hidden.", "ok"); })
        .catch(function (err) { say("b-msg", friendly(err), "err"); });
    });
  }

  // ---------- shared helpers for the new tabs ----------
  var STORE_TXT = { harrison: "Harrison", yellville: "Yellville", both: "Both stores", either: "Either store" };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function actBtn(host, label, cls, fn) { var b = el("button", "btn btn-sm " + cls, label); b.type = "button"; b.addEventListener("click", fn); host.appendChild(b); return b; }
  function confirmDelete(host, question, onYes, onNo) {
    host.textContent = ""; var q = el("span", "", question); q.style.fontWeight = "700"; host.appendChild(q);
    actBtn(host, "Yes, delete", "btn-danger", onYes); actBtn(host, "Keep it", "btn-line", onNo);
  }
  function ms(v) { return v && typeof v.toMillis === "function" ? v.toMillis() : (typeof v === "number" ? v : 0); }

  // ---------- inbox ----------
  var TOPIC_TXT = { general: "General question", quote: "Quote request", used: "Equipment", parts: "Parts request", trade: "Trade-in", "saw-shop-web": "Saw shop (copy)", "special-order": "Special order", "saw-shop": "Saw shop service", job: "Job application" };
  var inbox = [];
  function loadInbox() {
    db.collection("messages").get().then(function (qs) {
      inbox = []; qs.forEach(function (d) { var x = d.data(); x.id = d.id; inbox.push(x); });
      inbox.sort(function (a, b) { return ms(b.createdAt) - ms(a.createdAt); });
      renderInbox(); say("inbox-msg", "");
    }).catch(function (e) { say("inbox-msg", friendly(e), "err"); });
  }
  function renderInbox() {
    var showDone = $("inbox-done").checked, ul = $("msg-list"); ul.textContent = "";
    var fresh = inbox.filter(function (m) { return m.status !== "handled"; }).length;
    $("t-inbox").textContent = fresh ? "Inbox (" + fresh + ")" : "Inbox";
    var list = inbox.filter(function (m) { return showDone || m.status !== "handled"; });
    if (!list.length) { ul.appendChild(el("li", "", showDone ? "No messages yet." : "You're all caught up. No new messages.")); return; }
    list.forEach(function (m) {
      var li = el("li", "msg-item" + (m.status === "handled" ? " done" : ""));
      var top = el("div", "msg-top");
      top.appendChild(el("b", "", m.name || "No name"));
      top.appendChild(el("span", "badge" + (m.status === "handled" ? "" : " new"), m.status === "handled" ? "Handled" : "New"));
      var when = ms(m.createdAt) ? new Date(ms(m.createdAt)).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
      top.appendChild(el("span", "msg-when", [TOPIC_TXT[m.topic] || "Message", STORE_TXT[m.store] || "", when].filter(Boolean).join(" · ")));
      li.appendChild(top);
      if (m.ref) li.appendChild(el("p", "msg-ref", "Regarding: " + m.ref));
      li.appendChild(el("p", "msg-body", m.message || ""));
      var contact = el("p", "msg-contact");
      if (m.phone) { var a = el("a", "", m.phone); a.href = "tel:" + String(m.phone).replace(/[^0-9+]/g, ""); contact.appendChild(a); }
      if (m.email) {
        if (m.phone) contact.appendChild(document.createTextNode("  ·  "));
        var e2 = el("a", "", m.email); e2.href = "mailto:" + encodeURIComponent(m.email).replace(/%40/g, "@") + "?subject=" + encodeURIComponent("Re: your message to Miller Hardware"); contact.appendChild(e2);
      }
      li.appendChild(contact);
      var acts = el("div", "acts");
      actBtn(acts, m.status === "handled" ? "Mark as new" : "Mark handled", "btn-line", function () {
        var next = m.status === "handled" ? "new" : "handled";
        db.collection("messages").doc(m.id).update({ status: next }).then(function () { m.status = next; renderInbox(); }).catch(function (e) { say("inbox-msg", friendly(e), "err"); });
      });
      actBtn(acts, "Delete", "btn-line", function () {
        confirmDelete(acts, "Delete this message for good?", function () {
          db.collection("messages").doc(m.id).delete().then(function () { inbox = inbox.filter(function (x) { return x.id !== m.id; }); renderInbox(); say("inbox-msg", "Deleted.", "ok"); })
            .catch(function (e) { say("inbox-msg", friendly(e), "err"); });
        }, renderInbox);
      });
      li.appendChild(acts); ul.appendChild(li);
    });
  }
  function setupInbox() {
    $("inbox-done").addEventListener("change", renderInbox);
    $("inbox-refresh").addEventListener("click", loadInbox);
  }

  // ---------- specials ----------
  var specials = [], sp = { id: null, photo: "" };
  function spRead() {
    return { title: $("sp-title").value.trim(), price: $("sp-price").value === "" ? "" : Number($("sp-price").value),
      priceNote: $("sp-note").value.trim(), description: $("sp-desc").value.trim(), store: $("sp-store").value,
      startDate: $("sp-start").value, endDate: $("sp-end").value, photo: sp.photo, active: $("sp-active").checked, clearance: $("sp-clear").checked };
  }
  function spPreview() {
    var x = spRead(), host = $("sp-preview"); host.textContent = "";
    var c = el("article", "special" + (x.clearance ? " is-clearance" : ""));
    if (x.clearance) c.appendChild(el("span", "ribbon", "Clearance"));
    if (x.photo) { var ph = el("div", "special-photo"); var im = el("img"); im.src = x.photo; im.alt = ""; ph.appendChild(im); c.appendChild(ph); }
    var b = el("div", "special-body"); b.appendChild(el("h3", "", x.title || "Special title"));
    if (x.price !== "" || x.priceNote) {
      var pr = el("p", "special-price", x.price !== "" ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(x.price) : "");
      if (x.priceNote) pr.appendChild(el("small", "", x.priceNote)); b.appendChild(pr);
    }
    if (x.description) b.appendChild(el("p", "", x.description));
    b.appendChild(el("p", "special-meta", [STORE_TXT[x.store] || "Both stores", x.endDate ? "Ends " + x.endDate : "While supplies last"].join(" · ")));
    c.appendChild(b); host.appendChild(c);
    var t = $("sp-thumb"); t.textContent = "";
    if (sp.photo) {
      var d = el("div", "thumb"); var im2 = el("img"); im2.src = sp.photo; im2.alt = "Photo"; d.appendChild(im2);
      var rm = el("button", "", "×"); rm.type = "button"; rm.setAttribute("aria-label", "Remove photo"); rm.addEventListener("click", function () { sp.photo = ""; spPreview(); });
      d.appendChild(rm); t.appendChild(d);
    }
  }
  function spReset() {
    sp = { id: null, photo: "" };
    ["sp-title", "sp-price", "sp-note", "sp-desc", "sp-start", "sp-end"].forEach(function (id) { $(id).value = ""; });
    $("sp-store").value = "both"; $("sp-active").checked = true; $("sp-clear").checked = false; $("sp-photo").value = "";
    $("sp-form-title").textContent = "Add a special"; show("sp-cancel", false); spPreview();
  }
  function spEdit(x) {
    sp = { id: x.id, photo: x.photo || "" };
    $("sp-title").value = x.title || ""; $("sp-price").value = x.price === "" || x.price == null ? "" : x.price;
    $("sp-note").value = x.priceNote || ""; $("sp-desc").value = x.description || ""; $("sp-store").value = x.store || "both";
    $("sp-start").value = x.startDate || ""; $("sp-end").value = x.endDate || ""; $("sp-active").checked = x.active !== false; $("sp-clear").checked = !!x.clearance;
    $("sp-form-title").textContent = "Edit special"; show("sp-cancel", true); spPreview(); say("sp-msg", "");
    $("sp-form-title").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function loadSpecials() {
    db.collection("specials").get().then(function (qs) {
      specials = []; qs.forEach(function (d) { var x = d.data(); x.id = d.id; specials.push(x); });
      specials.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); }); renderSpecials();
    }).catch(function (e) { say("sp-list-msg", friendly(e), "err"); });
  }
  function renderSpecials() {
    var ul = $("sp-list"); ul.textContent = "";
    var t = new Date(); var today = t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") + "-" + String(t.getDate()).padStart(2, "0");
    if (!specials.length) { ul.appendChild(el("li", "", "No specials yet. Add one above.")); return; }
    specials.forEach(function (x) {
      var li = el("li"); var pic = el("div", "pic"); if (x.photo) { var im = el("img"); im.src = x.photo; im.alt = ""; pic.appendChild(im); } li.appendChild(pic);
      var info = el("div", "info"); var b = el("b", "", x.title || "Special");
      var state = x.active === false ? "Hidden" : (x.endDate && x.endDate < today ? "Ended" : (x.startDate && x.startDate > today ? "Scheduled" : "Showing"));
      b.appendChild(el("span", "badge" + (state === "Showing" ? " new" : ""), state)); info.appendChild(b);
      info.appendChild(el("span", "", [STORE_TXT[x.store] || "Both stores", x.endDate ? "ends " + x.endDate : "no end date"].join(" · ")));
      li.appendChild(info);
      var acts = el("div", "acts");
      actBtn(acts, "Edit", "btn-line", function () { spEdit(x); });
      actBtn(acts, x.active === false ? "Show" : "Hide", "btn-line", function () {
        db.collection("specials").doc(x.id).update({ active: x.active === false }).then(function () { x.active = x.active === false; renderSpecials(); })
          .catch(function (e) { say("sp-list-msg", friendly(e), "err"); });
      });
      actBtn(acts, "Delete", "btn-line", function () {
        confirmDelete(acts, "Delete this special?", function () {
          db.collection("specials").doc(x.id).delete().then(function () { specials = specials.filter(function (y) { return y.id !== x.id; }); if (sp.id === x.id) spReset(); renderSpecials(); })
            .catch(function (e) { say("sp-list-msg", friendly(e), "err"); });
        }, renderSpecials);
      });
      li.appendChild(acts); ul.appendChild(li);
    });
  }
  function setupSpecials() {
    ["sp-title", "sp-price", "sp-note", "sp-desc", "sp-store", "sp-start", "sp-end", "sp-active", "sp-clear"].forEach(function (id) { $(id).addEventListener("input", spPreview); $(id).addEventListener("change", spPreview); });
    $("sp-photo").addEventListener("change", function () {
      var f = this.files && this.files[0]; if (!f) return; say("sp-msg", "Preparing photo...");
      shrink(f).then(function (d) { sp.photo = d; spPreview(); say("sp-msg", ""); }).catch(function (e) { say("sp-msg", e.message, "err"); });
      this.value = "";
    });
    $("sp-cancel").addEventListener("click", function () { spReset(); say("sp-msg", ""); });
    $("sp-form").addEventListener("submit", function (e) {
      e.preventDefault(); var d = spRead();
      if (!d.title) { say("sp-msg", "Add a title for the special.", "err"); return; }
      if (d.startDate && d.endDate && d.endDate < d.startDate) { say("sp-msg", "The end date is before the start date.", "err"); return; }
      say("sp-msg", "Saving..."); var col = db.collection("specials"), p;
      if (sp.id) { d.updatedAt = Date.now(); p = col.doc(sp.id).update(d); } else { d.createdAt = Date.now(); d.updatedAt = d.createdAt; p = col.add(d); }
      p.then(function () { say("sp-msg", d.active ? "Saved. It shows on the home page during its dates." : "Saved, but hidden from the site.", "ok"); spReset(); loadSpecials(); })
        .catch(function (err) { say("sp-msg", friendly(err), "err"); });
    });
    spReset();
  }

  // ---------- jobs ----------
  var jobs = [], jb = { id: null };
  function jbReset() {
    jb = { id: null }; $("jb-title").value = ""; $("jb-desc").value = ""; $("jb-store").value = "both"; $("jb-type").value = "Full-time"; $("jb-open").checked = true;
    $("jb-form-title").textContent = "Post a job"; show("jb-cancel", false);
  }
  function jbEdit(j) {
    jb = { id: j.id }; $("jb-title").value = j.title || ""; $("jb-desc").value = j.description || ""; $("jb-store").value = j.store || "both";
    $("jb-type").value = j.type || "Full-time"; $("jb-open").checked = j.open !== false;
    $("jb-form-title").textContent = "Edit job"; show("jb-cancel", true); say("jb-msg", "");
    $("jb-form-title").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function loadJobs() {
    db.collection("jobs").get().then(function (qs) {
      jobs = []; qs.forEach(function (d) { var x = d.data(); x.id = d.id; jobs.push(x); });
      jobs.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); }); renderJobs();
    }).catch(function (e) { say("jb-list-msg", friendly(e), "err"); });
  }
  function renderJobs() {
    var ul = $("jb-list"); ul.textContent = "";
    if (!jobs.length) { ul.appendChild(el("li", "", "No jobs posted. The careers page shows a friendly 'no openings' note.")); return; }
    jobs.forEach(function (j) {
      var li = el("li"); var info = el("div", "info"); var b = el("b", "", j.title || "Job");
      b.appendChild(el("span", "badge" + (j.open !== false ? " new" : ""), j.open !== false ? "Open" : "Closed")); info.appendChild(b);
      info.appendChild(el("span", "", [STORE_TXT[j.store] || "Both stores", j.type].filter(Boolean).join(" · "))); li.appendChild(info);
      var acts = el("div", "acts");
      actBtn(acts, "Edit", "btn-line", function () { jbEdit(j); });
      actBtn(acts, j.open !== false ? "Close" : "Reopen", "btn-line", function () {
        db.collection("jobs").doc(j.id).update({ open: j.open === false }).then(function () { j.open = j.open === false; renderJobs(); }).catch(function (e) { say("jb-list-msg", friendly(e), "err"); });
      });
      actBtn(acts, "Delete", "btn-line", function () {
        confirmDelete(acts, "Delete this job post?", function () {
          db.collection("jobs").doc(j.id).delete().then(function () { jobs = jobs.filter(function (y) { return y.id !== j.id; }); if (jb.id === j.id) jbReset(); renderJobs(); })
            .catch(function (e) { say("jb-list-msg", friendly(e), "err"); });
        }, renderJobs);
      });
      li.appendChild(acts); ul.appendChild(li);
    });
  }
  function setupJobs() {
    $("jb-cancel").addEventListener("click", function () { jbReset(); say("jb-msg", ""); });
    $("jb-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var d = { title: $("jb-title").value.trim(), description: $("jb-desc").value.trim(), store: $("jb-store").value, type: $("jb-type").value, open: $("jb-open").checked };
      if (!d.title) { say("jb-msg", "Add a job title.", "err"); return; }
      say("jb-msg", "Saving..."); var col = db.collection("jobs"), p;
      if (jb.id) { d.updatedAt = Date.now(); p = col.doc(jb.id).update(d); } else { d.createdAt = Date.now(); d.updatedAt = d.createdAt; p = col.add(d); }
      p.then(function () { say("jb-msg", d.open ? "Saved. It's on the careers page now." : "Saved as closed. It won't show on the site.", "ok"); jbReset(); loadJobs(); })
        .catch(function (err) { say("jb-msg", friendly(err), "err"); });
    });
    jbReset();
  }

})();
