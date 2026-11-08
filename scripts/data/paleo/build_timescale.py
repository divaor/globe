#!/usr/bin/env python3
"""
Write public/data/paleo/timescale.json: the geologic time scale (1000 Ma -> today, and the
older eons, eras and periods after them) and
a short list of well-established events, in English and Spanish, for the time slider.

Boundary ages: ICS International Chronostratigraphic Chart v2023/09 (GTS2020-based).
Colours: official CCGM/CGMW colours of the ICS chart.

  python3 -I scripts/data/paleo/build_timescale.py --out public/data/paleo
"""
import argparse
import json
import pathlib

# rank, English, Spanish, start (Ma, older), end (Ma, younger), ICS colour
UNITS = [
    ("eon", "Proterozoic", "Proterozoico", 2500, 538.8, "#F73563"),
    ("eon", "Phanerozoic", "Fanerozoico", 538.8, 0, "#9AD9DD"),

    ("era", "Neoproterozoic", "Neoproterozoico", 1000, 538.8, "#FEB342"),
    ("era", "Paleozoic", "Paleozoico", 538.8, 251.902, "#99C08D"),
    ("era", "Mesozoic", "Mesozoico", 251.902, 66.0, "#67C5CA"),
    ("era", "Cenozoic", "Cenozoico", 66.0, 0, "#F2F91D"),

    ("period", "Tonian", "Tónico", 1000, 720, "#FEBF4E"),
    ("period", "Cryogenian", "Criogénico", 720, 635, "#FECC5C"),
    ("period", "Ediacaran", "Ediacárico", 635, 538.8, "#FED96A"),
    ("period", "Cambrian", "Cámbrico", 538.8, 486.85, "#7FA056"),
    ("period", "Ordovician", "Ordovícico", 486.85, 443.1, "#009270"),
    ("period", "Silurian", "Silúrico", 443.1, 419.62, "#B3E1B6"),
    ("period", "Devonian", "Devónico", 419.62, 358.86, "#CB8C37"),
    ("period", "Carboniferous", "Carbonífero", 358.86, 298.9, "#67A599"),
    ("period", "Permian", "Pérmico", 298.9, 251.902, "#F04028"),
    ("period", "Triassic", "Triásico", 251.902, 201.4, "#812B92"),
    ("period", "Jurassic", "Jurásico", 201.4, 143.1, "#34B2C9"),
    ("period", "Cretaceous", "Cretácico", 143.1, 66.0, "#7FC64E"),
    ("period", "Paleogene", "Paleógeno", 66.0, 23.03, "#FD9A52"),
    ("period", "Neogene", "Neógeno", 23.03, 2.58, "#FFE619"),
    ("period", "Quaternary", "Cuaternario", 2.58, 0, "#F9F97F"),

    ("epoch", "Paleocene", "Paleoceno", 66.0, 56.0, "#FDA75F"),
    ("epoch", "Eocene", "Eoceno", 56.0, 33.9, "#FDB46C"),
    ("epoch", "Oligocene", "Oligoceno", 33.9, 23.03, "#FDC07A"),
    ("epoch", "Miocene", "Mioceno", 23.03, 5.333, "#FFFF00"),
    ("epoch", "Pliocene", "Plioceno", 5.333, 2.58, "#FFFF99"),
    ("epoch", "Pleistocene", "Pleistoceno", 2.58, 0.0117, "#FFF2AE"),
    ("epoch", "Holocene", "Holoceno", 0.0117, 0, "#FEF2E0"),

    # Older than the plate model (for the Life through time stories): listed last, so a search
    # from the top finds the units above first at the 1000 Ma boundary.
    ("eon", "Hadean", "Hádico", 4567, 4031, "#AE027E"),
    ("eon", "Archean", "Arcaico", 4031, 2500, "#F0047F"),
    ("era", "Eoarchean", "Eoarcaico", 4031, 3600, "#DA037F"),
    ("era", "Paleoarchean", "Paleoarcaico", 3600, 3200, "#F444A9"),
    ("era", "Mesoarchean", "Mesoarcaico", 3200, 2800, "#F768A9"),
    ("era", "Neoarchean", "Neoarcaico", 2800, 2500, "#F99BC1"),
    ("era", "Paleoproterozoic", "Paleoproterozoico", 2500, 1600, "#F74370"),
    ("era", "Mesoproterozoic", "Mesoproterozoico", 1600, 1000, "#FDB462"),
    ("period", "Siderian", "Sideriense", 2500, 2300, "#F74F7C"),
    ("period", "Rhyacian", "Riácico", 2300, 2050, "#F75B89"),
    ("period", "Orosirian", "Orosírico", 2050, 1800, "#F76898"),
    ("period", "Statherian", "Estatérico", 1800, 1600, "#F875A7"),
    ("period", "Calymmian", "Calímmico", 1600, 1400, "#FDC07A"),
    ("period", "Ectasian", "Ectásico", 1400, 1200, "#F3CC8A"),
    ("period", "Stenian", "Esténico", 1200, 1000, "#FED99A"),
]

# (Ma, English, Spanish): short, widely accepted milestones (ages approximate).
EVENTS = [
    (1000, "Supercontinent Rodinia unites most continents",
     "El supercontinente Rodinia reúne casi todos los continentes"),
    (750, "Rodinia begins to break apart", "Rodinia empieza a fragmentarse"),
    (717, "Sturtian glaciation: first “Snowball Earth”",
     "Glaciación sturtiana: primera «Tierra bola de nieve»"),
    (650, "Marinoan glaciation: second Snowball Earth",
     "Glaciación marinoana: segunda Tierra bola de nieve"),
    (575, "Ediacaran biota: first large complex organisms",
     "Biota de Ediacara: primeros organismos complejos grandes"),
    (550, "Gondwana assembles in the south", "Gondwana se ensambla en el hemisferio sur"),
    (538.8, "Cambrian explosion of animal life", "Explosión cámbrica de la vida animal"),
    (470, "First land plants", "Primeras plantas terrestres"),
    (445, "End-Ordovician mass extinction", "Extinción masiva del final del Ordovícico"),
    (420, "Laurentia and Baltica collide (Caledonian mountains)",
     "Laurentia y Báltica chocan (cordillera caledoniana)"),
    (372, "Late Devonian mass extinction", "Extinción masiva del Devónico tardío"),
    (335, "Pangea supercontinent assembled", "Se forma el supercontinente Pangea"),
    (251.9, "Permian–Triassic extinction: ~90% of marine species lost",
     "Extinción del Pérmico-Triásico: desaparece ~90 % de las especies marinas"),
    (230, "First dinosaurs", "Primeros dinosaurios"),
    (225, "First mammals", "Primeros mamíferos"),
    (201, "Pangea starts to break apart; end-Triassic extinction",
     "Pangea empieza a fragmentarse; extinción del final del Triásico"),
    (180, "Central Atlantic Ocean opens", "Se abre el océano Atlántico central"),
    (150, "First birds (Archaeopteryx)", "Primeras aves (Archaeopteryx)"),
    (130, "South Atlantic opens: Africa and South America separate",
     "Se abre el Atlántico Sur: África y Sudamérica se separan"),
    (88, "India breaks away from Madagascar", "La India se separa de Madagascar"),
    (66, "Asteroid impact (K–Pg): non-avian dinosaurs die out",
     "Impacto de asteroide (K-Pg): se extinguen los dinosaurios no avianos"),
    (50, "India collides with Asia; the Himalayas begin to rise",
     "La India choca con Asia; empiezan a alzarse los Himalayas"),
    (34, "Antarctic ice sheet forms", "Se forma el casquete de hielo antártico"),
    (3, "Isthmus of Panama joins the Americas", "El istmo de Panamá une las Américas"),
    (0.3, "Homo sapiens appears in Africa", "Aparece el Homo sapiens en África"),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    data = {
        "source": "ICS International Chronostratigraphic Chart v2023/09 (ages in Ma; colours CCGM/CGMW)",
        "units": [dict(rank=r, name_en=en, name_es=es, start=s, end=e, color=c)
                  for r, en, es, s, e, c in UNITS],
        "events": [dict(ma=ma, en=en, es=es) for ma, en, es in EVENTS],
    }
    for u in data["units"]:
        assert u["start"] > u["end"], u
    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    def rows(items):
        return ",\n".join("  " + json.dumps(x, ensure_ascii=False, separators=(",", ":")) for x in items)

    text = ("{\n" + f' "source":{json.dumps(data["source"], ensure_ascii=False)},\n'
            + ' "units":[\n' + rows(data["units"]) + "\n ],\n"
            + ' "events":[\n' + rows(data["events"]) + "\n ]\n}\n")
    assert json.loads(text) == data
    (out / "timescale.json").write_text(text, encoding="utf-8")
    print(f"timescale.json: {len(data['units'])} units, {len(data['events'])} events")


if __name__ == "__main__":
    main()
