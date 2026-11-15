"""Test de bout en bout de la rubrique « Problèmes » (accueil), au format tablette Android (Chrome headless).

Usage : python3 tests/test_rubrique_problemes.py http://localhost:8765/ MOT_DE_PASSE
Prérequis : une copie jetable avec les 3 leçons d'exemple publiées et une personnalisation d'essai :
  python3 -I outils/perso.py tests/fixtures/perso_essai.json
Vérifie : raccourci sur l'accueil, séance de 5 problèmes variés (dont 1 ou 2 à deux étapes), calcul à 3 termes,
personnalisation déchiffrée et utilisée, phrase réponse, pas de progression de leçon, bilan, réglages parent.
"""
import json
import re
import sys

from playwright.sync_api import sync_playwright

URL, PW = sys.argv[1], sys.argv[2]
PERSO = json.load(open(__file__.rsplit("/", 1)[0] + "/fixtures/perso_essai.json", encoding="utf-8"))
fails = []


def check(cond, msg):
    print(("  ok   " if cond else "  FAIL ") + msg)
    if not cond:
        fails.append(msg)


def calcule(ligne):
    """Résultat de « 199 + 16 + 246 = » ou « 1 000 ÷ 4 = », recalculé à partir de l'écran."""
    expr = ligne.split("=")[0].replace(" ", " ")
    nombres = [int(x.replace(" ", "")) for x in re.findall(r"\d{1,3}(?: \d{3})+|\d+", expr)]
    ops = re.findall(r"[+−×÷]", expr)
    r = nombres[0]
    for op, x in zip(ops, nombres[1:]):
        r = {"+": r + x, "−": r - x, "×": r * x, "÷": r // x}[op]
    return r


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

    def zone_parent():
        racine()
        b = p.locator("#btn-parent").bounding_box()
        p.mouse.move(b["x"] + 10, b["y"] + 10); p.mouse.down(); p.wait_for_timeout(2100); p.mouse.up()
        p.wait_for_selector("#carte-problemes")

    def taper(n):
        for ch in str(n):
            p.click(f".pad .padkey[data-k='{ch}']")
        p.click("#btn-valider")

    def jouer_seance():
        """Joue les 5 problèmes ; renvoie les énoncés, le nombre de problèmes à deux étapes, les calculs vus."""
        enonces, deux, calculs = [], 0, []
        for i in range(5):
            p.wait_for_function(f"document.querySelector('.counter') && document.querySelector('.counter').textContent.indexOf('Problème {i + 1} sur 5') === 0")
            enonces.append(p.inner_text(".q.enonce"))
            if p.locator(".schema-choix").count():
                p.click(".schema-choix[data-bon='1']")
            etapes = 0
            while not p.locator(".preponse").count() and etapes < 3:
                etapes += 1
                if p.locator(".pquestion").count():
                    deux += etapes == 1
                for op in ["+", "−", "×", "÷"]:  # l'opération : essais dans l'ordre, l'appli corrige après 2 erreurs
                    if p.locator(".pcalcul").count():
                        break
                    b = p.locator(f".opkey[data-op='{op}']")
                    if b.is_enabled() and "tried" not in (b.get_attribute("class") or ""):
                        b.click()
                ligne = p.inner_text(".pcalcul")
                calculs.append(ligne)
                avant = p.locator(".pfait").count()
                taper(calcule(ligne))
                p.wait_for_function(f"document.querySelector('.preponse') || document.querySelectorAll('.pfait').length > {avant}")
            check(p.locator(".preponse .phrase").count() == 1, f"problème {i + 1} : phrase réponse affichée")
            p.click("#next-btn")
        check(re.search(r"\d+ problèmes? réussis? du premier coup sur 5", p.inner_text(".czone")), "fin de séance : bilan en problèmes")
        p.click("#next-btn"); p.wait_for_selector("#fin")
        return enonces, deux, calculs

    p.goto(URL); p.wait_for_selector("#mdp")
    p.fill("#mdp", PW); p.click("#btn-ouvrir"); p.wait_for_selector(".theme-tile", timeout=20000)

    print("== Rubrique sur l'accueil et personnalisation")
    check(p.locator("#btn-problemes").count() == 1, "raccourci « Problèmes » sur l'accueil")
    zone_parent()
    etat = p.inner_text("#perso-etat")
    check("Personnalisation chargée" in etat and "2 copains" in etat and "la maîtresse" in etat and "2 énoncés personnels" in etat, f"personnalisation déchiffrée ({etat})")
    check(p.get_attribute("[data-prob-limite='999']", "aria-pressed") == "true" and p.get_attribute("[data-prob-division='0']", "aria-pressed") == "true",
          "par défaut : nombres jusqu'à 1 000, pas de division")
    p.click("#next-btn"); p.wait_for_selector(".theme-tile")

    print("== Séance de 5 problèmes")
    p.click("#btn-problemes"); p.wait_for_selector(".q.enonce")
    g = p.evaluate("window.GENERATEURS.G.perso")
    check(g and g.get("maitresse") == PERSO["maitresse"] and g.get("enfant") == PERSO["enfant"], f"personnalisation donnée aux générateurs ({g})")
    enonces, deux, calculs = jouer_seance()
    check(1 <= deux <= 2, f"1 ou 2 problèmes à deux étapes ({deux})")
    defaut = enonces + calculs
    tout = " ".join(enonces)
    noms = [PERSO["enfant"][0], PERSO["maitresse"], PERSO["doudou"][0]] + [a[0] for a in PERSO["amis"]] + [x[0] for x in PERSO["parents"]]
    check(not re.search(r"undefined|NaN|null", tout), "énoncés sans trou")
    p.wait_for_selector("#fin")
    check(p.evaluate("Object.keys(localStorage).filter(k => k.startsWith('prog:') && k.endsWith(':problemes')).length") == 0, "pas de progression de leçon pour la rubrique")
    print("   énoncés :", *enonces, sep="\n     ")

    print("== Par défaut, sur 3 séances : pas de division, nombres ≤ 999")
    for k in range(3):
        p.click("#fin button:has-text('Recommencer')"); p.wait_for_selector(".q.enonce")
        e, d, c = jouer_seance()
        defaut += e + c
    grands = [int(x.replace(" ", "").replace("\u00a0", "")) for t in defaut for x in re.findall(r"\d{1,3}(?:[ \u00a0]\d{3})+|\d+", t)]
    check(max(grands) <= 999, f"nombres ≤ 999 (max {max(grands)})")
    check(not any("÷" in c for c in defaut), "aucune division")
    check(any("prunes" in t or "sacs de" in t for t in defaut), "énoncés personnels tirés")

    print("== Division et nombres jusqu'à 10 000 activés : variété et personnalisation sur 4 séances")
    zone_parent(); p.click("[data-prob-division='1']"); p.click("[data-prob-limite='9999']")
    p.click("#next-btn"); p.wait_for_selector(".theme-tile")
    p.click("#btn-problemes"); p.wait_for_selector(".q.enonce"); jouer_seance()
    calculs = []
    vus_noms, cas = set(), set()
    for k in range(4):
        p.click("#fin button:has-text('Recommencer')"); p.wait_for_selector(".q.enonce")
        e, d, c = jouer_seance()
        tout = " ".join(e)
        vus_noms |= {n for n in noms if n in tout}
        calculs += c
        p.wait_for_selector("#fin")
    check(len(vus_noms) >= 3, f"personnalisation utilisée dans les énoncés ({sorted(vus_noms)})")
    ops = {o for c in calculs for o in re.findall(r"[+−×÷]", c.split("=")[0])}
    check(ops == {"+", "−", "×", "÷"}, f"les 4 opérations rencontrées ({sorted(ops)})")

    print("== Bilan")
    zone_parent(); p.wait_for_function("window.__bilan !== undefined")
    b = p.evaluate("window.__bilan")
    check("[problemes]" in b and re.search(r"problèmes \d+/45 sans erreur", b), "bilan : 45 problèmes de la rubrique comptés")

    print("== Réglage parent : rubrique masquée")
    p.click("#btn-prob-affiche")
    p.click("#next-btn"); p.wait_for_selector(".theme-tile")
    check(p.locator("#btn-problemes").count() == 0, "rubrique masquée par le parent")

    check(not errs, f"aucune erreur JS/console {errs}")
    br.close()

print("\nRÉSULTAT :", "PASS" if not fails else f"{len(fails)} ÉCHEC(S)")
sys.exit(1 if fails else 0)
