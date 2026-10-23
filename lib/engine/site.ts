import "server-only";
import { safeFetch, assertSafeUrl } from "@/lib/safe-fetch";
import { domainOf, extractContacts, extractJsonLd, extractSocials } from "@/lib/engine/search";
import type { Lead } from "@/lib/types";

// One-click website extraction: the user pastes a business website and
// gets back the contacts that business publishes on its OWN pages
// (homepage, then /contact, /contact-us, /about until the essentials are
// found). Every fetch goes through safe-fetch — SSRF guards, robots.txt,
// per-host throttling and the policy blocklist (social / login-gated
// hosts) all apply. Nothing is invented: fields the site does not
// publish stay empty, and the lead links back to the page it came from.

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
  const candidates = [...new Set([url.toString(), `${url.origin}/contact`, `${url.origin}/contact-us`, `${url.origin}/about`])];

  let name: string | undefined;
  let kind = "";
  let email: string | undefined;
  let phone: string | undefined;
  let address: string | undefined;
  let hours: string | undefined;
  let structured = false;
  let firstPageUrl = "";
  let pagesRead = 0;
  const socials: string[] = [];

  for (const pageUrl of candidates) {
    if (email && phone && name) break;
    try {
      const page = await safeFetch(pageUrl);
      if (page.status < 200 || page.status >= 400) continue;
      pagesRead += 1;
      if (!firstPageUrl) firstPageUrl = page.finalUrl || pageUrl;
      const ld = extractJsonLd(page.text);
      if (ld.email || ld.phone) structured = true;
      name = name || ld.name || nameFromHtml(page.text);
      kind = kind || humanizeKind(ld.kind);
      email = email || ld.email;
      phone = phone || ld.phone;
      address = address || ld.address;
      hours = hours || ld.hours;
      const found = extractContacts(page.text, domain);
      email = email || found.email;
      phone = phone || found.phone;
      for (const s of [...ld.socials, ...extractSocials(page.text)]) {
        if (!socials.includes(s) && socials.length < 6) socials.push(s);
      }
    } catch { /* robots/blocked/dead page — try the next one */ }
  }

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
