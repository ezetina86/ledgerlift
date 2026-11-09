#!/usr/bin/env python3
"""
parse_catalog.py
Converts Nippard Exercise Catalog.xlsx → frontend/src/data/exercises.json
Run with: .venv/bin/python scripts/parse_catalog.py
"""

import json
import re
import shutil
import sys
from pathlib import Path

try:
    import openpyxl
except ImportError:
    print("ERROR: openpyxl not found. Run: uv pip install openpyxl --python .venv/bin/python")
    sys.exit(1)

XLSX_PATH = Path(__file__).parent.parent / "Nippard Exercise Catalog.xlsx"
OUT_PATH = Path(__file__).parent.parent / "frontend" / "src" / "data" / "exercises.json"
PUBLIC_EX_DIR = Path(__file__).parent.parent / "frontend" / "public" / "exercises"
PUBLIC_STILL = PUBLIC_EX_DIR / "still"
PUBLIC_CLIP = PUBLIC_EX_DIR / "clip"
OPENGYM_ROOT = Path("/Users/Enrique_Zetina/.gemini/antigravity-cli/brain/9fa08630-d116-43f2-bfd6-2aa2011ed43f/scratch/openGym/catalogue")


def slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_-]+", "-", text)
    return text


def parse_grade(raw) -> str | None:
    if not raw or raw is False:
        return None
    s = str(raw).strip()
    return s if s else None


def classify_movement_family(name: str, group: str) -> str:
    n = name.lower()
    g = group.lower()

    if g in ("adductors", "abductors") or "adduction" in n or "abduction" in n:
        return "adductor-abductor"
    if g == "calves" or "calf" in n:
        return "calf"
    if g == "core" or "plank" in n or "crunch" in n or "sit-up" in n or "leg raise" in n:
        return "core"
    if g in ("forarm", "forearm") or "wrist" in n:
        return "forearm"
    if g == "neck" or "shrug" in n or "neck" in n:
        return "shrug-neck"

    if g == "chest":
        if "fly" in n or "crossover" in n or "pec deck" in n or "press-around" in n:
            return "chest-fly"
        if "incline" in n:
            return "incline-press"
        return "horizontal-press"

    if g == "back":
        if "face-pull" in n or "face pull" in n:
            return "face-pull"
        if "pull-over" in n or "pull-in" in n or "pull-around" in n:
            return "pullover"
        if "pull-up" in n or "pull-down" in n or "chin-up" in n:
            return "vertical-pull"
        return "horizontal-row"

    if g == "shoulder":
        if "press" in n:
            return "vertical-press"
        if "reverse" in n or "facepull" in n or "pull-apart" in n or "rear" in n:
            return "face-pull"
        return "lateral-raise"

    if g == "biceps":
        if "bayesian" in n or "incline" in n or "lying" in n or "behind" in n:
            return "curl-lengthened"
        return "curl-shortened"

    if g == "triceps":
        if "overhead" in n or "katana" in n or "french" in n:
            return "triceps-overhead"
        return "triceps-pressdown"

    if g == "quad":
        if "extension" in n or "reverse nordic" in n or "sissy" in n:
            return "leg-extension"
        if "leg press" in n:
            return "leg-press"
        if "split squat" in n or "lunge" in n:
            return "lunge"
        return "squat"

    if g == "hamstring":
        if "curl" in n or "glut-ham" in n:
            return "leg-curl"
        return "hip-hinge"

    if g == "glute":
        if "thrust" in n or "bridge" in n:
            return "hip-thrust"
        if "lunge" in n or "step up" in n or "split" in n:
            return "lunge"
        if "deadlift" in n or "extension" in n or "pull through" in n:
            return "hip-hinge"
        return "adductor-abductor"

    return "other"


def load_subgroup_columns(wb) -> dict[int, str]:
    ws_mg = wb["MuscleGroups"]
    row_to_label: dict[int, str] = {}
    for r in range(3, 39):
        primary = ws_mg.cell(r, 1).value
        sub = ws_mg.cell(r, 2).value
        if not primary:
            continue
        p_clean = "Forearm" if str(primary).strip() == "Forarm" else str(primary).strip()
        if sub and str(sub).strip():
            row_to_label[r] = f"{p_clean}: {str(sub).strip()}"
        else:
            row_to_label[r] = p_clean

    ws_ex = wb["Muscle Group Exercises"]
    col_to_label: dict[int, str] = {}
    for c in range(11, 47):
        ref = ws_ex.cell(1, c).value
        if ref is not None:
            ref_row = int(float(ref))
            if ref_row in row_to_label:
                col_to_label[c] = row_to_label[ref_row]
    return col_to_label


STOP_WORDS = {"a", "an", "the", "and", "or", "on", "in", "with", "to", "for", "of", "from"}


def normalize_tokens(text: str) -> set[str]:
    text = text.lower()
    text = re.sub(r"t[\s-]?bar", "t-bar", text)
    text = re.sub(r"push[\s-]?ups?", "pushup", text)
    text = re.sub(r"pull[\s-]?ups?", "pullup", text)
    text = re.sub(r"pull[\s-]?downs?", "pulldown", text)
    text = re.sub(r"chin[\s-]?ups?", "chinup", text)
    text = re.sub(r"skull[\s-]?crushers?", "skullcrusher", text)
    text = re.sub(r"face[\s-]?pulls?", "facepull", text)
    text = re.sub(r"pullovers?", "pullover", text)
    text = re.sub(r"kickbacks?", "kickback", text)
    tokens = re.findall(r"[a-z0-9]+", text)
    stemmed = []
    for t in tokens:
        if t in STOP_WORDS:
            continue
        if t.endswith("ies") and len(t) > 4:
            t = t[:-3] + "y"
        elif t.endswith("es") and len(t) > 4 and not t.endswith("press"):
            t = t[:-2]
        elif t.endswith("s") and len(t) > 3 and not t.endswith(("ss", "us", "is")):
            t = t[:-1]
        elif t.endswith("ing") and len(t) > 5:
            t = t[:-3]
        stemmed.append(t)
    return set(stemmed)


def load_opengym_candidates() -> list[dict]:
    ex_dir = OPENGYM_ROOT / "exercises"
    still_dir = OPENGYM_ROOT / "media" / "still"
    clip_dir = OPENGYM_ROOT / "media" / "clip"

    candidates = []
    for p in ex_dir.glob("*.json"):
        try:
            d = json.loads(p.read_text())
            if "name" not in d or "instructions" not in d:
                continue
            eid = d["id"]
            still_path = still_dir / f"{eid}.webp"
            clip_path = clip_dir / f"{eid}.mp4"
            if not still_path.exists() or not clip_path.exists():
                continue

            name_toks = normalize_tokens(d["name"])
            desc_toks = normalize_tokens(d.get("description", ""))
            bp = d.get("bodyPart", "").lower()
            tgt = d.get("target", "").lower()
            secs = set(s.lower() for s in d.get("secondaryMuscles", []))
            eq = d.get("equipment", "").lower()
            try:
                num_id = int(eid)
            except ValueError:
                num_id = 99999

            candidates.append({
                "raw": d,
                "id": eid,
                "num_id": num_id,
                "name_toks": name_toks,
                "desc_toks": desc_toks,
                "bp": bp,
                "tgt": tgt,
                "secs": secs,
                "eq": eq,
                "still_path": still_path,
                "clip_path": clip_path,
            })
        except Exception:
            pass

    return candidates


def muscle_alignment(g: str, c: dict) -> bool:
    bp = c["bp"]
    tgt = c["tgt"]
    secs = c["secs"]

    if g == "chest":
        return bp == "chest" or tgt == "pectorals"
    if g == "back":
        return bp == "back" or tgt in ("lats", "upper back", "traps", "spine")
    if g == "shoulder":
        return bp == "shoulders" or tgt in ("delts", "traps") or "delts" in tgt
    if g == "biceps":
        return tgt == "biceps" or "biceps" in secs or (bp == "upper arms" and "triceps" not in tgt)
    if g == "triceps":
        return tgt == "triceps" or "triceps" in secs or (bp == "upper arms" and "biceps" not in tgt)
    if g == "quad":
        return tgt == "quads" or (bp == "upper legs" and tgt not in ("hamstrings", "glutes", "calves"))
    if g == "hamstring":
        return tgt == "hamstrings" or (bp == "upper legs" and tgt not in ("quads", "glutes"))
    if g == "glute":
        return tgt in ("glutes", "abductors", "adductors") or (bp == "upper legs" and tgt not in ("quads", "hamstrings"))
    if g == "calves":
        return bp == "lower legs" or tgt == "calves"
    if g in ("forarm", "forearm"):
        return bp == "lower arms" or tgt == "forearms"
    if g == "core":
        return bp == "waist" or tgt in ("abs", "obliques", "hip flexors")
    if g == "adductors":
        return tgt in ("adductors", "abductors") or bp == "upper legs"
    if g == "neck":
        return bp in ("neck", "back") or tgt in ("levator scapulae", "spine", "traps")
    return True


def match_opengym(
    name: str,
    primary_group: str,
    equipment: str,
    candidates: list[dict],
) -> dict:
    name_toks = normalize_tokens(name)
    g = primary_group.lower()
    eq = equipment.lower()

    best_score = -99999
    best_cand = None

    for c in candidates:
        overlap = len(name_toks & c["name_toks"])
        score = overlap * 15
        if overlap == len(name_toks):
            score += 25
        elif len(name_toks) > 0:
            score += int((overlap / len(name_toks)) * 20)

        desc_overlap = len(name_toks & c["desc_toks"])
        score += desc_overlap * 2

        if muscle_alignment(g, c):
            score += 20
        else:
            score -= 60

        c_eq = c["eq"]
        if eq in ("barbell", "dumbbell", "cable") and eq in c_eq:
            score += 8
        elif eq == "machine" and any(k in c_eq for k in ("machine", "lever")):
            score += 8
        elif eq in ("bodyweight", "none") and any(k in c_eq for k in ("body weight", "weighted", "assisted")):
            score += 5

        # Prefer IDs 0001–3776
        if c["num_id"] <= 3776:
            score += 5

        if score > best_score:
            best_score = score
            best_cand = c

    return best_cand


def main():
    wb = openpyxl.load_workbook(XLSX_PATH, data_only=True)
    ws = wb["Muscle Group Exercises"]
    col_to_subgroup = load_subgroup_columns(wb)

    print("Loading openGym candidates...")
    candidates = load_opengym_candidates()
    print(f"Loaded {len(candidates)} valid openGym candidates with media.")

    PUBLIC_STILL.mkdir(parents=True, exist_ok=True)
    PUBLIC_CLIP.mkdir(parents=True, exist_ok=True)

    exercises = []
    seen_ids: set[str] = set()

    for r in range(3, ws.max_row + 1):
        name = ws.cell(r, 1).value
        if not name:
            continue

        primary_group = ws.cell(r, 2).value or "Unknown"
        equipment = ws.cell(r, 3).value or "Bodyweight"
        nippard_tier = bool(ws.cell(r, 5).value)
        tier_grade = parse_grade(ws.cell(r, 6).value)
        muscle_ladder = bool(ws.cell(r, 7).value)
        jeff_fav = bool(ws.cell(r, 8).value)
        demo_link = ws.cell(r, 10).value if ws.cell(r, 10).value else None

        subgroups = [
            label
            for col_idx, label in col_to_subgroup.items()
            if ws.cell(r, col_idx).value is True
        ]
        if not subgroups and primary_group != "Unknown":
            subgroups = ["Forearm" if primary_group == "Forarm" else primary_group]

        movement_family = classify_movement_family(name, primary_group)

        base_id = slugify(name)
        uid = base_id
        counter = 2
        while uid in seen_ids:
            uid = f"{base_id}-{counter}"
            counter += 1
        seen_ids.add(uid)

        matched = match_opengym(name, primary_group, equipment, candidates)
        instructions = matched["raw"].get("instructions", []) if matched else []

        dest_still = PUBLIC_STILL / f"{uid}.webp"
        dest_clip = PUBLIC_CLIP / f"{uid}.mp4"

        if matched:
            shutil.copyfile(matched["still_path"], dest_still)
            shutil.copyfile(matched["clip_path"], dest_clip)

        exercises.append({
            "id": uid,
            "name": name,
            "primaryMuscleGroup": primary_group,
            "subgroups": subgroups,
            "movementFamily": movement_family,
            "equipment": equipment,
            "nippardTierList": nippard_tier,
            "tierListGrade": tier_grade,
            "muscleLadder": muscle_ladder,
            "jeffSubgroupFav": jeff_fav,
            "demonstrationLink": demo_link,
            "imageUrl": f"/exercises/still/{uid}.webp",
            "videoUrl": f"/exercises/clip/{uid}.mp4",
            "instructions": instructions,
        })

    exercises.sort(key=lambda e: (e["primaryMuscleGroup"], e["name"]))

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(exercises, indent=2, ensure_ascii=False))
    print(f"Exported {len(exercises)} exercises with subgroups, media & instructions to {OUT_PATH}")


if __name__ == "__main__":
    main()
