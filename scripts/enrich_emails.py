#!/usr/bin/env python3
"""Nightly email pre-enrichment for the `places` table.

Businesses that publish a website but no email in the listing data get a
visit to their OWN public pages (homepage + /contact-style paths): any
mailto: address or schema.org JSON-LD email found is written back. This
is the same compliant extraction the live engine does — pre-run at night
so searches return complete leads instantly.

Hard rules (same as the app): public business pages only; never the
blocklisted social/login domains; no guessing or pattern-inventing
emails; per-site robots + timeout discipline; write ONLY when an email
was actually published on the business's own site.

Usage: DATABASE_URL=postgres://... python3 scripts/enrich_emails.py [limit]
Prints: "checked=N filled=M".
Requires: psycopg2 (pip install psycopg2-binary). Stdlib HTTP otherwise.
"""
import json
import os
import re
import ssl
import sys
import urllib.request
import urllib.robotparser
from urllib.parse import urljoin, urlparse

BLOCKED = ("linkedin.com", "facebook.com", "instagram.com", "twitter.com",
           "x.com", "tiktok.com", "telegram.org", "whatsapp.com", "wa.me",
           "google.com", "youtube.com")
EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
UA = {"User-Agent": "LeadsForceGen-Enrich/1.0 (+https://leadsforcegen.vercel.app)"}
CTX = ssl.create_default_context()
PATHS = ["/", "/contact", "/contact-us", "/about", "/about-us"]


def fetch(url: str, timeout: int = 6) -> str | None:
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=timeout, context=CTX) as r:
            if r.status != 200:
                return None
            data = r.read(1_000_000)
            return data.decode("utf-8", "ignore")
    except Exception:
        return None


def allowed(url: str) -> bool:
    host = (urlparse(url).hostname or "").lower()
    if not host or any(b in host for b in BLOCKED):
        return False
    ip = host.replace(".", "").isdigit()
    if host in ("localhost",) or host.startswith(("192.168.", "10.", "172.16.", "172.17.",
                                                  "172.18.", "172.19.", "172.2", "172.30.",
                                                  "172.31.", "169.254.")) or ip and host.startswith("127."):
        return False
    try:
        rp = urllib.robotparser.RobotFileParser()
        rp.set_url(f"{urlparse(url).scheme}://{host}/robots.txt")
        rp.read()
        return rp.can_fetch(UA["User-Agent"], url)
    except Exception:
        return True  # no robots.txt reachable — fetching a public page is fine


def extract_email(html: str, domain: str) -> str | None:
    # 1) schema.org JSON-LD email
    for m in re.finditer(r'<script[^>]+type="application/ld\+json"[^>]*>(.*?)</script>',
                         html, re.S | re.I):
        try:
            data = json.loads(m.group(1))
        except Exception:
            continue
        stack = [data]
        while stack:
            node = stack.pop()
            if isinstance(node, dict):
                em = node.get("email")
                if isinstance(em, str) and EMAIL_RE.fullmatch(em.replace("mailto:", "")):
                    return em.replace("mailto:", "")
                stack.extend(node.values())
            elif isinstance(node, list):
                stack.extend(node)
    # 2) mailto: links — prefer ones on the business's own domain
    mails = [m.replace("mailto:", "").split("?")[0]
             for m in re.findall(r'mailto:([^"\'\s>]+)', html, re.I)]
    mails = [m for m in mails if EMAIL_RE.fullmatch(m) and
             not m.lower().endswith((".png", ".jpg", ".webp", ".gif"))]
    if not mails:
        return None
    own = [m for m in mails if m.lower().endswith("@" + domain)]
    return (own or mails)[0]


def main() -> int:
    import psycopg2

    limit = int(sys.argv[1]) if len(sys.argv) > 1 else 200
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()
    cur.execute(
        "SELECT id, website FROM public.places "
        "WHERE email IS NULL AND website IS NOT NULL AND website <> '' "
        "ORDER BY confidence DESC LIMIT %s", (limit,))
    rows = cur.fetchall()
    filled = 0
    for place_id, website in rows:
        url = website if website.startswith("http") else "https://" + website
        if not allowed(url):
            continue
        domain = (urlparse(url).hostname or "").removeprefix("www.")
        email = None
        for path in PATHS:
            html = fetch(urljoin(url, path))
            if html:
                email = extract_email(html, domain)
                if email:
                    break
        if email:
            cur.execute("UPDATE public.places SET email = %s, updated_at = now() "
                        "WHERE id = %s AND email IS NULL", (email, place_id))
            filled += cur.rowcount
            conn.commit()
    print(f"checked={len(rows)} filled={filled}")
    cur.close()
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
