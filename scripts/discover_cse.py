#!/usr/bin/env python3
"""DEPRECATED — DO NOT USE (2026-10-25 audit).

Google Programmable Search "Search the entire web" is OFF for this
project's engine and, per Google, cannot be turned back on (new engines
must use "Sites to search"; legacy entire-web ends 2027-01-01). The live
engine's CSE leg therefore contributes zero leads, and this bulk script
cannot discover anything either. Kept for reference only — do not wire
it into any workflow. Durable discovery paths are Overture stored packs
(scripts/ingest_overture_city.py) and the live OSM legs in lib/engine/.

Bulk discovery via Google Programmable Search (official API).

Finds business websites for a niche+city using operator queries
(inurl:/intitle:) — the compliant form of "dorking": Google API with the
owner's own key, never scraping google.com. Output is candidate websites
only; contacts are extracted later from the businesses' own pages by the
normal enrichment pipeline / scripts.

Usage: GOOGLE_CSE_API_KEY=... GOOGLE_CSE_CX=... \
  python3 scripts/discover_cse.py "dentist" "Dubai" >> candidates.csv
"""
import csv
import json
import os
import sys
import urllib.parse
import urllib.request

BLOCKED = ("facebook.", "instagram.", "linkedin.", "twitter.", "x.com",
           "tripadvisor.", "yelp.", "zomato.", "google.", "youtube.",
           "tiktok.", "justdial.", "indiamart.", "suulekha.")


def main() -> int:
    key, cx = os.environ.get("GOOGLE_CSE_API_KEY"), os.environ.get("GOOGLE_CSE_CX")
    if not key or not cx:
        print("Set GOOGLE_CSE_API_KEY and GOOGLE_CSE_CX first.", file=sys.stderr)
        return 2
    niche, location = sys.argv[1], sys.argv[2]
    q = f'{niche} {location} (inurl:contact OR intitle:contact OR "contact us")'
    url = ("https://www.googleapis.com/customsearch/v1?key=" + urllib.parse.quote(key)
           + "&cx=" + urllib.parse.quote(cx) + "&q=" + urllib.parse.quote(q) + "&num=10")
    with urllib.request.urlopen(url, timeout=20) as r:
        data = json.load(r)
    w = csv.writer(sys.stdout)
    seen = set()
    for item in data.get("items", []):
        link = item.get("link", "")
        host = urllib.parse.urlparse(link).hostname or ""
        host = host.lower()
        if not host or host in seen or any(b in host for b in BLOCKED):
            continue
        seen.add(host)
        w.writerow([item.get("title", "").strip(), f"https://{host}", link, niche, location])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
