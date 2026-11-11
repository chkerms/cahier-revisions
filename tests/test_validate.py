"""Tests du validateur : les exemples passent, les erreurs typiques d'un LLM sont rejetées.
Usage : python3 -I tests/test_validate.py (depuis la racine du dépôt)"""
import copy, json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "outils"))
from validate import validate

EX = ROOT / "exemples"
ok = True
for f in sorted(EX.glob("*.json")):
    e, w = validate(json.loads(f.read_text(encoding="utf-8")))
    print(("OK   " if not e else "KO   ") + f.name, *e, sep="\n     "); ok &= not e

G = json.loads((EX / "ce1_grammaire_nom.json").read_text(encoding="utf-8"))
M = json.loads((EX / "ce2_maths_fractions.json").read_text(encoding="utf-8"))
P = json.loads((EX / "ce1_poesie.json").read_text(encoding="utf-8"))
def blk(d, i): return d["lecon"]["blocs"][i]
MUT = [
 # structure (schéma)
 (G, "3 distracteurs", lambda d: d["quiz"][0]["distracteurs"].append("la")),
 (G, "4 questions", lambda d: d["quiz"].pop()),
 (G, "carte sans ref", lambda d: d["cartes"][0].pop("ref")),
 (G, "type de bloc inventé", lambda d: d["lecon"]["blocs"].append({"id": "b9", "type": "video", "source": "p1"})),
 (G, "champ parasite dans un bloc", lambda d: blk(d, 1).update(couleur="#f00")),
 (G, "couleur hors palette", lambda d: d["styles"]["c1"].update(couleur="#ff0000")),
 (G, "étape quiz sans données", lambda d: d.pop("quiz")),
 (G, "9 cartes hors liste à mémoriser", lambda d: d["cartes"].extend(copy.deepcopy(d["cartes"][:4]))),
 (G, "paragraphe de 400 caractères", lambda d: d["lecon"]["blocs"].append({"id": "b9", "type": "paragraphe", "source": "p1", "texte": "a" * 400})),
 (P, "alerte bloquante + statut pret", lambda d: d["meta"].update(statut="pret")),
 # règles métier (validate.py)
 (G, "distracteur inventé (hors leçon)", lambda d: d["quiz"][0]["distracteurs"].__setitem__(0, "une action")),
 (G, "réponse = distracteur", lambda d: d["quiz"][1]["distracteurs"].__setitem__(0, "une")),
 (G, "ref vers bloc inexistant", lambda d: d["cartes"][0]["ref"].append("b42")),
 (G, "indice vers bloc inexistant", lambda d: d["quiz"][0]["indice"].update(bloc="b42")),
 (G, "style non déclaré", lambda d: blk(d, 1).update(texte="Un {c5:nom} sert à nommer.")),
 (G, "balisage imbriqué", lambda d: blk(d, 1).update(texte="Un {c1:{mc:nom}} sert.")),
 (G, "accolade orpheline", lambda d: blk(d, 1).update(texte="Un {c1:nom sert.")),
 (G, "id en double", lambda d: d["cartes"][1].update(id="k1")),
 (G, "source de page inconnue", lambda d: blk(d, 1).update(source="p7")),
 (M, "fraction écrite en ligne", lambda d: blk(d, 3)["items"].__setitem__(0, "1/2 se lit un demi")),
 (M, "fraction en ligne dans une consigne de calcul", lambda d: d["calculs"][0].update(consigne="Combien font 1/2 + 1/2 ?")),
 (M, "point décimal", lambda d: blk(d, 1).update(texte="On prend 2.5 parts.")),
 (M, "étoile pour multiplier", lambda d: blk(d, 1).update(texte="3 * 4 parts.")),
 (M, "opération posée fausse", lambda d: blk(d, 4).update(resultat="482")),
 (M, "image non déclarée", lambda d: blk(d, 2).update(image="img9")),
 (M, "SVG avec script", lambda d: d["images"][0].update(svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 9"><script>x</script></svg>')),
 (M, "SVG sans viewBox", lambda d: d["images"][0].update(svg='<svg xmlns="http://www.w3.org/2000/svg" width="9"><circle r="3"/></svg>')),
 (M, "SVG qui charge une image externe", lambda d: d["images"][0].update(svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 9"><image href="http://x/y.png"/></svg>')),
 (M, "calcul faux", lambda d: d["calculs"][0].update(reponse="462")),
 (M, "expression non autorisée", lambda d: d["calculs"][0].update(expression="2 ** 8")),
 (M, "étape calculs sans données", lambda d: d.pop("calculs")),
 (M, "leçon sans date", lambda d: d["meta"].pop("date")),
 (M, "id de leçon invalide", lambda d: d["meta"].update(id="Les Fractions!")),
 (M, "fraction /0", lambda d: blk(d, 3)["items"].__setitem__(0, "{frac:1/0} se lit")),
 (M, "question sur un schéma sans image", lambda d: d["quiz"][2].pop("image")),
 (M, "image de question non déclarée", lambda d: d["quiz"][2].update(image="img7")),
 (P, "poème sans texte ni saisie parent", lambda d: d["lecon"]["blocs"][0].pop("strophes")),
 (P, "saisie parent avec strophes", lambda d: d["lecon"]["blocs"][0].update(saisie_parent=True)),
 (P, "récitation vers un bloc non poème", lambda d: (d["lecon"]["blocs"].append({"id": "b2", "type": "paragraphe", "source": "p1", "texte": "x"}), d["recitation"].update(bloc="b2"))),
]
# cas normal en v2 : une leçon rédigée par Claude n'a pas de liste d'alertes
sans_alertes = copy.deepcopy(G); sans_alertes.pop("alertes_lecture", None); sans_alertes["meta"].pop("sources", None)
[b.pop("source", None) for b in sans_alertes["lecon"]["blocs"]]
e, _ = validate(sans_alertes); ok &= not e
print(("OK   " if not e else "KO   ") + "leçon sans alertes ni sources (cas normal en v2)", *e, sep="\n     ")

# poème tapé par le parent sur la tablette : pas de strophes dans la leçon
saisie = copy.deepcopy(P); saisie["lecon"]["blocs"][0].pop("strophes"); saisie["lecon"]["blocs"][0]["saisie_parent"] = True
e, _ = validate(saisie); ok &= not e
print(("OK   " if not e else "KO   ") + "poème à saisir par le parent", *e, sep="\n     ")

print("\nMutations (doivent être rejetées) :")
for base, name, m in MUT:
    d = copy.deepcopy(base); m(d); e, _ = validate(d); r = bool(e); ok &= r
    print(("rejeté    " if r else "ACCEPTÉ ! ") + name + ("" if not e else f"  → {e[0][:90]}"))
print("\nRÉSULTAT :", "PASS" if ok else "FAIL"); sys.exit(0 if ok else 1)
