import "server-only";
import { safeFetch, assertSafeUrl } from "@/lib/safe-fetch";
import { discoverContactPages, domainOf, extractContacts, extractJsonLd, extractSocials, preferRoleEmail, ROLE_EMAIL_LOCALS } from "@/lib/engine/search";
import type { Lead } from "@/lib/types";

// One-click website extraction: the user pastes a business website and
// gets back the contacts that business publishes on its OWN pages.
// Candidate order: homepage, sitemap contact/about pages, nav/footer
// links pointing at a contact page, then static guesses (/contact,
// /contact-us, /about, /about-us, /support) — capped at 7 fetches total,
// the same per-site cap the search enrichment uses. Every fetch goes
// through safe-fetch — SSRF guards, robots.txt, per-host throttling and
// the policy blocklist (social / login-gated hosts) all apply. Nothing
// is invented: fields the site does not publish stay empty, and the
// lead links back to the page it came from.

// Nav/footer links whose URL contains "contact" are the site's own
// signposts to its real contact page — better than blind guessing.
// Same-origin only; mailto/tel/anchor/javascript links are skipped.
function extractNavContactLinks(html: string, origin: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/href=["']([^"']+)["']/gi)) {
    const raw = m[1].trim();
    if (!raw || /^(mailto:|tel:|#|javascript:)/i.test(raw)) continue;
    try {
      const u = new URL(raw, origin);
      if (u.origin !== origin) continue;
      if (!/contact/i.test(u.pathname)) continue;
      const clean = `${u.origin}${u.pathname}${u.search}`;
      if (!out.includes(clean)) out.push(clean);
    } catch { /* unparseable href — ignore */ }
    if (out.length >= 3) break;
  }
  return out;
}

function nameFromHtml(html: string): string | undefined {
  const og =
    html.match(/<meta[^>]+property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:site_name["']/i);
  if (og?.[1]?.trim()) return og[1].trim();
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (title?.[1]) {
    const cleaned = title[1].split(/\s*[|»·]\s*/)[0].split(" — ")[0].trim();
    if (cleaned) return cleaned;
  }
  return undefined;
}

function humanizeKind(kind?: string): string {
  if (!kind) return "";
  const spaced = kind.replace(/([a-z])([A-Z])/g, "$1 $2").trim();
  return /^organization$/i.test(spaced) ? "" : spaced; // too generic to be an industry
}

// discoverContactPages lives in lib/engine/search.ts (this file already
// imports from there); it finds a site's real contact page via its
// sitemap instead of only guessing /contact.

export type SiteLeadResult = { lead: Lead | null; reason?: string };

export async function leadFromWebsite(rawUrl: string): Promise<SiteLeadResult> {
  let input = (rawUrl || "").trim();
  if (!input) return { lead: null, reason: "Enter a website address first." };
  if (!/^https?:\/\//i.test(input)) input = `https://${input}`;
  let url: URL;
  try {
    url = assertSafeUrl(input);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid URL";
    if (/Blocked by policy/.test(msg)) {
      return { lead: null, reason: "That platform can't be scraped (social / login-gated sites are off-limits). Paste the business's own website instead." };
    }
    if (/private\/local/.test(msg)) return { lead: null, reason: "That address is private or local — only public websites can be read." };
    if (/robots/.test(msg)) return { lead: null, reason: "That site's robots.txt disallows reading it." };
    return { lead: null, reason: "That doesn't look like a valid public website address." };
  }

  const domain = domainOf(url.toString());
  const discovered = await discoverContactPages(url.origin, true);

  let name: string | undefined;
  let kind = "";
  let phone: string | undefined;
  let address: string | undefined;
  let hours: string | undefined;
  let structured = false;
  let firstPageUrl = "";
  let homeOrigin = "";
  let pagesRead = 0;
  const socials: string[] = [];
  // Every email found across pages; the final pick prefers a role
  // inbox, so a generic address on an early page never beats info@
  // published on the contact page.
  const emailsFound: string[] = [];
  const pushEmail = (e?: string): void => {
    if (e && !emailsFound.includes(e)) emailsFound.push(e);
  };

  const readPage = async (pageUrl: string): Promise<string | null> => {
    try {
      const page = await safeFetch(pageUrl);
      if (page.status < 200 || page.status >= 400) return null;
      pagesRead += 1;
      if (!firstPageUrl) firstPageUrl = page.finalUrl || pageUrl;
      if (!homeOrigin) {
        try {
          homeOrigin = new URL(page.finalUrl || pageUrl).origin;
        } catch { /* keep input origin */ }
      }
      const ld = extractJsonLd(page.text, domain);
      if (ld.email || ld.phone) structured = true;
      name = name || ld.name || nameFromHtml(page.text);
      kind = kind || humanizeKind(ld.kind);
      pushEmail(ld.email);
      phone = phone || ld.phone;
      address = address || ld.address;
      hours = hours || ld.hours;
      const found = extractContacts(page.text, domain);
      pushEmail(found.email);
      phone = phone || found.phone;
      for (const s of [...ld.socials, ...extractSocials(page.text)]) {
        if (!socials.includes(s) && socials.length < 6) socials.push(s);
      }
      return page.text;
    } catch { /* robots/blocked/dead page — try the next one */ }
    return null;
  };

  // Homepage first: its nav/footer reveals the real contact links.
  const homeHtml = await readPage(url.toString());
  const navLinks = homeHtml ? extractNavContactLinks(homeHtml, homeOrigin || url.origin) : [];

  // Sitemap truth, then the site's own nav links, then static guesses.
  // Hard cap 7 fetches total — the cap is never raised for extra guesses.
  const queue: string[] = [];
  const pushQ = (u: string): void => {
    if (queue.length < 7 && !queue.includes(u)) queue.push(u);
  };
  pushQ(url.toString());
  for (const u of discovered) pushQ(u);
  for (const u of navLinks) pushQ(u);
  for (const s of ["contact", "contact-us", "about", "about-us", "support"]) pushQ(`${url.origin}/${s}`);

  const fetched = new Set<string>([url.toString()]);
  for (const pageUrl of queue) {
    if (fetched.has(pageUrl)) continue;
    // Keep scanning while only a non-role inbox is held: the contact
    // page may publish the role address. Bounded by the 7-page cap.
    const best = preferRoleEmail(emailsFound);
    if (best && ROLE_EMAIL_LOCALS.has(best.split("@")[0]) && phone && name) break;
    fetched.add(pageUrl);
    await readPage(pageUrl);
  }
  const email = preferRoleEmail(emailsFound);

  if (!pagesRead) {
    return { lead: null, reason: "Couldn't read that website — it may be down, blocking automated visits, or disallowed by its robots.txt." };
  }
  if (!email && !phone && !name) {
    return { lead: null, reason: "The site loaded, but it publishes no readable email, phone, or business name on its public pages." };
  }

  let score = 10; // real business with a live website
  if (address) score += 20;
  if (phone) score += 20;
  if (email) score += 15;
  score += 15; // website itself verified live (we just read it)
  if (structured) score += 5;
  if (socials.length) score += 5;
  if (hours) score += 5;
  score = Math.min(100, score);

  return {
    lead: {
      company: name || domain,
      industry: kind || "Website lead",
      location: address || "",
      size: "",
      website: domain,
      description: `Extracted in one click from the business's own website (${domain}, ${pagesRead} page${pagesRead === 1 ? "" : "s"} read). Contacts are published by the business itself — verify before outreach.`,
      score,
      email,
      phone,
      address,
      socials: socials.length ? socials : undefined,
      hours,
      sourceUrl: firstPageUrl,
      sourceName: "Business website",
    },
  };
}
