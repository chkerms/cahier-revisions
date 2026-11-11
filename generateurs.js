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
    var t = pick(p.tables || [2, 3, 4, 5]), b = rnd(2, 10);
    var op = p.operation === "mixte" || !p.operation ? pick(["multiplication", "division"]) : p.operation;
    var e = op === "division" ? (t * b) + " ÷ " + t : t + " × " + b;
    return { consigne: { texte: "Calcule : " + e, oral: "Calcule : " + divise(e) }, expression: e, reponse: String(op === "division" ? b : t * b) };
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
