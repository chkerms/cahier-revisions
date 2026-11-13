"""Test de bout en bout du défi chrono (maths), au format tablette Android (Chrome headless).

Usage : python3 tests/test_defi.py http://localhost:8765/ MOT_DE_PASSE
Prérequis : la même copie jetable que tests/test_quiz.py (3 leçons d'exemple + tests/fixtures/essai_quiz_tables.json publiées).
"""
import json
import re
import sys

from playwright.sync_api import sync_playwright

URL, PW = sys.argv[1], sys.argv[2]
fails = []


def check(cond, msg):
    print(("  ok   " if cond else "  FAIL ") + msg)
    if not cond:
        fails.append(msg)


def reponse(q):
    """Réponse attendue, calculée depuis la consigne affichée."""
    if "pizza" in q:
        return "3"
    m = re.search(r"(\d+)\s*([×÷+\-−])\s*(\d+)", q.replace(" ", ""))
    if m:
        a, op, b = int(m.group(1)), m.group(2), int(m.group(3))
        r = {"×": a * b, "÷": a / b, "+": a + b, "-": a - b, "−": a - b}[op]
        return str(int(r)) if r == int(r) else str(r).replace(".", ",")
    m = re.search(r"(\d+) = (\d+) × \?", q)
    if m:
        return str(int(m.group(1)) // int(m.group(2)))
    raise ValueError("consigne non reconnue : " + q)


def secondes(t):
    return float(t.replace(" s", "").replace(",", "."))


ANDROID_UA = "Mozilla/5.0 (Linux; Android 10; SM-T510) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

with sync_playwright() as pw:
    br = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    ctx = br.new_context(viewport={"width": 800, "height": 1280}, device_scale_factor=1, has_touch=True, user_agent=ANDROID_UA)
    p = ctx.new_page()
    errs = []
    p.on("pageerror", lambda e: errs.append(str(e)))
    p.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)

    def racine():
        if p.locator("#btn-themes").count():
            p.click("#btn-themes")
        p.wait_for_selector(".theme-tile")

    def zone_parent():
        racine()
        b = p.locator("#btn-parent").bounding_box()
        p.mouse.move(b["x"] + 10, b["y"] + 10); p.mouse.down(); p.wait_for_timeout(2100); p.mouse.up()
        p.wait_for_selector("#mode-quiz")

    def jouer(n, erreur_en_premier=False):
        p.wait_for_selector("#saisie", timeout=6000)
        for i in range(n):
            p.wait_for_function(f"document.querySelector('#defi-compteur') && document.querySelector('#defi-compteur').textContent === '{i + 1} / {n}'")
            q = p.inner_text(".defi-q .q")
            r = "0" if (erreur_en_premier and i == 0) else reponse(q)
            if i % 2:  # clavier physique (pavé numérique branché)
                p.keyboard.type(r); p.keyboard.press("Enter")
            else:      # pavé à l'écran et touche Entrée
                for ch in r:
                    p.click(f".padkey[data-k='{ch}']")
                p.click("#btn-entree")
            if erreur_en_premier and i == 0:
                check("C'était" in p.inner_text(".defi-fb") and "+5 s" in p.inner_text(".defi-fb"), "erreur : bonne réponse montrée, +5 s")
        p.wait_for_selector("#defi-fin", timeout=6000)

    p.goto(URL); p.wait_for_selector("#mdp")
    p.fill("#mdp", PW); p.click("#btn-ouvrir"); p.wait_for_selector(".theme-tile", timeout=20000)

    print("== Bouton défi sur les leçons de maths")
    p.click(".theme-tile[data-theme=grammaire]"); p.wait_for_selector(".lecon-card")
    check(p.locator("[data-defi]").count() == 0, "français : pas de défi")
    racine(); p.click(".theme-tile[data-theme=calcul_mental]"); p.wait_for_selector("[data-defi=essai-quiz-tables]")
    check(p.inner_text("[data-defi=essai-quiz-tables]").strip().endswith("Défi"), "maths : bouton Défi à côté de la leçon")

    print("== Première partie (une erreur)")
    p.click("[data-defi=essai-quiz-tables]"); p.wait_for_selector("#defi-intro")
    check(p.locator("#defi-intro .record").count() == 0, "pas encore de record")
    p.click("#btn-partez"); p.wait_for_selector("#compte")
    check(p.inner_text("#compte") in ("3", "2"), "compte à rebours")
    jouer(10, erreur_en_premier=True)
    t1 = secondes(p.inner_text("#defi-temps"))
    check("9 justes sur 10" in p.inner_text("#defi-justes") and "1 erreur (+5 s)" in p.inner_text("#defi-justes"), f"bilan : {p.inner_text('#defi-justes')}")
    check(t1 >= 5.0, f"pénalité comptée ({t1} s)")
    check("Premier record" in p.inner_text("#defi-record"), "premier record")
    check(p.locator("#btn-defi-lecon").count() == 1, "erreur : bouton Revoir la leçon")
    st = json.loads(p.evaluate("localStorage.getItem('prog:enfant:essai-quiz-tables')"))
    check(st["defi"]["parties"] == 1 and abs(st["defi"]["record"] / 1000 - t1) < 0.06, f"record enregistré pour le profil ({st['defi']})")

    print("== Rejouer sans faute : nouveau record")
    p.click("#btn-rejouer"); p.wait_for_selector("#compte")
    jouer(10)
    t2 = secondes(p.inner_text("#defi-temps"))
    check("10 justes sur 10" in p.inner_text("#defi-justes"), "10 justes")
    check(t2 < t1 and "Nouveau record" in p.inner_text("#defi-record"), f"nouveau record ({t2} s contre {t1} s)")
    p.click("#btn-retour"); p.wait_for_selector("[data-defi=essai-quiz-tables]")
    check(p.inner_text("[data-defi=essai-quiz-tables]").strip().endswith(f"{t2:.1f}".replace(".", ",") + " s"), "record affiché sur la carte")

    print("== Leçon à calculs fixes")
    racine(); p.click(".theme-tile[data-theme=fractions]"); p.click("[data-defi=maths-les-fractions]"); p.click("#btn-partez")
    jouer(3)
    check("3 justes sur 3" in p.inner_text("#defi-justes"), "défi sur les 3 calculs fixes")

    print("== Abandon en cours de partie")
    p.click("#btn-rejouer"); p.wait_for_selector("#saisie", timeout=6000)
    p.click("#btn-home"); p.wait_for_selector(".theme-tile, .lecon-card")
    p.keyboard.press("Enter"); p.keyboard.type("12"); p.wait_for_timeout(1500)
    check(p.locator("#chrono").count() == 0 and p.locator(".lecon-card, .theme-tile").count() > 0, "retour accueil : partie arrêtée, clavier libéré")

    print("== Fin de leçon : bouton défi")
    racine(); p.click(".theme-tile[data-theme=fractions]"); p.click(".lecon-card[data-id=maths-les-fractions]"); p.wait_for_selector("[data-step=oral]")
    p.click("[data-step=oral]"); p.click("#btn-verifier"); p.click("#btn-valide"); p.click("#next-btn"); p.wait_for_selector("#fin")
    check(p.locator("[data-defi-fin=maths-les-fractions]").count() == 1, "écran de fin : « Défi chrono sur cette leçon »")
    p.click("[data-defi-fin=maths-les-fractions]"); p.wait_for_selector("#defi-intro")
    check("Ton record" in p.inner_text("#defi-intro"), "le défi s'ouvre avec le record de la leçon")
    p.click("#btn-home"); p.wait_for_selector(".theme-tile, .lecon-card")

    print("== Bilan")
    zone_parent(); p.wait_for_function("window.__bilan !== undefined")
    b = p.evaluate("window.__bilan")
    check("Dont 3 défis chrono terminés" in b, "bilan : 3 défis terminés (l'abandon ne compte pas)")
    check("DÉFIS CHRONO" in b and "[essai-quiz-tables] : 2 parties, meilleur temps" in b, "bilan : section défis, 2 parties sur les tables")
    check("saisi 0 (défi chrono)" in b, "bilan : l'erreur du défi listée à retravailler")
    check("abandonné" in b, "bilan : partie abandonnée visible dans le détail")

    print("== Réglage parent")
    p.click("#btn-defi-reglage")
    check(p.get_attribute("#btn-defi-reglage", "aria-pressed") == "false", "défi masqué par le parent")
    p.click("#next-btn"); p.wait_for_selector(".theme-tile"); p.click(".theme-tile[data-theme=calcul_mental]"); p.wait_for_selector(".lecon-card")
    check(p.locator("[data-defi]").count() == 0, "plus de bouton défi")

    check(not errs, f"aucune erreur JS/console {errs}")
    br.close()

print("\nRÉSULTAT :", "PASS" if not fails else f"{len(fails)} ÉCHEC(S)")
sys.exit(1 if fails else 0)
