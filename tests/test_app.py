"""Test de bout en bout de l'application, au format tablette Android (Chrome headless).

Usage : python3 tests/test_app.py http://localhost:8765/ MOT_DE_PASSE [dossier_captures]
Prérequis : servir la racine du dépôt (python3 -m http.server 8765) avec les leçons d'exemple publiées.
"""
import re
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

URL, PW = sys.argv[1], sys.argv[2]
SHOTS = Path(sys.argv[3]) if len(sys.argv) > 3 else None
fails = []


def check(cond, msg):
    print(("  ok   " if cond else "  FAIL ") + msg)
    if not cond:
        fails.append(msg)


def shot(p, n):
    if SHOTS:
        SHOTS.mkdir(exist_ok=True)
        p.screenshot(path=str(SHOTS / n))


ANDROID_UA = "Mozilla/5.0 (Linux; Android 10; SM-T510) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

with sync_playwright() as pw:
    br = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    ctx = br.new_context(viewport={"width": 800, "height": 1280}, device_scale_factor=1, has_touch=True, user_agent=ANDROID_UA)
    p = ctx.new_page()
    errs = []
    p.on("pageerror", lambda e: errs.append(str(e)))
    p.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)

    print("== Premier lancement : mot de passe")
    p.goto(URL); p.wait_for_selector("#mdp")
    check(p.locator("#mdp").is_visible(), "écran mot de passe au premier lancement")
    p.fill("#mdp", "pas-le-bon"); p.click("#btn-ouvrir"); p.wait_for_function("document.querySelector('.erreur') && document.querySelector('.erreur').textContent.length > 0", timeout=20000)
    check("incorrect" in p.inner_text(".erreur"), "mauvais mot de passe refusé")
    p.fill("#mdp", PW); p.click("#btn-ouvrir"); p.wait_for_selector(".lecon-card", timeout=20000)
    titres = [t.strip() for t in p.locator(".lecon-card .titre").all_inner_texts()]
    check(titres == ["Les fractions", "Le nom", "La Cigale et la Fourmi (début)"], f"3 leçons déchiffrées, triées par date ({titres})")
    check(p.locator(".nouveau").count() == 3, "badge Nouveau sur les leçons jamais ouvertes")
    check(p.locator(".lecon-card .sous").first.inner_text().find("MHM · P2") >= 0, "méthode et période affichées")
    shot(p, "a_accueil.png")

    print("== Relance : plus de mot de passe")
    p.reload(); p.wait_for_selector(".lecon-card", timeout=20000)
    check(p.locator("#mdp").count() == 0, "clé mémorisée sur l'appareil, pas de nouvelle saisie")

    print("== Filtres par matière")
    p.click("[data-filtre=mathematiques]")
    check(p.locator(".lecon-card").count() == 1, "filtre Maths : 1 leçon")
    p.click("[data-filtre=tout]")

    print("== Leçon de maths : calculs au pavé numérique")
    p.click(".lecon-card[data-id=maths-les-fractions]"); p.wait_for_selector("[data-step=calculs]")
    check(p.locator("main svg, main img").count() >= 1, "illustration SVG affichée dans la leçon")
    img_ok = p.eval_on_selector("[data-bloc=b3] img", "i => i.complete && i.naturalWidth > 0")
    check(img_ok, "SVG de la pizza chargé")
    p.click("[data-step=calculs]")
    def tape(s):
        for ch in s:
            p.click(f".padkey[data-k='{ch}']")
    tape("471"); check(p.inner_text("#saisie") == "471", "saisie au pavé affichée")
    p.click("#btn-valider")
    check(p.locator(".hintbox").count() == 1 and p.inner_text("#saisie") == "?", "erreur : indice + saisie vidée")
    tape("4729"); p.click(".padkey[data-k='⌫']"); p.click("#btn-valider")
    check(p.locator(".feedback.good").count() == 1, "472 accepté après correction (touche effacer)")
    p.click("#next-btn"); tape("394"); p.click("#btn-valider")
    check(p.locator(".feedback.good").count() == 1, "2e calcul juste du premier coup")
    stars_after = int(p.inner_text(".stars").replace("⭐", ""))
    p.click("#next-btn")
    check(p.locator(".czone img.qimg").count() == 1, "3e calcul : image affichée avec la consigne")
    shot(p, "b_calculs.png")
    for _ in range(3):
        tape("5"); p.click("#btn-valider")
    check("La bonne réponse était 3" in p.inner_text(".czone"), "après 3 essais : bonne réponse montrée, sans blocage")
    check(stars_after == 1, f"étoile seulement au premier coup ({stars_after})")
    p.click("#next-btn")
    check("1 calcul réussi du premier coup sur 3" in p.inner_text(".czone"), "bilan des calculs")

    print("== Fin de leçon et retour accueil")
    p.click("[data-step=oral]"); p.click("#btn-verifier"); p.click("#btn-valide"); p.click("#next-btn")
    p.wait_for_selector("#fin"); p.click("#btn-retour"); p.wait_for_selector(".lecon-card")
    etat = p.inner_text(".lecon-card[data-id=maths-les-fractions] .etat")
    check(etat.startswith("✓ Fini"), f"leçon marquée finie sur l'accueil ({etat})")

    print("== Zone parent (appui long) et prénom")
    p.click("#btn-parent")
    check(p.locator("#prenom").count() == 0, "un simple appui n'ouvre pas la zone parent")
    box = p.locator("#btn-parent").bounding_box()
    p.mouse.move(box["x"] + 10, box["y"] + 10); p.mouse.down(); p.wait_for_timeout(2100); p.mouse.up()
    p.wait_for_selector("#prenom")
    p.fill("#prenom", "Léa"); p.click("#btn-prenom"); p.click("#next-btn"); p.wait_for_selector(".lecon-card")
    check("Bonjour Léa" in p.inner_text("header"), "prénom affiché à l'accueil")
    shot(p, "c_accueil_prenom.png")

    print("== Hors ligne (service worker)")
    p.wait_for_function("navigator.serviceWorker && navigator.serviceWorker.controller !== null", timeout=15000)
    ctx.set_offline(True)
    p.reload(); p.wait_for_selector(".lecon-card", timeout=20000)
    check(p.locator(".lecon-card").count() == 3, "les leçons s'ouvrent sans réseau")
    ctx.set_offline(False)

    check(not errs, f"aucune erreur JS/console {errs}")
    br.close()

print("\nRÉSULTAT :", "PASS" if not fails else f"{len(fails)} ÉCHEC(S)")
sys.exit(1 if fails else 0)
