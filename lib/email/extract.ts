import { resolveMx } from "node:dns/promises";

// Paste/upload handling: pull every email-shaped token out of raw text
// (pasted lists, CSV content), keep only well-formed unique addresses.
// The caller never has to pre-clean a file: non-email junk is dropped,
// duplicates collapse, everything is lowercased.
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

export function extractEmails(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of raw.match(EMAIL_RE) || []) {
    const email = m.toLowerCase();
    if (email.includes("..")) continue;
    const [local, domain] = email.split("@");
    if (!local || !domain || domain.startsWith(".") || domain.endsWith(".")) continue;
    if (!seen.has(email)) {
      seen.add(email);
      out.push(email);
    }
  }
  return out;
}

export function emailShapeOk(email: string): boolean {
  return extractEmails(email).length === 1 && extractEmails(email)[0] === email.toLowerCase();
}

async function domainHasMx(email: string): Promise<boolean> {
  const domain = email.split("@")[1] || "";
  if (!domain) return false;
  try {
    const mx = await Promise.race([
      resolveMx(domain),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("mx timeout")), 3000)),
    ]);
    return Array.isArray(mx) && mx.length > 0;
  } catch {
    return false;
  }
}

// Verify a list: shape is already enforced by extraction; this checks
// the domain actually receives mail (MX record). Concurrency 8, same
// pattern as the lead engine's MX scoring.
export async function verifyEmails(
  emails: string[],
): Promise<{ email: string; mx: boolean }[]> {
  const out: { email: string; mx: boolean }[] = [];
  for (let i = 0; i < emails.length; i += 8) {
    const batch = emails.slice(i, i + 8);
    const results = await Promise.all(batch.map(async (email) => ({ email, mx: await domainHasMx(email) })));
    out.push(...results);
  }
  return out;
}
