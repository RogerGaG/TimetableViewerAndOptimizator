#!/usr/bin/env python3
import collections
import datetime
import json
import os

BASE_DIR = os.path.dirname(os.path.dirname(__file__))
RAW_DIR = os.path.join(BASE_DIR, "data", "raw")
OUT_DIR = os.path.join(BASE_DIR, "data", "processed")
PUBLIC_CATALOG_PATH = os.path.join(BASE_DIR, "public", "catalog.json")

DAY_NAMES = {1: "Monday", 2: "Tuesday", 3: "Wednesday", 4: "Thursday", 5: "Friday"}
CLASS_TYPE_MAP = {"T": "Lecture", "P": "Problem Session", "L": "Lab", "N": "No fixed schedule"}
REQ_TYPE_MAP = {
    "P": "Prerequisite",
    "C": "Corequisite",
    "X": "Pre-corequisite",
    "OREQU": "Or-requisite",
    "I": "Sequence/linked requirement",
}
LANG_MAP = {
    "Castellano": "Spanish",
    "CatalÃ¡n": "Catalan",
    "InglÃ©s": "English",
    "Per determinar": "To be decided",
}


def normalize_language(lang):
    if not lang:
        return "Unknown"
    if isinstance(lang, list):
        return [LANG_MAP.get(x, x) for x in lang]
    return LANG_MAP.get(lang, lang)


def translate_name(name):
    return name


def load_json(filename):
    with open(os.path.join(RAW_DIR, filename), "r", encoding="utf-8") as f:
        return json.load(f)


def existing_subject_files():
    filenames = []
    for filename in sorted(os.listdir(RAW_DIR)):
        if filename.startswith("InfoAssignatures") and filename.endswith(".json"):
            filenames.append(filename)
    return filenames


def existing_class_files():
    filenames = []
    for filename in sorted(os.listdir(RAW_DIR)):
        if filename.startswith("InfoClasses") and filename.endswith(".json"):
            filenames.append(filename)
    return filenames


def load_all_subjects():
    subjects = []
    seen_ids = set()
    for filename in existing_subject_files():
        payload = load_json(filename)
        for subject in payload.get("results", []):
            subject_id = subject.get("id") or subject.get("sigles")
            if subject_id in seen_ids:
                continue
            seen_ids.add(subject_id)
            subjects.append(subject)
    return subjects


def load_all_classes():
    combined = {"comentaris": [], "results": []}
    for filename in existing_class_files():
        payload = load_json(filename)
        combined["comentaris"].extend(payload.get("comentaris", []))
        combined["results"].extend(payload.get("results", []))
    return combined


def build_catalog():
    subjects = load_all_subjects()
    classes_raw = load_all_classes()
    requirements_raw = load_json("InfoRequisits.json")

    with open(os.path.join(RAW_DIR, "InfoExtra.txt"), "r", encoding="utf-8") as f:
        extra_text = f.read().strip()

    grau_codes = set()
    courses = []

    for subject in subjects:
        if "GRAU" not in subject.get("plans", []):
            continue

        code = subject["sigles"]
        grau_codes.add(code)
        obligation_entries = [o for o in subject.get("obligatorietats", []) if o.get("pla") == "GRAU"]

        courses.append({
            "id": subject.get("id", code),
            "code": code,
            "upcCode": subject.get("codi_upc"),
            "nameOriginal": subject.get("nom", ""),
            "nameEnglish": translate_name(subject.get("nom", "")),
            "credits": subject.get("credits"),
            "semester": subject.get("semestre"),
            "quarters": subject.get("quadrimestres", []),
            "languagesByQuarter": {k: normalize_language(v) for k, v in subject.get("lang", {}).items()},
            "active": subject.get("vigent") == "S",
            "department": subject.get("departament", ""),
            "publicGuideUrl": subject.get("guia_docent_url_publica", ""),
            "externalGuideUrl": subject.get("guia_docent_externa", ""),
            "plans": subject.get("plans", []),
            "obligations": [{
                "typeCode": o.get("codi_oblig", ""),
                "specializationCode": o.get("codi_especialitat", ""),
                "specializationNameOriginal": o.get("nom_especialitat", ""),
                "specializationNameEnglish": o.get("nom_especialitat", ""),
            } for o in obligation_entries],
        })

    comments = []
    for comment in classes_raw.get("comentaris", []):
        code = comment.get("codi_assig")
        if code in grau_codes:
            comments.append({
                "courseCode": code,
                "textOriginal": comment.get("comentari", ""),
                "textEnglish": comment.get("comentari", ""),
            })

    sessions = []
    for row in classes_raw.get("results", []):
        code = row.get("codi_assig")
        if code not in grau_codes:
            continue

        day = row.get("dia_setmana")
        start = row.get("inici", "00:00")
        duration = row.get("durada", 0)

        if day in DAY_NAMES and start != "00:00":
            hour, minute = map(int, start.split(":"))
            end_minutes = hour * 60 + minute + int(float(duration) * 60)
            end = f"{end_minutes // 60:02d}:{end_minutes % 60:02d}"
        else:
            end = None

        sessions.append({
            "courseCode": code,
            "group": str(row.get("grup", "")),
            "dayOfWeek": day,
            "dayName": DAY_NAMES.get(day, "Unscheduled"),
            "startTime": start,
            "durationHours": duration,
            "endTime": end,
            "classTypeCode": row.get("tipus", ""),
            "classType": CLASS_TYPE_MAP.get(row.get("tipus", ""), row.get("tipus", "")),
            "rooms": [x.strip() for x in str(row.get("aules", "")).split(",") if x.strip() and x.strip() != "-"],
            "language": normalize_language(row.get("idioma", "")),
            "scheduled": day in DAY_NAMES and start != "00:00",
        })

    groups_map = collections.defaultdict(list)
    for session in sessions:
        groups_map[(session["courseCode"], session["group"])].append(session)

    course_groups = []
    for (code, group), grouped_sessions in sorted(groups_map.items()):
        scheduled = [x for x in grouped_sessions if x["scheduled"]]
        unscheduled = [x for x in grouped_sessions if not x["scheduled"]]
        numeric_group = int(group) if group.isdigit() else None
        is_theory = numeric_group is not None and numeric_group % 10 == 0
        course_groups.append({
            "courseCode": code,
            "group": group,
            "languages": sorted({str(x["language"]) for x in grouped_sessions}),
            "classTypes": sorted({x["classTypeCode"] for x in grouped_sessions}),
            "scheduledSessionCount": len(scheduled),
            "hasUnscheduledParts": bool(unscheduled),
            "isTheoryGroup": is_theory,
            "sessions": sorted(grouped_sessions, key=lambda x: (x["dayOfWeek"], x["startTime"], x["classTypeCode"])),
        })

    selectable_codes = {group["courseCode"] for group in course_groups}
    courses = [course for course in courses if course["code"] in selectable_codes]
    sessions = [session for session in sessions if session["courseCode"] in selectable_codes]
    comments = [comment for comment in comments if comment["courseCode"] in selectable_codes]

    requirements = []
    for req in requirements_raw.get("results", []):
        if req.get("origin") in selectable_codes and req.get("destination") in selectable_codes:
            requirements.append({
                "fromCourseCode": req.get("origin"),
                "toCourseCode": req.get("destination"),
                "typeCode": req.get("tipus"),
                "type": REQ_TYPE_MAP.get(req.get("tipus"), req.get("tipus")),
            })

    return {
        "meta": {
            "source": "FIB UPC raw JSON files provided by user",
            "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z"),
            "scope": "GRAU (Computer Engineering / IngenierÃ­a InformÃ¡tica) courses only",
            "uiLanguage": "English",
            "subjectFiles": existing_subject_files(),
            "classFiles": existing_class_files(),
            "notes": [
                "Course names are currently preserved from source data and exposed with English field names.",
                "Only GRAU courses are included in this first version.",
                "Timetable comments and special cases are preserved for later use.",
                "This version supports selecting courses and then selecting groups independently.",
                extra_text,
            ],
        },
        "requirementTypeLegend": REQ_TYPE_MAP,
        "courses": sorted(courses, key=lambda c: c["code"]),
        "courseComments": sorted(comments, key=lambda c: (c["courseCode"], c["textOriginal"])),
        "requirements": sorted(requirements, key=lambda r: (r["toCourseCode"], r["fromCourseCode"], r["typeCode"])),
        "sessions": sessions,
        "courseGroups": course_groups,
    }


if __name__ == "__main__":
    os.makedirs(OUT_DIR, exist_ok=True)
    catalog = build_catalog()
    out_path = os.path.join(OUT_DIR, "catalog.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(catalog, f, ensure_ascii=False, indent=2)
    with open(PUBLIC_CATALOG_PATH, "w", encoding="utf-8") as f:
        json.dump(catalog, f, ensure_ascii=False, indent=2)
    print(f"Wrote {out_path}")
    print(f"Wrote {PUBLIC_CATALOG_PATH}")

