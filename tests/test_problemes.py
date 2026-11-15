"""Test de bout en bout des problèmes guidés (générateur « probleme »), au format tablette Android (Chrome headless).

Usage : python3 tests/test_problemes.py http://localhost:8765/ MOT_DE_PASSE
Prérequis : une copie jetable avec les 3 leçons d'exemple + tests/fixtures/essai_problemes.json publiées.
Vérifie : 3 gestes (schéma, opération, calcul), phrase réponse, aide qui s'efface après 2 réussites,
aide qui revient après une erreur, journal (nature des erreurs), bilan, pas de défi chrono.
"""
import json
import re
import sys

from playwright.sync_api import sync_playwright

URL, PW = sys.argv[1], sys.argv[2]
LECON = "essai-problemes"
fails = []


def check(cond, msg):
    print(("  ok   " if cond else "  FAIL ") + msg)
    if not cond:
        fails.append(msg)


def resultat(calcul):
    """Résultat recalculé depuis la ligne affichée « 47 − 19 = »."""
    m = re.search(r"([\d ]+?)\s*([+−×÷])\s*([\d ]+?)\s*=", calcul)
    a, op, b = int(m[1].replace(" ", "")), m[2], int(m[3].replace(" ", ""))
    return {"+": a + b, "−": a - b, "×": a * b, "÷": a // b}[op]


ANDROID_UA = "Mozilla/5.0 (Linux; Android 10; SM-T510) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

with sync_playwright() as pw:
    br = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    ctx = br.new_context(viewport={"width": 800, "height": 1280}, device_scale_factor=1, has_touch=True, user_agent=ANDROID_UA)
    p = ctx.new_page()
    errs = []
    p.on("pageerror", lambda e: errs.append(str(e)))
    p.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)

    def racine():
        if p.locator("#btn-home").count():
            p.click("#btn-home")
        if p.locator("#btn-themes").count():
            p.click("#btn-themes")
        p.wait_for_selector(".theme-tile")

    def ouvrir_calculs():
        racine()
        p.click(".theme-tile[data-theme=problemes]"); p.wait_for_selector(f".lecon-card[data-id={LECON}]")
        p.click(f".lecon-card[data-id={LECON}]"); p.wait_for_selector("[data-step=calculs]")
        p.click("[data-step=calculs]"); p.wait_for_selector(".q.enonce")

    def memoire():
        return json.loads(p.evaluate("localStorage.getItem('prob:enfant') || '{}'"))

    def resoudre(schema="bon", calcul_faux=0):
        """Résout le problème affiché. schema : 'bon', 'faux' ou None (étape absente attendue)."""
        enonce = p.inner_text(".q.enonce")
        cas = None
        if schema is None:
            check(p.locator(".schema-choix").count() == 0, "aide effacée : pas d'étape schéma")
        else:
            p.wait_for_selector(".schema-choix")
            check(p.locator(".schema-choix").count() == 3, "3 schémas proposés")
            check(p.locator(".schema-choix img[alt^='Schéma']").count() == 3, "schémas décrits (alt)")
            p.click(".schema-choix[data-bon='1']" if schema == "bon" else ".schema-choix[data-bon='0'] >> nth=0")
            if schema == "faux":
                check(p.locator(".schema-choix.right").count() == 1, "schéma faux : le bon passe en vert")
                check(p.locator(".pfb .hintbox").count() == 1, "schéma faux : phrase d'aide")
        p.wait_for_selector(".opkey")
        check(p.locator(".opkey").count() == 4, "4 touches d'opération")
        ops = ["+", "−", "×", "÷"]
        # on essaie les touches dans l'ordre : chaque touche fausse est une erreur d'opération
        faits = 0
        for o in ops:
            if p.locator(".pcalcul").count():
                break
            p.click(f".opkey[data-op='{o}']")
            p.wait_for_timeout(50)
            if p.locator(".pcalcul").count() == 0:
                faits += 1
                if faits == 1 and schema is None:
                    check(p.locator(".pfb .schema.seul").count() == 1, "sans étape schéma : le schéma s'affiche en aide après une erreur")
        p.wait_for_selector(".pcalcul")
        ligne = p.inner_text(".pcalcul")
        r = resultat(ligne)
        for _ in range(calcul_faux):
            for ch in str(r + 1):
                p.click(f".padkey[data-k='{ch}']")
            p.click("#btn-valider"); p.wait_for_timeout(50)
            check("Refais le calcul" in p.inner_text(".pfd"), "calcul faux : on réessaie")
        for ch in str(r):
            p.click(f".padkey[data-k='{ch}']")
        p.click("#btn-valider")
        p.wait_for_selector(".preponse .phrase")
        phrase = p.inner_text(".preponse .phrase")
        check(f"{r:,}".replace(",", " ") in phrase, f"phrase réponse avec le résultat : « {phrase} »")
        OPS_FAUX.append(faits)
        return enonce, faits, ligne

    OPS_FAUX = []
    p.goto(URL); p.wait_for_selector("#mdp")
    p.fill("#mdp", PW); p.click("#btn-ouvrir"); p.wait_for_selector(".theme-tile", timeout=20000)

    print("== Pas de défi chrono pour une leçon de problèmes")
    racine(); p.click(".theme-tile[data-theme=problemes]"); p.wait_for_selector(f".lecon-card[data-id={LECON}]")
    check(p.locator(f"[data-defi={LECON}]").count() == 0, "pas de bouton Défi")

    print("== Premier problème : schéma faux, puis bonne opération et bon calcul")
    ouvrir_calculs()
    check("Problème 1 sur 5" in p.inner_text(".counter"), "compteur « Problème 1 sur 5 »")
    p.screenshot(path="/tmp/probleme_etape1.png")
    enonce, faits, ligne = resoudre(schema="faux")
    p.screenshot(path="/tmp/probleme_fin.png", full_page=True)
    cas1 = [k for k, v in memoire().items()]
    check(len(cas1) == 1 and list(memoire().values()) == [0], f"erreur : réussites d'affilée remises à 0 ({memoire()})")
    check(p.locator("#next-btn").count() == 1, "bouton Problème suivant")

    print("== Problèmes suivants : schéma juste (le 2e avec une erreur de calcul)")
    for i in range(4):
        p.click("#next-btn"); p.wait_for_selector(".q.enonce")
        guide = p.locator(".schema-choix").count() > 0
        resoudre(schema="bon" if guide else None, calcul_faux=1 if i == 0 else 0)
    p.click("#next-btn"); p.wait_for_selector(".card.end")
    check("réussi" in p.inner_text(".card.end"), "écran de fin des calculs")

    print("== Aide qui s'efface : 2 réussites d'un cas → plus de schéma ; une erreur → il revient")
    tous = ["s1_parties", "s1_egales", "s2_complement", "s2_perte", "s2_avant_ajout", "s3_part", "s3_nombre",
            "s4_grande", "s4_petite", "s4_ecart", "s5_fois_plus", "s5_fois_moins"]
    p.evaluate("m => localStorage.setItem('prob:enfant', JSON.stringify(m))", {c: 2 for c in tous})
    ouvrir_calculs()
    check(p.locator(".schema-choix").count() == 0, "cas maîtrisés : on commence par l'opération")
    check(p.inner_text(".cdroite .plabel").startswith("Quelle opération"), "consigne sans numéro d'étape")
    _, faits, _ = resoudre(schema=None)
    m = memoire(); bouge = {c: v for c, v in m.items() if v != 2}
    check(len(bouge) == 1 and list(bouge.values())[0] == (0 if faits else 3),
          f"{'erreur d opération : cas remis à 0' if faits else 'réussite sans faute : 3 d affilée'} ({bouge})")
    print("== Journal et bilan")
    racine()
    b = p.locator("#btn-parent").bounding_box()
    p.mouse.move(b["x"] + 10, b["y"] + 10); p.mouse.down(); p.wait_for_timeout(2100); p.mouse.up()
    p.wait_for_function("window.__bilan !== undefined")
    bilan = p.evaluate("window.__bilan")
    m = re.search(r"--- DONNÉES BRUTES \(JSON\) ---\n(.*)\n--- FIN ---", bilan, re.S)
    brut = json.loads(m.group(1)) if m else {"seances": []}
    evs = [e for s in brut["seances"] for e in s["ev"] if e.get("prob")]
    check(len(evs) >= 6, f"problèmes journalisés ({len(evs)})")
    e1 = sorted(evs, key=lambda e: e["t"])[0] if evs else {"prob": {}}
    check(e1["prob"].get("schema") is False and e1["prob"].get("guide") is True and e1.get("reussi") is True, f"1er problème : schéma faux noté ({e1['prob']})")
    if any(OPS_FAUX):
        check(any(len(e["prob"]["ops"]) > 1 for e in evs), "mauvaise opération notée dans le journal")
        check("opération : " in bilan, "bilan : opérations choisies")
    check("schéma faux" in bilan and "erreurs : schéma" in bilan, "bilan : erreurs classées (schéma, opération, calcul)")
    check("calcul : attendu" in bilan, "bilan : erreur de calcul notée")
    p.screenshot(path="/tmp/probleme_bilan.png", full_page=True)
    print("\n".join("     | " + l for l in bilan.split("--- DONNÉES")[0].splitlines() if "problème" in l)[:1800])

    check(not errs, "aucune erreur JavaScript" + ("" if not errs else " : " + " | ".join(errs[:3])))
    br.close()

print("RÉSULTAT :", "PASS" if not fails else f"FAIL ({len(fails)})")
sys.exit(1 if fails else 0)
