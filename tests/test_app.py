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
    p.fill("#mdp", PW); p.click("#btn-ouvrir"); p.wait_for_selector(".theme-tile", timeout=20000)
    themes = p.eval_on_selector_all(".theme-tile", "els => els.map(e => e.dataset.theme)")
    check(themes == ["grammaire", "poesie", "fractions"], f"accueil par thèmes, français puis maths ({themes})")
    check([t.strip() for t in p.locator("h2.matiere").all_inner_texts()] == ["Français", "Maths"], "une section par matière")
    check("3 leçons" in p.inner_text("[data-vue=nouveau]"), "raccourci « Nouvelles leçons » : 3")
    check(p.locator("[data-vue=revoir]").count() == 0, "pas de raccourci « À revoir » au départ")
    shot(p, "a_accueil.png")

    print("== Relance : plus de mot de passe")
    p.reload(); p.wait_for_selector(".theme-tile", timeout=20000)
    check(p.locator("#mdp").count() == 0, "clé mémorisée sur l'appareil, pas de nouvelle saisie")

    print("== Thèmes")
    p.click("[data-vue=nouveau]"); p.wait_for_selector(".lecon-card")
    check(p.locator(".lecon-card").count() == 3, "vue Nouvelles leçons : 3 leçons")
    p.click("#btn-themes"); p.wait_for_selector(".theme-tile")
    p.click(".theme-tile[data-theme=fractions]"); p.wait_for_selector(".lecon-card")
    check(p.locator(".lecon-card").count() == 1 and "Fractions" in p.inner_text("#titre-vue"), "thème Fractions : 1 leçon")
    check(p.locator(".lecon-card .sous").first.inner_text().find("MHM · P2") >= 0, "méthode et période affichées")

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
    check("Fractions" in p.inner_text("#titre-vue"), "fin de leçon : retour au thème d'où l'on vient")
    etat = p.inner_text(".lecon-card[data-id=maths-les-fractions] .etat")
    check(etat.startswith("✓ Fini"), f"leçon marquée finie ({etat})")
    p.click("#next-btn"); p.wait_for_selector(".theme-tile")
    check("2 leçons" in p.inner_text("[data-vue=nouveau]"), "raccourci « Nouvelles leçons » : 2 après ouverture")

    print("== Zone parent (appui long) et prénom")
    p.click("#btn-parent")
    check(p.locator("#prenom").count() == 0, "un simple appui n'ouvre pas la zone parent")
    box = p.locator("#btn-parent").bounding_box()
    p.mouse.move(box["x"] + 10, box["y"] + 10); p.mouse.down(); p.wait_for_timeout(2100); p.mouse.up()
    p.wait_for_selector("#prenom")
    prog = p.inner_text("#programme")
    check("Fractions : 1 leçon" in prog and "Monnaie : pas encore de leçon" in prog, "zone parent : leçons par thème du programme")
    p.fill("#prenom", "Léa"); p.click("#btn-prenom"); p.click("#next-btn"); p.wait_for_selector(".theme-tile")
    check("Bonjour Léa" in p.inner_text("header"), "prénom affiché à l'accueil")
    shot(p, "c_accueil_prenom.png")

    def zone_parent():
        b = p.locator("#btn-parent").bounding_box()
        p.mouse.move(b["x"] + 10, b["y"] + 10); p.mouse.down(); p.wait_for_timeout(2100); p.mouse.up()
        p.wait_for_selector("#profils")

    def ls(k):
        return p.evaluate("k => localStorage.getItem(k)", k)

    print("== Profils : isolation enfant / test")
    check(p.locator("#bandeau-test").count() == 0, "profil enfant : pas de bandeau test")
    check(ls("prog:enfant:maths-les-fractions") is not None and ls("prog:maths-les-fractions") is None, "progression rangée sous le profil enfant")
    zone_parent()
    check(p.get_attribute("[data-profil=enfant]", "aria-pressed") == "true", "zone parent : profil Enfant actif par défaut")
    p.click("[data-profil=test]"); p.wait_for_selector("#bandeau-test")
    check("profil Test parent" in p.inner_text("#btn-raz"), "remise à zéro limitée au profil actif (libellé)")
    p.click("#next-btn"); p.wait_for_selector(".theme-tile")
    check(p.locator("#bandeau-test").is_visible(), "profil test : bandeau visible à l'accueil")
    check("Bonjour Léa" not in p.inner_text("header"), "profil test : prénom de l'enfant non affiché")
    check("3 leçons" in p.inner_text("[data-vue=nouveau]"), "profil test : progression vierge (3 nouvelles leçons)")
    shot(p, "d_profil_test.png")
    p.click("[data-vue=nouveau]"); p.click(".lecon-card[data-id=grammaire-le-nom]"); p.wait_for_selector("[data-step]")
    check(p.locator("#bandeau-test").is_visible(), "profil test : bandeau visible dans une leçon")
    p.click("#btn-home"); p.wait_for_selector(".theme-tile, .lecon-card")
    check(ls("prog:test:grammaire-le-nom") is not None and ls("prog:enfant:grammaire-le-nom") is None, "leçon ouverte en test : seul le profil test est modifié")
    p.goto(URL); p.wait_for_selector(".theme-tile", timeout=20000)
    zone_parent(); p.click("[data-profil=test]"); p.wait_for_selector("#bandeau-test")
    p.click("#btn-raz")
    check(ls("prog:test:grammaire-le-nom") is None and ls("prog:enfant:maths-les-fractions") is not None, "remise à zéro en test : la progression de l'enfant reste")
    p.click("#next-btn"); p.wait_for_selector(".theme-tile")

    print("== Profils : retour au profil enfant au lancement")
    p.reload(); p.wait_for_selector(".theme-tile", timeout=20000)
    check(p.locator("#bandeau-test").count() == 0 and "Bonjour Léa" in p.inner_text("header"), "relance : profil enfant, sans bandeau")
    check("2 leçons" in p.inner_text("[data-vue=nouveau]"), "relance : progression de l'enfant intacte")

    print("== Profils : migration depuis la 1.4.0")
    p.evaluate("""() => {
      Object.keys(localStorage).filter(k => k.startsWith('prog:') || k.startsWith('reglages:')).forEach(k => localStorage.removeItem(k));
      localStorage.removeItem('migration_profils'); localStorage.removeItem('profil_actif');
      localStorage.setItem('prog:maths-les-fractions', JSON.stringify({ ouvert: true, fini: true, best: 3 }));
      localStorage.setItem('reglages', JSON.stringify({ taille: 'grande', prenom: 'Zoé' }));
    }""")
    p.reload(); p.wait_for_selector(".theme-tile", timeout=20000)
    check(ls("prog:maths-les-fractions") is None and '"best":3' in (ls("prog:enfant:maths-les-fractions") or ""), "migration : progression 1.4.0 passée au profil enfant")
    check("Bonjour Zoé" in p.inner_text("header") and "prenom" not in ls("reglages") and "grande" in ls("reglages"), "migration : prénom au profil enfant, taille conservée")
    check(ls("migration_profils") == "1", "migration marquée faite")
    p.evaluate("() => localStorage.setItem('prog:grammaire-le-nom', JSON.stringify({ ouvert: true }))")
    p.reload(); p.wait_for_selector(".theme-tile", timeout=20000)
    check(ls("prog:grammaire-le-nom") is not None and ls("prog:enfant:grammaire-le-nom") is None, "migration jouée une seule fois")
    p.evaluate("() => { localStorage.removeItem('prog:grammaire-le-nom'); localStorage.setItem('reglages', JSON.stringify({ taille: 'moyenne' })); }")
    p.reload(); p.wait_for_selector(".theme-tile", timeout=20000)

    print("== Hors ligne (service worker)")
    p.wait_for_function("navigator.serviceWorker && navigator.serviceWorker.controller !== null", timeout=15000)
    ctx.set_offline(True)
    p.reload(); p.wait_for_selector(".theme-tile", timeout=20000)
    check(p.locator(".theme-tile").count() == 3, "les leçons s'ouvrent sans réseau")
    ctx.set_offline(False)

    check(not errs, f"aucune erreur JS/console {errs}")
    br.close()

print("\nRÉSULTAT :", "PASS" if not fails else f"{len(fails)} ÉCHEC(S)")
sys.exit(1 if fails else 0)
