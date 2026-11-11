/* Générateurs d'exercices de calcul : de nouveaux nombres à chaque séance.
   Chaque exercice produit porte son expression (vérifiée par tests/test_generateurs.py). */
(function (root) {
"use strict";

function rnd(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
function pick(t) { return t[Math.floor(Math.random() * t.length)]; }
function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " "); } /* 4 386 */

/* ---- nombres en lettres, orthographe rectifiée (tirets partout) */
var U = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix",
         "onze", "douze", "treize", "quatorze", "quinze", "seize"];
var D = { 2: "vingt", 3: "trente", 4: "quarante", 5: "cinquante", 6: "soixante" };
function moinsDe100(n) {
  if (n < 17) return U[n];
  if (n < 20) return "dix-" + U[n - 10];
  if (n < 70) {
    var d = Math.floor(n / 10), u = n % 10;
    return D[d] + (u === 0 ? "" : u === 1 ? "-et-un" : "-" + U[u]);
  }
  if (n < 80) return n === 71 ? "soixante-et-onze" : "soixante-" + moinsDe100(n - 60);
  if (n === 80) return "quatre-vingts";
  return "quatre-vingt-" + moinsDe100(n - 80);
}
function moinsDe1000(n) {
  var c = Math.floor(n / 100), r = n % 100;
  if (c === 0) return moinsDe100(r);
  var t = c === 1 ? "cent" : U[c] + "-cent";
  if (r === 0) return c > 1 ? t + "s" : t;
  return t + "-" + moinsDe100(r);
}
function enLettres(n) {
  if (n < 1000) return moinsDe1000(n);
  var m = Math.floor(n / 1000), r = n % 1000;
  var t = m === 1 ? "mille" : moinsDe100(m) + "-mille";
  return r === 0 ? t : t + "-" + moinsDe1000(r);
}

var RANGS = [{ v: 1000, s: "millier", p: "milliers" }, { v: 100, s: "centaine", p: "centaines" },
             { v: 10, s: "dizaine", p: "dizaines" }, { v: 1, s: "unité", p: "unités" }];
function qte(n, r) { return n + " " + (n > 1 ? r.p : r.s); }
function nombre(chiffres) { return chiffres === 4 ? rnd(1000, 9999) : rnd(100, 999); }
function divise(e) { return e.replace(/÷/g, "divisé par"); }

var G = {
  /* 6 × 100 + 2 × 10 + 4 × 1, ou 500 + 30 + 4 */
  decomposition: function (p) {
    var ch = p.chiffres || 3, n = nombre(ch), rangs = RANGS.slice(4 - ch), termes;
    if (p.forme === "somme") {
      termes = rangs.map(function (r) { return Math.floor(n / r.v) % 10 * r.v; }).filter(function (x) { return x; }).map(fmt);
    } else {
      termes = rangs.map(function (r) { return (Math.floor(n / r.v) % 10) + " × " + fmt(r.v); });
    }
    var e = termes.join(" + ");
    return { consigne: "Calcule : " + e, expression: e, reponse: String(n) };
  },
  /* Quel nombre fait 8 centaines et 5 unités ? */
  composition: function (p) {
    var ch = p.chiffres || 3, rangs = RANGS.slice(4 - ch), choisis = [rangs[0]];
    var autres = rangs.slice(1).sort(function () { return Math.random() - 0.5; });
    choisis = choisis.concat(autres.slice(0, rnd(1, 2)));
    choisis.sort(function (a, b) { return b.v - a.v; });
    var parts = choisis.map(function (r) { return { r: r, n: rnd(1, 9) }; });
    var noms = parts.map(function (x) { return qte(x.n, x.r); });
    var dit = noms.length === 2 ? noms.join(" et ") : noms.slice(0, -1).join(", ") + " et " + noms[noms.length - 1];
    var e = parts.map(function (x) { return x.n + " × " + fmt(x.r.v); }).join(" + ");
    var tot = parts.reduce(function (s, x) { return s + x.n * x.r.v; }, 0);
    return { consigne: "Quel nombre fait " + dit + " ?", expression: e, reponse: String(tot) };
  },
  /* Combien de dizaines dans 4 centaines ? */
  echanges: function () {
    var n = rnd(1, 9), cas = pick([
      ["dizaines", 100, 10], ["unités", 10, 1], ["centaines", 1000, 100], ["dizaines", 1000, 10]]);
    var de = RANGS.filter(function (r) { return r.v === cas[1]; })[0], k = cas[1] / cas[2];
    var mot = cas[0] === "unités" ? "Combien d'unités" : "Combien de " + cas[0];
    return { consigne: mot + " dans " + qte(n, de) + " ?", expression: n + " × " + k, reponse: String(n * k) };
  },
  /* Écris en chiffres : quatre-cent-six. */
  ecrire_chiffres: function (p) {
    var n = nombre(p.chiffres || 3);
    return { consigne: "Écris en chiffres : " + enLettres(n) + ".", expression: fmt(n), reponse: String(n), lettres: enLettres(n) };
  },
  /* Écris le plus grand : 4 386 ou 4 368 ? (les deux nombres ont le même début) */
  comparer: function (p) {
    var ch = p.chiffres || 4, a = nombre(ch), s = String(a).split("").map(Number);
    var r = rnd(0, ch - 1), t = s.slice();
    do { t[r] = rnd(r === 0 ? 1 : 0, 9); } while (t[r] === s[r]);
    for (var i = r + 1; i < ch; i++) t[i] = rnd(0, 9);
    var b = Number(t.join("")), sens = p.sens === "mixte" || !p.sens ? pick(["grand", "petit"]) : p.sens;
    var x = Math.random() < 0.5 ? [a, b] : [b, a];
    var rep = sens === "grand" ? Math.max(a, b) : Math.min(a, b);
    return { consigne: "Écris le plus " + sens + " : " + fmt(x[0]) + " ou " + fmt(x[1]) + " ?", reponse: String(rep),
             comparaison: { sens: sens, nombres: x } };
  },
  /* 7 × 6, ou 42 ÷ 6 */
  table: function (p) {
    var t = pick(p.tables || [2, 3, 4, 5]), b = rnd(p.operation === "addition" ? 1 : 2, p.jusqua || 10);
    var op = p.operation === "mixte" || !p.operation ? pick(["multiplication", "division"]) : p.operation;
    var e = op === "division" ? (t * b) + " ÷ " + t : op === "addition" ? b + " + " + t : b + " × " + t;
    var r = op === "division" ? b : op === "addition" ? b + t : t * b;
    return { consigne: { texte: "Calcule : " + e, oral: "Calcule : " + divise(e) }, expression: e, reponse: String(r) };
  },
  /* 20 bonbons, 4 bonbons par sachet / 24 cartes pour 3 enfants */
  partage: function (p) {
    var k = pick(p.tables || [2, 3, 4, 5]), q = rnd(2, 10), n = k * q, o = pick(["billes", "bonbons", "cartes", "images", "perles"]);
    var c = Math.random() < 0.5
      ? n + " " + o + ", " + k + " " + o + " par sachet. Combien de sachets ?"
      : n + " " + o + " pour " + k + " enfants. Combien de " + o + " chacun ?";
    return { consigne: c, expression: n + " ÷ " + k, reponse: String(q) };
  },
  /* Quelle est la moitié de 36 ? */
  moitie: function (p) {
    var n = 2 * rnd(1, Math.floor((p.max || 40) / 2));
    return { consigne: "Quelle est la moitié de " + n + " ?", expression: n + " ÷ 2", reponse: String(n / 2) };
  }
};

/* ---- horloge à aiguilles (SVG original) */
function horloge(hh, mm) {
  var s = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 220">',
    '<circle cx="110" cy="110" r="100" fill="#ffffff" stroke="#2b2b2b" stroke-width="6"/>'];
  for (var i = 0; i < 60; i++) {
    var a = i * Math.PI / 30, r1 = i % 5 ? 92 : 86;
    s.push('<line x1="' + (110 + r1 * Math.sin(a)).toFixed(1) + '" y1="' + (110 - r1 * Math.cos(a)).toFixed(1) +
      '" x2="' + (110 + 97 * Math.sin(a)).toFixed(1) + '" y2="' + (110 - 97 * Math.cos(a)).toFixed(1) +
      '" stroke="#2b2b2b" stroke-width="' + (i % 5 ? 1.5 : 3) + '"/>');
  }
  for (var n = 1; n <= 12; n++) {
    var b = n * Math.PI / 6;
    s.push('<text x="' + (110 + 70 * Math.sin(b)).toFixed(1) + '" y="' + (110 - 70 * Math.cos(b) + 7).toFixed(1) +
      '" font-size="20" font-family="sans-serif" font-weight="bold" text-anchor="middle" fill="#2b2b2b">' + n + '</text>');
  }
  var am = mm * Math.PI / 30, ah = ((hh % 12) + mm / 60) * Math.PI / 6;
  s.push('<line x1="110" y1="110" x2="' + (110 + 48 * Math.sin(ah)).toFixed(1) + '" y2="' + (110 - 48 * Math.cos(ah)).toFixed(1) + '" stroke="#1f3c88" stroke-width="9" stroke-linecap="round"/>');
  s.push('<line x1="110" y1="110" x2="' + (110 + 80 * Math.sin(am)).toFixed(1) + '" y2="' + (110 - 80 * Math.cos(am)).toFixed(1) + '" stroke="#c62828" stroke-width="5" stroke-linecap="round"/>');
  s.push('<circle cx="110" cy="110" r="7" fill="#2b2b2b"/></svg>');
  return s.join("");
}

var UNITES = {
  longueur: [["m", "cm", 100], ["m", "mm", 1000], ["cm", "mm", 10], ["dm", "cm", 10], ["m", "dm", 10], ["km", "m", 1000]],
  masse: [["kg", "g", 1000], ["t", "kg", 1000]],
  contenance: [["L", "dL", 10], ["L", "cL", 100], ["dL", "cL", 10]],
  duree: [["min", "s", 60], ["h", "min", 60], ["j", "h", 24]]
};
var NOMS = { m: "mètre", cm: "centimètre", mm: "millimètre", dm: "décimètre", km: "kilomètre", kg: "kilogramme", g: "gramme",
             t: "tonne", L: "litre", dL: "décilitre", cL: "centilitre", min: "minute", s: "seconde", h: "heure", j: "journée" };
function nomU(u, n) { var x = NOMS[u]; return n > 1 ? x + "s" : x; }

G.fractions = function (p) {
  var d = rnd(3, 10), op = p.operation === "mixte" || !p.operation ? pick(["addition", "soustraction"]) : p.operation, a, b;
  if (op === "addition") { a = rnd(1, d - 1); b = rnd(1, Math.max(1, d - a)); if (a + b > d) b = d - a; }
  else { a = rnd(2, d); b = rnd(1, a - 1); }
  var sg = op === "addition" ? " + " : " − ", res = op === "addition" ? a + b : a - b;
  return { consigne: { texte: "{frac:" + a + "/" + d + "}" + sg + "{frac:" + b + "/" + d + "} = ? Écris le numérateur du résultat.",
                       oral: fracMots(a, d) + (op === "addition" ? " plus " : " moins ") + fracMots(b, d) + ". Écris le numérateur du résultat." },
           expression: a + sg + b, reponse: String(res) };
};
var ORD = { 2: "demi", 3: "tiers", 4: "quart", 5: "cinquième", 6: "sixième", 7: "septième", 8: "huitième", 9: "neuvième", 10: "dixième" };
function fracMots(n, d) { return (n === 1 ? "un" : String(n)) + " " + ORD[d] + (n > 1 && d > 3 ? "s" : ""); }

G.heure = function (p) {
  var cas = p.cas || pick(["horloge", "grande_aiguille", "apres_midi", "moins"]);
  if (cas === "horloge") {
    var q = pick(["heures", "minutes"]), hh = rnd(1, 12), mm = 5 * rnd(0, q === "heures" ? 5 : 11); /* heures : petite aiguille loin de l'heure suivante */
    return { consigne: q === "minutes" ? "Regarde l'horloge. Combien de minutes indique la grande aiguille ?"
                                       : "Regarde l'horloge. Quelle heure indique la petite aiguille ? (le nombre d'heures)",
             svg: horloge(hh, mm), alt: "Une horloge à aiguilles.", expression: String(q === "minutes" ? mm : hh),
             reponse: String(q === "minutes" ? mm : hh) };
  }
  if (cas === "grande_aiguille") {
    var k = rnd(1, 11);
    return { consigne: "La grande aiguille est sur le " + k + ". Combien de minutes ?", expression: k + " × 5", reponse: String(5 * k) };
  }
  if (cas === "apres_midi") {
    var h2 = rnd(1, 11);
    return { consigne: "Il est " + h2 + " heure" + (h2 > 1 ? "s" : "") + " de l'après-midi. Écris l'heure entre 13 et 23.", expression: h2 + " + 12", reponse: String(h2 + 12) };
  }
  var m = pick([5, 10, 15, 20, 25]), h3 = rnd(2, 12), dit = m === 15 ? "le quart" : String(m);
  return { consigne: "Il est " + h3 + " heures moins " + dit + ". Il est donc " + (h3 - 1) + " h et combien de minutes ?",
           expression: "60 − " + m, reponse: String(60 - m) };
};

G.multiplication_posee = function (p) {
  var ca = p.chiffres || 2, cb = p.chiffres_multiplicateur || 1;
  var a = ca === 3 ? rnd(102, 989) : rnd(12, 98), b = cb === 2 ? rnd(12, 49) : rnd(2, 9);
  if (a % 10 === 0) a++;
  var e = a + " × " + b;
  return { consigne: "Pose et calcule sur ta feuille : " + e, expression: e, reponse: String(a * b) };
};

G.conversion = function (p) {
  var groupes = p.groupes || ["longueur"], g = pick(groupes), u = pick(UNITES[g]), n = rnd(2, 9);
  return { consigne: { texte: n + " " + (u[0] === "j" ? "journées" : u[0]) + " = ? " + u[1], oral: n + " " + nomU(u[0], n) + ", c'est combien " + (/^[aeiouh]/.test(nomU(u[1], 2)) ? "d'" : "de ") + nomU(u[1], 2) + " ?" },
           expression: n + " × " + u[2], reponse: String(n * u[2]) };
};

G.perimetre = function (p) {
  var f = p.figure === "carre" || (p.figure !== "rectangle" && Math.random() < 0.4) ? "carre" : "rectangle";
  if (f === "carre") {
    var c = rnd(2, 12);
    return { consigne: "Un carré a des côtés de " + c + " cm. Quel est son périmètre en cm ?", expression: c + " + " + c + " + " + c + " + " + c, reponse: String(4 * c) };
  }
  var L = rnd(4, 15), l = rnd(2, L - 1);
  return { consigne: "Un rectangle mesure " + L + " cm sur " + l + " cm. Quel est son périmètre en cm ?",
           expression: L + " + " + l + " + " + L + " + " + l, reponse: String(2 * (L + l)) };
};

G.double_moitie = function (p) {
  var niv = p.niveau || pick([1, 2, 3]), op = p.operation === "mixte" || !p.operation ? pick(["double", "moitie"]) : p.operation, n;
  if (op === "double") {
    n = niv === 1 ? rnd(1, 15) : niv === 2 ? 5 * rnd(4, 15) : 50 * rnd(2, 12);
    return { consigne: "Quel est le double de " + fmt(n) + " ?", expression: n + " × 2", reponse: String(2 * n) };
  }
  n = niv === 1 ? 2 * rnd(1, 20) : niv === 2 ? 10 * rnd(4, 15) : 100 * rnd(2, 12);
  return { consigne: "Quelle est la moitié de " + fmt(n) + " ?", expression: n + " ÷ 2", reponse: String(n / 2) };
};

G.decomposer_produit = function () {
  var t = pick([12, 16, 18, 20, 24, 30, 36, 40, 48, 50, 60, 100]), divs = [];
  for (var f = 2; f <= t / 2; f++) if (t % f === 0) divs.push(f);
  var f2 = pick(divs);
  return { consigne: "Complète : " + t + " = " + f2 + " × ?", expression: t + " ÷ " + f2, reponse: String(t / f2) };
};

/* specs : lesson.generateurs ; renvoie des exercices au format des calculs */
function creer(specs) {
  var out = [];
  (specs || []).forEach(function (s) {
    var vus = {};
    for (var i = 0, essais = 0; i < (s.nombre || 1) && essais < 50; essais++) {
      var ex = G[s.type](s.params || {}), cle = JSON.stringify(ex.consigne);
      if (vus[cle]) continue;
      vus[cle] = true; i++;
      ex.id = s.id + "-" + i; ex.ref = s.ref; ex.genere = s.type;
      out.push(ex);
    }
  });
  return out;
}

root.GENERATEURS = { creer: creer, types: Object.keys(G), enLettres: enLettres, G: G };
})(typeof window !== "undefined" ? window : globalThis);
