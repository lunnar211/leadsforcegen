# TASKS — LeadForge

Status key: TODO / DOING / DONE. One task at a time; lint + build + real
test with raw output before DONE.

## A. Foundation fixes
- [ ] A1. Fix missing export (fetchOSMLeads vs OSMProvider); grep for other broken imports — DONE (2026-10-22: no osm.ts/fetchOSMLeads in this codebase; tsc --noEmit clean; all @/lib imports resolve; fixed 3 react-hooks/set-state-in-effect lint errors found during verification)
- [ ] A2. Fix every dead button/link; create missing pages; Playwright click-through test — TODO
- [ ] A3. Remove ALL fake data; dashboard shows real Supabase values + honest empty states — TODO
- [x] A4 (partial, 2026-10-22). API contract: JSON { ok, data | error } + correct status codes; client checks res.ok/content-type, toast errors — TODO
- [ ] A5. Geocoding: proper User-Agent, 1 req/s throttle, 8s timeout, cache, fallback chain, Overpass 3 mirrors — TODO
- [ ] A6. next.config: turbopack.root, proxy.ts (not middleware), dynamic search/user routes — TODO
- [ ] A7. /api/health: env presence + Supabase + AI provider checks, no secrets — TODO

## B. Auth and app shell
- [ ] B1. Supabase auth (email/password + Google), /auth/callback safe redirect, proxy.ts protection, profile trigger, RLS on every table — TODO
- [ ] B2. App shell: sidebar, quota ring, theme toggle, Cmd+K palette, skeletons, toasts, 404/error boundaries, responsive 360px, WCAG AA — TODO

## C. Search Everywhere engine
- [ ] C1. lib/safe-fetch.ts — SSRF-safe, robots cache, 1 req/s/host, 1 MB cap, 5s timeout (draft written 2026-10-22 under the earlier spec; tests pending) — TODO
- [ ] C2. lib/sources/policy.ts — hard blocklist + breach-dump detector, enforced + tested (draft written 2026-10-22; tests pending) — TODO
- [ ] C3. Source registry + providers — IN PROGRESS (2026-10-22: engine phase 1 live in lib/engine/search.ts — Nominatim geocode + Overpass POST/3 mirrors + website extraction via safe-fetch, wired into /api/ai/leads with Groq/sample fallback; remaining sources TODO)
- [ ] C4. Extractors: emails/phones from business sites, ranking, E.164, MX/disposable verification, never invent contacts — TODO
- [ ] C5. Dedupe (phone/domain/Jaro-Winkler ≥0.88 within 150 m), confidence score, provenance per field — TODO
- [ ] C6. Orchestrator + POST /api/search — IN PROGRESS (quota + fallback chain live in /api/ai/leads; jobs table/polling UI TODO)
- [ ] C7. Results UI: TanStack Table, badges, lead drawer, per-source chips, empty/error states — TODO

## D. AI features
- [ ] D1. lib/ai.ts provider switch (Groq/Gemini/OpenRouter/custom OpenAI-compatible incl. local Ollama), Zod-validated JSON, retry, cache, graceful fallback — TODO
- [ ] D2. Hybrid score 0.6 rule + 0.4 AI fit vs saved ICP, one-line reason — TODO
- [ ] D3. Business summary, website audit, niche expander, NL filter (strict Zod), outreach writer with opt-out — TODO
- [ ] D4. AI Research Agent: allowlisted tools, max 25 steps, budget, prompt-injection defense — TODO

## E. Exports
- [ ] E1. CSV/XLSX/JSON/vCard/PDF exports, formula-injection neutralization, private bucket + signed URLs, Exports page — TODO
- [ ] E2. Saved searches + cron re-run, share links, hashed API keys, HMAC webhooks — TODO

## F. Plans, payments, admin
- [x] F1 (core, 2026-10-22). Server quota: daily_usage table + atomic consume_daily_quota() in schema.sql, /api/usage, dashboard displays server values only (localStorage plan/usage removed). Plans-table admin editor still TODO
- [ ] F2. Payments — IN PROGRESS (2026-10-22: manual eSewa/Khalti/bank flow BUILT — server NPR price map, proof upload to private bucket, admin approve/reject queue activating Pro + subscription period; Razorpay/Stripe verified scaffold retained; Lemon Squeezy worldwide checkout + signed idempotent webhook BUILT, needs owner LS keys)
- [ ] F3. Admin: overview, users, subscriptions, money, real-time audit log, source toggles, removal requests, announcements, settings; role check everywhere — TODO

## G. Design (after the app works)
- [ ] G1. Dark-first design system (#0B0B0F, accent #FF6A1F, Bricolage Grotesque + Geist), no fake counts, reduced-motion — TODO
- [ ] G2. Landing page: hero, how-it-works, bento, honest labeled demo, pricing with fair-use footnote, FAQ, footer, one lazy 3D element max — TODO

## H. Security and launch
- [ ] H1 (partial, 2026-10-22: RLS enabled on all tables with real policies in schema.sql; gitleaks history scan clean; security headers + CSP payment/Supabase allowances live; npm audit blocked by this environment registry policy — run locally). Remaining: RLS/IDOR tests, 403 checks, Zod everywhere, rate limits, security headers, gitleaks, npm audit, SSRF + quota race tests — TODO
- [ ] H2. SECURITY.md, README (setup, env names, manual steps), go/no-go checklist — TODO
