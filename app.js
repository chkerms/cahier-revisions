/* Cahier de révisions : lecteur de leçons chiffrées. Aucune dépendance externe. */
"use strict";
(function () {
var VERSION = "1.1.1";
var app = document.getElementById("app");
var nextBar = document.getElementById("next");
var D = null, IMG = {}, LESSONS = [], FILTRE = "tout";

/* ------------------------------------------------------------ réglages et stockage */
function reglages() { try { return JSON.parse(localStorage.getItem("reglages") || "{}"); } catch (e) { return {}; } }
function setReglages(o) { var r = reglages(); for (var k in o) r[k] = o[k]; try { localStorage.setItem("reglages", JSON.stringify(r)); } catch (e) {} }

var idb = {
  db: null,
  open: function () {
    var self = this;
    if (self.db) return Promise.resolve(self.db);
    return new Promise(function (res, rej) {
      if (!window.indexedDB) return rej(new Error("IndexedDB indisponible"));
      var r = indexedDB.open("cahier", 1);
      r.onupgradeneeded = function () { r.result.createObjectStore("kv"); };
      r.onsuccess = function () { self.db = r.result; res(self.db); };
      r.onerror = function () { rej(r.error); };
    });
  },
  op: function (mode, fn) {
    return this.open().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction("kv", mode), st = tx.objectStore("kv"), q = fn(st);
        tx.oncomplete = function () { res(q && q.result); };
        tx.onerror = function () { rej(tx.error); };
      });
    });
  },
  get: function (k) { return this.op("readonly", function (s) { return s.get(k); }); },
  put: function (k, v) { return this.op("readwrite", function (s) { return s.put(v, k); }); },
  del: function (k) { return this.op("readwrite", function (s) { return s.delete(k); }); }
};

/* ------------------------------------------------------------ chiffrement (WebCrypto) */
function b64(s) { var bin = atob(s), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
var subtle = window.crypto && window.crypto.subtle;

function unlock(password) {
  return fetch("cle/privee.json", { cache: "no-store" }).then(function (r) {
    if (!r.ok) throw new Error("clé introuvable (" + r.status + ")");
    return r.json();
  }).then(function (s) {
    return subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]).then(function (base) {
      return subtle.deriveKey({ name: "PBKDF2", salt: b64(s.salt), iterations: s.iter, hash: "SHA-256" }, base,
        { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    }).then(function (aes) {
      return subtle.decrypt({ name: "AES-GCM", iv: b64(s.iv) }, aes, b64(s.ct)).catch(function () { throw new Error("MOT_DE_PASSE"); });
    });
  }).then(function (pkcs8) {
    return subtle.importKey("pkcs8", pkcs8, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["decrypt"]);
  }).then(function (key) {
    return idb.put("cle", key).then(function () { return key; });
  });
}

function decryptLesson(env, key) {
  return subtle.decrypt({ name: "RSA-OAEP" }, key, b64(env.k)).then(function (raw) {
    return subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
  }).then(function (aes) {
    return subtle.decrypt({ name: "AES-GCM", iv: b64(env.iv) }, aes, b64(env.ct));
  }).then(function (buf) { return JSON.parse(new TextDecoder().decode(buf)); });
}

/* ------------------------------------------------------------ chargement des leçons */
function loadLessons(key) {
  var bad = 0;
  var remote = fetch("lecons/index.json", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : { lecons: [] }; })
    .catch(function () { return { lecons: [] }; })
    .then(function (idx) {
      return Promise.all(idx.lecons.map(function (e) {
        return fetch("lecons/" + e.f + "?m=" + encodeURIComponent(e.maj || ""), { cache: "no-cache" })
          .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
          .then(function (env) { return decryptLesson(env, key); })
          .catch(function () { bad++; return null; });
      }));
    });
  var local = idb.get("imports").then(function (v) { return v || []; }).catch(function () { return []; });
  return Promise.all([remote, local]).then(function (r) {
    var all = {}, list = r[0].filter(Boolean).concat(r[1].map(function (l) { l._importee = true; return l; }));
    list.forEach(function (l) { if (l && l.meta && l.meta.id) all[l.meta.id] = l; });
    LESSONS = Object.keys(all).map(function (k) { return all[k]; })
      .sort(function (a, b) { return a.meta.date < b.meta.date ? 1 : a.meta.date > b.meta.date ? -1 :
        plain(a.meta.titre).localeCompare(plain(b.meta.titre), "fr", { numeric: true }); });
    return { total: LESSONS.length, illisibles: bad };
  });
}
/* ------------------------------------------------------------ utilitaires */
function h(tag, attrs) {
  var el = document.createElement(tag), i, k;
  if (attrs) for (k in attrs) {
    if (!Object.prototype.hasOwnProperty.call(attrs, k) || attrs[k] == null || attrs[k] === false) continue;
    if (k === "class") el.className = attrs[k];
    else if (k === "text") el.textContent = attrs[k];
    else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), attrs[k]);
    else el.setAttribute(k, attrs[k] === true ? "" : attrs[k]);
  }
  for (i = 2; i < arguments.length; i++) add(el, arguments[i]);
  return el;
}
function add(el, c) {
  if (c == null || c === false) return;
  if (Array.isArray(c)) { c.forEach(function (x) { add(el, x); }); return; }
  el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
}
function txt(e) { return typeof e === "string" ? e : e.texte; }
function oralOverride(e) { return typeof e === "string" ? null : e.oral; }
function shuffle(a) {
  a = a.slice();
  for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}
/* progression par leçon, sur cet appareil uniquement */
var store = {
  key: function (id) { return "prog:" + (id || D.meta.id); },
  get: function (id) { try { return JSON.parse(localStorage.getItem(this.key(id)) || "{}"); } catch (e) { return {}; } },
  set: function (v, id) { try { localStorage.setItem(this.key(id), JSON.stringify(v)); } catch (e) {} },
  patch: function (o) { var s = this.get(); for (var k in o) s[k] = o[k]; this.set(s); }
};

/* ------------------------------------------------------------ texte riche */
var TOKEN = /\\([{}])|\{([^{}:]+):([^{}]*)\}/g;
var LANGS = { en: "en-GB", de: "de-DE", es: "es-ES", it: "it-IT" };
var COULEURS = { rouge: "--c-rouge", bleu: "--c-bleu", vert: "--c-vert", noir: "--c-noir", orange: "--c-orange",
  violet: "--c-violet", rose: "--c-rose", marron: "--c-marron" };
var SURLIGNES = { surligne_jaune: "--h-jaune", surligne_vert: "--h-vert", surligne_rose: "--h-rose" };

function styleSpan(key, content) {
  var st = (D.styles || {})[key] || {}, cls = [], css = "";
  if (COULEURS[st.couleur]) css += "color:var(" + COULEURS[st.couleur] + ");";
  if (SURLIGNES[st.couleur]) css += "background:var(" + SURLIGNES[st.couleur] + ");border-radius:.15em;padding:0 .1em;";
  if (st.souligne) cls.push("st-souligne");
  if (st.encadre) cls.push("st-encadre");
  if (st.gras) cls.push("st-gras");
  return h("span", { class: cls.join(" "), style: css || null, title: st.signification || null }, content);
}
function fracEl(content) {
  var p = content.split("/");
  return h("span", { class: "frac", role: "math", "aria-label": fracWords(+p[0], +p[1]) },
    h("span", { class: "fn" }, p[0]), h("span", { class: "fd" }, p[1]));
}
function rich(s) {
  s = String(s).replace(/(\d) (?=\d{3}(?!\d))/g, "$1\u202F"); /* 3 452 : espace insécable, le nombre ne se coupe pas */
  var frag = document.createDocumentFragment(), last = 0, m, hasFrac = false;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(s))) {
    if (m.index > last) frag.appendChild(document.createTextNode(s.slice(last, m.index)));
    if (m[1]) frag.appendChild(document.createTextNode(m[1]));
    else {
      var key = m[2], c = m[3];
      if (key === "frac") { frag.appendChild(fracEl(c)); hasFrac = true; }
      else if (key === "mc") frag.appendChild(h("span", { class: "mc" }, c));
      else if (key.indexOf("lang-") === 0) frag.appendChild(h("span", { lang: LANGS[key.slice(5)] || null }, c));
      else frag.appendChild(styleSpan(key, c));
    }
    last = TOKEN.lastIndex;
  }
  if (last < s.length) frag.appendChild(document.createTextNode(s.slice(last)));
  var wrap = h("span", { class: hasFrac ? "has-frac" : null });
  wrap.appendChild(frag);
  return wrap;
}

/* ------------------------------------------------------------ voix */
var ORD = { 2: "demi", 3: "tiers", 4: "quart", 5: "cinquième", 6: "sixième", 7: "septième", 8: "huitième",
  9: "neuvième", 10: "dixième", 11: "onzième", 12: "douzième", 100: "centième", 1000: "millième" };
function fracWords(a, b) {
  if (!ORD[b]) return a + " sur " + b;
  var w = ORD[b];
  if (a > 1 && b !== 3) w += "s";
  return (a === 1 ? "un" : String(a)) + " " + w;
}
function mathWords(s) {
  return s.replace(/(\d)\s*×\s*(\d)/g, "$1 fois $2").replace(/(\d)\s*[−-]\s*(\d)/g, "$1 moins $2")
          .replace(/(\d)\s*\+\s*(\d)/g, "$1 plus $2").replace(/(\d)\s*=\s*(\d)/g, "$1 égale $2")
          .replace(/(\d) (\d{3})\b/g, "$1$2");
}
/* Texte riche -> segments {text, lang} pour la synthèse vocale */
function segments(s, lang) {
  var out = [], last = 0, m, buf = "";
  lang = lang || "fr-FR";
  function flush() { if (buf.trim()) out.push({ text: mathWords(buf), lang: lang }); buf = ""; }
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(s))) {
    buf += s.slice(last, m.index);
    if (m[1]) buf += m[1];
    else if (m[2] === "frac") { var p = m[3].split("/"); buf += " " + fracWords(+p[0], +p[1]) + " "; }
    else if (m[2].indexOf("lang-") === 0) { flush(); out.push({ text: m[3], lang: LANGS[m[2].slice(5)] || lang }); }
    else buf += m[3];
    last = TOKEN.lastIndex;
  }
  buf += s.slice(last); flush();
  return out;
}
function segOf(e) { var o = oralOverride(e); return o ? [{ text: o, lang: "fr-FR" }] : segments(txt(e)); }

var TTS = {
  ok: "speechSynthesis" in window && typeof window.SpeechSynthesisUtterance === "function",
  auto: true, btn: null,
  voice: function (lang) {
    var vs = window.speechSynthesis.getVoices() || [], base = lang.slice(0, 2), best = null, i, v;
    for (i = 0; i < vs.length; i++) {
      v = vs[i]; var l = (v.lang || "").replace("_", "-");
      if (l === lang && (!best || (v.localService && !best.localService))) best = v;
    }
    if (best) return best;
    for (i = 0; i < vs.length; i++) if ((vs[i].lang || "").slice(0, 2) === base) return vs[i];
    return null;
  },
  stop: function () { if (!this.ok) return; window.speechSynthesis.cancel(); if (this.btn) this.btn.classList.remove("speaking"); this.btn = null; },
  speak: function (segs, btn) {
    if (!this.ok || !segs || !segs.length) return;
    var self = this, wasSame = btn && btn === this.btn;
    this.stop();
    if (wasSame) return;               /* deuxième appui = stop */
    this.btn = btn || null;
    if (btn) btn.classList.add("speaking");
    segs.forEach(function (sg, i) {
      var u = new SpeechSynthesisUtterance(sg.text);
      u.lang = sg.lang; u.rate = 0.85; u.pitch = 1.05;
      var v = self.voice(sg.lang); if (v) u.voice = v;
      if (i === segs.length - 1) u.onend = u.onerror = function () { if (self.btn === btn) self.stop(); };
      window.speechSynthesis.speak(u);
    });
  }
};
if (TTS.ok) { try { window.speechSynthesis.getVoices(); window.speechSynthesis.onvoiceschanged = function () {}; } catch (e) { TTS.ok = false; } }
if (!TTS.ok) document.documentElement.classList.add("no-tts");
function sayBtn(getSegs, cls) {
  var b = h("button", { class: "say" + (cls ? " " + cls : ""), "aria-label": "Écouter", type: "button", text: "🔊" });
  b.addEventListener("click", function (ev) { ev.stopPropagation(); TTS.speak(getSegs(), b); });
  return b;
}

/* ------------------------------------------------------------ blocs de leçon */
var BLOCS = {};
var SIGN = { addition: "+", soustraction: "−", multiplication: "×" };

function blocOral(b) {
  if (b.oral) return [{ text: b.oral, lang: "fr-FR" }];
  var S = [];
  function r(s) { S = S.concat(segments(s)); }
  switch (b.type) {
    case "titre": case "paragraphe": case "regle": case "remarque": r(b.texte); break;
    case "definition": r(b.terme + ". " + b.texte); break;
    case "exemples": case "liste":
      if (b.titre) r(b.titre + ".");
      b.items.forEach(function (it) { S = S.concat(segOf(it)); }); break;
    case "tableau":
      if (b.titre) r(b.titre + ".");
      b.lignes.forEach(function (row) { r(row.join(", ") + "."); }); break;
    case "operation_posee":
      S.push({ text: mathWords(b.termes.join(" " + SIGN[b.operation] + " ") + " = " + b.resultat), lang: "fr-FR" }); break;
    case "poeme":
      S.push({ text: b.titre + (b.auteur ? ", de " + b.auteur : "") + ".", lang: "fr-FR" });
      (b.strophes || []).forEach(function (st) { S.push({ text: st.join(", "), lang: "fr-FR" }); }); break;
    case "frise": b.evenements.forEach(function (e) { r(e.repere + " : " + e.libelle + "."); }); break;
    case "schema_legende":
      var im = (D.images || []).filter(function (x) { return x.id === b.image; })[0];
      if (im) S.push({ text: im.description, lang: "fr-FR" });
      b.legendes.forEach(function (l) { r("Numéro " + l.repere + " : " + l.libelle + "."); }); break;
  }
  return S;
}

function opEl(b) {
  var nums = b.termes.concat([b.resultat]), intL = 0, fracL = 0;
  nums.forEach(function (n) { var p = n.split(","); intL = Math.max(intL, p[0].length); fracL = Math.max(fracL, (p[1] || "").length); });
  var cols = intL + (fracL ? 1 + fracL : 0);
  function cells(n) {
    var p = n.split(","), a = [], i;
    for (i = 0; i < intL - p[0].length; i++) a.push("");
    a = a.concat(p[0].split(""));
    if (fracL) { a.push(p[1] != null ? "," : ""); var f = (p[1] || "").split(""); while (f.length < fracL) f.push(""); a = a.concat(f); }
    return a;
  }
  var g = h("div", { class: "op", style: "grid-template-columns:repeat(" + (cols + 1) + ",auto)", role: "img",
    "aria-label": mathWords(b.termes.join(" " + SIGN[b.operation] + " ") + " = " + b.resultat) });
  if (b.retenues && b.retenues.some(function (x) { return x; })) {
    var ret = b.retenues.slice(); while (ret.length < cols) ret.unshift("");
    g.appendChild(h("span"));
    ret.forEach(function (x) { g.appendChild(h("span", { class: "ret", text: x })); });
  }
  b.termes.forEach(function (t, i) {
    g.appendChild(h("span", { class: "sign", text: i === b.termes.length - 1 ? SIGN[b.operation] : "" }));
    cells(t).forEach(function (c) { g.appendChild(h("span", { text: c })); });
  });
  g.appendChild(h("span", { class: "res" }));
  cells(b.resultat).forEach(function (c) { g.appendChild(h("span", { class: "res", text: c })); });
  return h("div", { class: "opbox" }, g);
}

function renderBloc(b, opts) {
  opts = opts || {};
  var body, label = null, cls = "card b-" + b.type;
  switch (b.type) {
    case "titre": return h("h2", { class: "b-titre", "data-bloc": b.id }, rich(b.texte));
    case "paragraphe": body = h("p", null, rich(b.texte)); break;
    case "definition": label = "📌 Définition";
      body = [h("div", { class: "terme" }, rich(b.terme)), h("p", null, rich(b.texte))]; break;
    case "regle": label = "⭐ À retenir"; body = h("p", null, rich(b.texte)); break;
    case "remarque": label = "👀 Attention"; body = h("p", null, rich(b.texte)); break;
    case "exemples": label = "Exemples";
      body = h("ul", null, b.items.map(function (it) { return h("li", null, rich(txt(it))); })); break;
    case "liste":
      body = [b.titre ? h("div", { class: "terme" }, rich(b.titre)) : null,
        h(b.ordonnee ? "ol" : "ul", null, b.items.map(function (it) { return h("li", null, rich(txt(it))); }))]; break;
    case "tableau":
      body = [b.titre ? h("div", { class: "label" }, rich(b.titre)) : null,
        h("div", { class: "tablewrap" }, h("table", null,
          h("thead", null, h("tr", null, b.entetes.map(function (x) { return h("th", null, rich(x)); }))),
          h("tbody", null, b.lignes.map(function (row) { return h("tr", null, row.map(function (c) { return h("td", null, rich(c)); })); }))))]; break;
    case "operation_posee": body = opEl(b); break;
    case "poeme": cls += " poeme";
      if (!b.strophes) { body = [h("div", { class: "terme" }, b.titre), saisiePoeme(b)]; break; }
      body = [h("div", { class: "terme" }, b.titre),
        b.strophes.map(function (st) { return h("div", { class: "strophe" }, st.map(function (v) { return h("span", { class: "vers", text: v }); })); }),
        b.auteur ? h("div", { class: "auteur", text: b.auteur }) : null,
        b.saisie_parent && !opts.noSay ? h("details", { class: "corriger" }, h("summary", { text: "✏️ Corriger le texte (parent)" }), saisiePoeme(b)) : null]; break;
    case "frise":
      body = h("ul", { class: "frise" }, b.evenements.map(function (e) {
        return h("li", null, h("span", { class: "rep", text: e.repere }), rich(e.libelle)); })); break;
    case "schema_legende": cls += " schema";
      var im = (D.images || []).filter(function (x) { return x.id === b.image; })[0];
      body = [IMG[b.image] ? h("img", { src: IMG[b.image], alt: im ? im.description : "" }) : null,
        b.legendes.map(function (l) { return h("div", { class: "legende" }, h("span", { class: "num", text: l.repere }), h("span", null, rich(l.libelle))); })]; break;
    default: return h("div");
  }
  var card = h("section", { class: cls + (opts.noSay ? "" : " has-say"), "data-bloc": b.id },
    label ? h("div", { class: "label", text: label }) : null, body);
  if (!opts.noSay) card.appendChild(sayBtn(function () { return blocOral(b); }));
  return card;
}

function itemImg(it) {
  if (!it.image || !IMG[it.image]) return null;
  var im = (D.images || []).filter(function (x) { return x.id === it.image; })[0];
  return h("img", { class: "qimg", src: IMG[it.image], alt: im ? im.description : "" });
}

/* ------------------------------------------------------------ état global */
var STEP_META = {
  lecon: { icon: "📖", label: "Ma leçon" }, cartes: { icon: "🔄", label: "Cartes" },
  quiz: { icon: "🎯", label: "Quiz" }, calculs: { icon: "🧮", label: "Calculs" }, recitation: { icon: "🎤", label: "Récitation" },
  oral: { icon: "🗣️", label: "Interro" }
};
var state = { step: 0, done: {}, stars: 0 };
var starsEl;

function addStar(n) {
  state.stars += n || 1;
  starsEl.textContent = "⭐ " + state.stars;
  starsEl.classList.remove("pop"); void starsEl.offsetWidth; starsEl.classList.add("pop");
}
function setProgress(fr) { var b = document.getElementById("bar"); if (b) b.firstChild.style.width = Math.round(fr * 100) + "%"; }
function setNext(label, fn, cls) {
  nextBar.innerHTML = "";
  if (!label) { nextBar.hidden = true; return; }
  nextBar.hidden = false;
  nextBar.appendChild(h("button", { class: "btn " + (cls || "primary"), type: "button", id: "next-btn", onclick: fn, text: label }));
}
function goNext() {
  state.done[D.parcours[state.step]] = true;
  if (state.step < D.parcours.length - 1) { state.step++; render(); } else renderEnd();
}
function nextLabel() {
  var n = D.parcours[state.step + 1];
  return n ? "Étape suivante : " + STEP_META[n].icon + " " + STEP_META[n].label + "  ➜" : "J'ai fini ! 🎉";
}

function shell() {
  app.innerHTML = "";
  starsEl = h("div", { class: "stars", "aria-live": "polite", text: "⭐ " + state.stars });
  var autoBtn = TTS.ok ? h("button", { class: "iconbtn", type: "button", "aria-label": "Lecture automatique", "aria-pressed": String(TTS.auto),
    text: "🎧", onclick: function () { TTS.auto = !TTS.auto; autoBtn.setAttribute("aria-pressed", String(TTS.auto)); if (!TTS.auto) TTS.stop(); } }) : null;
  var de = document.documentElement;
  var fsBtn = (document.fullscreenEnabled && de.requestFullscreen) ? h("button", { class: "iconbtn", type: "button", "aria-label": "Plein écran", text: "⛶",
    onclick: function () { if (document.fullscreenElement) document.exitFullscreen(); else de.requestFullscreen().catch(function () {}); } }) : null;
  var homeBtn = h("button", { class: "iconbtn", type: "button", id: "btn-home", "aria-label": "Retour aux leçons", text: "🏠",
    onclick: function () { TTS.stop(); setNext(null); renderHome(); } });
  app.appendChild(h("header", { class: "top" }, homeBtn, h("h1", null, rich(D.meta.titre)), starsEl, autoBtn, fsBtn));
  app.appendChild(h("nav", { class: "steps" + (D.parcours.length >= 5 ? " many" : ""), "aria-label": "Étapes" }, D.parcours.map(function (s, i) {
    return h("button", { class: "step", type: "button", "aria-label": STEP_META[s].label, "aria-current": i === state.step ? "step" : null, "data-step": s,
      onclick: function () { TTS.stop(); state.step = i; render(); } },
      h("span", { "aria-hidden": "true", text: STEP_META[s].icon }), h("span", { class: "lbl", text: STEP_META[s].label }), state.done[s] ? h("span", { class: "done", text: " ✓" }) : null);
  })));
  app.appendChild(h("div", { class: "bar", id: "bar" }, h("i")));
  var main = h("main", { id: "main" }); app.appendChild(main);
  return main;
}

function render() {
  TTS.stop();
  var main = shell(), s = D.parcours[state.step];
  window.scrollTo(0, 0);
  ({ lecon: stepLecon, cartes: stepCartes, quiz: stepQuiz, calculs: stepCalculs, recitation: stepRecitation, oral: stepOral })[s](main);
}

/* ------------------------------------------------------------ 1. leçon */
function stepLecon(main) {
  D.lecon.blocs.forEach(function (b) { main.appendChild(renderBloc(b)); });
  setProgress(1);
  setNext(D.parcours.length > 1 ? "J'ai lu ma leçon ✓  ➜" : "J'ai fini ! 🎉", goNext);
}

/* ------------------------------------------------------------ 2. cartes mémo */
function stepCartes(main) {
  var saved = store.get().demain || [];
  var cards = D.cartes.slice().sort(function (a, b) { return (saved.indexOf(b.id) >= 0) - (saved.indexOf(a.id) >= 0); });
  var queue = cards.map(function (c) { return { c: c, passes: 0 }; });
  var known = [], later = [], total = D.cartes.length;
  setNext(null);
  var zone = h("div"); main.appendChild(zone);

  function show() {
    zone.innerHTML = "";
    setProgress((known.length + later.length) / total);
    if (!queue.length) return finish();
    var cur = queue[0], flipped = false;
    var front = h("div", { class: "face front" }, itemImg(cur.c), rich(txt(cur.c.recto)), h("div", { class: "hint", text: "👆 Touche la carte pour la retourner" }));
    var back = h("div", { class: "face back" }, rich(txt(cur.c.verso)));
    front.appendChild(sayBtn(function () { return segOf(cur.c.recto); }));
    back.appendChild(sayBtn(function () { return segOf(cur.c.verso); }));
    var flip = h("div", { class: "flip", id: "flashcard" }, h("div", { class: "flip-inner" }, front, back));
    var btns = h("div", { class: "actions", hidden: true },
      h("button", { class: "btn soft", type: "button", id: "btn-revoir", text: "🔁 À revoir", onclick: function () {
        cur.passes++; queue.shift();
        if (cur.passes >= 3) { later.push(cur.c); toast("On la reverra demain 🌙"); }
        else queue.push(cur);
        show(); } }),
      h("button", { class: "btn ok", type: "button", id: "btn-connais", text: "✅ Je connais", onclick: function () {
        queue.shift(); known.push(cur.c); if (cur.passes === 0) addStar(); show(); } }));
    function doFlip() {
      flipped = !flipped; flip.classList.toggle("flipped", flipped);
      btns.hidden = !flipped;
      if (flipped && TTS.auto) TTS.speak(segOf(cur.c.verso), back.querySelector(".say"));
    }
    flip.setAttribute("role", "button"); flip.setAttribute("tabindex", "0");
    flip.setAttribute("aria-label", "Retourner la carte");
    flip.addEventListener("click", doFlip);
    flip.addEventListener("keydown", function (ev) { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); doFlip(); } });
    var minH = 0;
    zone.appendChild(h("div", { class: "counter", text: "Carte " + (known.length + later.length + 1) + " sur " + total }));
    zone.appendChild(flip); zone.appendChild(btns);
    /* hauteur de carte selon le contenu le plus long */
    [front, back].forEach(function (f) { minH = Math.max(minH, f.scrollHeight); });
    flip.firstChild.style.minHeight = Math.max(minH, 200) + "px";
    if (TTS.auto) TTS.speak(segOf(cur.c.recto), front.querySelector(".say"));
  }
  function finish() {
    var st = store.get(); st.demain = later.map(function (c) { return c.id; }); store.set(st);
    zone.appendChild(h("div", { class: "card end" }, h("div", { class: "big", text: "🎉" }),
      h("p", { text: "Tu connais " + known.length + " carte" + (known.length > 1 ? "s" : "") + " sur " + total + " !" }),
      later.length ? h("p", { text: "🌙 " + later.length + " carte" + (later.length > 1 ? "s" : "") + " à revoir demain." }) : null));
    setProgress(1);
    setNext(nextLabel(), goNext);
  }
  function toast(m) { zone.parentNode.insertBefore(h("div", { class: "feedback again", role: "status", text: m }), zone); setTimeout(function () {
    var t = main.querySelector(".feedback.again"); if (t) t.remove(); }, 1800); }
  show();
}

/* ------------------------------------------------------------ 3. quiz */
function stepQuiz(main) {
  var qi = 0, firstTry = 0;
  setNext(null);
  function show() {
    main.querySelectorAll(".qzone").forEach(function (n) { n.remove(); });
    var zone = h("div", { class: "qzone" }); main.appendChild(zone);
    setProgress(qi / D.quiz.length);
    if (qi >= D.quiz.length) {
      zone.appendChild(h("div", { class: "card end" }, h("div", { class: "big", text: firstTry >= 4 ? "🏆" : "🎉" }),
        h("p", { text: "Tu as trouvé " + firstTry + " réponse" + (firstTry > 1 ? "s" : "") + " du premier coup sur " + D.quiz.length + " !" })));
      setProgress(1); setNext(nextLabel(), goNext); return;
    }
    var q = D.quiz[qi], tries = 0, solved = false;
    var opts = shuffle([{ e: q.reponse, ok: true }].concat(q.distracteurs.map(function (d) { return { e: d, ok: false }; })));
    var qsay = sayBtn(function () { return segOf(q.question); });
    zone.appendChild(h("div", { class: "counter", text: "Question " + (qi + 1) + " sur " + D.quiz.length }));
    zone.appendChild(h("div", { class: "card has-say" }, h("div", { class: "q" }, rich(txt(q.question))), itemImg(q), qsay));
    var fb = h("div", { "aria-live": "polite" });
    var list = h("div", { class: "choices" });
    opts.forEach(function (o) {
      var b = h("button", { class: "btn", type: "button" }, rich(txt(o.e)));
      b.addEventListener("click", function () {
        if (solved || b.classList.contains("tried")) return;
        tries++; fb.innerHTML = "";
        if (o.ok) {
          solved = true; b.classList.add("right");
          if (tries === 1) { firstTry++; addStar(); }
          fb.appendChild(h("div", { class: "feedback good", text: tries === 1 ? "Bravo ! ⭐" : "Bravo, tu as trouvé ! 👏" }));
          setNext(qi < D.quiz.length - 1 ? "Question suivante ➜" : "Voir mon résultat ➜", function () { qi++; setNext(null); show(); });
        } else {
          b.classList.add("tried");
          var hb = BLOCS[q.indice.bloc];
          fb.appendChild(h("div", { class: "feedback again", text: "Pas tout à fait… Relis ce passage de ta leçon et essaie encore ! 💪" }));
          fb.appendChild(h("div", { class: "hintbox" }, h("div", { class: "label", text: "💡 Indice" }),
            q.indice.aide ? h("p", { text: q.indice.aide }) : null, hb ? renderBloc(hb) : null));
        }
      });
      list.appendChild(h("div", { class: "choice" }, b, sayBtn(function () { return segOf(o.e); }, "inline")));
    });
    zone.appendChild(list); zone.appendChild(fb);
    if (TTS.auto) TTS.speak(segOf(q.question), qsay);
  }
  show();
}

/* ------------------------------------------------------------ 4. récitation */
function stepRecitation(main) {
  var b = BLOCS[D.recitation.bloc], level = 0, MAX = 4;
  if (!b.strophes) { setNext(null); main.appendChild(h("section", { class: "card poeme" }, h("div", { class: "terme", text: b.titre }), saisiePoeme(b))); return; }
  var units = D.recitation.unite === "strophe" ? b.strophes.map(function (st) { return [st]; }) : b.strophes.map(function (st) { return st.map(function (v) { return [v]; }); });
  setNext(null);
  var zone = h("div"); main.appendChild(zone);
  function rank(n) { /* permutation fixe pour que le masquage soit cumulatif d'un niveau à l'autre */
    var idx = []; for (var i = 0; i < n; i++) idx.push(i);
    return idx.sort(function (a, c) { return ((a * 7 + 3) % 11) - ((c * 7 + 3) % 11) || a - c; });
  }
  function lineEl(v) {
    var words = v.split(/(\s+)/), real = [], i;
    for (i = 0; i < words.length; i++) if (words[i].trim()) real.push(i);
    var order = rank(real.length), hideN = Math.round(real.length * level / MAX), hidden = {};
    for (i = 0; i < hideN; i++) hidden[real[order[i]]] = true;
    return h("span", { class: "txt" }, words.map(function (w, j) {
      if (!hidden[j]) return w;
      var m = h("span", { class: "mask", role: "button", tabindex: "0", "aria-label": "mot caché", text: w });
      m.addEventListener("click", function () { m.classList.toggle("show"); });
      return m;
    }));
  }
  function show() {
    zone.innerHTML = "";
    setProgress(level / MAX);
    zone.appendChild(h("div", { class: "level", text: level === 0 ? "Écoute et lis la poésie 👂" :
      level === MAX ? "Tout est caché : récite de mémoire ! 🌟" : "Niveau " + level + " : retrouve les mots cachés 🙈" }));
    var card = h("section", { class: "card poeme" }, h("div", { class: "terme", text: b.titre }));
    if (D.recitation.unite === "strophe") {
      b.strophes.forEach(function (st) {
        card.appendChild(h("div", { class: "line-row strophe" }, h("div", { class: "txt" }, st.map(function (v) { return h("div", null, lineEl(v)); })),
          sayBtn(function () { return [{ text: st.join(", "), lang: "fr-FR" }]; }, "inline")));
      });
    } else {
      b.strophes.forEach(function (st) {
        var s = h("div", { class: "strophe" });
        st.forEach(function (v) { s.appendChild(h("div", { class: "line-row" }, lineEl(v), sayBtn(function () { return [{ text: v, lang: "fr-FR" }]; }, "inline"))); });
        card.appendChild(s);
      });
    }
    zone.appendChild(card);
    zone.appendChild(h("div", { class: "actions" },
      level > 0 ? h("button", { class: "btn", type: "button", text: "👀 Montrer plus de mots", onclick: function () { level--; show(); } }) : null,
      level < MAX ? h("button", { class: "btn primary", type: "button", id: "btn-cacher", text: "🙈 Cacher plus de mots", onclick: function () { level++; if (level === MAX) addStar(); show(); } }) : null,
      h("button", { class: "btn", type: "button", text: "🔊 Tout écouter", onclick: function (ev) { TTS.speak(blocOral(b), ev.currentTarget); } })));
    if (level === MAX) setNext(nextLabel(), goNext); else setNext(null);
  }
  show();
}

/* ------------------------------------------------------------ 5. interro orale */
function stepOral(main) {
  var oi = 0, valid = 0;
  setNext(null);
  function show() {
    main.querySelectorAll(".ozone").forEach(function (n) { n.remove(); });
    var zone = h("div", { class: "ozone" }); main.appendChild(zone);
    setProgress(oi / D.oral.length);
    if (oi >= D.oral.length) { setProgress(1); setNext(nextLabel(), goNext); zone.appendChild(h("div", { class: "card end" },
      h("div", { class: "big", text: "🗣️" }), h("p", { text: valid + " réponse" + (valid > 1 ? "s" : "") + " validée" + (valid > 1 ? "s" : "") + " avec ton parent !" }))); return; }
    var o = D.oral[oi], qsay = sayBtn(function () { return segOf(o.question); });
    zone.appendChild(h("div", { class: "counter", text: "Question " + (oi + 1) + " sur " + D.oral.length }));
    zone.appendChild(h("div", { class: "card has-say" }, h("div", { class: "label", text: "La question de la maîtresse ou du maître" }),
      h("div", { class: "q" }, rich(txt(o.question))), itemImg(o), qsay));
    zone.appendChild(h("p", { class: "counter", text: "🗣️ Réponds à voix haute, puis appuie sur le bouton." }));
    var reveal = h("div");
    var vb = h("button", { class: "btn primary", type: "button", id: "btn-verifier", text: "📖 Vérifier avec mon cahier", onclick: function () {
      vb.remove();
      reveal.appendChild(h("div", { class: "card" }, h("div", { class: "label", text: "Ce qu'il fallait dire (le parent coche)" }),
        h("ul", { class: "checks" }, o.points_cles.map(function (p) {
          var c = h("button", { class: "check", type: "button", "aria-pressed": "false" }, h("span", { class: "box" }), rich(p));
          c.addEventListener("click", function () { c.setAttribute("aria-pressed", c.getAttribute("aria-pressed") === "true" ? "false" : "true"); });
          return h("li", null, c); }))));
      var refs = h("details", { class: "card" }, h("summary", { text: "Voir la leçon" }), o.ref.map(function (r) { return BLOCS[r] ? renderBloc(BLOCS[r], { noSay: true }) : null; }));
      reveal.appendChild(refs);
      reveal.appendChild(h("div", { class: "actions" },
        h("button", { class: "btn soft", type: "button", text: "🔁 On revoit ensemble", onclick: function () { oi++; show(); } }),
        h("button", { class: "btn ok", type: "button", id: "btn-valide", text: "👍 C'est validé !", onclick: function () { valid++; addStar(); oi++; show(); } })));
    } });
    zone.appendChild(h("div", { class: "actions" }, vb)); zone.appendChild(reveal);
    if (TTS.auto) TTS.speak(segOf(o.question), qsay);
  }
  show();
}

/* ------------------------------------------------------------ fin */
function renderEnd() {
  TTS.stop();
  var main = shell(); setProgress(1); setNext(null);
  var nom = reglages().prenom ? " " + reglages().prenom : "";
  var pr = store.get(); store.patch({ fini: true, best: Math.max(pr.best || 0, state.stars) });
  main.appendChild(h("div", { class: "card end", id: "fin" }, h("div", { class: "big", text: "🏆" }),
    h("h2", { text: "Bravo" + nom + " !" }), h("p", { text: "Tu as gagné " + state.stars + " étoile" + (state.stars > 1 ? "s" : "") + " ⭐" }),
    h("div", { class: "actions" },
      h("button", { class: "btn", type: "button", text: "🔁 Recommencer", onclick: function () { state = { step: 0, done: {}, stars: 0 }; render(); } }),
      h("button", { class: "btn primary", type: "button", id: "btn-retour", text: "🏠 Mes leçons", onclick: function () { renderHome(); } }))));
  if (TTS.auto) TTS.speak([{ text: "Bravo" + nom + " ! Tu as gagné " + state.stars + " étoiles.", lang: "fr-FR" }]);
}


/* ------------------------------------------------------------ calculs (pavé numérique) */
function stepCalculs(main) {
  var ci = 0, first = 0;
  setNext(null);
  function norm(s) { var n = parseFloat(String(s).replace(",", ".")); return isNaN(n) ? null : Math.round(n * 1000); }
  function show() {
    main.querySelectorAll(".czone").forEach(function (n) { n.remove(); });
    var zone = h("div", { class: "czone" }); main.appendChild(zone);
    setProgress(ci / D.calculs.length);
    if (ci >= D.calculs.length) {
      zone.appendChild(h("div", { class: "card end" }, h("div", { class: "big", text: "🧮" }),
        h("p", { text: first + " calcul" + (first > 1 ? "s" : "") + " réussi" + (first > 1 ? "s" : "") + " du premier coup sur " + D.calculs.length + " !" })));
      setProgress(1); setNext(nextLabel(), goNext); return;
    }
    var c = D.calculs[ci], val = "", tries = 0, done = false;
    var csay = sayBtn(function () { return segOf(c.consigne); });
    zone.appendChild(h("div", { class: "counter", text: "Calcul " + (ci + 1) + " sur " + D.calculs.length }));
    zone.appendChild(h("div", { class: "card has-say" }, h("div", { class: "q" }, rich(txt(c.consigne))), itemImg(c), csay));
    var disp = h("div", { class: "saisie", id: "saisie", "aria-live": "polite", text: "?" });
    var fb = h("div", { "aria-live": "polite" });
    function upd() { disp.textContent = val || "?"; disp.classList.toggle("vide", !val); }
    function key(k) {
      if (done) return;
      if (k === "⌫") val = val.slice(0, -1);
      else if (k === ",") { if (val && val.indexOf(",") < 0) val += ","; }
      else if (val.length < 9) val = (val === "0" ? "" : val) + k;
      upd();
    }
    var pad = h("div", { class: "pad" }, ["1", "2", "3", "4", "5", "6", "7", "8", "9", ",", "0", "⌫"].map(function (k) {
      return h("button", { class: "padkey" + (k === "⌫" ? " del" : ""), type: "button", "data-k": k, "aria-label": k === "⌫" ? "Effacer" : k, text: k,
        onclick: function () { key(k); } });
    }));
    var ok = h("button", { class: "btn primary", type: "button", id: "btn-valider", text: "✓ Valider", onclick: function () {
      if (done || !val) return;
      tries++; fb.innerHTML = "";
      if (norm(val) === norm(c.reponse)) {
        done = true; disp.classList.add("juste");
        if (tries === 1) { first++; addStar(); }
        fb.appendChild(h("div", { class: "feedback good", text: tries === 1 ? "Bravo ! ⭐" : "Bravo, tu as trouvé ! 👏" }));
        setNext(ci < D.calculs.length - 1 ? "Calcul suivant ➜" : "Voir mon résultat ➜", function () { ci++; setNext(null); show(); });
      } else if (tries < 3) {
        val = ""; upd();
        var hb = BLOCS[c.ref[0]];
        fb.appendChild(h("div", { class: "feedback again", text: "Pas encore… Regarde ta leçon et essaie encore ! 💪" }));
        if (hb) fb.appendChild(h("div", { class: "hintbox" }, h("div", { class: "label", text: "💡 Indice" }), renderBloc(hb)));
      } else {
        done = true;
        fb.appendChild(h("div", { class: "feedback again", text: "La bonne réponse était " + c.reponse + ". On le retravaillera ensemble ! 🌱" }));
        setNext(ci < D.calculs.length - 1 ? "Calcul suivant ➜" : "Voir mon résultat ➜", function () { ci++; setNext(null); show(); });
      }
    } });
    zone.appendChild(disp); zone.appendChild(pad); zone.appendChild(h("div", { class: "actions" }, ok)); zone.appendChild(fb);
    if (TTS.auto) TTS.speak(segOf(c.consigne), csay);
  }
  show();
}

/* ------------------------------------------------------------ poésie tapée par le parent (texte jamais publié) */
function poemeKey(b) { return "poeme:" + D.meta.id + ":" + b.id; }
function poemeParse(s) {
  var st = String(s || "").replace(/\r/g, "").split(/\n\s*\n/).map(function (x) {
    return x.split("\n").map(function (v) { return v.trim(); }).filter(function (v) { return v; });
  }).filter(function (x) { return x.length; });
  return st.length ? st : null;
}
function poemeLocal(b) { try { return poemeParse(localStorage.getItem(poemeKey(b))); } catch (e) { return null; } }
function saisiePoeme(b) {
  var ta = h("textarea", { class: "mdp saisie-poeme", id: "saisie-poeme", rows: "12", "aria-label": "Texte de la poésie" });
  try { ta.value = localStorage.getItem(poemeKey(b)) || ""; } catch (e) {}
  var err = h("p", { class: "erreur", role: "alert" });
  return h("div", { class: "saisie-parent" },
    h("p", { class: "label", text: "✏️ Pour le parent : tape la poésie une seule fois" }),
    h("p", { text: "Un vers par ligne, une ligne vide entre deux strophes. Le texte reste sur cette tablette." }),
    ta, err,
    h("button", { class: "btn primary", type: "button", id: "btn-poeme", text: "Enregistrer la poésie", onclick: function () {
      var st = poemeParse(ta.value);
      if (!st) { err.textContent = "Le texte est vide."; return; }
      try { localStorage.setItem(poemeKey(b), ta.value.trim()); } catch (e) { err.textContent = "Enregistrement impossible sur cet appareil."; return; }
      b.strophes = st; render();
    } }));
}

/* ------------------------------------------------------------ ouverture d'une leçon */
function openLesson(lesson) {
  D = lesson; BLOCS = {}; IMG = {};
  D.lecon.blocs.forEach(function (b) { BLOCS[b.id] = b; if (b.saisie_parent) b.strophes = poemeLocal(b); });
  (D.images || []).forEach(function (im) {
    if (im.svg) IMG[im.id] = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(im.svg);
    else if (im.data) IMG[im.id] = im.data;
  });
  store.patch({ ouvert: true });
  state = { step: 0, done: {}, stars: 0 };
  render();
}

/* ------------------------------------------------------------ écrans */
var MATIERES = {
  mathematiques: { icon: "🔢", label: "Maths" }, francais: { icon: "📝", label: "Français" },
  questionner_le_monde: { icon: "🌍", label: "Le monde" }, langue_vivante: { icon: "🇬🇧", label: "Anglais" },
  emc: { icon: "🤝", label: "EMC" }, arts: { icon: "🎨", label: "Arts" }, autre: { icon: "📚", label: "Autre" }
};
function plain(s) { return String(s).replace(/\{[^{}:]+:([^{}]*)\}/g, "$1"); }
function dateFr(iso) {
  try { return new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }); }
  catch (e) { return iso; }
}

function renderLogin(msg) {
  TTS.stop(); setNext(null); app.innerHTML = "";
  var inp = h("input", { type: "password", id: "mdp", class: "mdp", autocomplete: "current-password", "aria-label": "Mot de passe" });
  var err = h("p", { class: "erreur", role: "alert", text: msg || "" });
  var go = h("button", { class: "btn primary", type: "button", id: "btn-ouvrir", text: "Ouvrir le cahier" });
  function submit() {
    if (!inp.value) return;
    go.disabled = true; go.textContent = "Ouverture…"; err.textContent = "";
    unlock(inp.value.trim()).then(function () { boot(); }).catch(function (e) {
      go.disabled = false; go.textContent = "Ouvrir le cahier";
      err.textContent = e.message === "MOT_DE_PASSE" ? "Mot de passe incorrect." : "Impossible d'ouvrir le cahier : " + e.message;
    });
  }
  go.addEventListener("click", submit);
  inp.addEventListener("keydown", function (ev) { if (ev.key === "Enter") submit(); });
  app.appendChild(h("div", { class: "card login" }, h("div", { class: "big", text: "🔒" }), h("h1", { text: "Cahier de révisions" }),
    h("p", { text: "Réservé aux parents : saisissez le mot de passe une seule fois sur cet appareil." }), inp, go, err));
  setTimeout(function () { inp.focus(); }, 50);
}

function renderHome(info) {
  TTS.stop(); setNext(null); D = null; app.innerHTML = ""; window.scrollTo(0, 0);
  var r = reglages();
  app.appendChild(h("header", { class: "top home" }, h("h1", { text: r.prenom ? "Bonjour " + r.prenom + " ! 👋" : "Mes révisions 📚" })));
  var mats = {}; LESSONS.forEach(function (l) { mats[l.meta.matiere] = true; });
  var keys = Object.keys(mats);
  if (keys.length > 1) {
    app.appendChild(h("nav", { class: "steps filtres", "aria-label": "Matières" },
      [["tout", "⭐", "Tout"]].concat(keys.map(function (k) { var m = MATIERES[k] || MATIERES.autre; return [k, m.icon, m.label]; })).map(function (f) {
        return h("button", { class: "step", type: "button", "data-filtre": f[0], "aria-current": FILTRE === f[0] ? "step" : null,
          onclick: function () { FILTRE = f[0]; renderHome(); } }, f[1] + " ", h("span", { class: "lbl2", text: f[2] }));
      })));
  }
  var list = h("div", { class: "lecons" });
  var shown = LESSONS.filter(function (l) { return FILTRE === "tout" || l.meta.matiere === FILTRE; });
  if (!shown.length) list.appendChild(h("div", { class: "card end" }, h("div", { class: "big", text: "🌱" }),
    h("p", { text: LESSONS.length ? "Pas de leçon dans cette matière." : "Pas encore de leçon. Elles arriveront bientôt !" })));
  shown.forEach(function (l) {
    var m = MATIERES[l.meta.matiere] || MATIERES.autre, p = store.get(l.meta.id), badges = [];
    var aMethode = l.meta.methode && l.meta.methode !== "aucune" && l.meta.methode !== "autre";
    if (aMethode || l.meta.periode) badges.push((aMethode ? l.meta.methode : "") + (aMethode && l.meta.periode ? " · " : "") + (l.meta.periode ? "P" + l.meta.periode : ""));
    var etat = !p.ouvert ? h("span", { class: "nouveau", text: "Nouveau ✨" })
      : h("span", null, p.fini ? "✓ Fini · ⭐ " + (p.best || 0) : "En cours", (p.demain && p.demain.length) ? "  🌙 " + p.demain.length + " à revoir" : "");
    list.appendChild(h("button", { class: "lecon-card", type: "button", "data-id": l.meta.id, onclick: function () { openLesson(l); } },
      h("span", { class: "mat", "aria-hidden": "true", text: m.icon }),
      h("span", { class: "corps" }, h("span", { class: "titre", text: plain(l.meta.titre) }),
        h("span", { class: "sous", text: dateFr(l.meta.date) + (badges.length ? " · " + badges.join(" · ") : "") }), h("span", { class: "etat" }, etat))));
  });
  app.appendChild(list);
  if (info && info.illisibles) app.appendChild(h("p", { class: "parentnote", text: info.illisibles + " leçon(s) illisible(s) : le mot de passe a peut-être changé (zone parent > Verrouiller)." }));
  var gear = h("button", { class: "iconbtn gear", type: "button", id: "btn-parent", "aria-label": "Zone parent (maintenir 2 secondes)", text: "⚙️" });
  var hint = h("p", { class: "parentnote", text: "" }), timer = null;
  function start(ev) { ev.preventDefault(); timer = setTimeout(function () { timer = null; renderParent(); }, 1800); hint.textContent = "Garde le doigt appuyé…"; }
  function stop() { if (timer) { clearTimeout(timer); timer = null; hint.textContent = "Zone parent : maintenir le bouton 2 secondes."; } }
  gear.addEventListener("pointerdown", start); gear.addEventListener("pointerup", stop); gear.addEventListener("pointerleave", stop);
  gear.addEventListener("contextmenu", function (ev) { ev.preventDefault(); });
  app.appendChild(h("footer", { class: "pied" }, gear, hint));
}

function renderParent(msg) {
  TTS.stop(); setNext(null); app.innerHTML = "";
  var r = reglages();
  var prenom = h("input", { type: "text", class: "mdp", id: "prenom", value: r.prenom || "", maxlength: "20", "aria-label": "Prénom de l'enfant" });
  var file = h("input", { type: "file", accept: ".json,application/json", id: "import", class: "file" });
  var out = h("p", { class: "erreur", role: "status", text: msg || "" });
  file.addEventListener("change", function () {
    var f = file.files[0]; if (!f) return;
    f.text().then(function (t) {
      var obj = JSON.parse(t);
      var p = obj.ct ? idb.get("cle").then(function (k) { return decryptLesson(obj, k); }) : Promise.resolve(obj);
      return p.then(function (l) {
        if (!l || !l.meta || !l.meta.id || !l.lecon) throw new Error("ce fichier n'est pas une leçon");
        return idb.get("imports").then(function (v) {
          v = (v || []).filter(function (x) { return x.meta.id !== l.meta.id; }); v.push(l);
          return idb.put("imports", v);
        }).then(function () { return "Leçon « " + plain(l.meta.titre) + " » ajoutée sur cet appareil."; });
      });
    }).then(function (m) { return loadLessons(window.__cle).then(function () { renderParent(m); }); })
      .catch(function (e) { out.textContent = "Import impossible : " + e.message; });
  });
  function act(label, id, fn, cls) { return h("button", { class: "btn " + (cls || ""), type: "button", id: id, text: label, onclick: fn }); }
  app.appendChild(h("header", { class: "top" }, h("h1", { text: "⚙️ Zone parent" })));
  app.appendChild(h("div", { class: "card" }, h("div", { class: "label", text: "Prénom affiché" }), prenom,
    act("Enregistrer", "btn-prenom", function () { setReglages({ prenom: prenom.value.trim() }); out.textContent = "Prénom enregistré."; })));
  app.appendChild(h("div", { class: "card" }, h("div", { class: "label", text: "Leçons" }),
    h("p", { text: LESSONS.length + " leçon(s) sur cet appareil." }),
    act("🔄 Recharger les leçons", "btn-recharger", function () { boot(); }),
    h("div", { class: "label", text: "Ajouter une leçon depuis un fichier (secours)" }), file));
  app.appendChild(h("div", { class: "card" }, h("div", { class: "label", text: "Progression" }),
    act("♻️ Remettre toute la progression à zéro", "btn-raz", function () {
      Object.keys(localStorage).forEach(function (k) { if (k.indexOf("prog:") === 0) localStorage.removeItem(k); });
      out.textContent = "Progression remise à zéro.";
    }, "soft"),
    act("🔒 Verrouiller ce cahier (redemander le mot de passe)", "btn-verrou", function () {
      idb.del("cle").then(function () { renderLogin(); });
    }, "soft")));
  app.appendChild(out);
  app.appendChild(h("p", { class: "parentnote", text: "Version " + VERSION + " · données stockées uniquement sur cet appareil." }));
  setNext("⬅ Retour aux leçons", function () { renderHome(); });
}

/* ------------------------------------------------------------ démarrage */
function boot() {
  setNext(null);
  if (!subtle) { app.innerHTML = ""; app.appendChild(h("div", { class: "fatal", text: "Ce navigateur ne sait pas ouvrir le cahier (WebCrypto absent). Ouvrez la page en https dans Chrome à jour." })); return; }
  app.innerHTML = ""; app.appendChild(h("div", { class: "card end" }, h("div", { class: "big", text: "📚" }), h("p", { text: "Chargement des leçons…" })));
  idb.get("cle").catch(function () { return null; }).then(function (key) {
    if (!key) return renderLogin();
    window.__cle = key;
    return loadLessons(key).then(function (info) {
      if (info.total === 0 && info.illisibles > 0) return idb.del("cle").then(function () { renderLogin("Le mot de passe a changé : saisissez le nouveau."); });
      renderHome(info);
    });
  }).catch(function (e) { app.innerHTML = ""; app.appendChild(h("div", { class: "fatal", text: "Erreur au démarrage : " + e.message })); });
}

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  navigator.serviceWorker.register("sw.js").catch(function () {});
}
window.addEventListener("error", function (ev) {
  if (document.querySelector(".fatal")) return;
  app.insertBefore(h("div", { class: "fatal", text: "Petit problème d'affichage (" + (ev.message || "erreur") + "). Revenez à l'accueil ou rechargez." }), app.firstChild);
});
window.__cahier = { version: VERSION };
boot();
})();
