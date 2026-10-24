#!/usr/bin/env python3
"""City-pack extracts from Overture Maps Places (global, CDLA-Permissive).

Same licence and cleaning rules as scripts/ingest_overture.py, but sliced
by metro bounding box instead of country code — so ANY city on Earth can
become a lead pack. Two modes:

  python3 scripts/ingest_overture_city.py --counts
      One DuckDB scan over the release; prints the row count inside each
      built-in metro box (used to size packs against Supabase headroom).

  python3 scripts/ingest_overture_city.py London Toronto Mumbai
      Writes data/places-city-<slug>.csv per city with the SAME columns
      as places-ae.csv, ready for the existing Supabase import path.
      Files are the warehouse; only fitting packs get promoted to the
      hot `places` table.

City boxes are centre + radius (km) and intentionally generous: the
engine's own radius filter (20 km) and dedupe still apply at search time.
"""
import os
import re
import subprocess
import sys
from urllib.parse import urlparse

RELEASE = os.environ.get("OVERTURE_RELEASE", "2026-10-21.0")
BUCKET = "https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com"
SOCIAL_HOSTS = ("facebook.com", "instagram.com", "tiktok.com", "linkedin.com",
                "x.com", "twitter.com", "youtube.com", "youtu.be")

# slug: (display, lat, lon, radius_km)
CITIES = {
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


def part_urls() -> list[str]:
    prefix = f"release/{RELEASE}/theme=places/type=place/"
    xml = subprocess.run(
        ["curl", "-s", "-m", "60", f"{BUCKET}/?list-type=2&prefix={prefix}&max-keys=200"],
        capture_output=True, text=True, check=True,
    ).stdout
    keys = re.findall(r"<Key>([^<]+)</Key>", xml)
    if not keys:
        raise SystemExit("No Overture parts found — check RELEASE.")
    return [f"{BUCKET}/{k}" for k in keys]


def connect():
    import duckdb
    p = urlparse(os.environ.get("http_proxy") or os.environ.get("HTTP_PROXY") or "")
    for k in list(os.environ):
        if "proxy" in k.lower():
            os.environ.pop(k, None)
    con = duckdb.connect()
    con.execute("LOAD httpfs;")
    if p.hostname:
        con.execute(f"SET http_proxy='{p.hostname}:{p.port}';")
        if p.username:
            con.execute(f"SET http_proxy_username='{p.username}';")
        if p.password:
            con.execute(f"SET http_proxy_password='{p.password}';")
    return con


def box_expr(lat: float, lon: float, r_km: float) -> tuple[float, float, float, float]:
    dlat = r_km / 111.0
    dlon = r_km / (111.0 * max(0.2, abs(__import__("math").cos(__import__("math").radians(lat)))))
    return (lon - dlon, lon + dlon, lat - dlat, lat + dlat)


def main() -> None:
    args = [a.lower() for a in sys.argv[1:]]
    counts_only = "--counts" in args
    wanted = [a for a in args if a != "--counts"] or list(CITIES)
    unknown = [a for a in wanted if a not in CITIES]
    if unknown:
        raise SystemExit(f"Unknown cities: {unknown}. Known: {sorted(CITIES)}")
    # part_urls() must run BEFORE connect(): connect() strips the proxy
    # env vars for DuckDB's httpfs, but curl needs them to reach S3.
    urls = part_urls()
    con = connect()
    print(f"{len(urls)} part files, release {RELEASE}")
    lst = "[" + ",".join(f"'{u}'" for u in urls) + "]"
    base = f"""
        SELECT (bbox.xmin + bbox.xmax) / 2 AS lon, (bbox.ymin + bbox.ymax) / 2 AS lat
        FROM read_parquet({lst})
        WHERE coalesce(lower(operating_status), 'open') NOT LIKE '%closed%'
          AND confidence >= 0.3 AND names.primary IS NOT NULL
    """
    if counts_only:
        cases = " ".join(
            f"WHEN lon BETWEEN {box_expr(CITIES[s][1], CITIES[s][2], CITIES[s][3])[0]:.4f} "
            f"AND {box_expr(CITIES[s][1], CITIES[s][2], CITIES[s][3])[1]:.4f} "
            f"AND lat BETWEEN {box_expr(CITIES[s][1], CITIES[s][2], CITIES[s][3])[2]:.4f} "
            f"AND {box_expr(CITIES[s][1], CITIES[s][2], CITIES[s][3])[3]:.4f} THEN '{s}'"
            for s in wanted
        )
        rows = con.execute(f"SELECT CASE {cases} ELSE NULL END AS city, COUNT(*) FROM ({base}) GROUP BY 1 ORDER BY 2 DESC").fetchall()
        for city, n in rows:
            if city:
                print(f"{city}: {n} rows")
        return

    def like_any(col: str) -> str:
        return " OR ".join(f"lower({col}) LIKE '%{h}%'" for h in SOCIAL_HOSTS)
    out_dir = os.path.join(os.path.dirname(__file__), "..", "data")
    os.makedirs(out_dir, exist_ok=True)
    for slug in wanted:
        _, lat, lon, r = CITIES[slug]
        xmin, xmax, ymin, ymax = box_expr(lat, lon, r)
        out = os.path.join(out_dir, f"places-city-{slug}.csv")
        q = f"""
        COPY (
          WITH base AS (
            SELECT
              id, names.primary AS name, basic_category AS category,
              (bbox.xmin + bbox.xmax) / 2 AS lon,
              (bbox.ymin + bbox.ymax) / 2 AS lat,
              phones[1] AS phone, websites[1] AS website_raw,
              emails[1] AS email, socials,
              addresses[1].freeform AS address,
              addresses[1].locality AS locality,
              addresses[1].country AS country, confidence
            FROM read_parquet({lst})
            WHERE addresses[1].country IS NOT NULL
              AND coalesce(lower(operating_status), 'open') NOT LIKE '%closed%'
              AND confidence >= 0.3 AND names.primary IS NOT NULL
              AND (bbox.xmin + bbox.xmax) / 2 BETWEEN {xmin:.4f} AND {xmax:.4f}
              AND (bbox.ymin + bbox.ymax) / 2 BETWEEN {ymin:.4f} AND {ymax:.4f}
          )
          SELECT id, name, category, lat, lon, phone,
            CASE WHEN {like_any('website_raw')} THEN NULL ELSE website_raw END AS website,
            email,
            coalesce(to_json(CASE WHEN {like_any('website_raw')}
              THEN list_distinct(socials || [website_raw]) ELSE socials END), '[]') AS socials,
            address, locality, country, confidence, 'overture' AS source
          FROM base
        ) TO '{out}' (FORMAT CSV, HEADER)
        """
        con.execute(q)
        raw = open(out, "rb").read()
        if b"\x00" in raw:
            open(out, "wb").write(raw.replace(b"\x00", b""))
        n = sum(1 for _ in open(out)) - 1
        print(f"{slug}: {n} rows -> {out} ({os.path.getsize(out) / 1_000_000:.1f} MB)")


if __name__ == "__main__":
    main()
