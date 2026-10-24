#!/usr/bin/env python3
"""Refresh the `places` table from Overture Maps (monthly release).

Extract + transform happen in DuckDB over the Overture S3 parquet (same
pipeline as scripts/ingest_overture.py), then rows are UPSERTED straight
into Postgres — no dashboard CSV importer involved.

Usage:
  DATABASE_URL=postgres://... python3 scripts/refresh_places.py AE NP
  DATABASE_URL=postgres://... python3 scripts/refresh_places.py US-METROS
  DATABASE_URL=postgres://... python3 scripts/refresh_places.py CITY-PACKS

US-METROS loads the top-10 US metro bounding boxes (fits the free-tier
database; full-US needs a bigger plan).

CITY-PACKS extracts the 11 worldwide city packs (same boxes as
scripts/ingest_overture_city.py) to data/places-city-<slug>.csv — the
warehouse files — and upserts ONLY the HOT_CITIES subset into the
`places` table. Never upsert all 11 blindly: ~3.7M rows would blow the
free-tier database. Files are the warehouse; the table is the hot window.

Requires: duckdb, psycopg2 (pip install duckdb psycopg2-binary).
Prints one summary line per country: "AE upserted=134144 total_in_table=…".
Exit code 0 only if every requested region succeeded.
"""
import csv
import io
import os
import sys

RELEASE = os.environ.get("OVERTURE_RELEASE", "2026-10-21.0")
BUCKET = "https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com"

US_METROS = [  # (name, lon_min, lon_max, lat_min, lat_max)
    ("NYC", -74.3, -73.5, 40.4, 41.0), ("LA", -118.7, -117.5, 33.6, 34.4),
    ("Chicago", -88.1, -87.3, 41.5, 42.2), ("DallasFW", -97.6, -96.4, 32.5, 33.2),
    ("Houston", -95.9, -94.9, 29.4, 30.2), ("Miami", -80.6, -79.9, 25.5, 26.4),
    ("Atlanta", -84.8, -83.9, 33.4, 34.2), ("Phoenix", -112.4, -111.5, 33.2, 33.8),
    ("SFBay", -122.6, -121.7, 37.1, 38.1), ("Seattle", -122.6, -121.9, 47.2, 47.9),
]

SOCIAL_HOSTS = ("facebook.com", "instagram.com", "twitter.com", "x.com",
                "linkedin.com", "tiktok.com", "youtube.com", "wa.me", "whatsapp.com")

# Worldwide city packs — MUST mirror scripts/ingest_overture_city.py CITIES
# (display, lat, lon, radius_km). The monthly refresh extracts all of them
# to warehouse files but upserts only HOT_CITIES into the free-tier table.
CITY_PACKS = {
    "london": ("London", 51.5074, -0.1278, 30),
    "toronto": ("Toronto", 43.6532, -79.3832, 30),
    "mumbai": ("Mumbai", 19.0760, 72.8777, 30),
    "delhi": ("Delhi", 28.7041, 77.1025, 30),
    "sydney": ("Sydney", -33.8688, 151.2093, 30),
    "berlin": ("Berlin", 52.5200, 13.4050, 25),
    "paris": ("Paris", 48.8566, 2.3522, 25),
    "tokyo": ("Tokyo", 35.6762, 139.6503, 30),
    "saopaulo": ("Sao Paulo", -23.5558, -46.6396, 30),
    "karachi": ("Karachi", 24.8607, 67.0011, 25),
    "dhaka": ("Dhaka", 23.8103, 90.4125, 25),
}
HOT_CITIES = ["karachi", "dhaka"]  # ~143k rows together; fits free-tier headroom


def extract(country: str | None, bbox, out_csv: str) -> int:
    """Run the DuckDB extract for one country (or one US metro) to CSV.

    country=None means a worldwide city pack: no country filter, bbox is
    matched on the place CENTRE (exactly like ingest_overture_city.py),
    so refresh extracts stay identical to the warehouse pack files.
    """
    import duckdb
    import re
    import urllib.request
    from urllib.parse import urlparse

    listing = urllib.request.urlopen(
        f"{BUCKET}/?list-type=2&prefix=release/{RELEASE}/theme=places/type=place/&max-keys=200",
        timeout=60).read().decode()
    keys = re.findall(r"<Key>([^<]+)</Key>", listing)
    urls = "[" + ",".join(f"'{BUCKET}/{k}'" for k in keys) + "]"

    # Proxy: capture, then strip from the environment before DuckDB reads
    # it (httpfs breaks on the sandbox proxy otherwise) and re-apply the
    # decomposed values inside DuckDB — same pattern as ingest_overture_city.
    proxy = os.environ.get("http_proxy") or os.environ.get("HTTPS_PROXY") or ""
    p = urlparse(proxy) if proxy else None
    for k in list(os.environ):
        if "proxy" in k.lower():
            os.environ.pop(k, None)

    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs;")
    # Same failure class as ingest_overture_city.py: DuckDB's default
    # 30s per-request timeout trips on slow proxy reads.
    con.execute("SET http_timeout=300;")
    if p and p.hostname:
        con.execute(f"SET http_proxy='{p.hostname}:{p.port}';")
        if p.username:
            con.execute(f"SET http_proxy_username='{p.username}';")
        if p.password:
            con.execute(f"SET http_proxy_password='{p.password}';")

    where = []
    if country:
        where.append(f"addresses[1].country = '{country}'")
    else:
        where.append("names.primary IS NOT NULL")
    if bbox:
        x0, x1, y0, y1 = bbox
        if country:
            where.append(f"bbox.xmin > {x0} AND bbox.xmax < {x1} AND bbox.ymin > {y0} AND bbox.ymax < {y1}")
        else:
            where.append(f"(bbox.xmin + bbox.xmax) / 2 BETWEEN {x0} AND {x1} AND (bbox.ymin + bbox.ymax) / 2 BETWEEN {y0} AND {y1}")
    closed = ("(operating_status IS NULL OR operating_status <> 'closed')"
              if country else
              "coalesce(lower(operating_status), 'open') NOT LIKE '%closed%'")
    q = f"""
    COPY (
      SELECT
        id,
        names.primary AS name,
        basic_category AS category,
        (bbox.ymin + bbox.ymax) / 2 AS lat,
        (bbox.xmin + bbox.xmax) / 2 AS lon,
        phones[1] AS phone,
        websites[1] AS website,
        emails[1] AS email,
        to_json(socials) AS socials,
        addresses[1].freeform AS address,
        addresses[1].locality AS locality,
        addresses[1].country AS country,
        confidence,
        'overture' AS source
      FROM read_parquet({urls})
      WHERE {' AND '.join(where)}
        AND {closed}
        AND confidence >= 0.3
    ) TO '{out_csv}' (HEADER, DELIMITER ',');
    """
    con.execute(q)
    con.close()

    # Post-process: move social-host "websites" into socials; strip NULs.
    rows = 0
    tmp = out_csv + ".tmp"
    with open(out_csv, newline="", encoding="utf-8") as fin, \
         open(tmp, "w", newline="", encoding="utf-8") as fout:
        reader = csv.DictReader(fin)
        writer = csv.DictWriter(fout, fieldnames=reader.fieldnames)
        writer.writeheader()
        import json
        for row in reader:
            row = {k: (v.replace("\x00", "") if isinstance(v, str) else v)
                   for k, v in row.items()}
            site = (row.get("website") or "").lower()
            if any(h in site for h in SOCIAL_HOSTS):
                try:
                    socials = json.loads(row.get("socials") or "[]")
                except Exception:
                    socials = []
                if row["website"] not in socials:
                    socials.append(row["website"])
                row["socials"] = json.dumps(socials)
                row["website"] = ""
            if not row.get("socials"):
                row["socials"] = "[]"
            writer.writerow(row)
            rows += 1
    os.replace(tmp, out_csv)
    return rows


def upsert(csv_path: str) -> int:
    """COPY into a staging table, then INSERT … ON CONFLICT into places."""
    import psycopg2

    dsn = os.environ["DATABASE_URL"]
    conn = psycopg2.connect(dsn)
    conn.autocommit = False
    cur = conn.cursor()
    cur.execute("CREATE TEMP TABLE places_stage (LIKE public.places INCLUDING DEFAULTS)")
    with open(csv_path, newline="", encoding="utf-8") as f:
        cur.copy_expert(
            "COPY places_stage (id,name,category,lat,lon,phone,website,email,"
            "socials,address,locality,country,confidence,source) "
            "FROM STDIN WITH (FORMAT csv, HEADER true, NULL '')", f)
    cur.execute("""
        INSERT INTO public.places AS p
        SELECT * FROM places_stage
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name, category = EXCLUDED.category,
          lat = EXCLUDED.lat, lon = EXCLUDED.lon,
          phone = COALESCE(EXCLUDED.phone, p.phone),
          website = COALESCE(EXCLUDED.website, p.website),
          email = COALESCE(EXCLUDED.email, p.email),
          socials = EXCLUDED.socials, address = EXCLUDED.address,
          locality = EXCLUDED.locality, confidence = EXCLUDED.confidence,
          updated_at = now()
    """)
    n = cur.rowcount
    conn.commit()
    cur.close()
    conn.close()
    return n


def main() -> int:
    targets = sys.argv[1:] or ["AE", "NP"]
    ok = True
    for t in targets:
        if t == "CITY-PACKS":
            import math
            os.makedirs("data", exist_ok=True)
            for slug, (display, lat, lon, r) in CITY_PACKS.items():
                dlat = r / 111.0
                dlon = r / (111.0 * max(0.2, abs(math.cos(math.radians(lat)))))
                bbox = (lon - dlon, lon + dlon, lat - dlat, lat + dlat)
                csv_path = f"data/places-city-{slug}.csv"
                try:
                    rows = extract(None, bbox, csv_path)
                    if slug in HOT_CITIES:
                        n = upsert(csv_path)
                        print(f"{display}: extracted={rows} upserted={n}", flush=True)
                    else:
                        print(f"{display}: extracted={rows} (warehouse file only)", flush=True)
                except Exception as e:  # noqa: BLE001
                    ok = False
                    print(f"{display}: FAILED {type(e).__name__}: {e}", flush=True)
            continue
        jobs = []
        if t == "US-METROS":
            jobs = [("US", (x0, x1, y0, y1), name) for name, x0, x1, y0, y1 in US_METROS]
        else:
            jobs = [(t, None, t)]
        for country, bbox, label in jobs:
            csv_path = f"/tmp/places-{label.lower()}.csv"
            try:
                rows = extract(country, bbox, csv_path)
                n = upsert(csv_path)
                print(f"{label}: extracted={rows} upserted={n}", flush=True)
            except Exception as e:  # noqa: BLE001 — report and continue/fail at end
                ok = False
                print(f"{label}: FAILED {type(e).__name__}: {e}", flush=True)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
