#!/usr/bin/env python3
"""
parse_catalog.py
Converts Nippard Exercise Catalog.xlsx → frontend/src/data/exercises.json
Run with: ../.venv/bin/python parse_catalog.py
"""

import json
import re
import sys
from pathlib import Path

try:
    import openpyxl
except ImportError:
    print("ERROR: openpyxl not found. Run: uv pip install openpyxl --python ../.venv/bin/python")
    sys.exit(1)

XLSX_PATH = Path(__file__).parent.parent / "Nippard Exercise Catalog.xlsx"
OUT_PATH = Path(__file__).parent.parent / "frontend" / "src" / "data" / "exercises.json"


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


def main():
    wb = openpyxl.load_workbook(XLSX_PATH)
    ws = wb["Muscle Group Exercises"]

    exercises = []
    seen_ids: set[str] = set()

    for row in ws.iter_rows(min_row=3, values_only=True):
        name = row[0]
        if not name:
            continue

        primary_group = row[1] or "Unknown"
        equipment = row[2] or "Bodyweight"
        nippard_tier = bool(row[4])
        tier_grade = parse_grade(row[5])
        muscle_ladder = bool(row[6])
        jeff_fav = bool(row[7])
        demo_link = row[9] if row[9] else None

        # Generate unique slug ID
        base_id = slugify(name)
        uid = base_id
        counter = 2
        while uid in seen_ids:
            uid = f"{base_id}-{counter}"
            counter += 1
        seen_ids.add(uid)

        exercises.append({
            "id": uid,
            "name": name,
            "primaryMuscleGroup": primary_group,
            "equipment": equipment,
            "nippardTierList": nippard_tier,
            "tierListGrade": tier_grade,
            "muscleLadder": muscle_ladder,
            "jeffSubgroupFav": jeff_fav,
            "demonstrationLink": demo_link,
        })

    # Sort: by muscle group then name
    exercises.sort(key=lambda e: (e["primaryMuscleGroup"], e["name"]))

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(exercises, indent=2, ensure_ascii=False))

    # Summary
    by_group: dict[str, int] = {}
    for e in exercises:
        g = e["primaryMuscleGroup"]
        by_group[g] = by_group.get(g, 0) + 1

    print(f"Exported {len(exercises)} exercises to {OUT_PATH.relative_to(Path.cwd())}")
    print()
    for g, count in sorted(by_group.items()):
        tier_count = sum(1 for e in exercises if e["primaryMuscleGroup"] == g and e["nippardTierList"])
        print(f"  {g:<14} {count:>3} exercises  ({tier_count} on tier list)")


if __name__ == "__main__":
    main()
