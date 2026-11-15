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


/* ---- problèmes guidés (stratégies 1 à 5) : énoncé original, 3 schémas en barres, opération, unité, phrase réponse.
   Schémas : « tout » (le tout au-dessus, deux parties dessous), « cmp » (deux barres et l'écart),
   « egal » (le tout en parts égales), « fois » (petite quantité, grande quantité = k fois la petite). */
/* prénoms sans voyelle initiale : jamais d'élision à gérer (« de Hugo » s'écrit bien ainsi, h aspiré) */
var PRENOMS = [["Lou", "f"], ["Hugo", "m"], ["Jade", "f"], ["Noé", "m"], ["Chloé", "f"], ["Malik", "m"], ["Zoé", "f"],
               ["Sacha", "m"], ["Mia", "f"], ["Yanis", "m"], ["Rose", "f"], ["Tom", "m"], ["Nina", "f"], ["Théo", "m"]];
function deuxPrenoms() { var a = pick(PRENOMS), b; do { b = pick(PRENOMS); } while (b === a); return [a, b]; }
/* P : { 0: prénom 1, g: genre 1, 1: [prénom 2, genre 2] } ; il(P) parle du 1er, il(P[1]) du 2e */
function genre(x) { return x.g || x[1]; }
function il(x) { return genre(x) === "f" ? "elle" : "il"; }
function Il(x) { return genre(x) === "f" ? "Elle" : "Il"; }
function lui(x) { return genre(x) === "f" ? "elle" : "lui"; }
function fois(k) { return enLettres(k) + " fois"; }

/* valeur cachée derrière le « ? » d'un schéma (null si le schéma n'a pas de sens entier) */
function valeurSchema(s) {
  function q(x) { return x === "?"; }
  var v = null;
  if (s.f === "tout") v = q(s.top) ? s.parts[0] + s.parts[1] : s.top - (q(s.parts[0]) ? s.parts[1] : s.parts[0]);
  else if (s.f === "cmp") v = q(s.grand) ? s.petit + s.ecart : q(s.petit) ? s.grand - s.ecart : s.grand - s.petit;
  else if (s.f === "egal") v = q(s.top) ? s.n * s.part : q(s.part) ? s.top / s.n : s.top / s.part;
  else if (s.f === "fois") v = q(s.grand) ? s.petit * s.k : s.grand / s.k;
  return v;
}
function lab(x) { return x === "?" ? "?" : fmt(x); }
function rectT(x, y, w, hh, txt, inconnu) {
  return '<rect x="' + x.toFixed(1) + '" y="' + y + '" width="' + w.toFixed(1) + '" height="' + hh + '" rx="4" fill="' + (inconnu ? "#ffe08a" : "#ffffff") +
    '" stroke="#1f3c88" stroke-width="2.5"/>' + (txt === "" ? "" : '<text x="' + (x + w / 2).toFixed(1) + '" y="' + (y + hh / 2 + 7) +
    '" font-size="20" font-family="sans-serif" font-weight="bold" text-anchor="middle" fill="#2b2b2b">' + txt + '</text>');
}
function texteS(x, y, t, anchor) {
  return '<text x="' + x.toFixed(1) + '" y="' + y + '" font-size="17" font-family="sans-serif" text-anchor="' + (anchor || "middle") + '" fill="#1f3c88">' + t + '</text>';
}
function accolade(x1, x2, y) {
  var m = (x1 + x2) / 2;
  return '<path d="M' + x1.toFixed(1) + ' ' + y + ' q0 8 8 8 H' + (m - 6).toFixed(1) + ' q6 0 6 8 q0 -8 6 -8 H' + (x2 - 8).toFixed(1) + ' q8 0 8 -8" fill="none" stroke="#1f3c88" stroke-width="2"/>';
}
function fleche(x1, x2, y) {
  return '<line x1="' + (x1 + 4).toFixed(1) + '" y1="' + y + '" x2="' + (x2 - 4).toFixed(1) + '" y2="' + y + '" stroke="#c62828" stroke-width="2.5"/>' +
    '<path d="M' + x1.toFixed(1) + ' ' + y + ' l9 -6 v12 z M' + x2.toFixed(1) + ' ' + y + ' l-9 -6 v12 z" fill="#c62828"/>';
}
/* largeur d'une partie : proportionnelle, bornée pour que les nombres restent lisibles */
function prop(a, tot) { var r = a > 0 && tot > 0 ? a / tot : 0.5; return Math.min(0.75, Math.max(0.25, r)); }
function svgSchema(s) {
  var W = 300, X = 10, L = 280, o = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' 130">'], v = valeurSchema(s);
  function val(x) { return x === "?" ? v : x; }
  if (s.f === "tout") {
    var p0 = val(s.parts[0]), p1 = val(s.parts[1]), w0 = L * prop(p0, p0 + p1);
    o.push(rectT(X, 12, L, 44, lab(s.top), s.top === "?"));
    o.push(rectT(X, 64, w0, 44, lab(s.parts[0]), s.parts[0] === "?"));
    o.push(rectT(X + w0, 64, L - w0, 44, lab(s.parts[1]), s.parts[1] === "?"));
  } else if (s.f === "cmp") {
    var g = val(s.grand), pe = val(s.petit), wp = L * prop(pe, g);
    o.push(rectT(X, 10, L, 40, lab(s.grand), s.grand === "?"));
    o.push(rectT(X, 58, wp, 40, lab(s.petit), s.petit === "?"));
    o.push(fleche(X + wp, X + L, 78));
    o.push('<rect x="' + (X + wp + (L - wp) / 2 - 26).toFixed(1) + '" y="96" width="52" height="22" rx="4" fill="' + (s.ecart === "?" ? "#ffe08a" : "#ffffff") + '"/>');
    o.push('<text x="' + (X + wp + (L - wp) / 2).toFixed(1) + '" y="114" font-size="19" font-family="sans-serif" font-weight="bold" text-anchor="middle" fill="#c62828">' + lab(s.ecart) + '</text>');
  } else if (s.f === "egal") {
    var nb = s.n === "?" || s.n > 8 ? 5 : s.n, wb = L / nb;
    o.push(rectT(X, 8, L, 40, lab(s.top), s.top === "?"));
    for (var i = 0; i < nb; i++) {
      var ell = nb === 5 && (s.n === "?" || s.n > 8) && i === 3;
      o.push(rectT(X + i * wb, 52, wb, 40, ell ? "…" : lab(s.part), !ell && s.part === "?"));
    }
    o.push(accolade(X, X + L, 96));
    o.push(texteS(X + L / 2, 127, s.n === "?" ? "? parts" : s.n + " parts"));
  } else {
    var bw = (L - 50) / s.k;
    o.push(rectT(X, 8, bw, 40, lab(s.petit), s.petit === "?"));
    for (var j = 0; j < s.k; j++) o.push(rectT(X + j * bw, 58, bw, 40, "", false));
    o.push('<path d="M' + (X + s.k * bw + 6).toFixed(1) + ' 58 q8 0 8 8 v12 l6 2 l-6 2 v12 q0 8 -8 8" fill="none" stroke="#1f3c88" stroke-width="2"/>');
    o.push('<rect x="' + (X + s.k * bw + 22).toFixed(1) + '" y="64" width="' + (L - s.k * bw - 14).toFixed(1) + '" height="28" rx="4" fill="' + (s.grand === "?" ? "#ffe08a" : "#ffffff") + '"/>');
    o.push('<text x="' + (X + s.k * bw + 24).toFixed(1) + '" y="85" font-size="19" font-family="sans-serif" font-weight="bold" fill="#2b2b2b">' + lab(s.grand) + '</text>');
    o.push(texteS(X + bw + 8, 34, s.k + " fois", "start"));
  }
  o.push('</svg>');
  return o.join("");
}
function altSchema(s) {
  if (s.f === "tout") return "Schéma : le tout " + lab(s.top) + " ; les parties " + lab(s.parts[0]) + " et " + lab(s.parts[1]) + ".";
  if (s.f === "cmp") return "Schéma : grande barre " + lab(s.grand) + ", petite barre " + lab(s.petit) + ", écart " + lab(s.ecart) + ".";
  if (s.f === "egal") return "Schéma : le tout " + lab(s.top) + " ; " + (s.n === "?" ? "?" : s.n) + " parts de " + lab(s.part) + ".";
  return "Schéma : petite quantité " + lab(s.petit) + " ; grande quantité " + lab(s.grand) + ", " + s.k + " fois la petite.";
}

/* nombres : a + b = t, avec t ≤ lim et des parties assez différentes pour se voir sur le schéma */
function deuxParties(lim, mini) {
  mini = Math.min(mini || 8, Math.floor(lim / 4));
  for (;;) {
    var t = rnd(Math.min(lim, Math.max(3 * mini + 6, Math.floor(lim / 4))), lim);
    for (var k = 0; k < 20; k++) { var a = rnd(mini, t - mini); if (Math.abs(2 * a - t) >= t / 8) return [a, t - a, t]; }
  }
}
function facteur(p) { return pick(p.tables || [2, 3, 4, 5, 6, 7, 8, 9]); }
/* « deux fois plus » à « cinq fois plus » : dans les tables demandées si possible */
function petitFacteur(p) { var t = (p.tables || []).filter(function (x) { return x <= 5; }); return pick(t.length ? t : [2, 3, 4, 5]); }

/* chaque cas : nombres(p) → objet n ; textes : [énoncé, unité, phrase(r)] selon le contexte */
var CAS = {
  s1_parties: { s: 1, op: "+", aide: "Je cherche le tout : le ? est sur la grande barre, au-dessus des deux parties.",
    aideOp: "Je cherche le tout avec des parties différentes : je fais une addition.",
    nombres: function (p, lim, o) { var x = deuxParties(lim, o.min); return { a: x[0], b: x[1], r: x[2] }; },
    expr: function (n) { return n.a + " + " + n.b; },
    schemas: function (n) { var M = Math.max(n.a, n.b), m = Math.min(n.a, n.b);
      return [{ f: "tout", top: "?", parts: [n.a, n.b] }, { f: "tout", top: M, parts: [m, "?"] }, { f: "cmp", grand: M, petit: m, ecart: "?" }]; },
    ctx: [
      [function (n, P) { return [P[0] + " a " + n.a + " images dans son album et " + n.b + " images dans sa boîte. Combien d'images a-t-" + il(P) + " en tout ?", "images", P[0] + " a " + n.r + " images en tout."]; }, { max: 500 }],
      [function (n, P) { return ["Dans un jeu vidéo, " + P[0] + " gagne " + n.a + " points au premier niveau et " + n.b + " points au deuxième niveau. Combien de points a-t-" + il(P) + " au total ?", "points", P[0] + " a " + n.r + " points au total."]; }, { max: 9999 }],
      [function (n) { return ["En janvier, la bibliothèque prête " + n.a + " livres. En février, elle en prête " + n.b + ". Combien de livres prête-t-elle en deux mois ?", "livres", "La bibliothèque prête " + n.r + " livres en deux mois."]; }, { max: 9999 }],
      [function (n) { return ["Un vélo coûte " + n.a + " € et un casque coûte " + n.b + " €. Combien faut-il payer pour les deux ?", "€", "Il faut payer " + n.r + " €."]; }, { max: 999 }]
    ] },
  s1_egales: { s: 1, op: "×", aide: "Je cherche le tout : il est fait de parts toutes pareilles.",
    aideOp: "Je cherche le tout avec des parts identiques : je fais une multiplication.",
    nombres: function (p, lim, o) { var n = facteur(p), b = o.f(); return { n: n, b: b, r: n * b }; },
    expr: function (n) { return n.n + " × " + n.b; },
    schemas: function (n) { return [{ f: "egal", top: "?", n: n.n, part: n.b }, { f: "tout", top: "?", parts: [n.n, n.b] },
      { f: "tout", top: Math.max(n.n, n.b), parts: [Math.min(n.n, n.b), "?"] }]; },
    ctx: [
      [function (n, P) { return [P[0] + " achète " + n.n + " paquets de " + n.b + " cartes. Combien de cartes a-t-" + il(P) + " en tout ?", "cartes", P[0] + " a " + n.r + " cartes en tout."]; }, { f: function () { return Math.random() < 0.7 ? rnd(3, 12) : 10 * rnd(2, 5); } }],
      [function (n) { return ["Dans la classe, il y a " + n.n + " tables. Sur chaque table, il y a " + n.b + " crayons. Combien de crayons y a-t-il en tout ?", "crayons", "Il y a " + n.r + " crayons en tout."]; }, { f: function () { return rnd(2, 8); } }],
      [function (n, P) { return [P[0] + " fait " + n.n + " tours de piste. Un tour mesure " + n.b + " m. Combien de mètres court-" + il(P) + " ?", "m", P[0] + " court " + n.r + " m."]; }, { f: function () { return Math.random() < 0.5 ? 10 * rnd(5, 9) : 100 * rnd(1, 4); } }],
      [function (n) { return ["Le cuisinier prend " + n.n + " boîtes. Chaque boîte contient " + n.b + " œufs. Combien d'œufs a-t-il ?", "œufs", "Le cuisinier a " + n.r + " œufs."]; }, { f: function () { return pick([6, 10, 12]); } }]
    ] },
  s2_complement: { s: 2, op: "−", aide: "Je connais le tout et une partie : le ? est sur l'autre partie.",
    aideOp: "Je cherche une partie du tout : je fais une soustraction.",
    nombres: function (p, lim, o) { var x = deuxParties(lim, o.min); return { t: x[2], a: x[0], r: x[1] }; },
    expr: function (n) { return n.t + " − " + n.a; },
    schemas: function (n) { return [{ f: "tout", top: n.t, parts: [n.a, "?"] }, { f: "tout", top: "?", parts: [n.t, n.a] }, { f: "cmp", grand: "?", petit: n.t, ecart: n.a }]; },
    ctx: [
      [function (n) { return ["Dans le bac, il y a " + n.t + " ballons. " + n.a + " ballons sont rouges, les autres sont jaunes. Combien de ballons sont jaunes ?", "ballons", n.r + " ballons sont jaunes."]; }, { max: 100 }],
      [function (n, P) { return ["Un livre a " + n.t + " pages. " + P[0] + " a déjà lu " + n.a + " pages. Combien de pages lui reste-t-il à lire ?", "pages", "Il lui reste " + n.r + " pages à lire."]; }, { max: 400 }],
      [function (n, P) { return [P[0] + " veut un jeu à " + n.t + " €. " + Il(P) + " a déjà " + n.a + " €. Combien d'euros lui manque-t-il ?", "€", "Il lui manque " + n.r + " €."]; }, { max: 300 }],
      [function (n) { return ["Le stade a " + n.t + " places. " + n.a + " supporters sont déjà assis. Combien de places sont encore libres ?", "places", n.r + " places sont encore libres."]; }, { max: 9999, min: 100 }]
    ] },
  s2_perte: { s: 2, op: "−", aide: "Au début, j'avais le tout. Une partie est partie : le ? est sur ce qui reste.",
    aideOp: "Je cherche ce qui reste : je fais une soustraction.",
    nombres: function (p, lim, o) { var x = deuxParties(lim, o.min); return { t: x[2], a: x[0], r: x[1] }; },
    expr: function (n) { return n.t + " − " + n.a; },
    schemas: function (n) { return [{ f: "tout", top: n.t, parts: [n.a, "?"] }, { f: "tout", top: "?", parts: [n.t, n.a] }, { f: "cmp", grand: "?", petit: n.t, ecart: n.a }]; },
    ctx: [
      [function (n, P) { return [P[0] + " a " + n.t + " € dans sa tirelire. " + Il(P) + " dépense " + n.a + " € pour un livre. Combien d'euros lui reste-t-il ?", "€", "Il lui reste " + n.r + " €."]; }, { max: 300 }],
      [function (n) { return ["Le fermier ramasse " + n.t + " œufs. En chemin, " + n.a + " œufs se cassent. Combien d'œufs reste-t-il ?", "œufs", "Il reste " + n.r + " œufs."]; }, { max: 200 }],
      [function (n, P) { return ["Une ficelle mesure " + n.t + " cm. " + P[0] + " en coupe " + n.a + " cm. Combien de centimètres de ficelle reste-t-il ?", "cm", "Il reste " + n.r + " cm de ficelle."]; }, { max: 999 }],
      [function (n) { return ["Le boulanger a fait " + n.t + " croissants. Il en vend " + n.a + " le matin. Combien de croissants lui reste-t-il ?", "croissants", "Il lui reste " + n.r + " croissants."]; }, { max: 300 }]
    ] },
  s2_avant_ajout: { s: 2, op: "−", aide: "Le tout, c'est maintenant. On a ajouté une partie : le ? est sur ce qu'il y avait avant.",
    aideOp: "Je cherche ce qu'il y avait avant l'ajout : je fais une soustraction.",
    nombres: function (p, lim, o) { var x = deuxParties(lim, o.min); return { t: x[2], a: x[1], r: x[0] }; },
    expr: function (n) { return n.t + " − " + n.a; },
    schemas: function (n) { return [{ f: "tout", top: n.t, parts: ["?", n.a] }, { f: "tout", top: "?", parts: [n.t, n.a] }, { f: "cmp", grand: "?", petit: n.t, ecart: n.a }]; },
    ctx: [
      [function (n, P) { return [P[0] + " reçoit " + n.a + " billes de son cousin. Maintenant, " + il(P) + " a " + n.t + " billes. Combien de billes avait-" + il(P) + " avant ?", "billes", P[0] + " avait " + n.r + " billes avant."]; }, { max: 300 }],
      [function (n) { return ["Le jardinier plante " + n.a + " fleurs. Le jardin compte maintenant " + n.t + " fleurs. Combien de fleurs y avait-il avant ?", "fleurs", "Il y avait " + n.r + " fleurs avant."]; }, { max: 500 }],
      [function (n, P) { return ["Ce soir, " + P[0] + " pose " + n.a + " pièces de son puzzle. Maintenant, " + n.t + " pièces sont posées. Combien de pièces étaient posées avant ?", "pièces", n.r + " pièces étaient posées avant."]; }, { max: 1000 }],
      [function (n) { return ["On verse " + n.a + " L d'eau dans la piscine gonflable. Elle contient maintenant " + n.t + " L. Combien de litres y avait-il avant ?", "L", "Il y avait " + n.r + " L d'eau avant."]; }, { max: 900 }]
    ] },
  s3_part: { s: 3, op: "÷", aide: "Je partage le tout en parts égales : le ? est sur chaque part.",
    aideOp: "Je fais un partage et je cherche la valeur d'une part : je fais une division.",
    nombres: function (p) { var k = facteur(p), q = rnd(2, 10); return { t: k * q, k: k, r: q }; },
    expr: function (n) { return n.t + " ÷ " + n.k; },
    schemas: function (n) { return [{ f: "egal", top: n.t, n: n.k, part: "?" }, { f: "egal", top: "?", n: n.k, part: n.t }, { f: "tout", top: n.t, parts: [n.k, "?"] }]; },
    ctx: [
      [function (n, P) { return [P[0] + " range " + n.t + " livres sur " + n.k + " étagères. Il y a autant de livres sur chaque étagère. Combien de livres y a-t-il sur chaque étagère ?", "livres", "Il y a " + n.r + " livres sur chaque étagère."]; }, {}],
      [function (n) { return ["La maîtresse partage " + n.t + " feutres entre " + n.k + " groupes. Chaque groupe reçoit autant de feutres. Combien de feutres reçoit chaque groupe ?", "feutres", "Chaque groupe reçoit " + n.r + " feutres."]; }, {}],
      [function (n) { return [n.k + " enfants gagnent " + n.t + " € ensemble. Ils partagent la somme en parts égales. Combien d'euros reçoit chaque enfant ?", "€", "Chaque enfant reçoit " + n.r + " €."]; }, {}],
      [function (n) { return ["Une corde de " + n.t + " m est coupée en " + n.k + " morceaux de même longueur. Combien mesure chaque morceau ?", "m", "Chaque morceau mesure " + n.r + " m."]; }, {}]
    ] },
  s3_nombre: { s: 3, op: "÷", aide: "Je fais des parts toutes pareilles : le ? est sur le nombre de parts.",
    aideOp: "Je fais un partage et je cherche le nombre de parts : je fais une division.",
    nombres: function (p, lim, o) { var b = o.t ? pick(o.t) : facteur(p), q = rnd(2, 10); return { t: b * q, b: b, r: q }; },
    expr: function (n) { return n.t + " ÷ " + n.b; },
    schemas: function (n) { return [{ f: "egal", top: n.t, n: "?", part: n.b }, { f: "egal", top: "?", n: n.b, part: n.t }, { f: "tout", top: n.t, parts: [n.b, "?"] }]; },
    ctx: [
      [function (n, P) { return [P[0] + " a " + n.t + " photos. " + Il(P) + " en colle " + n.b + " sur chaque page. Combien de pages remplit-" + il(P) + " ?", "pages", P[0] + " remplit " + n.r + " pages."]; }, {}],
      [function (n) { return ["Le jardinier a " + n.t + " graines. Il met " + n.b + " graines dans chaque pot. Combien de pots remplit-il ?", "pots", "Le jardinier remplit " + n.r + " pots."]; }, {}],
      [function (n) { return ["Avec " + n.t + " enfants, on forme des équipes de " + n.b + " joueurs. Combien d'équipes peut-on former ?", "équipes", "On peut former " + n.r + " équipes."]; }, {}],
      [function (n, P) { return [P[0] + " range " + n.t + " œufs dans des boîtes de " + n.b + " œufs. Combien de boîtes remplit-" + il(P) + " ?", "boîtes", P[0] + " remplit " + n.r + " boîtes."]; }, { t: [6, 10, 12] }]
    ] },
  s4_grande: { s: 4, op: "+", aide: "Je cherche la plus grande quantité : le ? est sur la grande barre.",
    aideOp: "Je cherche la plus grande quantité : j'ajoute l'écart, je fais une addition.",
    nombres: function (p, lim, o) { var x = deuxParties(lim, o.min); return { a: Math.max(x[0], x[1]), e: Math.min(x[0], x[1]), r: x[2] }; },
    expr: function (n) { return n.a + " + " + n.e; },
    schemas: function (n) { var M = Math.max(n.a, n.e), m = Math.min(n.a, n.e);
      return [{ f: "cmp", grand: "?", petit: n.a, ecart: n.e }, { f: "cmp", grand: M, petit: "?", ecart: m }, { f: "tout", top: M, parts: [m, "?"] }]; },
    ctx: [
      [function (n, P) { return ["La tour de " + P[0] + " mesure " + n.a + " cm. La tour de " + P[1][0] + " mesure " + n.e + " cm de plus. Combien mesure la tour de " + P[1][0] + " ?", "cm", "La tour de " + P[1][0] + " mesure " + n.r + " cm."]; }, { max: 300 }],
      [function (n, P) { return ["Aux fléchettes, " + P[0] + " marque " + n.a + " points. " + P[1][0] + " marque " + n.e + " points de plus que " + lui(P) + ". Combien de points marque " + P[1][0] + " ?", "points", P[1][0] + " marque " + n.r + " points."]; }, { max: 500 }],
      [function (n) { return ["Un sac de pommes pèse " + n.a + " kg. Un sac de patates pèse " + n.e + " kg de plus. Combien pèse le sac de patates ?", "kg", "Le sac de patates pèse " + n.r + " kg."]; }, { max: 60 }],
      [function (n, P) { return ["Le livre de " + P[0] + " a " + n.a + " pages. Le livre de " + P[1][0] + " a " + n.e + " pages de plus. Combien de pages a le livre de " + P[1][0] + " ?", "pages", "Le livre de " + P[1][0] + " a " + n.r + " pages."]; }, { max: 400 }]
    ] },
  s4_petite: { s: 4, op: "−", piege: true, aide: "Je cherche la plus petite quantité : le ? est sur la petite barre.",
    aideOp: "Je cherche la plus petite quantité : j'enlève l'écart, je fais une soustraction.",
    nombres: function (p, lim, o) { var x = deuxParties(lim, o.min); return { g: x[2], e: Math.min(x[0], x[1]), r: Math.max(x[0], x[1]) }; },
    expr: function (n) { return n.g + " − " + n.e; },
    schemas: function (n) { return [{ f: "cmp", grand: n.g, petit: "?", ecart: n.e }, { f: "cmp", grand: "?", petit: n.g, ecart: n.e }, { f: "tout", top: "?", parts: [n.g, n.e] }]; },
    ctx: [
      [function (n, P) { return [P[1][0] + " a " + n.g + " billes. " + Il(P[1]) + " a " + n.e + " billes de plus que " + P[0] + ". Combien de billes a " + P[0] + " ?", "billes", P[0] + " a " + n.r + " billes."]; }, { max: 300 }],
      [function (n) { return ["Le pont rouge mesure " + n.g + " m. Il mesure " + n.e + " m de plus que le pont vert. Combien mesure le pont vert ?", "m", "Le pont vert mesure " + n.r + " m."]; }, { max: 999 }],
      [function (n) { return ["Une trottinette coûte " + n.g + " €. Elle coûte " + n.e + " € de plus qu'un ballon. Combien coûte le ballon ?", "€", "Le ballon coûte " + n.r + " €."]; }, { max: 300 }],
      [function (n) { return ["Le carton bleu pèse " + n.g + " kg. Il pèse " + n.e + " kg de plus que le carton vert. Combien pèse le carton vert ?", "kg", "Le carton vert pèse " + n.r + " kg."]; }, { max: 60 }]
    ] },
  s4_ecart: { s: 4, op: "−", aide: "Je cherche l'écart entre les deux barres : le ? est sur la flèche.",
    aideOp: "Je cherche l'écart : je fais une soustraction.",
    nombres: function (p, lim, o) { var x = deuxParties(lim, o.min); return { g: x[2], p: x[0], r: x[1] }; },
    expr: function (n) { return n.g + " − " + n.p; },
    schemas: function (n) { return [{ f: "cmp", grand: n.g, petit: n.p, ecart: "?" }, { f: "tout", top: "?", parts: [n.g, n.p] }, { f: "cmp", grand: "?", petit: n.g, ecart: n.p }]; },
    ctx: [
      [function (n, P) { return [P[0] + " a lu " + n.g + " pages. " + P[1][0] + " a lu " + n.p + " pages. Combien de pages " + P[0] + " a-t-" + il(P) + " lues de plus que " + P[1][0] + " ?", "pages", P[0] + " a lu " + n.r + " pages de plus que " + P[1][0] + "."]; }, { max: 400, min: 20 }],
      [function (n) { return ["Le grand sapin mesure " + n.g + " cm. Le petit sapin mesure " + n.p + " cm. Combien de centimètres le grand sapin a-t-il de plus ?", "cm", "Le grand sapin mesure " + n.r + " cm de plus."]; }, { max: 999, min: 60 }],
      [function (n) { return ["Un jeu coûte " + n.g + " €. Un ballon coûte " + n.p + " €. Combien d'euros le jeu coûte-t-il de plus que le ballon ?", "€", "Le jeu coûte " + n.r + " € de plus que le ballon."]; }, { max: 300 }],
      [function (n, P) { return ["L'école de " + P[0] + " a " + n.g + " élèves. L'école de " + P[1][0] + " a " + n.p + " élèves. Combien d'élèves l'école de " + P[0] + " a-t-elle de plus ?", "élèves", "L'école de " + P[0] + " a " + n.r + " élèves de plus."]; }, { max: 900, min: 120 }]
    ] },
  s5_fois_plus: { s: 5, op: "×", piege: true, aide: "Je cherche la grande quantité : elle fait plusieurs fois la petite.",
    aideOp: "« Fois plus » : je cherche la plus grande quantité, je fais une multiplication.",
    nombres: function (p, lim, o) { var k = petitFacteur(p), a = o.f(); return { a: a, k: k, r: a * k }; },
    expr: function (n) { return n.a + " × " + n.k; },
    schemas: function (n) { return [{ f: "fois", petit: n.a, k: n.k, grand: "?" }, { f: "cmp", grand: "?", petit: n.a, ecart: n.k }, { f: "fois", petit: "?", k: n.k, grand: n.a }]; },
    ctx: [
      [function (n, P) { return [P[0] + " a " + n.a + " autocollants. " + P[1][0] + " en a " + fois(n.k) + " plus. Combien d'autocollants a " + P[1][0] + " ?", "autocollants", P[1][0] + " a " + n.r + " autocollants."]; }, { f: function () { return Math.random() < 0.7 ? rnd(3, 12) : 10 * rnd(2, 5); } }],
      [function (n) { return ["La petite tour mesure " + n.a + " cm. La grande tour est " + fois(n.k) + " plus haute. Combien mesure la grande tour ?", "cm", "La grande tour mesure " + n.r + " cm."]; }, { f: function () { return rnd(5, 30); } }],
      [function (n) { return ["Un crayon coûte " + n.a + " €. Une trousse coûte " + fois(n.k) + " plus cher. Combien coûte la trousse ?", "€", "La trousse coûte " + n.r + " €."]; }, { f: function () { return rnd(2, 5); } }],
      [function (n, P) { return [P[0] + " court " + n.a + " m. " + P[1][0] + " court " + fois(n.k) + " plus loin. Combien de mètres court " + P[1][0] + " ?", "m", P[1][0] + " court " + n.r + " m."]; }, { f: function () { return 10 * rnd(2, 9); } }]
    ] },
  s5_fois_moins: { s: 5, op: "÷", piege: true, aide: "Je cherche la petite quantité : la grande en fait plusieurs fois plus.",
    aideOp: "« Fois moins » : je cherche la plus petite quantité, je fais une division.",
    nombres: function (p, lim, o) { var k = petitFacteur(p), q = o.f(); return { g: q * k, k: k, r: q }; },
    expr: function (n) { return n.g + " ÷ " + n.k; },
    schemas: function (n) { return [{ f: "fois", petit: "?", k: n.k, grand: n.g }, { f: "fois", petit: n.g, k: n.k, grand: "?" }, { f: "cmp", grand: n.g, petit: "?", ecart: n.k }]; },
    ctx: [
      [function (n, P) { return [P[1][0] + " a " + n.g + " autocollants. " + P[0] + " en a " + fois(n.k) + " moins. Combien d'autocollants a " + P[0] + " ?", "autocollants", P[0] + " a " + n.r + " autocollants."]; }, { f: function () { return rnd(3, 12); } }],
      [function (n) { return ["La grande corde mesure " + n.g + " m. La petite corde est " + fois(n.k) + " plus courte. Combien mesure la petite corde ?", "m", "La petite corde mesure " + n.r + " m."]; }, { f: function () { return rnd(2, 12); } }],
      [function (n) { return ["Une trottinette coûte " + n.g + " €. Un casque coûte " + fois(n.k) + " moins cher. Combien coûte le casque ?", "€", "Le casque coûte " + n.r + " €."]; }, { f: function () { return rnd(5, 30); } }],
      [function (n) { return ["Le chien pèse " + n.g + " kg. Le chat pèse " + fois(n.k) + " moins. Combien pèse le chat ?", "kg", "Le chat pèse " + n.r + " kg."]; }, { f: function () { return rnd(2, 6); } }]
    ] }
};

/* texte lu par la synthèse vocale : unités en toutes lettres */
function oralUnites(t) {
  return t.replace(/(\d) €/g, "$1 euros").replace(/(\d) kg\b/g, "$1 kilos").replace(/(\d) cm\b/g, "$1 centimètres")
          .replace(/(\d) m\b/g, "$1 mètres").replace(/(\d) L\b/g, "$1 litres").replace(/(\d) (\d{3})\b/g, "$1$2");
}
/* espaces insécables : « ? » et l'unité ne partent jamais seuls à la ligne */
function insecables(t) { return t.replace(/ \?/g, "\u00a0?").replace(/(\d) (€|kg|cm|m|L)(?![a-zà-ü])/g, "$1\u00a0$2"); }
G.probleme = function (p) {
  var ids = p.problemes && p.problemes.length ? p.problemes : Object.keys(CAS).filter(function (k) {
    return !p.strategies || p.strategies.indexOf(CAS[k].s) >= 0; });
  var id = pick(ids), C = CAS[id], cx = pick(C.ctx), d = deuxPrenoms(), P = { 0: d[0][0], g: d[0][1], 1: d[1] };
  var lim = Math.min(p.limite || 999, cx[1].max || 9999), n;
  /* nombres dans la limite, et aucun mauvais schéma qui donnerait par hasard la bonne réponse (2 + 2 = 2 × 2) */
  for (var essai = 0; essai < 200; essai++) {
    n = C.nombres(p, lim, cx[1]);
    var grand = Math.max(n.r, n.t || 0, n.g || 0, n.a || 0, n.b || 0, n.e || 0, n.p || 0);
    var ambigu = C.schemas(n).slice(1).some(function (s) { return valeurSchema(s) === n.r; });
    if (grand <= lim && !ambigu) break;
  }
  var nd = {};
  for (var k in n) nd[k] = n[k] >= 1000 ? fmt(n[k]) : n[k]; /* 4 386 à l'écran */
  var tx = cx[0](nd, P), e = C.expr(nd);
  var sch = C.schemas(n).map(function (s, i) { return { spec: s, bon: i === 0 }; });
  for (var i = sch.length - 1; i > 0; i--) { var j = rnd(0, i), x = sch[i]; sch[i] = sch[j]; sch[j] = x; }
  return { consigne: { texte: insecables(tx[0]), oral: oralUnites(tx[0]) }, expression: e, reponse: String(n.r),
           probleme: { cas: id, strategie: C.s, op: C.op, calcul: e, unite: tx[1], phrase: insecables(tx[2]), phrase_oral: oralUnites(tx[2]),
                       aide: C.aide, aideOp: C.aideOp, piege: !!C.piege,
                       schemas: sch.map(function (x) { return { svg: svgSchema(x.spec), alt: altSchema(x.spec), spec: x.spec, bon: x.bon }; }) } };
};
G.probleme.cas = Object.keys(CAS);

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
