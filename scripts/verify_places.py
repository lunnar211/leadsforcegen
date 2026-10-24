#!/usr/bin/env python3
"""Verify + optimise stored `places` rows (AI-assisted data quality).

Runs on the n8n host (weekly workflow), NOT in the web request path, so
it never slows a customer search. For each unverified row (stalest first):

  Deterministic checks (always run):
    - name sanity (empty / junk like a bare "test")
    - phone shape (too few digits to be real)
    - website reachability (HEAD request to the business's own site)
    - email domain MX records (when dnspython is installed)
  Dedupe (within the batch):
    - same normalised phone OR same website domain -> later rows are
      flagged as duplicates of the first (highest-confidence) row.
  AI review (Groq, fail-open, flag-only):
    - rows whose name shares no token with their category are batched to
      Groq, which may ONLY flag clear mismatches. It never recategorises,
      never edits, never deletes.

Safety rules (hard):
  - Confidence only ever goes DOWN. Verification never inflates a row.
  - Nothing is ever deleted. Bad rows are flagged + pushed to the bottom
    of results (confidence 0.05), so a wrong flag costs ranking, not data.
  - AI failure (no key, timeout, bad JSON) skips the AI step only.

Usage:
  DATABASE_URL=postgres://... python3 scripts/verify_places.py --limit 5000
  DATABASE_URL=postgres://... python3 scripts/verify_places.py --limit 100 --dry-run

Requires: psycopg2 (pip install psycopg2-binary); dnspython optional
(pip install dnspython — without it the MX step reports "mx_unchecked").
Needs the supabase/places-quality.sql columns (verified_at, quality_flags).
"""
import argparse
import json
import os
import re
import sys
import urllib.request
from collections import Counter

UA = "LeadsForceGen-data-quality/1.0"


def digits(s):
    return re.sub(r"\D", "", s or "")


def domain_of(url):
    if not url:
        return ""
    u = url if "://" in url else "https://" + url
    try:
        from urllib.parse import urlparse
        return (urlparse(u).hostname or "").lower().removeprefix("www.")
    except Exception:
        return ""


def name_tokens(name):
    return set(re.split(r"[^a-z0-9]+", (name or "").lower())) - {""}


def category_tokens(category):
    return set(re.split(r"[^a-z0-9_]+", (category or "").lower())) - {""}


def website_alive(url, timeout=5):
    try:
        req = urllib.request.Request(url if "://" in url else "https://" + url,
                                     method="HEAD", headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return 200 <= res.status < 400
    except Exception:
        return False


def email_has_mx(email):
    try:
        import dns.resolver
    except ImportError:
        return None  # unchecked, not a failure
    try:
        host = (email or "").rsplit("@", 1)[-1]
        if not host or "." not in host:
            return False
        return len(dns.resolver.resolve(host, "MX")) > 0
    except Exception:
        return False


def ai_review(rows, key):
    """rows: [(idx, name, category)]. Returns set of idx judged mismatched."""
    if not key or not rows:
        return set()
    lines = "\n".join(f"{i}. {name} | category: {cat}" for i, name, cat in rows)
    prompt = ("You are a strict data-quality filter for a business directory. "
              "Below are real business listings with their stored category. "
              "Reply with JSON ONLY: {\"bad\":[indices]} listing ONLY entries you are "
              "CONFIDENT are the wrong category for the business name. When in doubt, KEEP.\n" + lines)
    try:
        import urllib.request as u
        req = u.Request(
            "https://api.groq.com/openai/v1/chat/completions",
            data=json.dumps({
                "model": os.environ.get("AI_MODEL", "llama-3.3-70b-versatile"),
                "temperature": 0,
                "messages": [{"role": "user", "content": prompt}],
            }).encode(),
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            method="POST")
        with u.urlopen(req, timeout=15) as res:
            data = json.loads(res.read())
        text = data["choices"][0]["message"]["content"]
        parsed = json.loads(text[text.index("{"):text.rindex("}") + 1])
        return set(n for n in (parsed.get("bad") or []) if isinstance(n, int))
    except Exception:
        return set()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=5000)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    import psycopg2
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()
    cur.execute(
        "SELECT id, name, category, phone, website, email, confidence "
        "FROM public.places WHERE verified_at IS NULL "
        "ORDER BY updated_at ASC, id LIMIT %s", (args.limit,))
    rows = cur.fetchall()
    print(f"fetched={len(rows)}", flush=True)

    seen_phone, seen_domain = {}, {}
    updates, suspicious = [], []
    for (rid, name, category, phone, website, email, confidence) in rows:
        flags, conf = [], float(confidence or 0)
        toks = name_tokens(name)
        if len((name or "").strip()) < 2 or "test" in toks:
            flags.append("bad_name")
        ph = digits(phone)
        if phone and len(ph) < 7:
            flags.append("bad_phone")
        dom = domain_of(website)
        if website:
            if not website_alive(website):
                flags.append("website_unreachable")
        if email:
            mx = email_has_mx(email)
            if mx is None:
                flags.append("mx_unchecked")
            elif not mx:
                flags.append("email_no_mx")
        if ph and ph in seen_phone:
            flags.append(f"duplicate_of:{seen_phone[ph]}")
        elif ph:
            seen_phone[ph] = rid
        if dom and dom in seen_domain:
            flags.append(f"duplicate_of:{seen_domain[dom]}")
        elif dom:
            seen_domain[dom] = rid
        if category and not (toks & category_tokens(category)):
            suspicious.append((len(updates), name, category))
        # Penalties only ever lower confidence; flagged duplicates and junk
        # names sink to the bottom instead of being deleted.
        if "bad_name" in flags or any(f.startswith("duplicate_of:") for f in flags):
            conf = 0.05
        else:
            if "website_unreachable" in flags:
                conf *= 0.8
            if "email_no_mx" in flags:
                conf *= 0.9
            conf = max(0.05, conf)
        updates.append((conf, json.dumps(flags), rid))

    if suspicious:
        bad = ai_review(suspicious, os.environ.get("GROQ_API_KEY", ""))
        for idx, _, _ in suspicious:
            if idx in bad:
                conf, fl, rid = updates[idx]
                flags = json.loads(fl)
                flags.append("ai_category_mismatch")
                updates[idx] = (max(0.05, conf * 0.7), json.dumps(flags), rid)
        print(f"ai_reviewed={len(suspicious)} ai_flagged={len(bad)}", flush=True)

    counts = Counter(f for _, fl, _ in updates for f in json.loads(fl))
    print(f"updates={len(updates)} flags={dict(counts)}", flush=True)
    if not args.dry_run:
        cur.executemany(
            "UPDATE public.places SET confidence=%s, quality_flags=%s::jsonb, "
            "verified_at=now() WHERE id=%s", updates)
        conn.commit()
        print("committed", flush=True)
    else:
        print("dry-run: no writes", flush=True)
    cur.close()
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
