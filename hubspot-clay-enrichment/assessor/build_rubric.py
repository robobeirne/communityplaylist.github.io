"""Builds rubric.json: the marking scheme the assessor uses, one entry per question.
Source: data3.json (assessment + Workbench merge). Option values follow HubSpot's slug rule, so ticks can be written as-is."""
import json, re, sys
D = json.load(open(sys.argv[1] if len(sys.argv) > 1 else "data3.json"))
slug = lambda s: re.sub(r"[^a-z0-9]+", "_", s.lower())[:80].strip("_")
LV = ["not_discussed", "touched_on", "answered", "confirmed"]
WHO = D["who"]
# Plain role → who to listen to. Titles per industry come from the Workbench personas.
ROLES = {k: {"label": WHO[k], **({"titles": D["personas"][k]["titles"]} if k in D["personas"] else {})} for k in WHO if k not in ("crm",)}
ROLE_KEYS = {"Exec": "exec", "Group EHS lead": "sponsor", "Site EHS manager": "operator", "Ops leader": "ops", "IT/OT": "it",
             "Camera owner": "security", "Finance/risk": "finance", "HR/works council": "people"}
qs = []
for q in D["questions"]:
    sid = re.sub(r"[^a-z0-9]+", "_", q["id"])
    details = []
    for c in q["capture"]:
        ind = (re.match(r"^\[(L|M|R)\]", c) or [None, None])[1]
        # One option per checklist item, as in the HubSpot properties (items can contain a semicolon).
        # "Number of people engaged" is counted from the deal's contacts, so it isn't ticked.
        if c.startswith("Number of people engaged"):
            continue
        details.append({"value": slug(c.strip()), "label": c.strip(), **({"industry": ind} if ind else {})})
    owners = [ROLE_KEYS[o] for o in (q.get("owners") or []) if o in ROLE_KEYS] or q["who"]
    qs.append({
        "id": q["id"], "topic": q["section"], "question": q["title"], "why": q["why"],
        "industry": q["industry"], "verbatim_required": q["verbatim"], "key": q["weight"] == 3,
        "ask": q["who"], "must_come_from": [o for o in owners if o in ROLES],
        "levels": {LV[i]: t for i, t in enumerate(q.get("levels") or [])},
        **({"level_names": dict(zip(LV, q["levelNames"]))} if q.get("levelNames") else {}),
        "levels_apply_to_area": q.get("area") if q.get("levelsShared") else None,
        "test": (q.get("def") or {}).get("test", ""),
        "counts": (q.get("def") or {}).get("is", []),
        "does_not_count": [x[0] + (f" ({x[1]})" if x[1] else "") for x in (q.get("def") or {}).get("isNot", [])],
        "confused_with": (q.get("def") or {}).get("confused", ""),
        "traps": (q.get("def") or {}).get("traps", ""),
        "listen_for": q["listen"], "red_flag": q["red"],
        "details": details,
        "due_by_stage": q["dueBy"],
        "recheck": q["stale"][1] if q.get("stale") else None,
        "hubspot": {k: f"da_{sid}_{k}" for k in ("status", "notes", "source", "details")},
    })
out = {"version": "2026-10-07", "levels": LV, "roles": ROLES, "questions": qs}
json.dump(out, open(sys.argv[2] if len(sys.argv) > 2 else "ai/rubric.json", "w"), ensure_ascii=False, indent=1)
print(len(qs), "questions. Now run: node assessor/sync_details.mjs")
