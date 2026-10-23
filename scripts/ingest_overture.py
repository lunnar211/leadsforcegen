#!/usr/bin/env python3
"""Ingest Overture Maps Places slices into CSVs for the Supabase `places` table.

Overture data is CDLA-Permissive-2.0 / Apache-2.0: storing and
redistributing is allowed (unlike places APIs whose terms forbid keeping
their data). Run monthly to refresh; load the CSVs via the Supabase
Table Editor import (or any bulk loader) into public.places.

Usage:
  python3 -m venv /tmp/dkenv && /tmp/dkenv/bin/pip install duckdb
  /tmp/dkenv/bin/python scripts/ingest_overture.py AE NP

Reads the current Overture release from its public S3 bucket with
DuckDB (anonymous HTTPS range reads), filters to businesses that are
not marked closed with confidence >= 0.3, cleans social-platform URLs
out of the website field (they belong in socials), and writes one CSV
per country next to this script in ../data/.
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


def main() -> None:
    countries = [c.upper() for c in sys.argv[1:]] or ["AE", "NP"]
    import duckdb

    urls = part_urls()
    print(f"{len(urls)} part files, release {RELEASE}")

    # The sandbox reaches the internet through a proxy whose URL DuckDB's
    # httpfs cannot parse whole; hand it the decomposed settings instead.
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
    lst = "[" + ",".join(f"'{u}'" for u in urls) + "]"

    out_dir = os.path.join(os.path.dirname(__file__), "..", "data")
    os.makedirs(out_dir, exist_ok=True)

    def like_any(col: str) -> str:
        return " OR ".join(f"lower({col}) LIKE '%{h}%'" for h in SOCIAL_HOSTS)
    for cc in countries:
        out = os.path.join(out_dir, f"places-{cc.lower()}.csv")
        q = f"""
        COPY (
          WITH base AS (
            SELECT
              id,
              names.primary AS name,
              basic_category AS category,
              (bbox.xmin + bbox.xmax) / 2 AS lon,
              (bbox.ymin + bbox.ymax) / 2 AS lat,
              phones[1] AS phone,
              websites[1] AS website_raw,
              emails[1] AS email,
              socials,
              addresses[1].freeform AS address,
              addresses[1].locality AS locality,
              addresses[1].country AS country,
              confidence
            FROM read_parquet({lst})
            WHERE addresses[1].country = '{cc}'
              AND coalesce(lower(operating_status), 'open') NOT LIKE '%closed%'
              AND confidence >= 0.3
              AND names.primary IS NOT NULL
          )
          SELECT
            id, name, category, lat, lon, phone,
            CASE WHEN {like_any('website_raw')} THEN NULL ELSE website_raw END AS website,
            email,
            coalesce(to_json(CASE
              WHEN {like_any('website_raw')}
                THEN list_distinct(socials || [website_raw])
              ELSE socials END), '[]') AS socials,
            address, locality, country, confidence,
            'overture' AS source
          FROM base
        ) TO '{out}' (FORMAT CSV, HEADER)
        """
        con.execute(q)
        n = sum(1 for _ in open(out)) - 1
        size_mb = os.path.getsize(out) / 1_000_000
        print(f"{cc}: {n} rows -> {out} ({size_mb:.1f} MB)")


if __name__ == "__main__":
    main()
