#!/usr/bin/env python3
"""Batch lead generator: Database → Excel/CSV, on request.

The bridge between the three stores:
  * Postgres `places` table (live source of truth, DATABASE_URL), or
    the local dataset files in data/places-*.csv when no DB is set;
  * Excel (.xlsx) + CSV lead files written to out/ — ready to open,
    share, or upload to the Google Drive "LeadsForceGen Data" folder;
  * stdout summary line that the n8n workflow forwards to Telegram.

Usage:
  python3 scripts/generate_leads.py --niche dentist --city dubai --limit 500
  python3 scripts/generate_leads.py --niche restaurant --city kathmandu
  python3 scripts/generate_leads.py --niche cafe --lat 25.2 --lon 55.27 --radius-km 15

Prints: "leads=N with_email=E with_phone=P file=out/leads-....xlsx".
Requires: openpyxl for .xlsx (CSV is always written); psycopg2 only for DB mode.
"""
import argparse
import csv
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")
OUT = os.path.join(HERE, "..", "out")

CITIES = {  # name -> (lat_min, lat_max, lon_min, lon_max)
    "dubai": (25.08, 25.32, 55.14, 55.36),
    "kathmandu": (27.64, 27.76, 85.24, 85.39),
    "abu dhabi": (24.25, 24.60, 54.30, 54.65),
    "pokhara": (28.15, 28.28, 83.93, 84.05),
}
CATEGORIES = {
    "dentist": ["dental_clinic", "dentist"], "dental clinic": ["dental_clinic", "dentist"],
    "restaurant": ["restaurant"], "cafe": ["cafe", "coffee_shop"],
    "hotel": ["hotel", "lodging"], "pharmacy": ["pharmacy"],
    "clinic": ["clinic", "medical_clinic", "doctor"], "gym": ["gym", "fitness_center"],
    "salon": ["beauty_salon", "salon", "barber_shop"], "plumber": ["plumber"],
    "electrician": ["electrician"], "lawyer": ["lawyer", "legal_services"],
    "school": ["specialty_school", "high_school", "preschool", "elementary_school",
               "middle_school", "college_university", "educational_service",
               "education", "tutoring_service"],
    "teacher": ["specialty_school", "high_school", "preschool", "elementary_school",
                "middle_school", "college_university", "educational_service",
                "education", "tutoring_service"],
    "real estate": ["real_estate_service"], "bank": ["bank_or_credit_union"],
    "car dealer": ["auto_dealer", "automotive_service"],
    "travel agency": ["travel_service"],
}
FIELDS = ["name", "category", "phone", "email", "website", "socials",
          "address", "locality", "country", "confidence"]


def bbox_for(args) -> tuple[float, float, float, float]:
    if args.city and args.city.lower() in CITIES:
        return CITIES[args.city.lower()]
    if args.lat is not None and args.lon is not None:
        d_lat = args.radius_km / 111.0
        d_lon = args.radius_km / (111.0 * max(0.2, abs(__import__("math").cos(__import__("math").radians(args.lat)))))
        return (args.lat - d_lat, args.lat + d_lat, args.lon - d_lon, args.lon + d_lon)
    raise SystemExit(f"Unknown city '{args.city}' — pass --lat/--lon or add it to CITIES.")


def from_db(cats, bbox, limit):
    import psycopg2
    lat0, lat1, lon0, lon1 = bbox
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()
    cur.execute(
        "SELECT name, category, phone, email, website, socials, address, locality, country, confidence "
        "FROM public.places WHERE category = ANY(%s) AND lat BETWEEN %s AND %s AND lon BETWEEN %s AND %s "
        "ORDER BY confidence DESC NULLS LAST LIMIT %s",
        (cats, lat0, lat1, lon0, lon1, limit))
    cols = [d[0] for d in cur.description]
    rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    cur.close()
    conn.close()
    return rows


def from_csv(cats, bbox, limit):
    lat0, lat1, lon0, lon1 = bbox
    rows = []
    for fn in os.listdir(DATA):
        if not (fn.startswith("places-") and fn.endswith(".csv")):
            continue
        with open(os.path.join(DATA, fn), newline="", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                try:
                    lat, lon = float(r["lat"]), float(r["lon"])
                except (TypeError, ValueError):
                    continue
                if r["category"] in cats and lat0 <= lat <= lat1 and lon0 <= lon <= lon1:
                    rows.append({k: r.get(k, "") for k in FIELDS})
    rows.sort(key=lambda r: float(r["confidence"] or 0), reverse=True)
    return rows[:limit]


def write_files(rows, niche, city):
    os.makedirs(OUT, exist_ok=True)
    slug = f"leads-{niche.replace(' ', '-')}-{(city or 'custom').replace(' ', '-')}".lower()
    csv_path = os.path.join(OUT, slug + ".csv")
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        for r in rows:
            w.writerow({k: (json.dumps(r[k]) if k == "socials" and not isinstance(r[k], str) else r.get(k, "")) for k in FIELDS})
    xlsx_path = csv_path.replace(".csv", ".xlsx")
    try:
        import re
        from openpyxl import Workbook
        bad = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")
        wb = Workbook(write_only=True)
        ws = wb.create_sheet("leads")
        ws.append(FIELDS)
        for r in rows:
            ws.append([bad.sub("", str(r.get(k, "") or "")) for k in FIELDS])
        wb.save(xlsx_path)
    except ImportError:
        xlsx_path = "(openpyxl not installed — CSV only)"
    return csv_path, xlsx_path


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--niche", required=True)
    ap.add_argument("--city")
    ap.add_argument("--lat", type=float)
    ap.add_argument("--lon", type=float)
    ap.add_argument("--radius-km", type=float, default=15)
    ap.add_argument("--limit", type=int, default=500)
    args = ap.parse_args()

    cats = CATEGORIES.get(args.niche.lower(), [args.niche.lower().replace(" ", "_")])
    bbox = bbox_for(args)
    if os.environ.get("DATABASE_URL"):
        rows, src = from_db(cats, bbox, args.limit), "database"
    else:
        rows, src = from_csv(cats, bbox, args.limit), "local-datasets"
    csv_path, xlsx_path = write_files(rows, args.niche, args.city)
    with_email = sum(1 for r in rows if r.get("email"))
    with_phone = sum(1 for r in rows if r.get("phone"))
    print(f"source={src} leads={len(rows)} with_email={with_email} with_phone={with_phone} "
          f"csv={csv_path} xlsx={xlsx_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
