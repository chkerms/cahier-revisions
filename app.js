/* Cahier de révisions : lecteur de leçons chiffrées. Aucune dépendance externe. */
"use strict";
(function () {
var VERSION = "1.8.0";
var app = document.getElementById("app");
var nextBar = document.getElementById("next");
var D = null, IMG = {}, LESSONS = [], VUE = null, CTX = null; /* CTX : leçon d'origine de la question affichée (quiz transverse) */

/* ------------------------------------------------------------ réglages et stockage */
function reglages() { try { return JSON.parse(localStorage.getItem("reglages") || "{}"); } catch (e) { return {}; } }
var TAILLES = { petite: 0.78, moyenne: 0.88, grande: 1 };
function appliquerTaille() { document.documentElement.style.setProperty("--zoom", TAILLES[reglages().taille] || TAILLES.moyenne); }
function setReglages(o) { var r = reglages(); for (var k in o) r[k] = o[k]; try { localStorage.setItem("reglages", JSON.stringify(r)); } catch (e) {} }

/* profils : l'enfant et un profil test pour le parent, sur le même appareil.
   Par profil : progression (prog:<profil>:<leçon>) et réglages (reglages:<profil> : prénom).
   Communs à l'appareil : taille du texte, poésies tapées par le parent, leçons importées. */
var PROFILS = [
  { id: "enfant", libelle: "Enfant", icon: "🧒", test: false },
  { id: "test", libelle: "Test parent", icon: "🧪", test: true }
];
var profils = {
  actifId: function () { var a = null; try { a = localStorage.getItem("profil_actif"); } catch (e) {} return this.get(a) ? a : "enfant"; },
  get: function (id) { for (var i = 0; i < PROFILS.length; i++) if (PROFILS[i].id === id) return PROFILS[i]; return null; },
  actif: function () { return this.get(this.actifId()); },
  choisir: function (id) { if (!this.get(id)) return; try { localStorage.setItem("profil_actif", id); } catch (e) {} majBandeau(); }
};
function reglagesDe(id) { try { return JSON.parse(localStorage.getItem("reglages:" + id) || "{}"); } catch (e) { return {}; } }
function setReglagesDe(id, o) { var r = reglagesDe(id); for (var k in o) r[k] = o[k]; try { localStorage.setItem("reglages:" + id, JSON.stringify(r)); } catch (e) {} }
function reglagesProfil() { return reglagesDe(profils.actifId()); }
function setReglagesProfil(o) { setReglagesDe(profils.actifId(), o); }
/* 1.4.0 → profils : une seule fois, sans rien perdre (clés prog:<leçon> et prénom global vers le profil enfant) */
function migrerProfils() {
  try {
    if (localStorage.getItem("migration_profils")) return;
    Object.keys(localStorage).forEach(function (k) {
      if (k.indexOf("prog:") !== 0 || k.slice(5).indexOf(":") >= 0) return;
      var neuve = "prog:enfant:" + k.slice(5);
      if (localStorage.getItem(neuve) === null) localStorage.setItem(neuve, localStorage.getItem(k));
      localStorage.removeItem(k);
    });
    var g = reglages();
    if (g.prenom !== undefined) {
      var re = JSON.parse(localStorage.getItem("reglages:enfant") || "{}");
      if (re.prenom === undefined) re.prenom = g.prenom;
      localStorage.setItem("reglages:enfant", JSON.stringify(re));
      delete g.prenom; localStorage.setItem("reglages", JSON.stringify(g));
    }
    localStorage.setItem("migration_profils", "1");
  } catch (e) {}
}
function majBandeau() {
  var t = profils.actif().test, b = document.getElementById("bandeau-test");
  document.body.classList.toggle("profil-test", t);
  if (t && !b) document.body.insertBefore(h("div", { class: "bandeau-test", id: "bandeau-test", role: "status",
    text: "🧪 Profil test : la progression de l'enfant n'est pas touchée." }), document.body.firstChild);
  if (!t && b) b.remove();
}
/* demande à Chrome de ne pas effacer les données du site quand l'appareil manque de place */
var STOCKAGE = { protege: null };
function protegerStockage() {
  if (!navigator.storage || !navigator.storage.persist) return;
  navigator.storage.persisted().then(function (p) { return p || navigator.storage.persist(); })
    .then(function (p) { STOCKAGE.protege = !!p; }).catch(function () {});
}

var idb = {
  db: null,
  open: function () {
    var self = this;
    if (self.db) return Promise.resolve(self.db);
    return new Promise(function (res, rej) {
      if (!window.indexedDB) return rej(new Error("IndexedDB indisponible"));
      var r = indexedDB.open("cahier", 2);
      r.onupgradeneeded = function () {
        var db = r.result;
        if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
        if (!db.objectStoreNames.contains("seances")) db.createObjectStore("seances", { keyPath: "id" });
      };
      r.onsuccess = function () { self.db = r.result; res(self.db); };
      r.onerror = function () { rej(r.error); };
    });
  },
  op: function (mode, fn, nom) {
    nom = nom || "kv";
    return this.open().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction(nom, mode), st = tx.objectStore(nom), q = fn(st);
        tx.oncomplete = function () { res(q && q.result); };
        tx.onerror = function () { rej(tx.error); };
      });
    });
  },
  get: function (k) { return this.op("readonly", function (s) { return s.get(k); }); },
  put: function (k, v) { return this.op("readwrite", function (s) { return s.put(v, k); }); },
  del: function (k) { return this.op("readwrite", function (s) { return s.delete(k); }); }
};

/* ------------------------------------------------------------ journal des séances (IndexedDB, store « seances ») */
/* Une séance = ouverture d'une leçon jusqu'au retour à l'accueil. Elle est réécrite à chaque événement :
   rien n'est perdu si l'appli est fermée en cours de route. Conservation : 180 jours. */
var JOURNAL_JOURS = 180;
var journal = {
  s: null,
  debut: function (l, type) {
    var now = new Date().toISOString(), pid = profils.actifId();
    this.s = { id: pid + ":" + now + ":" + Math.random().toString(36).slice(2, 7), profil: pid, debut: now, fin: now,
      type: type || (l._quiz ? "quiz_transverse" : "lecon"), mode: l._quiz || null,
      lecon: l.meta.id, titre: plain(l.meta.titre), matiere: l.meta.matiere, parcours: (l.parcours || []).slice(),
      etapes: { vues: [], finies: [], sautees: [] }, terminee: false, ev: [] };
    this.save();
  },
  etape: function (k, nom) { if (!this.s) return; var l = this.s.etapes[k]; if (l.indexOf(nom) < 0) { l.push(nom); this.save(); } },
  marque: function (o) { if (!this.s) return; for (var k in o) this.s[k] = o[k]; this.save(); },
  ev: function (o) { if (!this.s) return o; o.t = new Date().toISOString(); this.s.ev.push(o); this.save(); return o; },
  maj: function (o, champs) { for (var k in champs) o[k] = champs[k]; this.save(); },
  fin: function () { this.s = null; },
  save: function () {
    var s = this.s; if (!s) return;
    s.fin = new Date().toISOString();
    idb.op("readwrite", function (st) { return st.put(s); }, "seances").catch(function () {});
  },
  lire: function () { return idb.op("readonly", function (st) { return st.getAll(); }, "seances").then(function (r) { return r || []; }).catch(function () { return []; }); },
  purger: function () {
    var limite = new Date(Date.now() - JOURNAL_JOURS * 864e5).toISOString();
    return this.lire().then(function (all) {
      var vieux = all.filter(function (x) { return x.debut < limite; });
      if (!vieux.length) return;
      return idb.op("readwrite", function (st) { vieux.forEach(function (x) { st.delete(x.id); }); return null; }, "seances");
    }).catch(function () {});
  }
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
/* progression par leçon et par profil, sur cet appareil uniquement */
var store = {
  key: function (id) { return "prog:" + profils.actifId() + ":" + (id || D.meta.id); },
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
  var st = ((CTX || D).styles || {})[key] || {}, cls = [], css = "";
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
  return h("img", { class: "qimg", src: IMG[it.image], alt: im ? im.description : (it.alt || "") });
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
  journal.etape("finies", D.parcours[state.step]);
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
      onclick: function () {
        TTS.stop();
        for (var j = 0; j < i; j++) if (!state.done[D.parcours[j]]) journal.etape("sautees", D.parcours[j]);
        state.step = i; render(); } },
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
  journal.etape("vues", s);
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
        if (cur.passes >= 3) { later.push(cur.c); toast("On la reverra demain 🌙");
          journal.ev({ k: "carte", id: cur.c.id, recto: plain(txt(cur.c.recto)), revoir: cur.passes, demain: true }); }
        else queue.push(cur);
        show(); } }),
      h("button", { class: "btn ok", type: "button", id: "btn-connais", text: "✅ Je connais", onclick: function () {
        queue.shift(); known.push(cur.c); if (cur.passes === 0) addStar();
        journal.ev({ k: "carte", id: cur.c.id, recto: plain(txt(cur.c.recto)), revoir: cur.passes, demain: false }); show(); } }));
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
    journal.etape("finies", "cartes");
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
      journal.etape("finies", "quiz");
      zone.appendChild(h("div", { class: "card end" }, h("div", { class: "big", text: firstTry >= 4 ? "🏆" : "🎉" }),
        h("p", { text: "Tu as trouvé " + firstTry + " réponse" + (firstTry > 1 ? "s" : "") + " du premier coup sur " + D.quiz.length + " !" })));
      setProgress(1); setNext(nextLabel(), goNext); return;
    }
    var q = D.quiz[qi], tries = 0, solved = false, faux = [], evt = null;
    CTX = q._src || null;
    function noteQuiz(ok) {
      var c = { essais: tries, faux: faux.slice(), resolu: ok };
      if (evt) journal.maj(evt, c);
      else { c.k = "quiz"; c.id = q._qid || q.id; c.q = plain(txt(q.question)); origine(c, q); evt = journal.ev(c); }
    }
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
          noteQuiz(true);
          fb.appendChild(h("div", { class: "feedback good", text: tries === 1 ? "Bravo ! ⭐" : "Bravo, tu as trouvé ! 👏" }));
          setNext(qi < D.quiz.length - 1 ? "Question suivante ➜" : "Voir mon résultat ➜", function () { qi++; setNext(null); show(); });
        } else {
          b.classList.add("tried"); faux.push(plain(txt(o.e))); noteQuiz(false);
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
  var b = BLOCS[D.recitation.bloc], level = 0, MAX = 4, maxNiv = 0;
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
      level < MAX ? h("button", { class: "btn primary", type: "button", id: "btn-cacher", text: "🙈 Cacher plus de mots", onclick: function () { level++; if (level === MAX) addStar();
        if (level > maxNiv) { maxNiv = level; journal.ev({ k: "recitation", niveau: level, max: MAX }); } show(); } }) : null,
      h("button", { class: "btn", type: "button", text: "🔊 Tout écouter", onclick: function (ev) { TTS.speak(blocOral(b), ev.currentTarget); } })));
    if (level === MAX) { journal.etape("finies", "recitation"); setNext(nextLabel(), goNext); } else setNext(null);
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
    if (oi >= D.oral.length) { journal.etape("finies", "oral"); setProgress(1); setNext(nextLabel(), goNext); zone.appendChild(h("div", { class: "card end" },
      h("div", { class: "big", text: "🗣️" }), h("p", { text: valid + " réponse" + (valid > 1 ? "s" : "") + " validée" + (valid > 1 ? "s" : "") + " avec ton parent !" }))); return; }
    var o = D.oral[oi], qsay = sayBtn(function () { return segOf(o.question); });
    function noteOral(ok) {
      var coches = [], manque = [];
      reveal.querySelectorAll(".check").forEach(function (c, i) { (c.getAttribute("aria-pressed") === "true" ? coches : manque).push(plain(o.points_cles[i])); });
      journal.ev({ k: "oral", id: o.id, q: plain(txt(o.question)), valide: ok, coches: coches, manque: manque });
    }
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
        h("button", { class: "btn soft", type: "button", id: "btn-revoir-oral", text: "🔁 On revoit ensemble", onclick: function () { noteOral(false); oi++; show(); } }),
        h("button", { class: "btn ok", type: "button", id: "btn-valide", text: "👍 C'est validé !", onclick: function () { noteOral(true); valid++; addStar(); oi++; show(); } })));
    } });
    zone.appendChild(h("div", { class: "actions" }, vb)); zone.appendChild(reveal);
    if (TTS.auto) TTS.speak(segOf(o.question), qsay);
  }
  show();
}

/* ------------------------------------------------------------ fin */
function renderEnd() {
  TTS.stop(); CTX = null;
  var main = shell(); setProgress(1); setNext(null);
  var nom = reglagesProfil().prenom ? " " + reglagesProfil().prenom : "";
  if (!D._quiz) { var pr = store.get(); store.patch({ fini: true, best: Math.max(pr.best || 0, state.stars) }); }
  var revoir = D._quiz ? leconsARevoir() : [];
  journal.marque({ terminee: true, etoiles: state.stars });
  main.appendChild(h("div", { class: "card end", id: "fin" }, h("div", { class: "big", text: "🏆" }),
    h("h2", { text: "Bravo" + nom + " !" }), h("p", { text: "Tu as gagné " + state.stars + " étoile" + (state.stars > 1 ? "s" : "") + " ⭐" }),
    revoir.length ? h("div", { class: "a-revoir", id: "a-revoir" }, h("p", { text: "📖 Pour progresser, relis " + (revoir.length > 1 ? "ces leçons" : "cette leçon") + " :" }),
      revoir.map(function (l) { return h("button", { class: "btn soft", type: "button", "data-revoir": l.meta.id, onclick: function () { openLesson(l); } }, "📖 Revoir ", rich(l.meta.titre)); })) : null,
    (!D._quiz && defiDispo(D)) ? h("div", { class: "actions" }, h("button", { class: "btn soft", type: "button", "data-defi-fin": D.meta.id,
      text: "⏱️ Défi chrono sur cette leçon", onclick: (function (l) { return function () { renderDefi(l); }; })(D) })) : null,
    h("div", { class: "actions" },
      h("button", { class: "btn", type: "button", text: "🔁 Recommencer", onclick: function () {
        if (D._quiz) return openQuiz(D._quiz);
        state = { step: 0, done: {}, stars: 0 }; journal.debut(D); render(); } }),
      h("button", { class: "btn primary", type: "button", id: "btn-retour", text: "🏠 Mes leçons", onclick: function () { renderHome(); } }))));
  if (TTS.auto) TTS.speak([{ text: "Bravo" + nom + " ! Tu as gagné " + state.stars + " étoiles.", lang: "fr-FR" }]);
}


/* ------------------------------------------------------------ calculs (pavé numérique) */
function stepCalculs(main) {
  var ci = 0, first = 0;
  var CAL = (D.calculs || []).concat(window.GENERATEURS ? window.GENERATEURS.creer(D.generateurs) : []);
  CAL.forEach(function (c) { if (c.svg) { IMG[c.id] = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(c.svg); c.image = c.id; } });
  setNext(null);
  function norm(s) { var n = parseFloat(String(s).replace(",", ".")); return isNaN(n) ? null : Math.round(n * 1000); }
  function show() {
    main.querySelectorAll(".czone").forEach(function (n) { n.remove(); });
    var zone = h("div", { class: "czone" }); main.appendChild(zone);
    setProgress(ci / CAL.length);
    if (ci >= CAL.length) {
      journal.etape("finies", "calculs");
      zone.appendChild(h("div", { class: "card end" }, h("div", { class: "big", text: "🧮" }),
        h("p", { text: first + " calcul" + (first > 1 ? "s" : "") + " réussi" + (first > 1 ? "s" : "") + " du premier coup sur " + CAL.length + " !" })));
      setProgress(1); setNext(nextLabel(), goNext); return;
    }
    var c = CAL[ci], val = "", tries = 0, done = false, saisies = [], evt = null;
    CTX = c._src || null;
    function note(ok, fini) {
      var o = { saisies: saisies.slice(), reussi: ok, fini: fini };
      if (evt) journal.maj(evt, o);
      else { o.k = "calcul"; o.id = c._qid || c.id; o.gen = c.genere || null; o.consigne = plain(txt(c.consigne)); o.attendu = String(c.reponse); origine(o, c); evt = journal.ev(o); }
    }
    var csay = sayBtn(function () { return segOf(c.consigne); });
    var gauche = h("div", { class: "cgauche" }), droite = h("div", { class: "cdroite" });
    zone.appendChild(gauche); zone.appendChild(droite);
    gauche.appendChild(h("div", { class: "counter", text: "Calcul " + (ci + 1) + " sur " + CAL.length }));
    gauche.appendChild(h("div", { class: "card has-say" }, h("div", { class: "q" }, rich(txt(c.consigne))), itemImg(c), csay));
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
      tries++; fb.innerHTML = ""; saisies.push(val);
      if (norm(val) === norm(c.reponse)) {
        done = true; disp.classList.add("juste"); note(true, true);
        if (tries === 1) { first++; addStar(); }
        fb.appendChild(h("div", { class: "feedback good", text: tries === 1 ? "Bravo ! ⭐" : "Bravo, tu as trouvé ! 👏" }));
        setNext(ci < CAL.length - 1 ? "Calcul suivant ➜" : "Voir mon résultat ➜", function () { ci++; setNext(null); show(); });
      } else if (tries < 3) {
        note(false, false); val = ""; upd();
        var hb = BLOCS[c.ref[0]];
        fb.appendChild(h("div", { class: "feedback again", text: "Pas encore… Regarde ta leçon et essaie encore ! 💪" }));
        if (hb) fb.appendChild(h("div", { class: "hintbox" }, h("div", { class: "label", text: "💡 Indice" }), renderBloc(hb)));
      } else {
        done = true; note(false, true);
        fb.appendChild(h("div", { class: "feedback again", text: "La bonne réponse était " + c.reponse + ". On le retravaillera ensemble ! 🌱" }));
        setNext(ci < CAL.length - 1 ? "Calcul suivant ➜" : "Voir mon résultat ➜", function () { ci++; setNext(null); show(); });
      }
    } });
    gauche.appendChild(fb); droite.appendChild(disp); droite.appendChild(pad); droite.appendChild(h("div", { class: "actions" }, ok));
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
function chargerLecon(lesson) {
  D = lesson; BLOCS = {}; IMG = {}; CTX = null;
  D.lecon.blocs.forEach(function (b) { BLOCS[b.id] = b; if (b.saisie_parent) b.strophes = poemeLocal(b); });
  (D.images || []).forEach(function (im) {
    if (im.svg) IMG[im.id] = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(im.svg);
    else if (im.data) IMG[im.id] = im.data;
  });
}
function openLesson(lesson) {
  defiStop();
  chargerLecon(lesson);
  store.patch({ ouvert: true });
  state = { step: 0, done: {}, stars: 0 };
  journal.debut(D);
  render();
}

/* ------------------------------------------------------------ mode quiz (activé par le parent, par profil) */
var QUIZ_TYPES = [
  { id: "francais", icon: "🎯", label: "Quiz français", matiere: "francais" },
  { id: "maths", icon: "🔢", label: "Quiz maths", matiere: "mathematiques" },
  { id: "surprise", icon: "🎲", label: "Quiz surprise", matiere: null }
];
var QUIZ_N = 10, QUIZ_CALCULS = 3, QUIZ_MIN = 5, QUIZ_PAR_LECON = 2, QUIZ_JOURS_RATES = 30;
function quizType(id) { return QUIZ_TYPES.filter(function (t) { return t.id === id; })[0]; }
function reglagesQuiz() { var q = reglagesProfil().quiz || {}; return { francais: !!q.francais, maths: !!q.maths, surprise: !!q.surprise, reservoir: q.reservoir === "ouvertes" ? "ouvertes" : "toutes" }; }
function setReglagesQuiz(o) { var q = reglagesQuiz(); for (var k in o) q[k] = o[k]; setReglagesProfil({ quiz: q }); }
/* leçons du réservoir : toutes les leçons publiées, ou seulement celles que ce profil a ouvertes */
function reservoirQuiz(type) {
  var t = quizType(type), r = reglagesQuiz();
  return LESSONS.filter(function (l) {
    return (!t.matiere || l.meta.matiere === t.matiere) && (r.reservoir === "toutes" || store.get(l.meta.id).ouvert);
  });
}
function nbQuestions(type) { return reservoirQuiz(type).reduce(function (n, l) { return n + ((l.quiz || []).length); }, 0); }
function nbGenerateurs(type) { return reservoirQuiz(type).reduce(function (n, l) { return n + (l.meta.matiere === "mathematiques" ? (l.generateurs || []).length : 0); }, 0); }
function tailleQuiz(type) {
  var nq = nbQuestions(type), calc = type !== "francais" && nbGenerateurs(type) && window.GENERATEURS ? QUIZ_CALCULS : 0;
  return Math.min(QUIZ_N - calc, nq) + calc;
}
function quizDispo(type) { return reglagesQuiz()[type] && nbQuestions(type) >= QUIZ_MIN; }
function origine(ev, item) { if (item._src) { ev.lecon = item._src.meta.id; ev.titre = plain(item._src.meta.titre); } }
/* tirage pondéré sans remise : au plus 2 éléments par leçon, puis on relâche si le réservoir est trop petit */
function tirer(items, n, poids) {
  var out = [], reste = items.slice(), parLecon = {};
  [true, false].forEach(function (limite) {
    while (out.length < n) {
      var cand = reste.filter(function (it) { return !limite || (parLecon[it._src.meta.id] || 0) < QUIZ_PAR_LECON; });
      if (!cand.length) break;
      var tot = 0; cand.forEach(function (it) { tot += poids(it); });
      var r = Math.random() * tot, k = 0;
      for (; k < cand.length - 1; k++) { r -= poids(cand[k]); if (r < 0) break; }
      var it = cand[k]; out.push(it); reste.splice(reste.indexOf(it), 1);
      parLecon[it._src.meta.id] = (parLecon[it._src.meta.id] || 0) + 1;
    }
  });
  return out;
}
/* questions ratées (ou quittées) ces 30 derniers jours par ce profil : clé leçon/id */
function questionsRatees(all) {
  var pid = profils.actifId(), lim = new Date(Date.now() - QUIZ_JOURS_RATES * 864e5).toISOString(), r = {};
  all.forEach(function (x) {
    if (x.profil !== pid || x.debut < lim) return;
    x.ev.forEach(function (e) { if (e.k === "quiz" && (e.essais > 1 || e.resolu === false)) r[(e.lecon || x.lecon) + "/" + e.id] = true; });
  });
  return r;
}
/* un quiz transverse est une leçon assemblée : blocs, images et identifiants préfixés par la leçon d'origine */
function assemblerQuiz(type, rates) {
  var t = quizType(type), pool = reservoirQuiz(type);
  var qs = [], gens = [];
  pool.forEach(function (l) {
    var pre = l.meta.id + "/";
    (l.quiz || []).forEach(function (q) {
      var c = JSON.parse(JSON.stringify(q));
      c._qid = q.id; c.id = pre + q.id; c._src = l;
      if (c.indice && c.indice.bloc) c.indice.bloc = pre + c.indice.bloc;
      if (c.image) c.image = pre + c.image;
      c.ref = (c.ref || []).map(function (b) { return pre + b; });
      qs.push(c);
    });
    if (l.meta.matiere === "mathematiques") (l.generateurs || []).forEach(function (g) { gens.push({ g: g, l: l }); });
  });
  var calculs = [];
  if (type !== "francais" && gens.length && window.GENERATEURS) {
    gens = shuffle(gens);
    for (var i = 0; i < QUIZ_CALCULS; i++) {
      var x = gens[i % gens.length], spec = JSON.parse(JSON.stringify(x.g)); spec.nombre = 1;
      var ex = window.GENERATEURS.creer([spec])[0];
      if (!ex) continue;
      var pre = x.l.meta.id + "/";
      ex._qid = ex.id; ex.id = pre + ex.id + "-" + i; ex._src = x.l;
      ex.ref = (ex.ref || []).map(function (b) { return pre + b; });
      calculs.push(ex);
    }
  }
  var quiz = tirer(qs, QUIZ_N - calculs.length, function (q) { return rates[q._src.meta.id + "/" + q._qid] ? 2 : 1; });
  var vus = {}, blocs = [], images = [];
  quiz.concat(calculs).forEach(function (it) {
    var l = it._src, pre = l.meta.id + "/";
    if (vus[l.meta.id]) return; vus[l.meta.id] = true;
    l.lecon.blocs.forEach(function (b) { var c = JSON.parse(JSON.stringify(b)); c.id = pre + b.id; if (c.image) c.image = pre + c.image; blocs.push(c); });
    (l.images || []).forEach(function (im) { var c = JSON.parse(JSON.stringify(im)); c.id = pre + im.id; images.push(c); });
  });
  return {
    _quiz: type,
    meta: { id: "quiz-" + type, titre: t.icon + " " + t.label, matiere: t.matiere || "mixte" },
    parcours: calculs.length ? ["quiz", "calculs"] : ["quiz"],
    lecon: { blocs: blocs }, images: images, quiz: quiz, calculs: calculs, styles: {}
  };
}
function openQuiz(type) {
  return journal.lire().then(function (all) {
    D = assemblerQuiz(type, questionsRatees(all)); BLOCS = {}; IMG = {}; CTX = null;
    D.lecon.blocs.forEach(function (b) { BLOCS[b.id] = b; });
    D.images.forEach(function (im) {
      if (im.svg) IMG[im.id] = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(im.svg);
      else if (im.data) IMG[im.id] = im.data;
    });
    state = { step: 0, done: {}, stars: 0 };
    journal.debut(D);
    render();
  });
}
/* fin d'un quiz transverse : les leçons des questions ratées ou quittées */
function leconsARevoir() {
  var ids = [];
  (journal.s ? journal.s.ev : []).forEach(function (e) {
    var rate = (e.k === "quiz" && (e.essais > 1 || e.resolu === false)) || (e.k === "calcul" && !(e.reussi && e.saisies.length === 1));
    if (rate && e.lecon && ids.indexOf(e.lecon) < 0) ids.push(e.lecon);
  });
  return ids.map(function (id) { return LESSONS.filter(function (l) { return l.meta.id === id; })[0]; }).filter(Boolean);
}
function carteModeQuiz() {
  var r = reglagesQuiz(), pa = profils.actif();
  function bascule(id) { var o = {}; o[id] = !reglagesQuiz()[id]; setReglagesQuiz(o); renderParent(quizType(id).label + (o[id] ? " activé." : " désactivé.")); }
  var defiOn = !reglagesProfil().defi_off;
  return h("div", { class: "card", id: "mode-quiz" }, h("div", { class: "label", text: "Mode quiz et défi chrono (profil " + pa.libelle + ")" }),
    h("div", { class: "actions" }, h("button", { class: "btn" + (defiOn ? " primary" : ""), type: "button", id: "btn-defi-reglage", "aria-pressed": defiOn ? "true" : "false",
      text: (defiOn ? "✓ " : "") + "⏱️ Défi chrono sur les leçons de maths", onclick: function () {
        setReglagesProfil({ defi_off: defiOn }); renderParent("Défi chrono " + (defiOn ? "masqué." : "affiché.")); } })),
    h("p", { class: "parentnote", text: "Désactivé par défaut. Chaque quiz activé apparaît sur l'accueil s'il a au moins " + QUIZ_MIN + " questions." }),
    h("div", { class: "actions" }, QUIZ_TYPES.map(function (t) {
      return h("button", { class: "btn" + (r[t.id] ? " primary" : ""), type: "button", "data-quiz-type": t.id, "aria-pressed": r[t.id] ? "true" : "false",
        text: (r[t.id] ? "✓ " : "") + t.icon + " " + t.label, onclick: function () { bascule(t.id); } });
    })),
    h("div", { class: "label", text: "Questions tirées dans" }),
    h("div", { class: "actions" }, [["toutes", "Toutes les leçons publiées"], ["ouvertes", "Les leçons déjà ouvertes"]].map(function (x) {
      var on = r.reservoir === x[0];
      return h("button", { class: "btn" + (on ? " primary" : ""), type: "button", "data-reservoir": x[0], "aria-pressed": on ? "true" : "false",
        text: x[1], onclick: function () { setReglagesQuiz({ reservoir: x[0] }); renderParent("Réservoir du quiz : " + x[1].toLowerCase() + "."); } });
    })),
    h("p", { class: "parentnote", id: "quiz-dispo", text: QUIZ_TYPES.map(function (t) {
      var n = nbQuestions(t.id), g = t.id === "francais" ? 0 : nbGenerateurs(t.id);
      return t.label + " : " + n + " question" + (n > 1 ? "s" : "") + (g ? " + calculs" : "");
    }).join(" · ") }));
}

/* ------------------------------------------------------------ défi chrono (maths) : 10 calculs, pavé + Entrée, record à battre */
var DEFI_N = 10, DEFI_PENALITE = 5000, DEFI_EXCLUS = ["multiplication_posee"]; /* posée sur la feuille : pas de chrono */
var DEFI = { timers: [], intervalle: null, touche: null };
function defiStop() {
  DEFI.timers.forEach(clearTimeout); DEFI.timers = [];
  if (DEFI.intervalle) clearInterval(DEFI.intervalle); DEFI.intervalle = null;
  if (DEFI.touche) document.removeEventListener("keydown", DEFI.touche); DEFI.touche = null;
}
function defiPlus(fn, ms) { DEFI.timers.push(setTimeout(fn, ms)); }
function fmtTemps(ms) { return (Math.round(ms / 100) / 10).toFixed(1).replace(".", ",") + " s"; }
function defiGens(l) { return (l.generateurs || []).filter(function (g) { return DEFI_EXCLUS.indexOf(g.type) < 0; }); }
function defiDispo(l) {
  if (reglagesProfil().defi_off || !l || l.meta.matiere !== "mathematiques") return false;
  return (defiGens(l).length > 0 && !!window.GENERATEURS) || (l.calculs || []).length >= 3;
}
/* 10 calculs tirés des générateurs (sans doublon), sinon les calculs fixes de la leçon dans le désordre */
function tirerDefi(l) {
  var gens = defiGens(l), out = [], vus = {};
  if (gens.length && window.GENERATEURS) {
    for (var k = 0; out.length < DEFI_N && k < DEFI_N * 8; k++) {
      var spec = JSON.parse(JSON.stringify(gens[k % gens.length])); spec.nombre = 1;
      var ex = window.GENERATEURS.creer([spec])[0];
      if (!ex) continue;
      var cle = JSON.stringify(ex.consigne);
      if (vus[cle]) continue;
      vus[cle] = true; ex.id = ex.id + "-" + out.length; out.push(ex);
    }
  }
  if (!out.length) out = shuffle(l.calculs || []).slice(0, DEFI_N).map(function (c) { return JSON.parse(JSON.stringify(c)); });
  out.forEach(function (c) { if (c.svg) { IMG[c.id] = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(c.svg); c.image = c.id; } });
  return out;
}
function renderDefi(l, direct) {
  defiStop(); TTS.stop(); setNext(null); journal.fin();
  chargerLecon(l);
  var rec = (store.get(l.meta.id).defi || {}).record;
  app.innerHTML = ""; window.scrollTo(0, 0);
  var home = h("button", { class: "iconbtn", type: "button", id: "btn-home", "aria-label": "Retour aux leçons", text: "🏠", onclick: function () { renderHome(); } });
  app.appendChild(h("header", { class: "top" }, home, h("h1", null, "⏱️ ", rich(l.meta.titre))));
  var main = h("main", { id: "main", class: "defi" }); app.appendChild(main);
  if (direct) return defiCompte(main, l, rec);
  main.appendChild(h("div", { class: "card end", id: "defi-intro" }, h("div", { class: "big", text: "⏱️" }), h("h2", { text: "Défi chrono" }),
    h("p", { text: DEFI_N + " calculs, le plus vite possible !" }),
    h("p", { text: "Tape ta réponse, puis appuie sur ↵ Entrée." }),
    h("p", { text: "Une erreur ajoute 5 secondes." }),
    rec ? h("p", { class: "record", text: "🏆 Ton record : " + fmtTemps(rec) }) : null,
    h("div", { class: "actions" }, h("button", { class: "btn primary", type: "button", id: "btn-partez", text: "🚀 Partez !", onclick: function () { defiCompte(main, l, rec); } }))));
}
function defiCompte(main, l, rec) {
  main.innerHTML = "";
  var z = h("div", { class: "compte", id: "compte", "aria-live": "assertive" }); main.appendChild(z);
  ["3", "2", "1", "Go !"].forEach(function (t, i) { defiPlus(function () { z.textContent = t; }, i * 700); });
  defiPlus(function () { defiJeu(main, l, rec); }, 4 * 700 - 200);
}
function defiJeu(main, l, rec) {
  var CAL = tirerDefi(l), i = 0, cumul = 0, pen = 0, err = 0, t0 = 0, val = "", bloque = false;
  journal.debut(l, "defi");
  main.innerHTML = "";
  var chrono = h("div", { class: "chrono", id: "chrono", text: fmtTemps(0) });
  var compteur = h("div", { class: "counter", id: "defi-compteur" });
  var question = h("div", { class: "card defi-q" });
  var disp = h("div", { class: "saisie vide", id: "saisie", "aria-live": "polite", text: "?" });
  var fb = h("div", { class: "defi-fb", "aria-live": "polite" });
  function upd() { disp.textContent = val || "?"; disp.classList.toggle("vide", !val); }
  function key(k) {
    if (bloque) return;
    if (k === "⌫") val = val.slice(0, -1);
    else if (k === ",") { if (val && val.indexOf(",") < 0) val += ","; }
    else if (val.length < 9) val = (val === "0" ? "" : val) + k;
    upd();
  }
  function norm(x) { var n = parseFloat(String(x).replace(",", ".")); return isNaN(n) ? null : Math.round(n * 1000); }
  function montre() {
    var c = CAL[i];
    compteur.textContent = (i + 1) + " / " + CAL.length;
    question.innerHTML = ""; add(question, h("div", { class: "q" }, rich(txt(c.consigne)))); add(question, itemImg(c));
    val = ""; upd(); disp.classList.remove("juste", "faux"); fb.textContent = "";
    t0 = performance.now(); bloque = false;
  }
  function valider() {
    if (bloque || !val) return;
    bloque = true;
    var c = CAL[i], tq = performance.now() - t0, ok = norm(val) === norm(c.reponse);
    cumul += tq;
    journal.ev({ k: "calcul", defi: true, id: c.id, gen: c.genere || null, consigne: plain(txt(c.consigne)), attendu: String(c.reponse),
      saisies: [val], reussi: ok, fini: true, temps: Math.round(tq) });
    if (ok) { disp.classList.add("juste"); fb.textContent = "✓"; }
    else { err++; pen += DEFI_PENALITE; disp.classList.add("faux"); fb.textContent = "C'était " + c.reponse + "  (+5 s)"; }
    chrono.textContent = fmtTemps(cumul + pen);
    defiPlus(function () { i++; if (i < CAL.length) montre(); else fin(); }, ok ? 250 : 1300);
  }
  function fin() {
    defiStop();
    var total = Math.round(cumul + pen), st = store.get(), d = st.defi || {}, record = !d.record || total < d.record;
    store.patch({ defi: { record: record ? total : d.record, parties: (d.parties || 0) + 1, dernier: total } });
    journal.marque({ terminee: true, defi_ms: total, erreurs: err, n: CAL.length });
    var nom = reglagesProfil().prenom ? " " + reglagesProfil().prenom : "";
    main.innerHTML = "";
    main.appendChild(h("div", { class: "card end", id: "defi-fin" }, h("div", { class: "big", text: record ? "🏆" : "⏱️" }),
      h("div", { class: "chrono", id: "defi-temps", text: fmtTemps(total) }),
      h("p", { id: "defi-justes", text: (CAL.length - err) + " juste" + (CAL.length - err > 1 ? "s" : "") + " sur " + CAL.length + (err ? " · " + err + " erreur" + (err > 1 ? "s" : "") + " (+" + (err * 5) + " s)" : " · aucune erreur !") }),
      record ? h("p", { class: "record", id: "defi-record", text: d.record ? "Nouveau record" + nom + " ! L'ancien était " + fmtTemps(d.record) + "." : "Premier record" + nom + " !" })
        : h("p", { class: "record", text: "Ton record : " + fmtTemps(d.record) + ". Essaie encore !" }),
      h("div", { class: "actions" },
        h("button", { class: "btn primary", type: "button", id: "btn-rejouer", text: "🔁 Rejouer", onclick: function () { renderDefi(l, true); } }),
        err ? h("button", { class: "btn soft", type: "button", id: "btn-defi-lecon", text: "📖 Revoir la leçon", onclick: function () { openLesson(l); } }) : null,
        h("button", { class: "btn", type: "button", id: "btn-retour", text: "🏠 Mes leçons", onclick: function () { renderHome(); } }))));
  }
  var pad = h("div", { class: "pad" }, ["1", "2", "3", "4", "5", "6", "7", "8", "9", ",", "0", "⌫"].map(function (k) {
    return h("button", { class: "padkey" + (k === "⌫" ? " del" : ""), type: "button", "data-k": k, "aria-label": k === "⌫" ? "Effacer" : k, text: k, onclick: function () { key(k); } });
  }).concat([h("button", { class: "padkey entree", type: "button", id: "btn-entree", "aria-label": "Entrée", text: "↵ Entrée", onclick: valider })]));
  main.appendChild(h("div", { class: "defi-haut" }, chrono, compteur));
  main.appendChild(question); main.appendChild(disp); main.appendChild(fb); main.appendChild(pad);
  /* clavier physique ou pavé numérique branché sur la tablette */
  DEFI.touche = function (ev) {
    var k = ev.key;
    if (/^[0-9]$/.test(k)) key(k);
    else if (k === "," || k === ".") key(",");
    else if (k === "Backspace") key("⌫");
    else if (k === "Enter") valider();
    else return;
    ev.preventDefault();
  };
  document.addEventListener("keydown", DEFI.touche);
  DEFI.intervalle = setInterval(function () { if (!bloque) chrono.textContent = fmtTemps(cumul + pen + performance.now() - t0); }, 100);
  montre();
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

/* thèmes de l'accueil, alignés sur le programme de CE2 (même liste que THEMES dans outils/validate.py) */
var THEMES = [
  ["grammaire", "francais", "🔤", "Grammaire"], ["conjugaison", "francais", "⏳", "Conjugaison"],
  ["dictee", "francais", "✏️", "Dictée"], ["vocabulaire", "francais", "📖", "Vocabulaire"], ["poesie", "francais", "📜", "Poésie"],
  ["nombres", "mathematiques", "🔢", "Nombres"], ["fractions", "mathematiques", "🍕", "Fractions"],
  ["operations", "mathematiques", "➗", "Opérations"], ["calcul_mental", "mathematiques", "⚡", "Calcul mental"],
  ["mesures", "mathematiques", "📏", "Mesures"], ["heure", "mathematiques", "🕒", "L'heure"],
  ["geometrie", "mathematiques", "📐", "Géométrie"], ["monnaie", "mathematiques", "💶", "Monnaie"],
  ["problemes", "mathematiques", "💡", "Problèmes"], ["donnees", "mathematiques", "📊", "Tableaux et graphiques"]
].map(function (x) { return { key: x[0], matiere: x[1], icon: x[2], label: x[3] }; });
var THEME = {}; THEMES.forEach(function (x) { THEME[x.key] = x; });
var ORDRE_MATIERES = ["francais", "mathematiques", "questionner_le_monde", "langue_vivante", "emc", "arts", "autre"];
/* leçons publiées avant le champ meta.theme : on devine le thème d'après le titre, puis le domaine */
var REGLES = {
  francais: [["poesie", /poesie|poeme|recitation/], ["conjugaison", /conjug|imparfait|present de l|futur|passe compose|temps des verbes/],
    ["dictee", /orthograph|dictee|^mots\b/], ["vocabulaire", /vocabul|lexique|synonym|antonym|famille|prefixe|suffixe|dictionnaire/]],
  mathematiques: [["calcul_mental", /calcul mental/], ["fractions", /fraction/], ["monnaie", /monnaie|euro|prix/],
    ["mesures", /mesure|longueur|masse|contenance|perimetre|conversion|unite/], ["heure", /heure|duree|horloge|calendrier/],
    ["geometrie", /geometr|figure|polygone|angle|cercle|symetr|solide|segment|droite|carre|rectangle|triangle|patron/],
    ["donnees", /tableau|diagramme|graphique|donnees/], ["problemes", /probleme/],
    ["operations", /addition|soustraction|multipli|divis|operation|posee|soustraire|produit/]]
};
var DEFAUT = { francais: "grammaire", mathematiques: "nombres" };
function sansAccent(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
function themeOf(l) {
  var m = l.meta;
  if (m.theme && THEME[m.theme] && THEME[m.theme].matiere === m.matiere) return m.theme;
  var regles = REGLES[m.matiere];
  if (!regles) return "m:" + (MATIERES[m.matiere] ? m.matiere : "autre");
  if (m.matiere === "francais") {
    if (m.type_lecon === "poesie") return "poesie";
    if (m.type_lecon === "liste_a_memoriser") return "dictee";
  }
  var titre = sansAccent(plain(m.titre)).replace(/^(lecon|maths?)[^:]*:\s*/, ""), dom = sansAccent(m.domaine), i;
  for (i = 0; i < regles.length; i++) if (regles[i][1].test(titre)) return regles[i][0];
  for (i = 0; i < regles.length; i++) if (regles[i][1].test(dom)) return regles[i][0];
  return DEFAUT[m.matiere];
}
function themeInfo(k) {
  if (THEME[k]) return THEME[k];
  var mk = k.slice(2), m = MATIERES[mk] || MATIERES.autre;
  return { key: k, matiere: mk, icon: m.icon, label: m.label };
}
/* ordre de la méthode : période, puis numéro dans le titre (leçon 2 avant leçon 10), puis date */
function ordreMethode(a, b) {
  return ((a.meta.periode || 0) - (b.meta.periode || 0)) ||
    plain(a.meta.titre).localeCompare(plain(b.meta.titre), "fr", { numeric: true }) || (a.meta.date < b.meta.date ? -1 : a.meta.date > b.meta.date ? 1 : 0);
}
function aRevoir(l) { var p = store.get(l.meta.id); return !!(p.demain && p.demain.length); }
function estNouvelle(l) { return !store.get(l.meta.id).ouvert; }

function piedParent() {
  var gear = h("button", { class: "iconbtn gear", type: "button", id: "btn-parent", "aria-label": "Zone parent (maintenir 2 secondes)", text: "⚙️" });
  var hint = h("p", { class: "parentnote", text: "" }), timer = null;
  function start(ev) { ev.preventDefault(); timer = setTimeout(function () { timer = null; renderParent(); }, 1800); hint.textContent = "Garde le doigt appuyé…"; }
  function stop() { if (timer) { clearTimeout(timer); timer = null; hint.textContent = "Zone parent : maintenir le bouton 2 secondes."; } }
  gear.addEventListener("pointerdown", start); gear.addEventListener("pointerup", stop); gear.addEventListener("pointerleave", stop);
  gear.addEventListener("contextmenu", function (ev) { ev.preventDefault(); });
  return h("footer", { class: "pied" }, gear, hint);
}

function carteLecon(l) {
  var p = store.get(l.meta.id), badges = [];
  var aMethode = l.meta.methode && l.meta.methode !== "aucune" && l.meta.methode !== "autre";
  if (aMethode || l.meta.periode) badges.push((aMethode ? l.meta.methode : "") + (aMethode && l.meta.periode ? " · " : "") + (l.meta.periode ? "P" + l.meta.periode : ""));
  var etat = !p.ouvert ? h("span", { class: "nouveau", text: "Nouveau ✨" })
    : h("span", null, p.fini ? "✓ Fini · ⭐ " + (p.best || 0) : "En cours", (p.demain && p.demain.length) ? "  🌙 " + p.demain.length + " à revoir" : "");
  var carte = h("button", { class: "lecon-card", type: "button", "data-id": l.meta.id, onclick: function () { openLesson(l); } },
    h("span", { class: "mat", "aria-hidden": "true", text: themeInfo(themeOf(l)).icon }),
    h("span", { class: "corps" }, h("span", { class: "titre", text: plain(l.meta.titre) }),
      h("span", { class: "sous", text: dateFr(l.meta.date) + (badges.length ? " · " + badges.join(" · ") : "") }), h("span", { class: "etat" }, etat)));
  if (!defiDispo(l)) return carte;
  var rec = (p.defi || {}).record;
  return h("div", { class: "lecon-ligne" }, carte,
    h("button", { class: "defi-btn", type: "button", "data-defi": l.meta.id, "aria-label": "Défi chrono" + (rec ? ", record " + fmtTemps(rec) : ""), onclick: function () { renderDefi(l); } },
      h("span", { class: "ic", "aria-hidden": "true", text: "⏱️" }), h("span", { class: "lbl", text: rec ? "🏆 " + fmtTemps(rec) : "Défi" })));
}

function renderHome(info) {
  defiStop(); TTS.stop(); setNext(null); D = null; CTX = null; journal.fin(); app.innerHTML = ""; window.scrollTo(0, 0);
  var vues = { revoir: ["🌙", "À revoir", aRevoir], nouveau: ["✨", "Nouvelles leçons", estNouvelle] };
  var liste = null, titre = null;
  if (VUE && vues[VUE]) { liste = LESSONS.filter(vues[VUE][2]); titre = vues[VUE][0] + " " + vues[VUE][1]; }
  else if (VUE) { liste = LESSONS.filter(function (l) { return themeOf(l) === VUE; }).sort(ordreMethode); titre = themeInfo(VUE).icon + " " + themeInfo(VUE).label; }
  if (liste && !liste.length) { VUE = null; liste = null; }

  /* écran d'un thème : les leçons dans l'ordre de la méthode */
  if (liste) {
    var retour = h("button", { class: "iconbtn", type: "button", id: "btn-themes", "aria-label": "Retour aux thèmes", text: "🏠",
      onclick: function () { VUE = null; renderHome(); } });
    app.appendChild(h("header", { class: "top home" }, retour, h("h1", { id: "titre-vue", text: titre })));
    app.appendChild(h("div", { class: "lecons" }, liste.map(carteLecon)));
    setNext("⬅ Mes thèmes", function () { VUE = null; renderHome(); });
    return;
  }

  /* accueil : raccourcis, puis les thèmes de chaque matière */
  var r = reglagesProfil();
  app.appendChild(h("header", { class: "top home" }, h("h1", { text: r.prenom ? "Bonjour " + r.prenom + " ! 👋" : "Mes révisions 📚" })));
  if (!LESSONS.length) app.appendChild(h("div", { class: "card end" }, h("div", { class: "big", text: "🌱" }), h("p", { text: "Pas encore de leçon. Elles arriveront bientôt !" })));
  var raccourcis = [];
  ["revoir", "nouveau"].forEach(function (k) {
    var n = LESSONS.filter(vues[k][2]).length;
    if (n) raccourcis.push(h("button", { class: "raccourci " + k, type: "button", "data-vue": k, onclick: function () { VUE = k; renderHome(); } },
      h("span", { class: "ic", "aria-hidden": "true", text: vues[k][0] }),
      h("span", { class: "corps" }, h("span", { class: "titre", text: vues[k][1] }), h("span", { class: "sous", text: n + " leçon" + (n > 1 ? "s" : "") }))));
  });
  if (raccourcis.length) app.appendChild(h("div", { class: "raccourcis" }, raccourcis));
  var quiz = QUIZ_TYPES.filter(function (t) { return quizDispo(t.id); });
  if (quiz.length) app.appendChild(h("div", { class: "raccourcis quiz" }, quiz.map(function (t) {
    return h("button", { class: "raccourci quiz", type: "button", "data-quiz": t.id, onclick: function () { openQuiz(t.id); } },
      h("span", { class: "ic", "aria-hidden": "true", text: t.icon }),
      h("span", { class: "corps" }, h("span", { class: "titre", text: t.label }), h("span", { class: "sous", text: tailleQuiz(t.id) + " questions" })));
  })));

  var groupes = {};
  LESSONS.forEach(function (l) { var k = themeOf(l); (groupes[k] = groupes[k] || []).push(l); });
  ORDRE_MATIERES.forEach(function (mat) {
    var keys = THEMES.filter(function (x) { return x.matiere === mat; }).map(function (x) { return x.key; }).concat(["m:" + mat])
      .filter(function (k) { return groupes[k]; });
    if (!keys.length) return;
    app.appendChild(h("h2", { class: "matiere", text: (MATIERES[mat] || MATIERES.autre).label }));
    app.appendChild(h("div", { class: "themes" }, keys.map(function (k) {
      var ls = groupes[k], ti = themeInfo(k), nv = ls.filter(estNouvelle).length;
      return h("button", { class: "theme-tile", type: "button", "data-theme": k, onclick: function () { VUE = k; renderHome(); } },
        h("span", { class: "ic", "aria-hidden": "true", text: ti.icon }),
        h("span", { class: "corps" }, h("span", { class: "titre", text: ti.label }),
          h("span", { class: "sous", text: ls.length + " leçon" + (ls.length > 1 ? "s" : "") }),
          nv ? h("span", { class: "nouveau", text: nv + " nouvelle" + (nv > 1 ? "s" : "") + " ✨" }) : null));
    })));
  });
  if (info && info.illisibles) app.appendChild(h("p", { class: "parentnote", text: info.illisibles + " leçon(s) illisible(s) : le mot de passe a peut-être changé (zone parent > Verrouiller)." }));
  app.appendChild(piedParent());
}

/* ------------------------------------------------------------ bilan des révisions (export) */
var BILAN = { profil: "enfant", periode: "envoi" };
var PERIODES = [["envoi", "Depuis le dernier envoi"], ["7", "7 jours"], ["30", "30 jours"], ["tout", "Tout"]];
var DUREE_MAX = 30; /* minutes : une appli restée ouverte ne gonfle pas le total */
function d2(n) { return (n < 10 ? "0" : "") + n; }
function jjmm(iso) { var d = new Date(iso); return d2(d.getDate()) + "/" + d2(d.getMonth() + 1); }
function jjmmhh(iso) { var d = new Date(iso); return jjmm(iso) + " " + d2(d.getHours()) + ":" + d2(d.getMinutes()); }
function guil(s) { return "« " + s + " »"; }
function depuisPeriode(pid, per) {
  if (per === "tout") return "";
  if (per === "envoi") return reglagesDe(pid).dernier_envoi || "";
  return new Date(Date.now() - parseInt(per, 10) * 864e5).toISOString();
}
/* résumé lisible par le parent et par Claude, puis données brutes */
function genererBilan(all, pid, depuis) {
  var pr = profils.get(pid), maintenant = new Date().toISOString();
  var S = all.filter(function (x) { return x.profil === pid && x.debut >= depuis; }).sort(function (a, b) { return a.debut < b.debut ? -1 : 1; });
  var L = [], du = S.length ? S[0].debut : depuis || maintenant;
  L.push("Bilan du cahier de révisions : du " + jjmm(du) + " au " + jjmm(maintenant) + " (profil " + pr.libelle + ")");
  if (!S.length) { L.push("", "Aucune séance sur cette période."); var t0 = L.join("\n"); return { texte: t0, court: t0, n: 0 }; }
  var minutes = 0, plafond = false, lecons = {}, ordre = [];
  S.forEach(function (x) {
    var m = (new Date(x.fin) - new Date(x.debut)) / 6e4;
    if (m > DUREE_MAX) { m = DUREE_MAX; plafond = true; }
    minutes += m;
    /* les réponses d'un quiz transverse sont rangées sous leur leçon d'origine */
    function lc(id, titre) { if (!lecons[id]) { lecons[id] = { titre: titre, ev: [] }; ordre.push(id); } return lecons[id]; }
    if (x.type !== "quiz_transverse") lc(x.lecon, x.titre);
    x.ev.forEach(function (e) { lc(e.lecon || x.lecon, e.titre || x.titre).ev.push(e); });
  });
  var quizT = S.filter(function (x) { return x.type === "quiz_transverse"; });
  var defis = S.filter(function (x) { return x.type === "defi" && x.terminee; });
  L.push(S.length + " séance" + (S.length > 1 ? "s" : "") + ", " + Math.round(minutes) + " minute" + (Math.round(minutes) > 1 ? "s" : "") +
    " au total" + (plafond ? " (séances longues comptées 30 min)" : "") + ", " + ordre.length + " leçon" + (ordre.length > 1 ? "s" : "") + " travaillée" + (ordre.length > 1 ? "s" : "") + ".");
  if (quizT.length) {
    var qe = []; quizT.forEach(function (x) { qe = qe.concat(x.ev.filter(function (e) { return e.k === "quiz" || e.k === "calcul"; })); });
    var q1 = qe.filter(function (e) { return e.k === "quiz" ? e.essais === 1 && e.resolu !== false : e.reussi && e.saisies.length === 1; }).length;
    L.push("Dont " + quizT.length + " quiz transverse" + (quizT.length > 1 ? "s" : "") + " (" + quizT.map(function (x) { return x.mode; }).join(", ") + ") : " +
      q1 + "/" + qe.length + " réponses justes du premier coup. Leurs erreurs sont rangées sous la leçon d'origine.");
  }
  if (defis.length) L.push("Dont " + defis.length + " défi" + (defis.length > 1 ? "s" : "") + " chrono terminé" + (defis.length > 1 ? "s" : "") + ".");
  L.push("Les identifiants entre crochets sont les meta.id des leçons.");

  var sautees = S.filter(function (x) { return x.etapes.sautees.some(function (e) { return x.etapes.finies.indexOf(e) < 0; }); });
  L.push("", "ÉTAPES SAUTÉES : " + sautees.length + " séance" + (sautees.length > 1 ? "s" : "") + " sur " + S.length);
  sautees.forEach(function (x) {
    L.push("- " + jjmm(x.debut) + " " + guil(x.titre) + " : " + x.etapes.sautees.filter(function (e) { return x.etapes.finies.indexOf(e) < 0; })
      .map(function (e) { return (STEP_META[e] || { label: e }).label.toLowerCase(); }).join(", "));
  });

  var aRetravailler = [], acquis = [];
  ordre.forEach(function (id) {
    var lc = lecons[id], ev = lc.ev;
    var pb = [], ok = [];
    /* quiz : par question, le nombre de fois où elle a demandé plusieurs essais */
    var qz = {}, qn = [];
    ev.filter(function (e) { return e.k === "quiz"; }).forEach(function (e) {
      if (!qz[e.id]) { qz[e.id] = { q: e.q, fois: 0, vues: 0, faux: [] }; qn.push(e.id); }
      var z = qz[e.id]; z.vues++;
      if (e.essais > 1 || e.resolu === false) { z.fois++; e.faux.forEach(function (f) { if (z.faux.indexOf(f) < 0) z.faux.push(f); }); }
      if (e.resolu === false) z.abandon = (z.abandon || 0) + 1;
    });
    var qok = 0;
    qn.forEach(function (k) { var z = qz[k];
      if (z.fois) pb.push("quiz " + k + " " + guil(z.q) + " : raté du premier coup " + z.fois + " fois sur " + z.vues + " (choisi : " + z.faux.map(guil).join(", ") + ")" +
        (z.abandon ? ", question quittée sans la bonne réponse" + (z.abandon > 1 ? " " + z.abandon + " fois" : "") : ""));
      else qok++; });
    if (qn.length) ok.push("quiz " + qok + "/" + qn.length + " du premier coup");
    /* calculs : chaque calcul manqué au premier essai (les nombres changent d'une séance à l'autre) */
    var cal = ev.filter(function (e) { return e.k === "calcul"; }), cok = cal.filter(function (e) { return e.reussi && e.saisies.length === 1; }).length;
    cal.filter(function (e) { return !(e.reussi && e.saisies.length === 1); }).slice(0, 8).forEach(function (e) {
      pb.push("calcul " + (e.gen ? "(" + e.gen + ") " : e.id + " ") + guil(e.consigne) + " : attendu " + e.attendu + ", saisi " + e.saisies.join(" puis ") +
        (e.reussi ? "" : e.fini === false ? " (calcul quitté en cours)" : e.defi ? "" : " (non trouvé)") + (e.defi ? " (défi chrono)" : ""));
    });
    if (cal.length) ok.push("calculs " + cok + "/" + cal.length + " du premier coup");
    /* cartes : état à la dernière séance où elles ont été passées */
    var dernier = {}; ev.filter(function (e) { return e.k === "carte"; }).forEach(function (e) { dernier[e.id] = e; });
    var cartes = Object.keys(dernier).map(function (k) { return dernier[k]; });
    var demain = cartes.filter(function (e) { return e.demain; }), hesite = cartes.filter(function (e) { return !e.demain && e.revoir > 0; });
    if (demain.length) pb.push("cartes à revoir demain : " + demain.map(function (e) { return e.id + " " + guil(e.recto); }).join(", "));
    if (hesite.length) pb.push("cartes sues après hésitation : " + hesite.map(function (e) { return e.id + " " + guil(e.recto); }).join(", "));
    if (cartes.length) ok.push("cartes " + cartes.filter(function (e) { return !e.demain && !e.revoir; }).length + "/" + cartes.length + " sues tout de suite");
    /* récitation : niveau de masquage le plus haut atteint */
    var rec = ev.filter(function (e) { return e.k === "recitation"; });
    if (rec.length) { var mx = Math.max.apply(null, rec.map(function (e) { return e.niveau; })), MX = rec[0].max;
      if (mx < MX) pb.push("récitation : niveau " + mx + " sur " + MX + " atteint"); else ok.push("récitation complète"); }
    /* oral : dernière réponse de chaque question */
    var od = {}; ev.filter(function (e) { return e.k === "oral"; }).forEach(function (e) { od[e.id] = e; });
    Object.keys(od).forEach(function (k) { var e = od[k];
      if (e.valide) ok.push("oral " + k + " validé"); else pb.push("oral " + k + " " + guil(e.q) + " : à revoir" + (e.manque.length ? " (manquait : " + e.manque.join(" ; ") + ")" : "")); });
    var tete = guil(lc.titre) + " [" + id + "]";
    if (pb.length) aRetravailler.push({ tete: tete, pb: pb });
    else if (ok.length) acquis.push(tete + " : " + ok.join(", "));
  });
  L.push("", "À RETRAVAILLER");
  if (!aRetravailler.length) L.push("- rien à signaler");
  aRetravailler.forEach(function (x) { L.push("- " + x.tete); x.pb.forEach(function (p) { L.push("    · " + p); }); });
  L.push("", "ACQUIS");
  if (!acquis.length) L.push("- aucune leçon sans erreur sur cette période");
  acquis.forEach(function (a) { L.push("- " + a); });
  if (defis.length) {
    L.push("", "DÉFIS CHRONO (" + DEFI_N + " calculs, +5 s par erreur)");
    var parL = {}, ordreD = [];
    defis.forEach(function (x) { if (!parL[x.lecon]) { parL[x.lecon] = []; ordreD.push(x.lecon); } parL[x.lecon].push(x); });
    ordreD.forEach(function (id) {
      var ps = parL[id], best = ps.slice().sort(function (a, b) { return a.defi_ms - b.defi_ms; })[0];
      L.push("- " + guil(ps[0].titre) + " [" + id + "] : " + ps.length + " partie" + (ps.length > 1 ? "s" : "") + ", meilleur temps " + fmtTemps(best.defi_ms) +
        " (" + best.erreurs + " erreur" + (best.erreurs > 1 ? "s" : "") + "), temps : " + ps.map(function (x) { return fmtTemps(x.defi_ms); }).join(", "));
    });
  }
  var court = L.join("\n");

  L.push("", "DÉTAIL PAR SÉANCE");
  S.forEach(function (x) {
    var m = Math.min(DUREE_MAX, Math.round((new Date(x.fin) - new Date(x.debut)) / 6e4));
    if (x.type === "defi") { L.push("- " + jjmmhh(x.debut) + ", défi chrono " + guil(x.titre) + " : " + (x.terminee ? fmtTemps(x.defi_ms) + ", " + x.erreurs + " erreur" + (x.erreurs > 1 ? "s" : "") : "abandonné")); return; }
    L.push("- " + jjmmhh(x.debut) + ", " + m + " min, " + guil(x.titre) + " : étapes finies " + (x.etapes.finies.join(", ") || "aucune") +
      (x.terminee ? " ; leçon terminée" : " ; leçon non terminée"));
  });
  L.push("", "--- DONNÉES BRUTES (JSON) ---",
    JSON.stringify({ format: "bilan-cahier-1", version: VERSION, profil: pid, depuis: depuis || null, genere: maintenant, seances: S }),
    "--- FIN ---");
  return { texte: L.join("\n"), court: court, n: S.length };
}

function carteBilan(out) {
  var card = h("div", { class: "card", id: "bilan" }, h("div", { class: "label", text: "Bilan des révisions" }));
  var info = h("p", { id: "bilan-info", text: "Calcul du bilan…" });
  var pre = h("pre", { class: "bilan-texte", id: "bilan-texte" });
  var r = reglages();
  var email = h("input", { type: "email", class: "mdp", id: "email", value: r.email || "", placeholder: "adresse email (bouton Email)", "aria-label": "Adresse email du parent" });
  email.addEventListener("change", function () { setReglages({ email: email.value.trim() }); });
  var B = null;
  function nomFichier() { var d = new Date(); return "bilan-" + d.getFullYear() + "-" + d2(d.getMonth() + 1) + "-" + d2(d.getDate()) + ".txt"; }
  function marquer() { setReglagesDe(BILAN.profil, { dernier_envoi: new Date().toISOString() }); }
  function corpsCourt() { return B.court.length > 1500 ? B.court.slice(0, 1500) + "\n… (suite dans le fichier du bilan)" : B.court; }
  card.appendChild(h("div", { class: "actions" }, PROFILS.map(function (x) {
    var on = x.id === BILAN.profil;
    return h("button", { class: "btn" + (on ? " primary" : ""), type: "button", "data-bilan-profil": x.id, "aria-pressed": on ? "true" : "false",
      text: x.icon + " " + x.libelle, onclick: function () { BILAN.profil = x.id; renderParent(); } });
  })));
  card.appendChild(h("div", { class: "actions" }, PERIODES.map(function (x) {
    var on = x[0] === BILAN.periode;
    return h("button", { class: "btn" + (on ? " primary" : ""), type: "button", "data-periode": x[0], "aria-pressed": on ? "true" : "false",
      text: x[1], onclick: function () { BILAN.periode = x[0]; renderParent(); } });
  })));
  card.appendChild(info);
  card.appendChild(h("details", null, h("summary", { text: "Voir le bilan" }), pre));
  card.appendChild(email);
  var bShare = h("button", { class: "btn primary", type: "button", id: "btn-partager", text: "📤 Envoyer le bilan", disabled: true });
  var bMail = h("button", { class: "btn", type: "button", id: "btn-email", text: "✉️ Email (résumé)", disabled: true });
  var bDl = h("button", { class: "btn", type: "button", id: "btn-telecharger", text: "⬇️ Télécharger", disabled: true });
  card.appendChild(h("div", { class: "actions" }, bShare, bMail, bDl));
  bShare.addEventListener("click", function () {
    var f = new File([B.texte], nomFichier(), { type: "text/plain" });
    if (!(navigator.canShare && navigator.share && navigator.canShare({ files: [f] }))) {
      out.textContent = "Partage de fichier indisponible sur ce navigateur : utilisez Email ou Télécharger."; return;
    }
    navigator.share({ files: [f], title: "Bilan du cahier de révisions", text: corpsCourt() })
      .then(function () { marquer(); renderParent("Bilan envoyé."); })
      .catch(function (e) { if (e && e.name !== "AbortError") out.textContent = "Envoi impossible : " + e.message; });
  });
  bMail.addEventListener("click", function () {
    setReglages({ email: email.value.trim() });
    marquer();
    location.href = "mailto:" + encodeURIComponent(email.value.trim()) + "?subject=" + encodeURIComponent("Bilan du cahier de révisions") + "&body=" + encodeURIComponent(corpsCourt());
  });
  bDl.addEventListener("click", function () {
    var url = URL.createObjectURL(new Blob([B.texte], { type: "text/plain;charset=utf-8" }));
    var a = h("a", { href: url, download: nomFichier() }); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    marquer(); out.textContent = "Bilan téléchargé (" + nomFichier() + ").";
  });
  var depuis = depuisPeriode(BILAN.profil, BILAN.periode), envoi = reglagesDe(BILAN.profil).dernier_envoi;
  journal.lire().then(function (all) {
    B = genererBilan(all, BILAN.profil, depuis);
    window.__bilan = B.texte;
    info.textContent = B.n + " séance" + (B.n > 1 ? "s" : "") + " sur la période · dernier envoi : " + (envoi ? jjmmhh(envoi) : "jamais");
    pre.textContent = B.texte.split("\n--- DONNÉES BRUTES")[0];
    bShare.disabled = bMail.disabled = bDl.disabled = !B.n;
  });
  return card;
}

/* zone parent : leçons par thème du programme, thèmes encore vides compris */
function cartePrograme() {
  var groupes = {};
  LESSONS.forEach(function (l) { var k = themeOf(l); (groupes[k] = groupes[k] || []).push(l); });
  var lignes = [];
  ["francais", "mathematiques"].forEach(function (mat) {
    lignes.push(h("div", { class: "label", text: MATIERES[mat].label }));
    THEMES.filter(function (x) { return x.matiere === mat; }).forEach(function (x) {
      var ls = (groupes[x.key] || []).slice().sort(ordreMethode);
      lignes.push(ls.length
        ? h("details", { class: "prog", "data-theme": x.key }, h("summary", { text: x.icon + " " + x.label + " : " + ls.length + " leçon" + (ls.length > 1 ? "s" : "") }),
            h("ul", null, ls.map(function (l) { return h("li", { text: plain(l.meta.titre) + (l.meta.theme ? "" : " (thème deviné)") }); })))
        : h("p", { class: "prog vide", "data-theme": x.key, text: x.icon + " " + x.label + " : pas encore de leçon" }));
    });
  });
  return h("div", { class: "card", id: "programme" }, h("div", { class: "label", text: "Programme de CE2 : leçons par thème" }), lignes);
}

function renderParent(msg) {
  TTS.stop(); setNext(null); app.innerHTML = "";
  var r = reglagesProfil(), pa = profils.actif();
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
  app.appendChild(h("div", { class: "card", id: "profils" }, h("div", { class: "label", text: "Profil actif" }),
    h("div", { class: "actions" }, PROFILS.map(function (x) {
      var on = x.id === pa.id;
      return h("button", { class: "btn" + (on ? " primary" : ""), type: "button", "data-profil": x.id, "aria-pressed": on ? "true" : "false",
        text: x.icon + " " + x.libelle, onclick: function () { profils.choisir(x.id); renderParent("Profil actif : " + x.libelle + "."); } });
    })),
    h("p", { class: "parentnote", text: "Le profil test garde sa propre progression. L'appli revient au profil Enfant à chaque lancement." })));
  app.appendChild(carteBilan(out));
  app.appendChild(carteModeQuiz());
  var taille = reglages().taille || "moyenne";
  app.appendChild(h("div", { class: "card" }, h("div", { class: "label", text: "Taille du texte" }),
    h("div", { class: "actions" }, ["petite", "moyenne", "grande"].map(function (k) {
      return h("button", { class: "btn" + (k === taille ? " primary" : ""), type: "button", "data-taille": k, "aria-pressed": k === taille ? "true" : "false",
        text: k.charAt(0).toUpperCase() + k.slice(1), onclick: function () { setReglages({ taille: k }); appliquerTaille(); renderParent("Taille du texte : " + k + "."); } });
    }))));
  app.appendChild(h("div", { class: "card" }, h("div", { class: "label", text: "Prénom affiché (profil " + pa.libelle + ")" }), prenom,
    act("Enregistrer", "btn-prenom", function () { setReglagesProfil({ prenom: prenom.value.trim() }); out.textContent = "Prénom enregistré pour le profil " + pa.libelle + "."; })));
  app.appendChild(h("div", { class: "card" }, h("div", { class: "label", text: "Leçons" }),
    h("p", { text: LESSONS.length + " leçon(s) sur cet appareil." }),
    act("🔄 Recharger les leçons", "btn-recharger", function () { boot(); }),
    h("div", { class: "label", text: "Ajouter une leçon depuis un fichier (secours)" }), file));
  app.appendChild(cartePrograme());
  app.appendChild(h("div", { class: "card" }, h("div", { class: "label", text: "Progression" }),
    act("♻️ Remettre à zéro la progression du profil " + pa.libelle, "btn-raz", function () {
      var pre = "prog:" + pa.id + ":";
      Object.keys(localStorage).forEach(function (k) { if (k.indexOf(pre) === 0) localStorage.removeItem(k); });
      out.textContent = "Progression du profil " + pa.libelle + " remise à zéro.";
    }, "soft"),
    act("🔒 Verrouiller ce cahier (redemander le mot de passe)", "btn-verrou", function () {
      idb.del("cle").then(function () { renderLogin(); });
    }, "soft")));
  app.appendChild(out);
  app.appendChild(h("p", { class: "parentnote", text: "Version " + VERSION + " · données stockées uniquement sur cet appareil" +
    (STOCKAGE.protege === true ? " (protégées contre l'effacement automatique)." : STOCKAGE.protege === false ? " (non protégées : Chrome peut les effacer si l'appareil manque de place)." : ".") }));
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
      VUE = null; renderHome(info);
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
window.__cahier = { version: VERSION, tirer: tirer, assemblerQuiz: assemblerQuiz }; /* exposés pour tests/test_quiz.py */
appliquerTaille();
migrerProfils();
profils.choisir("enfant"); /* chaque lancement repart sur le profil de l'enfant */
protegerStockage();
journal.purger();
boot();
})();
