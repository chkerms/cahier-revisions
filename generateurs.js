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
/* Personnalisation (lecons/perso.json, chiffré ; posée par l'appli dans G.perso) : prénom de l'enfant, copains, maîtresse,
   doudou, parents. Sans elle, les énoncés gardent des prénoms et des personnages génériques. */
function persoListe() {
  var P = G.perso || {}, l = (P.amis || []).filter(function (x) { return x && x[0]; });
  if (P.enfant && P.enfant[0]) l = l.concat([P.enfant, P.enfant]); /* l'enfant revient plus souvent que chaque copain */
  return l;
}
function deuxPrenoms() {
  var pool = persoListe();
  if (pool.length < 2 || Math.random() < 0.15) pool = PRENOMS;
  var a = pick(pool), b, k = 0;
  do { b = pick(pool); } while (b[0] === a[0] && ++k < 50);
  if (b[0] === a[0]) b = pick(PRENOMS.filter(function (x) { return x[0] !== a[0]; }));
  return [a, b];
}
function cap(t) { return t.charAt(0).toUpperCase() + t.slice(1); }
/* la maîtresse, le doudou, un parent : [nom, genre] */
function maitresse() { var m = (G.perso || {}).maitresse; return m ? [m, "f"] : ["la maîtresse", "f"]; }
function doudou() { var d = (G.perso || {}).doudou; return d && d[0] ? d : ["Pilou le phoque", "m"]; }
function unParent() {
  var P = G.perso || {}, l = (P.parents && P.parents.length ? P.parents : [["Papa", "m"], ["Maman", "f"]]);
  if (P.famille && P.famille.length && Math.random() < 0.4) l = P.famille; /* grands-parents… */
  return pick(l);
}
function ils(a, b) { return genre(a) === "f" && genre(b) === "f" ? "elles" : "ils"; }
function chacun(a, b) { return genre(a) === "f" && genre(b) === "f" ? "chacune" : "chacun"; }
/* élision devant un prénom à voyelle (« d'Inès », « qu'Anna ») : les prénoms personnels ne sont pas choisis pour l'éviter */
function elisions(t) { return t.replace(/\b(que|Que) (elle|il|elles|ils|on|un|une)\b/g, "$1'$2").replace(/\b(que|Que)'/g, function (m, w) { return w === "Que" ? "Qu'" : "qu'"; }).replace(/\b(de|que|De|Que) ([AEIOUYÉÈÊÂÎÔ])/g, function (m, w, v) { return (w.toLowerCase() === "de" ? (w === "De" ? "D'" : "d'") : (w === "Que" ? "Qu'" : "qu'")) + v; }); }
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
  if (s.f === "tout") {
    var conn = s.parts.filter(function (x) { return !q(x); }).reduce(function (a, b) { return a + b; }, 0);
    v = q(s.top) ? conn : s.top - conn;
  }
  else if (s.f === "cmp") v = q(s.grand) ? s.petit + s.ecart : q(s.petit) ? s.grand - s.ecart : s.grand - s.petit;
  else if (s.f === "egal") v = q(s.top) ? s.n * s.part : q(s.part) ? s.top / s.n : s.top / s.part;
  else if (s.f === "fois") v = q(s.grand) ? s.petit * s.k : s.grand / s.k;
  return v;
}
/* prix avec centimes : les montants sont en centimes (multiples de 5), affichés « 19,95 » ou « 8 » */
function euros(c) { var e = Math.floor(c / 100), r = c % 100; return fmt(e) + (r ? "," + (r < 10 ? "0" : "") + r : ""); }
var LAB = null; /* étiquettes des schémas pendant un problème en centimes : valeur → « 19,95 » */
function lab(x) { return x === "?" ? "?" : LAB && LAB[x] !== undefined ? LAB[x] : fmt(x); }
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
  if (s.f === "tout" && s.parts.length === 2) {
    var p0 = val(s.parts[0]), p1 = val(s.parts[1]), w0 = L * prop(p0, p0 + p1);
    o.push(rectT(X, 12, L, 44, lab(s.top), s.top === "?"));
    o.push(rectT(X, 64, w0, 44, lab(s.parts[0]), s.parts[0] === "?"));
    o.push(rectT(X + w0, 64, L - w0, 44, lab(s.parts[1]), s.parts[1] === "?"));
  } else if (s.f === "tout") {
    /* 3 parties : largeurs proportionnelles, au moins 22 % chacune pour que les nombres restent lisibles */
    var vs = s.parts.map(function (x) { var y = val(x); return y > 0 ? y : 1; }), tot = vs.reduce(function (a, b) { return a + b; }, 0);
    var ws = vs.map(function (y) { return Math.max(0.22, y / tot); }), sw = ws.reduce(function (a, b) { return a + b; }, 0), xx = X;
    o.push(rectT(X, 12, L, 44, lab(s.top), s.top === "?"));
    s.parts.forEach(function (x, i) { var w = L * ws[i] / sw; o.push(rectT(xx, 64, w, 44, lab(x), x === "?")); xx += w; });
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
  if (s.f === "tout") return "Schéma : le tout " + lab(s.top) + " ; les parties " + s.parts.slice(0, -1).map(lab).join(", ") + " et " + lab(s.parts[s.parts.length - 1]) + ".";
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
/* a + b + c = t, chaque partie ≥ mini et assez différente des autres pour se voir */
function troisParties(lim, mini) {
  mini = Math.min(mini || 8, Math.floor(lim / 6));
  for (;;) {
    var t = rnd(Math.min(lim, Math.max(4 * mini + 6, Math.floor(lim / 3))), lim);
    var a = rnd(mini, t - 2 * mini), b = rnd(mini, t - a - mini), c = t - a - b;
    if (c >= mini && a !== b && b !== c && a !== c) return [a, b, c, t];
  }
}
function facteur(p) { return pick(p.tables || [2, 3, 4, 5, 6, 7, 8, 9]); }
/* « deux fois plus » à « cinq fois plus » : dans les tables demandées si possible */
function petitFacteur(p) { var t = (p.tables || []).filter(function (x) { return x <= 5; }); return pick(t.length ? t : [2, 3, 4, 5]); }

/* chaque cas : nombres(p) → objet n ; textes : [énoncé, unité, phrase(r)] selon le contexte */
var CAS = {
  s1_parties: { s: 1, op: "+", argent: ["a", "b", "r"], aide: "Je cherche le tout : le ? est sur la grande barre, au-dessus des deux parties.",
    aideOp: "Je cherche le tout avec des parties différentes : je fais une addition.",
    nombres: function (p, lim, o) { var x = deuxParties(lim, o.min); return { a: x[0], b: x[1], r: x[2] }; },
    expr: function (n) { return n.a + " + " + n.b; },
    schemas: function (n) { var M = Math.max(n.a, n.b), m = Math.min(n.a, n.b);
      return [{ f: "tout", top: "?", parts: [n.a, n.b] }, { f: "tout", top: M, parts: [m, "?"] }, { f: "cmp", grand: M, petit: m, ecart: "?" }]; },
    ctx: [
      [function (n, P) { return [P[0] + " a " + n.a + " images dans son album et " + n.b + " images dans sa boîte. Combien d'images a-t-" + il(P) + " en tout ?", "images", P[0] + " a " + n.r + " images en tout."]; }, { max: 500 }],
      [function (n, P) { return ["Dans un jeu vidéo, " + P[0] + " gagne " + n.a + " points au premier niveau et " + n.b + " points au deuxième niveau. Combien de points a-t-" + il(P) + " au total ?", "points", P[0] + " a " + n.r + " points au total."]; }, { max: 9999 }],
      [function (n) { return ["En janvier, la bibliothèque prête " + n.a + " livres. En février, elle en prête " + n.b + ". Combien de livres prête-t-elle en deux mois ?", "livres", "La bibliothèque prête " + n.r + " livres en deux mois."]; }, { max: 9999 }],
      [function (n) { var Pa = unParent(); return ["Au marché, " + Pa[0] + " achète des pommes pour " + n.a + " € et du fromage pour " + n.b + " €. Combien paie-t-" + il(Pa) + " ?", "€", cap(Pa[0]) + " paie " + n.r + " €."]; }, { centimes: true, max: 60 }],
      [function (n) { return ["Le camion pèse " + n.a + " kg. Sa remorque pèse " + n.b + " kg. Combien pèsent-ils ensemble ?", "kg", "Ils pèsent " + n.r + " kg ensemble."]; }, { max: 9999, min: 400 }],
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
      [function (n) { var Pa = unParent(); return [cap(Pa[0]) + " achète " + n.n + " billets de train. Un billet coûte " + n.b + " €. Combien paie-t-" + il(Pa) + " ?", "€", cap(Pa[0]) + " paie " + n.r + " €."]; }, { f: function () { return rnd(13, 99); } }],
      [function (n) { return ["Le cuisinier prend " + n.n + " boîtes. Chaque boîte contient " + n.b + " œufs. Combien d'œufs a-t-il ?", "œufs", "Le cuisinier a " + n.r + " œufs."]; }, { f: function () { return pick([6, 10, 12]); } }]
    ] },
  s1_trois: { s: 1, op: "+", aide: "Je cherche le tout : le ? est sur la grande barre, au-dessus des trois parties.",
    aideOp: "Je cherche le tout avec des parties différentes : j'additionne les trois parties.",
    nombres: function (p, lim, o) { var x = troisParties(lim, o.min); return { a: x[0], b: x[1], c: x[2], r: x[3] }; },
    expr: function (n) { return n.a + " + " + n.b + " + " + n.c; },
    schemas: function (n) { var M = Math.max(n.a, n.b, n.c), m = Math.min(n.a, n.b, n.c);
      return [{ f: "tout", top: "?", parts: [n.a, n.b, n.c] }, { f: "tout", top: "?", parts: [n.a, n.b] }, { f: "cmp", grand: M, petit: m, ecart: "?" }]; },
    ctx: [
      [function (n, P) { return ["Pour son collier, " + P[0] + " a " + n.a + " perles bleues, " + n.b + " perles roses et " + n.c + " perles dorées. Combien de perles a-t-" + il(P) + " en tout ?", "perles", P[0] + " a " + n.r + " perles en tout."]; }, { max: 600 }],
      [function (n) { return ["À la piscine, " + n.a + " enfants nagent le matin, " + n.b + " à midi et " + n.c + " le soir. Combien d'enfants sont venus nager ?", "enfants", n.r + " enfants sont venus nager."]; }, { max: 999 }],
      [function (n) { var D = doudou(); return [cap(D[0]) + " range sa pêche : " + n.a + " sardines, " + n.b + " harengs et " + n.c + " maquereaux. Combien de poissons a-t-" + il(D) + " ?", "poissons", cap(D[0]) + " a " + n.r + " poissons.", "Il a promis de ne pas tout manger d'un coup !"]; }, { max: 300 }],
      [function (n) { return ["La bibliothèque reçoit " + n.a + " albums, " + n.b + " bandes dessinées et " + n.c + " romans. Combien de livres reçoit-elle ?", "livres", "La bibliothèque reçoit " + n.r + " livres."]; }, { max: 9999 }],
      [function (n) { var M = maitresse(); return ["Pour la fête de l'école, la classe de " + M[0] + " vend " + n.a + " crêpes, " + n.b + " gaufres et " + n.c + " parts de gâteau. Combien de gourmandises vend-elle ?", "gourmandises", "La classe vend " + n.r + " gourmandises."]; }, { max: 500 }]
    ] },
  s1_perimetre: { s: 1, op: "×", aide: "Le carré a 4 côtés pareils : le tour, c'est le tout, fait de 4 parts égales.",
    aideOp: "Je cherche le tour d'un carré : 4 côtés identiques, je fais une multiplication.",
    nombres: function (p, lim, o) { var b = o.f(); return { n: 4, b: b, r: 4 * b }; },
    expr: function (n) { return "4 × " + n.b; },
    schemas: function (n) { return [{ f: "egal", top: "?", n: 4, part: n.b }, { f: "tout", top: "?", parts: [n.b, n.b] }, { f: "tout", top: "?", parts: [4, n.b] }]; },
    ctx: [
      [function (n, P) { return ["Le bassin des petits est un carré de " + n.b + " m de côté. " + P[0] + " en fait une fois le tour. Combien de mètres parcourt-" + il(P) + " ?", "m", P[0] + " parcourt " + n.r + " m."]; }, { f: function () { return rnd(6, 25); } }],
      [function (n, P) { return [P[0] + " colle un ruban tout autour d'un cadre carré. Chaque côté mesure " + n.b + " cm. Quelle longueur de ruban lui faut-il ?", "cm", "Il lui faut " + n.r + " cm de ruban."]; }, { f: function () { return rnd(12, 45); } }],
      [function (n) { var D = doudou(); return [cap(D[0]) + " construit un enclos carré pour ses poissons. Chaque côté mesure " + n.b + " m. Quelle longueur de grillage lui faut-il ?", "m", "Il faut " + n.r + " m de grillage.", "Les poissons, eux, auraient préféré la mer…"]; }, { f: function () { return rnd(5, 30); } }],
      [function (n) { return ["Le bac à sable de l'école est un carré de " + n.b + " dm de côté. Combien mesure son tour ?", "dm", "Le tour du bac à sable mesure " + n.r + " dm."]; }, { f: function () { return rnd(15, 40); } }],
      [function (n) { return ["Un champ carré a des côtés de " + n.b + " m. Le fermier pose une clôture tout autour. Quelle est la longueur de la clôture ?", "m", "La clôture mesure " + n.r + " m."]; }, { f: function () { return 10 * rnd(5, 25); } }]
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
      [function (n) { return ["Le stade a " + n.t + " places. " + n.a + " supporters sont déjà assis. Combien de places sont encore libres ?", "places", n.r + " places sont encore libres."]; }, { max: 9999, min: 100 }],
      [function (n) { return ["Le train doit parcourir " + n.t + " km. Il a déjà parcouru " + n.a + " km. Combien de kilomètres lui reste-t-il à parcourir ?", "km", "Il lui reste " + n.r + " km à parcourir."]; }, { max: 9999, min: 100 }]
    ] },
  s2_perte: { s: 2, op: "−", argent: ["t", "a", "r"], aide: "Au début, j'avais le tout. Une partie est partie : le ? est sur ce qui reste.",
    aideOp: "Je cherche ce qui reste : je fais une soustraction.",
    nombres: function (p, lim, o) { var x = deuxParties(lim, o.min); return { t: x[2], a: x[0], r: x[1] }; },
    expr: function (n) { return n.t + " − " + n.a; },
    schemas: function (n) { return [{ f: "tout", top: n.t, parts: [n.a, "?"] }, { f: "tout", top: "?", parts: [n.t, n.a] }, { f: "cmp", grand: "?", petit: n.t, ecart: n.a }]; },
    ctx: [
      [function (n, P) { return [P[0] + " a " + n.t + " € dans sa tirelire. " + Il(P) + " dépense " + n.a + " € pour un livre. Combien d'euros lui reste-t-il ?", "€", "Il lui reste " + n.r + " €."]; }, { max: 300 }],
      [function (n) { return ["Le fermier ramasse " + n.t + " œufs. En chemin, " + n.a + " œufs se cassent. Combien d'œufs reste-t-il ?", "œufs", "Il reste " + n.r + " œufs."]; }, { max: 200 }],
      [function (n, P) { return ["Une ficelle mesure " + n.t + " cm. " + P[0] + " en coupe " + n.a + " cm. Combien de centimètres de ficelle reste-t-il ?", "cm", "Il reste " + n.r + " cm de ficelle."]; }, { max: 999 }],
      [function (n, P) { return [P[0] + " a " + n.t + " € dans son porte-monnaie. " + Il(P) + " achète un goûter à " + n.a + " €. Combien d'argent lui reste-t-il ?", "€", "Il lui reste " + n.r + " €."]; }, { centimes: true, max: 30 }],
      [function (n) { return ["Le club de foot a " + n.t + " € dans sa caisse. Il paie " + n.a + " € pour des maillots. Combien d'argent reste-t-il dans la caisse ?", "€", "Il reste " + n.r + " € dans la caisse."]; }, { max: 9999, min: 300 }],
      [function (n) { return ["Le boulanger a fait " + n.t + " croissants. Il en vend " + n.a + " le matin. Combien de croissants lui reste-t-il ?", "croissants", "Il lui reste " + n.r + " croissants."]; }, { max: 300 }]
    ] },
  s2_trois: { s: 2, op: "−", aide: "Je connais le tout et deux parties : le ? est sur la troisième partie.",
    aideOp: "Je cherche la partie qui manque : j'enlève au tout les deux parties connues, je fais une soustraction.",
    nombres: function (p, lim, o) { var x = troisParties(lim, o.min); return { t: x[3], a: x[0], b: x[1], r: x[2] }; },
    expr: function (n) { return n.t + " − " + n.a + " − " + n.b; },
    schemas: function (n) { return [{ f: "tout", top: n.t, parts: [n.a, n.b, "?"] }, { f: "tout", top: "?", parts: [n.a, n.b, n.t] }, { f: "cmp", grand: n.t, petit: n.a, ecart: "?" }]; },
    ctx: [
      [function (n, P) { return [P[0] + " a " + n.t + " images : " + n.a + " de chats, " + n.b + " de chiens et les autres de chevaux. Combien d'images de chevaux a-t-" + il(P) + " ?", "images", P[0] + " a " + n.r + " images de chevaux."]; }, { max: 500 }],
      [function (n) { return ["Une randonnée de " + n.t + " km dure trois jours. Le premier jour, on marche " + n.a + " km. Le deuxième jour, " + n.b + " km. Combien de kilomètres reste-t-il pour le troisième jour ?", "km", "Il reste " + n.r + " km pour le troisième jour."]; }, { max: 99, min: 8 }],
      [function (n, P) { return ["Le collier de " + P[0] + " a " + n.t + " perles : " + n.a + " rouges, " + n.b + " vertes et les autres jaunes. Combien de perles jaunes y a-t-il ?", "perles", "Il y a " + n.r + " perles jaunes."]; }, { max: 300 }],
      [function (n) { return ["À la course de l'école, " + n.t + " enfants courent : " + n.a + " en CP, " + n.b + " en CE1, et les autres en CE2. Combien d'enfants de CE2 courent ?", "enfants", n.r + " enfants de CE2 courent."]; }, { max: 200, min: 15 }],
      [function (n) { return ["Au jeu de l'oie géant, il faut " + n.t + " points pour gagner. L'équipe bleue a marqué " + n.a + " points, puis " + n.b + " points. Combien de points lui manque-t-il ?", "points", "Il lui manque " + n.r + " points."]; }, { max: 999, min: 20 }]
    ] },
  s4_moins: { s: 4, op: "−", argent: ["g", "e", "r"], aide: "Je cherche la plus petite quantité : « de moins », le ? est sur la petite barre.",
    aideOp: "« De moins » : je cherche la plus petite quantité, je fais une soustraction.",
    nombres: function (p, lim, o) { var x = deuxParties(lim, o.min); return { g: x[2], e: Math.min(x[0], x[1]), r: Math.max(x[0], x[1]) }; },
    expr: function (n) { return n.g + " − " + n.e; },
    schemas: function (n) { return [{ f: "cmp", grand: n.g, petit: "?", ecart: n.e }, { f: "cmp", grand: "?", petit: n.g, ecart: n.e }, { f: "tout", top: "?", parts: [n.g, n.e] }]; },
    ctx: [
      [function (n, P) { return [P[0] + " a " + n.g + " billes. " + P[1][0] + " en a " + n.e + " de moins. Combien de billes a " + P[1][0] + " ?", "billes", P[1][0] + " a " + n.r + " billes."]; }, { max: 300 }],
      [function (n) { return ["Le grand bus transporte " + n.g + " passagers. Le petit bus en transporte " + n.e + " de moins. Combien de passagers transporte le petit bus ?", "passagers", "Le petit bus transporte " + n.r + " passagers."]; }, { max: 99 }],
      [function (n) { return ["Un vélo coûte " + n.g + " €. Une trottinette coûte " + n.e + " € de moins. Combien coûte la trottinette ?", "€", "La trottinette coûte " + n.r + " €."]; }, { max: 999 }],
      [function (n) { return ["Le chemin rouge mesure " + n.g + " m. Le chemin bleu mesure " + n.e + " m de moins. Combien mesure le chemin bleu ?", "m", "Le chemin bleu mesure " + n.r + " m."]; }, { max: 9999 }],
      [function (n, P) { return [P[0] + " a " + n.g + " € dans sa tirelire. " + P[1][0] + " a " + n.e + " € de moins. Combien d'argent a " + P[1][0] + " ?", "€", P[1][0] + " a " + n.r + " €."]; }, { centimes: true, max: 60 }]
    ] },
  /* la fraction qui reste : le tout, c'est d/d ; pas d'étape schéma ; on écrit le nombre de parts qui restent (« 2 » cinquièmes) */
  s2_fraction: { s: 2, frac: true, op: "−",
    nombres: function () { var d = rnd(3, 10), a = rnd(1, d - 1); return { d: d, a: a, r: d - a }; },
    ctx: [
      [function (n, P) { return [P[0] + " a mangé " + F(n.a, n.d) + " de la tarte. Quelle fraction de la tarte reste-t-il ?", "de la tarte"]; }, {}],
      [function (n) { return ["Le jardinier a déjà planté " + F(n.a, n.d) + " du potager. Quelle fraction du potager reste-t-il à planter ?", "du potager"]; }, {}],
      [function (n, P) { return [P[0] + " a lu " + F(n.a, n.d) + " de son livre. Quelle fraction du livre lui reste-t-il à lire ?", "du livre"]; }, {}],
      [function (n) { var D = doudou(); return [cap(D[0]) + " a mangé " + F(n.a, n.d) + " de son poisson. Quelle fraction du poisson reste-t-il ?", "du poisson", "Il garde le reste pour le goûter !"]; }, {}]
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
    nombres: function (p, lim, o) {
      if (o && o.grand) { var k2 = pick([2, 2, 4, 5, 10]), q2 = k2 === 2 ? rnd(51, 499) : 5 * rnd(10, 60); return { t: k2 * q2, k: k2, r: q2 }; } /* 1 020 ÷ 4, 436 ÷ 2 : par la décomposition */
      var k = facteur(p), q = rnd(2, 10); return { t: k * q, k: k, r: q }; },
    expr: function (n) { return n.t + " ÷ " + n.k; },
    schemas: function (n) { return [{ f: "egal", top: n.t, n: n.k, part: "?" }, { f: "egal", top: "?", n: n.k, part: n.t }, { f: "tout", top: n.t, parts: [n.k, "?"] }]; },
    ctx: [
      [function (n, P) { return [P[0] + " range " + n.t + " livres sur " + n.k + " étagères. Il y a autant de livres sur chaque étagère. Combien de livres y a-t-il sur chaque étagère ?", "livres", "Il y a " + n.r + " livres sur chaque étagère."]; }, {}],
      [function (n) { return [cap(maitresse()[0]) + " partage " + n.t + " feutres entre " + n.k + " groupes. Chaque groupe reçoit autant de feutres. Combien de feutres reçoit chaque groupe ?", "feutres", "Chaque groupe reçoit " + n.r + " feutres."]; }, {}],
      [function (n) { return [n.k + " enfants gagnent " + n.t + " € ensemble. Ils partagent la somme en parts égales. Combien d'euros reçoit chaque enfant ?", "€", "Chaque enfant reçoit " + n.r + " €."]; }, {}],
      [function (n) { return ["Une corde de " + n.t + " m est coupée en " + n.k + " morceaux de même longueur. Combien mesure chaque morceau ?", "m", "Chaque morceau mesure " + n.r + " m."]; }, {}],
      [function (n) { return ["Pour la fête du quartier, " + n.k + " familles louent ensemble une grande tente à " + n.t + " €. Chaque famille paie la même somme. Combien paie chaque famille ?", "€", "Chaque famille paie " + n.r + " €."]; }, { grand: true }],
      [function (n, P) { return ["Le grand-père de " + P[0] + " plante " + n.t + " bulbes de tulipes dans " + n.k + " jardinières, autant dans chacune. Combien de bulbes met-il dans chaque jardinière ?", "bulbes", "Il met " + n.r + " bulbes dans chaque jardinière."]; }, { grand: true }]
    ] },
  s3_nombre: { s: 3, op: "÷", aide: "Je fais des parts toutes pareilles : le ? est sur le nombre de parts.",
    aideOp: "Je fais un partage et je cherche le nombre de parts : je fais une division.",
    nombres: function (p, lim, o) { var b = o.t ? pick(o.t) : facteur(p), q = o.grand ? pick([rnd(11, 30), 10 * rnd(2, 5)]) : rnd(2, 10); return { t: b * q, b: b, r: q }; },
    expr: function (n) { return n.t + " ÷ " + n.b; },
    schemas: function (n) { return [{ f: "egal", top: n.t, n: "?", part: n.b }, { f: "egal", top: "?", n: n.b, part: n.t }, { f: "tout", top: n.t, parts: [n.b, "?"] }]; },
    ctx: [
      [function (n, P) { return [P[0] + " a " + n.t + " photos. " + Il(P) + " en colle " + n.b + " sur chaque page. Combien de pages remplit-" + il(P) + " ?", "pages", P[0] + " remplit " + n.r + " pages."]; }, {}],
      [function (n) { return ["Le jardinier a " + n.t + " graines. Il met " + n.b + " graines dans chaque pot. Combien de pots remplit-il ?", "pots", "Le jardinier remplit " + n.r + " pots."]; }, {}],
      [function (n) { return ["Avec " + n.t + " enfants, on forme des équipes de " + n.b + " joueurs. Combien d'équipes peut-on former ?", "équipes", "On peut former " + n.r + " équipes."]; }, {}],
      [function (n) { var Pa = unParent(); return ["Avec " + n.t + " €, " + Pa[0] + " achète des places de cinéma à " + n.b + " € chacune. Combien de places peut-" + il(Pa) + " acheter ?", "places", cap(Pa[0]) + " peut acheter " + n.r + " places."]; }, { grand: true, t: [4, 5, 6, 8, 10] }],
      [function (n, P) { return [P[0] + " range " + n.t + " œufs dans des boîtes de " + n.b + " œufs. Combien de boîtes remplit-" + il(P) + " ?", "boîtes", P[0] + " remplit " + n.r + " boîtes."]; }, { t: [6, 10, 12] }]
    ] },
  s4_grande: { s: 4, op: "+", argent: ["a", "e", "r"], aide: "Je cherche la plus grande quantité : le ? est sur la grande barre.",
    aideOp: "Je cherche la plus grande quantité : j'ajoute l'écart, je fais une addition.",
    nombres: function (p, lim, o) { var x = deuxParties(lim, o.min); return { a: Math.max(x[0], x[1]), e: Math.min(x[0], x[1]), r: x[2] }; },
    expr: function (n) { return n.a + " + " + n.e; },
    schemas: function (n) { var M = Math.max(n.a, n.e), m = Math.min(n.a, n.e);
      return [{ f: "cmp", grand: "?", petit: n.a, ecart: n.e }, { f: "cmp", grand: M, petit: "?", ecart: m }, { f: "tout", top: M, parts: [m, "?"] }]; },
    ctx: [
      [function (n, P) { return ["La tour de " + P[0] + " mesure " + n.a + " cm. La tour de " + P[1][0] + " mesure " + n.e + " cm de plus. Combien mesure la tour de " + P[1][0] + " ?", "cm", "La tour de " + P[1][0] + " mesure " + n.r + " cm."]; }, { max: 300 }],
      [function (n, P) { return ["Aux fléchettes, " + P[0] + " marque " + n.a + " points. " + P[1][0] + " marque " + n.e + " points de plus que " + lui(P) + ". Combien de points marque " + P[1][0] + " ?", "points", P[1][0] + " marque " + n.r + " points."]; }, { max: 500 }],
      [function (n) { return ["Un livre coûte " + n.a + " €. Un jeu coûte " + n.e + " € de plus. Combien coûte le jeu ?", "€", "Le jeu coûte " + n.r + " €."]; }, { centimes: true, max: 60 }],
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
  s5_fois_plus: { s: 5, op: "×", piege: true, argent: ["a", "r"], aide: "Je cherche la grande quantité : elle fait plusieurs fois la petite.",
    aideOp: "« Fois plus » : je cherche la plus grande quantité, je fais une multiplication.",
    nombres: function (p, lim, o) { var k = petitFacteur(p), a = o.f(); return { a: a, k: k, r: a * k }; },
    expr: function (n) { return n.a + " × " + n.k; },
    schemas: function (n) { return [{ f: "fois", petit: n.a, k: n.k, grand: "?" }, { f: "cmp", grand: "?", petit: n.a, ecart: n.k }, { f: "fois", petit: "?", k: n.k, grand: n.a }]; },
    ctx: [
      [function (n, P) { return [P[0] + " a " + n.a + " autocollants. " + P[1][0] + " en a " + fois(n.k) + " plus. Combien d'autocollants a " + P[1][0] + " ?", "autocollants", P[1][0] + " a " + n.r + " autocollants."]; }, { f: function () { return Math.random() < 0.7 ? rnd(3, 12) : 10 * rnd(2, 5); } }],
      [function (n) { return ["La petite tour mesure " + n.a + " cm. La grande tour est " + fois(n.k) + " plus haute. Combien mesure la grande tour ?", "cm", "La grande tour mesure " + n.r + " cm."]; }, { f: function () { return rnd(5, 30); } }],
      [function (n) { return ["Un stylo coûte " + n.a + " €. Une boîte de peinture coûte " + fois(n.k) + " plus cher. Combien coûte la boîte de peinture ?", "€", "La boîte de peinture coûte " + n.r + " €."]; }, { centimes: true, f: function () { return rnd(12, 120); } }],
      [function (n) { return ["Le petit camion transporte " + n.a + " kg de sable. Le gros camion en transporte " + fois(n.k) + " plus. Combien de kilos transporte le gros camion ?", "kg", "Le gros camion transporte " + n.r + " kg de sable."]; }, { f: function () { return rnd(120, 2400); } }],
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

/* ---- problèmes à deux étapes (« stratégie » 9) : une question intermédiaire, puis la question finale. Pas d'étape schéma.
   ctx → [énoncé, unité, phrase réponse, blague ou null, question intermédiaire] ; etapes(n) → [{ op, expr, r }, { op, expr, r }] */
function gourmand(x) { return genre(x) === "f" ? "gourmande" : "gourmand"; }
function enfantOu(P) { var e = (G.perso || {}).enfant; return e && e[0] ? e : [P[0], P.g]; }
var CAS2 = {
  e2_gagne_donne: { s: 9, aides: ["D'abord, j'ajoute ce qui arrive : je fais une addition.", "Ensuite, j'enlève ce qui part : je fais une soustraction."],
    nombres: function (p, lim, o) { var m = o.min || 5;
      for (;;) { var a = rnd(m, lim - m), b = rnd(m, lim - a), s1 = a + b, c = rnd(m, s1 - m); if (s1 <= lim && s1 - c >= m && c !== a && c !== b) return { a: a, b: b, s: s1, c: c, r: s1 - c }; } },
    etapes: function (n) { return [{ op: "+", expr: n.a + " + " + n.b, r: n.s }, { op: "−", expr: n.s + " − " + n.c, r: n.r }]; },
    ctx: [
      [function (n, P) { return [P[0] + " a " + n.a + " images. À la récré, " + il(P) + " en gagne " + n.b + ". Puis " + il(P) + " en donne " + n.c + " à " + P[1][0] + ". Combien d'images a-t-" + il(P) + " maintenant ?",
        "images", P[0] + " a maintenant " + n.r + " images.", null, "Combien d'images " + P[0] + " a-t-" + il(P) + " après la récré ?"]; }, { max: 200 }],
      [function (n, P) { var Pa = unParent(), E = enfantOu(P); return [cap(Pa[0]) + " cueille " + n.a + " g de mûres le matin et " + n.b + " g l'après-midi. " + Il(Pa) + " en met " + n.c + " g dans une tarte. Combien de grammes de mûres reste-t-il ?",
        "g", "Il reste " + n.r + " g de mûres.", "On suppose que " + E[0] + " n'en a pas mangé en cachette… " + cap(gourmand(E)) + " !", "Combien de grammes de mûres " + Pa[0] + " a-t-" + il(Pa) + " cueillis en tout ?"]; }, { max: 999, min: 50 }],
      [function (n) { return ["Le bus part avec " + n.a + " passagers. Au premier arrêt, " + n.b + " personnes montent. Au deuxième arrêt, " + n.c + " personnes descendent. Combien de passagers y a-t-il maintenant ?",
        "passagers", "Il y a maintenant " + n.r + " passagers.", null, "Combien de passagers y a-t-il après le premier arrêt ?"]; }, { max: 99, min: 4 }],
      [function (n, P) { var D = doudou(); return [cap(D[0]) + " a " + n.a + " poissons dans son seau. " + P[0] + " lui en apporte " + n.b + ". " + cap(gourmand(D)) + ", " + D[0] + " en mange " + n.c + ". Combien de poissons reste-t-il dans le seau ?",
        "poissons", "Il reste " + n.r + " poissons dans le seau.", "Et maintenant, petite sieste sur la banquise !", "Combien de poissons y a-t-il dans le seau avant le repas ?"]; }, { max: 150 }]
    ] },
  e2_depenses: { s: 9, aides: ["D'abord, je réunis les deux quantités enlevées : je fais une addition.", "Ensuite, j'enlève ce total : je fais une soustraction."],
    nombres: function (p, lim, o) { var m = o.min || 5;
      for (;;) { var B = rnd(Math.max(4 * m, Math.floor(lim / 3)), lim), a = rnd(m, B), b = rnd(m, B); if (a + b <= B - m && a !== b) return { B: B, a: a, b: b, s: a + b, r: B - a - b }; } },
    etapes: function (n) { return [{ op: "+", expr: n.a + " + " + n.b, r: n.s }, { op: "−", expr: n.B + " − " + n.s, r: n.r }]; },
    ctx: [
      [function (n) { var M = maitresse(); return ["La classe de " + M[0] + " a " + n.B + " € pour la sortie. Le car coûte " + n.a + " € et le musée coûte " + n.b + " €. Combien d'argent reste-t-il ?",
        "€", "Il reste " + n.r + " €.", null, "Combien coûtent le car et le musée ensemble ?"]; }, { max: 2000, min: 40 }],
      [function (n, P) { return [P[0] + " a " + n.B + " € dans sa tirelire. " + Il(P) + " achète un livre à " + n.a + " € et un jeu à " + n.b + " €. Combien d'argent lui reste-t-il ?",
        "€", "Il lui reste " + n.r + " €.", null, "Combien " + P[0] + " dépense-t-" + il(P) + " en tout ?"]; }, { max: 150, min: 4 }],
      [function (n, P) { return ["Une pelote de laine fait " + n.B + " cm. " + P[0] + " en coupe " + n.a + " cm, puis " + P[1][0] + " en coupe " + n.b + " cm. Combien de centimètres de laine reste-t-il ?",
        "cm", "Il reste " + n.r + " cm de laine.", null, "Combien de centimètres ont été coupés en tout ?"]; }, { max: 999, min: 20 }],
      [function (n, P) { return ["Le puzzle de " + P[0] + " a " + n.B + " pièces. Lundi, " + il(P) + " en pose " + n.a + ". Mardi, " + il(P) + " en pose " + n.b + ". Combien de pièces reste-t-il à poser ?",
        "pièces", "Il reste " + n.r + " pièces à poser.", null, "Combien de pièces " + P[0] + " a-t-" + il(P) + " posées lundi et mardi ?"]; }, { max: 1000, min: 30 }]
    ] },
  e2_groupes_fois: { s: 9, aides: ["D'abord, je cherche le premier total : je fais une multiplication.", "Ensuite, ce total se répète : je multiplie encore."],
    nombres: function (p, lim, o) { var x = o.x(), y = o.y(), z = o.z(); return { x: x, y: y, s: x * y, z: z, r: x * y * z }; },
    etapes: function (n) { return [{ op: "×", expr: n.x + " × " + n.y, r: n.s }, { op: "×", expr: n.s + " × " + n.z, r: n.r }]; },
    ctx: [
      [function (n, P) { var Pa = unParent(); return [P[0] + " et " + Pa[0] + " vont à la piscine en bus. Un trajet coûte " + n.x + " €. " + cap(ils(P, Pa)) + " font l'aller et le retour. Combien paient-" + ils(P, Pa) + " en tout ?",
        "€", cap(ils(P, Pa)) + " paient " + n.r + " € en tout.", null, "Combien coûtent l'aller et le retour pour une personne ?"]; },
        { x: function () { return rnd(2, 9); }, y: function () { return 2; }, z: function () { return 2; } }],
      [function (n, P) { return ["Un tour de manège coûte " + n.x + " €. " + P[0] + " fait " + n.y + " tours, et " + P[1][0] + " aussi. Combien paient-" + ils(P, P[1]) + " en tout ?",
        "€", cap(ils(P, P[1])) + " paient " + n.r + " € en tout.", null, "Combien paie " + P[0] + " ?"]; },
        { x: function () { return rnd(2, 5); }, y: function () { return rnd(2, 6); }, z: function () { return 2; } }],
      [function (n) { var M = maitresse(); return ["Une boîte contient " + n.x + " paquets de " + n.y + " biscuits. " + cap(M[0]) + " achète " + n.z + " boîtes pour la classe. Combien de biscuits y a-t-il en tout ?",
        "biscuits", "Il y a " + n.r + " biscuits en tout.", null, "Combien de biscuits y a-t-il dans une boîte ?"]; },
        { x: function () { return rnd(2, 5); }, y: function () { return rnd(4, 10); }, z: function () { return rnd(2, 5); } }],
      [function (n) { var D = doudou(); return [cap(D[0]) + " mange " + n.x + " poissons à chaque repas. " + Il(D) + " fait " + n.y + " repas par jour. Combien de poissons mange-t-" + il(D) + " en " + n.z + " jours ?",
        "poissons", cap(D[0]) + " mange " + n.r + " poissons en " + n.z + " jours.", "Quel appétit !", "Combien de poissons mange-t-" + il(D) + " en un jour ?"]; },
        { x: function () { return rnd(2, 6); }, y: function () { return rnd(2, 4); }, z: function () { return rnd(2, 7); } }]
    ] },
  e2_groupes_plus: { s: 9, aides: ["D'abord, je cherche le total des groupes égaux : je fais une multiplication.", "Ensuite, j'ajoute ceux qui restent : je fais une addition."],
    nombres: function (p, lim, o) { var n1 = rnd(2, 9), k = o.k ? o.k() : rnd(3, 10), e = o.e ? o.e() : rnd(3, 40); return { n: n1, k: k, s: n1 * k, e: e, r: n1 * k + e }; },
    etapes: function (n) { return [{ op: "×", expr: n.n + " × " + n.k, r: n.s }, { op: "+", expr: n.s + " + " + n.e, r: n.r }]; },
    ctx: [
      [function (n) { var M = maitresse(); return [cap(M[0]) + " a " + n.n + " boîtes de " + n.k + " craies et encore " + n.e + " craies dans sa trousse. Combien de craies a-t-" + il(M) + " en tout ?",
        "craies", cap(M[0]) + " a " + n.r + " craies en tout.", null, "Combien de craies y a-t-il dans les boîtes ?"]; }, {}],
      [function (n, P) { var Pa = unParent(); return ["Pour la fête, " + Pa[0] + " achète " + n.n + " paquets de " + n.k + " ballons. " + P[0] + " trouve encore " + n.e + " ballons dans le placard. Combien de ballons ont-" + ils(P, Pa) + " pour la fête ?",
        "ballons", cap(ils(P, Pa)) + " ont " + n.r + " ballons pour la fête.", null, "Combien de ballons y a-t-il dans les paquets ?"]; }, {}],
      [function (n) { return ["À la piscine, " + n.n + " groupes de " + n.k + " enfants nagent. " + n.e + " enfants attendent au bord du bassin. Combien d'enfants y a-t-il à la piscine ?",
        "enfants", "Il y a " + n.r + " enfants à la piscine.", null, "Combien d'enfants nagent ?"]; }, {}],
      [function (n, P) { return [P[0] + " remplit " + n.n + " pages de son album, avec " + n.k + " autocollants par page. Puis " + il(P) + " en colle " + n.e + " sur la couverture. Combien d'autocollants a-t-" + il(P) + " collés ?",
        "autocollants", P[0] + " a collé " + n.r + " autocollants.", null, "Combien d'autocollants y a-t-il sur les pages ?"]; }, { k: function () { return pick([4, 5, 6, 8, 10, 12]); } }]
    ] },
  e2_total_partage: { s: 9, div: true, aides: ["D'abord, je réunis les deux quantités : je fais une addition.", "Ensuite, je partage en parts égales : je fais une division."],
    nombres: function (p, lim, o) { var m = o.min || 3;
      /* partage dans les tables (q ≤ 10), sauf en deux (moitié) ou pour une somme ronde (multiple de 5) */
      for (;;) { var k = o.k ? o.k() : rnd(2, 5), q = o.q ? o.q() : rnd(3, 10), t = k * q, a = rnd(m, t - m); if (t <= lim && Math.abs(2 * a - t) >= t / 8) return { a: a, b: t - a, s: t, k: k, r: q }; } },
    etapes: function (n) { return [{ op: "+", expr: n.a + " + " + n.b, r: n.s }, { op: "÷", expr: n.s + " ÷ " + n.k, r: n.r }]; },
    ctx: [
      [function (n, P) { var I = ils(P, P[1]); return [P[0] + " ramasse " + n.a + " coquillages et " + P[1][0] + " en ramasse " + n.b + ". " + cap(I) + " les partagent en deux parts égales. Combien de coquillages a " + chacun(P, P[1]) + " ?",
        "coquillages", cap(chacun(P, P[1])) + " a " + n.r + " coquillages.", null, "Combien de coquillages ont-" + I + " ramassés en tout ?"]; }, { k: function () { return 2; }, q: function () { return rnd(6, 50); } }],
      [function (n) { return ["La classe gagne " + n.a + " € à la tombola et " + n.b + " € au marché de Noël. Elle partage l'argent entre " + n.k + " projets, en parts égales. Combien reçoit chaque projet ?",
        "€", "Chaque projet reçoit " + n.r + " €.", null, "Combien la classe gagne-t-elle en tout ?"]; }, { k: function () { return pick([2, 4, 5]); }, q: function () { return 10 * rnd(3, 30); }, min: 20 }],
      [function (n, P) { var Pa = unParent(), I = ils(P, Pa); return [cap(Pa[0]) + " cueille " + n.a + " fraises et " + P[0] + " en cueille " + n.b + ". " + cap(I) + " les mettent dans " + n.k + " barquettes, autant dans chacune. Combien de fraises y a-t-il dans chaque barquette ?",
        "fraises", "Il y a " + n.r + " fraises dans chaque barquette.", "Promis, personne n'en a croqué une en route !", "Combien de fraises ont-" + I + " cueillies en tout ?"]; }, {}],
      [function (n) { var D = doudou(); return [cap(D[0]) + " pêche " + n.a + " poissons le matin et " + n.b + " l'après-midi. " + Il(D) + " les range dans " + n.k + " seaux, autant dans chaque seau. Combien de poissons y a-t-il dans chaque seau ?",
        "poissons", "Il y a " + n.r + " poissons dans chaque seau.", null, "Combien de poissons a-t-" + il(D) + " pêchés en tout ?"]; }, {}]
    ] }
};
/* seuil : un total, puis « Oui ou non ? » (assez d'argent, trop lourd, assez de places) ; ctx → [énoncé, unité, phrase si oui, phrase si non, question intermédiaire, sens] */
CAS2.e2_seuil = { s: 9, seuil: true, aides: ["D'abord, je cherche le total : je fais une addition.", "Ensuite, je compare le total au nombre de l'énoncé."],
  nombres: function (p, lim, o) { var m = o.min || 5;
    for (;;) { var a = o.a ? o.a() : rnd(m, Math.floor(lim / 2)), b = o.b ? o.b() : rnd(m, Math.floor(lim / 2)), s1 = a + b, S = Math.round(s1 * (Math.random() < 0.5 ? rnd(80, 95) : rnd(105, 120)) / 100);
      if (S !== s1 && S <= lim && s1 <= lim && S > Math.max(a, b)) return { a: a, b: b, s: s1, S: S, r: s1 }; } },
  etapes: function (n) { return [{ op: "+", expr: n.a + " + " + n.b, r: n.s }]; },
  ctx: [
    [function (n, P) { var Pa = unParent(); return [P[0] + " a " + n.a + " € dans sa tirelire. " + cap(Pa[0]) + " lui donne " + n.b + " €. Le jeu qu'" + il(P) + " veut coûte " + n.S + " €. A-t-" + il(P) + " assez d'argent ?", "€",
      "Oui, " + P[0] + " a assez d'argent : " + n.s + " €, c'est plus que " + n.S + " €.", "Non, " + P[0] + " n'a pas assez d'argent : " + n.s + " €, c'est moins que " + n.S + " €.", "Combien d'argent " + P[0] + " a-t-" + il(P) + " maintenant ?", "assez"]; }, { max: 150, a: function () { return rnd(5, 60); }, b: function () { return rnd(5, 40); } }],
    [function (n) { return ["L'ascenseur peut porter " + n.S + " kg. Un livreur pèse " + n.a + " kg et ses cartons pèsent " + n.b + " kg. Peut-il monter avec ses cartons ?", "kg",
      "Oui : " + n.s + " kg, c'est moins que " + n.S + " kg.", "Non : " + n.s + " kg, c'est plus que " + n.S + " kg. Il faudra faire deux voyages !", "Combien pèsent le livreur et ses cartons ensemble ?", "max"]; }, { max: 300, a: function () { return rnd(60, 90); }, b: function () { return rnd(15, 60); } }],
    [function (n, P) { return ["La brouette de " + P[0] + " peut porter " + n.S + " kg. " + Il(P) + " y met " + n.a + " kg de bois et " + n.b + " kg de pierres. La brouette peut-elle porter tout ce chargement ?", "kg",
      "Oui : " + n.s + " kg, c'est moins que " + n.S + " kg.", "Non : " + n.s + " kg, c'est plus que " + n.S + " kg. Il faudra deux voyages !", "Combien pèse tout le chargement ?", "max"]; }, { max: 150, a: function () { return rnd(15, 60); }, b: function () { return rnd(15, 60); } }],
    [function (n) { var M = maitresse(); return ["Le car a " + n.S + " places. Pour la sortie de la classe de " + M[0] + ", il y a " + n.a + " élèves et " + n.b + " adultes. Tout le monde peut-il monter dans le car ?", "personnes",
      "Oui : " + n.s + " personnes, c'est moins que " + n.S + " places.", "Non : " + n.s + " personnes, c'est plus que " + n.S + " places. Il faut un deuxième car !", "Combien de personnes partent en sortie ?", "max"]; }, { max: 80, a: function () { return rnd(15, 30); }, b: function () { return rnd(3, 9); } }]
  ] };
Object.keys(CAS2).forEach(function (k) { CAS[k] = CAS2[k]; CAS[k].e2 = true; });
/* fraction écrite {frac:a/d} et lue « trois cinquièmes » */
function F(a, d) { return "{frac:" + a + "/" + d + "}"; }
function fracOral(t) { return t.replace(/\{frac:(\d+)\/(\d+)\}/g, function (m, a, d) { return fracMots(+a, +d); }); }

/* texte lu par la synthèse vocale : unités en toutes lettres */
function oralUnites(t) {
  return t.replace(/\b1,(\d\d) €/g, "1 euro $1").replace(/\b1 €/g, "1 euro").replace(/(\d+),(\d\d) €/g, "$1 euros $2").replace(/(\d) €/g, "$1 euros").replace(/(\d) km\b/g, "$1 kilomètres").replace(/(\d) kg\b/g, "$1 kilos").replace(/(\d) cm\b/g, "$1 centimètres")
          .replace(/(\d) m\b/g, "$1 mètres").replace(/(\d) L\b/g, "$1 litres").replace(/(\d) g\b/g, "$1 grammes").replace(/(\d) dm\b/g, "$1 décimètres").replace(/(\d) (\d{3})\b/g, "$1$2");
}
/* espaces insécables : « ? » et l'unité ne partent jamais seuls à la ligne */
function insecables(t) { return t.replace(/ \?/g, "\u00a0?").replace(/ !/g, "\u00a0!").replace(/(\d) (€|kg|km|cm|dm|m|g|L)(?![a-zà-ü])/g, "$1\u00a0$2"); }
function texte(t) { return insecables(elisions(t)); }
function oral(t) { return oralUnites(elisions(t)); }
/* Énoncés personnels de perso.json : { cas, texte, unite, phrase, blague?, question? (deux étapes), max?, min?, f|x|y|z|k|q: [min, max] }.
   Trous : les nombres du cas ({a}, {b}, {r}…), {kfois} (« trois fois »). Ils écrivent les prénoms en toutes lettres. */
function plage(t) { return function () { return rnd(t[0], t[1]); }; }
function ctxPerso(m) {
  var o = {};
  ["max", "min"].forEach(function (k) { if (m[k] != null) o[k] = m[k]; });
  ["f", "x", "y", "z", "k", "q", "e"].forEach(function (k) { if (m[k]) o[k] = plage(m[k]); });
  function rempl(t, n) {
    return t == null ? null : String(t).replace(/\{(\w+)\}/g, function (x, k) { return k === "kfois" ? fois(n.k) : n[k] != null ? n[k] : x; });
  }
  return [function (n) { return [rempl(m.texte, n), m.unite, rempl(m.phrase, n), rempl(m.blague, n), rempl(m.question, n)]; }, o, true];
}
function ctxDuCas(id, p) {
  var perso = id === "e2_seuil" || id === "s2_fraction" ? [] : ((G.perso || {}).problemes || []).filter(function (m) { return m.cas === id; }).map(ctxPerso);
  /* un énoncé personnel une fois sur deux quand il y en a */
  if (perso.length && ((G.perso || {}).forcer || Math.random() < 0.5)) return perso;
  var l = CAS[id].ctx.filter(function (c) { return p.centimes || !c[1].centimes; }); /* prix avec centimes : sur demande */
  return l.length ? l : CAS[id].ctx;
}
G.probleme = function (p) {
  var ids = p.problemes && p.problemes.length ? p.problemes : Object.keys(CAS).filter(function (k) {
    if (CAS[k].frac && !p.fractions) return false; /* fraction qui reste : sur demande */
    return p.strategies ? p.strategies.indexOf(CAS[k].s) >= 0 : CAS[k].s !== 9; }); /* deux étapes (9) : seulement sur demande */
  var id = pick(ids), C = CAS[id], cx = pick(ctxDuCas(id, p)), d = deuxPrenoms(), P = { 0: d[0][0], g: d[0][1], 1: d[1] };
  var lim = Math.min(p.limite || 999, cx[1].max || 9999), n, cent = !!cx[1].centimes && !!C.argent;
  /* nombres dans la limite, et aucun mauvais schéma qui donnerait par hasard la bonne réponse (2 + 2 = 2 × 2).
     En centimes : tirage en pièces de 5 centimes, puis × 5 ; la limite porte sur les euros. */
  for (var essai = 0; essai < 200; essai++) {
    n = C.nombres(p, cent ? lim * 20 : lim, cent ? Object.assign({}, cx[1], { min: Math.max(cx[1].min || 0, 20) }) : cx[1]); /* en centimes : 1 € au moins */
    if (cent) C.argent.forEach(function (k) { n[k] *= 5; });
    var grand = Math.max.apply(null, Object.keys(n).map(function (k) { return cent && C.argent.indexOf(k) >= 0 ? n[k] / 100 : n[k]; }));
    var ambigu = !C.e2 && !C.frac && C.schemas(n).slice(1).some(function (s) { return valeurSchema(s) === n.r; });
    if (grand <= lim && !ambigu) break;
  }
  var nd = {};
  for (var k in n) nd[k] = cent && C.argent.indexOf(k) >= 0 ? euros(n[k]) : n[k] >= 1000 ? fmt(n[k]) : n[k]; /* 4 386, 19,95 à l'écran */
  var tx = cx[0](nd, P);
  var rep = cent ? euros(n.r) : String(n.r);
  if (C.frac) {
    /* « 5/5 − 3/5 = ? cinquièmes » : on écrit le nombre de parts */
    var unite = ORD[n.d] + (n.d > 3 ? "s" : ""), calc = F(n.d, n.d) + " − " + F(n.a, n.d), ph = "Il reste " + F(n.r, n.d) + " " + tx[1] + ".";
    return { consigne: { texte: texte(tx[0]), oral: fracOral(oral(tx[0])) }, expression: n.d + " − " + n.a, reponse: String(n.r),
             probleme: { cas: id, strategie: C.s, op: "−", calcul: calc, unite: unite, phrase: texte(ph), phrase_oral: fracOral(ph),
                         blague: tx[2] ? texte(tx[2]) : null, blague_oral: tx[2] ? oral(tx[2]) : null, aide: "", piege: false, schemas: [],
                         aideOp: "Le tout, c'est " + F(n.d, n.d) + ". J'enlève la part déjà faite : je fais une soustraction.",
                         etapes: [{ op: "−", calcul: calc, reponse: String(n.r), question: null, aideOp: "Le tout, c'est " + F(n.d, n.d) + ". J'enlève la part déjà faite : je fais une soustraction." }] } };
  }
  if (C.seuil) {
    var oui = tx[5] === "assez" ? n.s >= n.S : n.s <= n.S, ph2 = oui ? tx[2] : tx[3];
    var e1 = C.etapes(nd)[0], derniere2 = tx[0].replace(/^.*[.!]\s/, "");
    return { consigne: { texte: texte(tx[0]), oral: oral(tx[0]) }, expression: e1.expr, reponse: oui ? "oui" : "non",
             probleme: { cas: id, strategie: 9, op: "+", calcul: e1.expr, unite: tx[1], phrase: texte(ph2), phrase_oral: oral(ph2),
                         blague: null, blague_oral: null, aide: "", aideOp: C.aides[0], piege: false, schemas: [],
                         etapes: [{ op: "+", calcul: e1.expr, reponse: String(n.s), aideOp: C.aides[0], question: texte(tx[4]), question_oral: oral(tx[4]) },
                                  { ouinon: true, reponse: oui ? "oui" : "non", seuil: String(nd.S), question: texte(derniere2), question_oral: oral(derniere2), aideOp: C.aides[1] }] } };
  }
  if (C.e2) {
    var et = C.etapes(n), etd = C.etapes(nd), derniere = tx[0].replace(/^.*[.!]\s/, ""); /* la question finale de l'énoncé */
    return { consigne: { texte: texte(tx[0]), oral: oral(tx[0]) }, expression: etd[1].expr, reponse: String(n.r),
             probleme: { cas: id, strategie: 9, op: et[1].op, calcul: etd[1].expr, unite: tx[1], phrase: texte(tx[2]), phrase_oral: oral(tx[2]),
                         blague: tx[3] ? texte(tx[3]) : null, blague_oral: tx[3] ? oral(tx[3]) : null, aide: "", aideOp: C.aides[1], piege: false, schemas: [],
                         etapes: et.map(function (x, i) { return { op: x.op, calcul: etd[i].expr, reponse: String(x.r), aideOp: C.aides[i],
                           question: texte(i === 0 ? tx[4] : derniere), question_oral: oral(i === 0 ? tx[4] : derniere) }; }) } };
  }
  var e = C.expr(nd);
  var sch = C.schemas(n).map(function (s, i) { return { spec: s, bon: i === 0 }; });
  for (var i = sch.length - 1; i > 0; i--) { var j = rnd(0, i), x = sch[i]; sch[i] = sch[j]; sch[j] = x; }
  if (cent) { LAB = {}; C.argent.forEach(function (k) { LAB[n[k]] = nd[k]; }); }
  try {
    return { consigne: { texte: texte(tx[0]), oral: oral(tx[0]) }, expression: e, reponse: rep,
             probleme: { cas: id, strategie: C.s, op: C.op, calcul: e, unite: tx[1], phrase: texte(tx[2]), phrase_oral: oral(tx[2]), decimal: cent,
                         blague: tx[3] ? texte(tx[3]) : null, blague_oral: tx[3] ? oral(tx[3]) : null,
                         aide: C.aide, aideOp: C.aideOp, piege: !!C.piege,
                         schemas: sch.map(function (x) { return { svg: svgSchema(x.spec), alt: altSchema(x.spec), spec: x.spec, bon: x.bon }; }) } };
  } finally { LAB = null; }
};
G.probleme.cas = Object.keys(CAS);
/* cas qui demandent une division (à écarter tant que la classe n'en fait pas) */
G.probleme.division = Object.keys(CAS).filter(function (k) { return CAS[k].op === "÷" || CAS[k].div; });
G.probleme.fractions = Object.keys(CAS).filter(function (k) { return CAS[k].frac; });

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

root.GENERATEURS = { creer: creer, types: Object.keys(G), enLettres: enLettres, G: G, schema: svgSchema };
})(typeof window !== "undefined" ? window : globalThis);
