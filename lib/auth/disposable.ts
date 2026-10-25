import "server-only";
import { DISPOSABLE_DOMAINS } from "./disposable-domains";

/**
 * True when the address sits on a disposable / temporary-mail domain.
 * Matches the domain itself AND any subdomain of a listed domain
 * (mail.foo.tempmail.com is disposable when tempmail.com is listed),
 * so bots can't dodge the block with a subdomain. Real providers
 * (gmail, outlook, yahoo, company domains) are never on the list.
 */
export function isDisposableEmail(email: string): boolean {
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  const domain = email.slice(at + 1).trim().toLowerCase();
  if (!domain || !domain.includes(".")) return false;
  // Walk up: sub.example.com -> example.com -> com (stop before bare TLD).
  const parts = domain.split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    if (DISPOSABLE_DOMAINS.has(parts.slice(i).join("."))) return true;
  }
  return false;
}
