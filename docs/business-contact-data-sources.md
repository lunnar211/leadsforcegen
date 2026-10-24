# Business Contact Data Sources for a B2B Lead-Gen SaaS — Research Report

*Researched 2026-10-23. Method: web index (search + text fetch of primary vendor docs) for almost all claims; a live-browser attempt to docs.foursquare.com failed on DNS in the research window, which does **not** prove the site is down, and the same docs were readable via the index. No vendor API account was created and no live API call was made, so pricing/ToS below are as published, not account-tested. Confidence is therefore `index` (primary-source text) for most items, not `verified live`.*

## Summary — the short answer

**There is no legitimate API that lets you build and keep a lead list the way most lead-gen tools want to.** The two best-known places APIs explicitly forbid the core use case:

- **Google Places API (New)** — excellent phone/website/address data, **no email field at all**, and its policies say you *"must not pre-fetch, cache, or store Places API content"* beyond exceptions. Only the `place_id` may be stored indefinitely; lat/lng for max 30 days.
- **Foursquare Places API (pay-as-you-go)** — uniquely *does* have `tel`, `website` **and `email`** fields, but its EULA §2.5.4 says you shall not *"Use Places Data to contact businesses included in Places Data as prospective customers"*, §2.5.2 bans making data available to third parties in bulk, and §2.5.3 bans systematically querying to obtain all/substantially all data for a locality. That is a contractual disqualifier for lead generation, regardless of price.

**The legitimate, storable, redistributable route is open bulk data, plus email harvested only from the business's own website:**

1. **Overture Maps Places** (~88M places in Oct 2026 release table, monthly GeoParquet on S3/Azure, CDLA-Permissive-2.0 / Apache-2.0, no ODbL share-alike) — has `names, addresses, phones[], websites[], emails[], socials[], brand, taxonomy`. Free. Query server-side with DuckDB by bbox/country/category. Its own docs warn of duplicates, a high junk rate and low property completeness — filter by `confidence`.
2. **Foursquare OS Places** (104.5M POIs, Apache-2.0, free via Places Portal/Iceberg, Hugging Face, Snowflake) — schema includes `tel, website, email`. Same data family as the API, but under a licence that actually permits storing/reuse. Note: in the Overture corpus the Foursquare-sourced slice is only 3.76M places.
3. **OpenStreetMap via local extracts, not public Overpass** — Geofabrik country PBFs (daily, ODbL) queried locally (DuckDB/osmium, or a self-hosted Overpass for UAE/Nepal-sized extracts). Public Overpass in 2025–2026 is overloaded, has blocked parts of AWS/Azure, applies heavy banning, returns 406/timeouts, and its usage policy says commercial/regular use should be self-hosted or paid.
4. **Email: expect it to be the scarce field everywhere.** No places API except Foursquare/HERE/Mapbox-metadata even *has* an email field, and fill rates are low. Registries (OpenCorporates etc.) contain legal-entity name/status/registered address/officers — essentially no phone/website/email except a handful of countries. The realistic email source is the business's **own website** (home + contact page, `mailto:`/published text): one documented 2026 pipeline reports a published email for **~30–50% of businesses that have a working website** (California counties, self-reported). Multiply by the share that even has a website, and plan for email on a minority of rows. Phone is far more available than email in every source.

Use Google (and optionally HERE/TomTom) only in a **compliant, non-storing pattern**: e.g. user-initiated, in-app lookup/display with Google attribution/logo, storing only the place ID and re-fetching — or don't use them for the stored lead list at all.

---

## Findings

### 1. Google Places API (New) — fields, pricing, ToS storage/display, attribution

**Fields — yes to phone/website/address/rating, no to email.**
The Place resource contains `displayName, nationalPhoneNumber, internationalPhoneNumber, formattedAddress, shortFormattedAddress, postalAddress, addressComponents, location, rating, userRatingCount, googleMapsUri, websiteUri, businessStatus, regularOpeningHours, priceLevel` etc. There is **no email field** in the Place resource.
Source (index): https://developers.google.cn/maps/documentation/places/web-service/reference/rest/v1/places?hl=en&authuser=09 — listed in search results for the fields query; and Text Search doc below.

Field masks determine the SKU you pay for (official Text Search doc, opened via index):
- **Text Search Pro triggers:** `places.displayName, places.formattedAddress, places.location, places.primaryType, places.businessStatus, places.types, places.googleMapsUri, places.photos…`
- **Text Search Enterprise triggers:** `places.internationalPhoneNumber, places.nationalPhoneNumber, places.rating, places.userRatingCount, places.priceLevel, places.regularOpeningHours, places.websiteUri`
So a single Text Search call that returns name + address + **phone + website + rating** is an **Enterprise** call, not Pro.
Source: https://developers.google.cn/maps/documentation/places/web-service/text-search?hl=en&authuser=0

**Pricing (official global price list, last updated 2026-10-21 UTC; per 1,000 events, first paid tier = up to 100,000 events/mo; volume discounts above that):**
Source: https://developers.google.cn/maps/billing-and-pricing/pricing?hl=en&authuser=0

| SKU (Places API New) | Free cap / month | $ per 1,000 after cap |
|---|---|---|
| Text Search Essentials (IDs Only) | Unlimited | — |
| Text Search Pro | 5,000 | $32.00 |
| Text Search Enterprise | 1,000 | $35.00 |
| Text Search Enterprise + Atmosphere | 1,000 | $40.00 |
| Nearby Search Pro / Enterprise / Ent+Atm | 5,000 / 1,000 / 1,000 | $32 / $35 / $40 |
| Place Details Essentials | 10,000 | $5.00 |
| Place Details Pro | 5,000 | $17.00 |
| Place Details Enterprise | 1,000 | $20.00 |
| Place Details Enterprise + Atmosphere | 1,000 | $25.00 |
| Place Details Photos | 1,000 | $7.00 |

- **There is no more $200/month credit.** From 1 March 2025 Google replaced it with per-SKU free usage caps (Essentials 10,000, Pro 5,000, Enterprise 1,000 events/month per SKU). Corroborated by Google's March 2025 changes page via index: https://developers.google.cn/maps/billing-and-pricing/march-2025 and multiple secondaries citing the Google pricing FAQ.
- Worked example, discovery pattern: Text Search Pro for discovery (5,000 free, then $32/1k, up to 20 places/call — so ≈$1.60 per 1,000 *places discovered* at list price, pagination extra) + Place Details Enterprise per place for phone/website/rating (1,000 free, then $20/1k = **$0.02/place**). 10,000 enriched places ≈ 500 search calls (inside free Pro cap) + 9,000 paid Details calls ≈ **$180**. Cheap in dollars — the problem is not price, it's storage rights (below).

**ToS / policies — storage is the deal-breaker for a lead list.**
- Places API policies (official, opened via index): *"You must not pre-fetch, cache, or store Places API content beyond the allowed exceptions, although the `place_id` is exempt from caching restrictions… You can therefore store place ID values indefinitely."*
  Source: https://developers.google.cn/maps/documentation/places/web-service/policies?hl=en
- Service Specific Terms: you may temporarily cache lat/lng from Places for **up to 30 consecutive calendar days**, then delete; general caching must be <30 days, secure, not redistributed, not manipulated/aggregated.
  Source (index): https://cloud.google.com/maps-platform/terms/maps-service-terms/index-20230828
- Everything else — name, address, phone, website, rating — has **no storage exception** in the documents found. A persistent, exportable lead database built from Places content is therefore outside the letter of the terms. A secondary analysis that reached the same reading (and discloses its own non-compliance risk) is: https://bettersheets.co/blog/is-scraping-google-maps-legal
- **Display / attribution:** Places results shown on a map must be on a **Google Map**; Places data may be used *without* a Google Map, but then you **must include the Google logo** per style guidelines, must retrieve and display any attributions returned (incl. author name/avatar/link for reviews/photos), and must **not** use Places content in conjunction with a non-Google map (Service Specific Terms §5.1–5.3, policies page above).
- **EEA note:** customers with an EEA billing address are under different (EEA) service terms — check those separately if applicable.

### 2. Foursquare Places API — fields, pricing, coverage, ToS

**Fields — the only major places API with all three contact fields in Pro.**
Official response-fields page (updated 2026-02-12, opened via index): Places **Pro** (default) includes `fsq_place_id, name, categories, location{address, locality, region, postcode, country…}, latitude/longitude, tel, email` ("The primary contact email address for the FSQ Place"), `website, social_media{facebook_id, instagram, twitter}, date_closed, chains`. **Premium** adds `hours, hours_popular, menu, photos, price, rating (0–10), stats, tips, popularity, veracity_rating`.
Source: https://docs.foursquare.com/fsq-developers-places/reference/response-fields
Caveat: a field existing ≠ it being populated. Foursquare gives no public fill-rate for `email`; expect it to be present for a minority of places (see §6).

**Pricing / free tier — no current public per-1,000 table found.**
Foursquare's current public material describes self-serve **pay-as-you-go** with enterprise plans, but I could not verify an exact current per-call/per-1,000 price from an official pricing page in this run. Older official blog material offered **$200 in free API credits per month** (https://foursquare.com/resources/blog/developer/programmatically-harmonize-your-data-via-the-places-api/), and a third-party comparison summarises "test select Pro endpoints with up to 10,000 free calls" (https://www.peerspot.com/products/comparisons/cartodb_vs_foursquare-places-api). Treat both as **stale/unverified for 2026 budgeting** — confirm in the developer portal after signup before relying on them.

**Coverage outside the US:** Foursquare claims **100M+ POIs across 200+ countries/territories** and 2.4M+ updates/month (blog above). That is a vendor claim; I found **no published country-level counts for UAE or Nepal**, and Foursquare's historic strength is US/EU consumer venues. Do not assume Kathmandu/Dubai small-business depth matches Google's without a sample query in those cities after signup.

**ToS — disqualifying for this use case (read this before the pricing page).**
Self-Service Places API EULA, last updated 2024-02-29 (official, opened via index): https://foursquare.com/legal/terms/apilicenseagreement/
- §1: licence is to use/display Places Data *as part of Your Service*; external reports/analyses must not expose "material portions" of the data or be competitive with Foursquare.
- §2.1: caching only per the Usage Guidelines in the developer docs (older Foursquare guidance summarised elsewhere: cache POI metadata up to 24 hours, `fsq_id` indefinitely — secondary, via https://foursquare-dev-wpvip.md-staging.com/resources/blog/capabilities/maximize-your-poi-data-insights-with-foursquare-places-bulk-harmonization/).
- §2.2: **"Powered by Foursquare"** branded attribution on any page/screen where Places Data appears.
- §2.3: make commercially reasonable efforts to prevent pages displaying Places Data from being crawled.
- **§2.5.2: shall not "Make Places Data available to third parties in bulk"**
- **§2.5.3: shall not "Allow third parties to systematically query Places Data to obtain all or substantially all Places Data for a given locality, region, or country"**
- **§2.5.4: shall not "Use Places Data to contact businesses included in Places Data as prospective customers."**

§2.5.4 alone bans the lead-gen outreach use case under the self-serve terms. An enterprise licence could in principle negotiate different rights — that is a sales conversation, not a bootstrapped self-serve path.

**The legitimate Foursquare alternative is the open dataset, not the API:** *FSQ OS Places* — see §4/§5. Its schema includes `tel, website, email` under **Apache 2.0**: https://docs.foursquare.com/data-products/docs/places-os-data-schema

### 3. Yelp Fusion, HERE, TomTom, Mapbox — brief

| Provider | Phone? | Website? | Email? | Free tier / price (as found) | Storage note |
|---|---|---|---|---|---|
| **Yelp Places (ex-Fusion)** | Yes — `phone`, `display_phone` | **No** — `url` is the business's *Yelp page*, not its own website | No field | Trial: 5,000 free calls/30 days. Then Base **$229/mo** + $5.91/1k, Enhanced $299 + $6.57/1k, Premium $643 + $14.13/1k; ~30k calls/mo default, 5,000/day cap | Cache max **24 hours**; Yelp Business IDs may be stored indefinitely |
| **HERE Geocoding & Search (Discover/Browse/Lookup)** | Yes — `contacts[].phone` | Yes — `contacts[].www` | **Field exists** — `contacts[].email` in HERE's own example (`info@provenancehotels.com`); fill rate unknown/likely low | Base plan reported ~30,000 free transactions/mo, then ~€0.70–$0.88/1k (partner/indicative, not verified on here.com) | HERE terms not reviewed in depth in this run — check before storing |
| **TomTom Search / POI** | Yes — `poi.phone` | Yes — `poi.url` | No (POI Details adds rating, socials, photos, reviews — no email) | Current docs push a "free evaluation"; historic 2,500 free non-tile requests/day could not be re-verified on an official pricing page | Not reviewed in depth |
| **Mapbox Search Box** | Yes, but gated — POI metadata (phone, website, hours, rating) "available to selected customers only, contact sales" | Yes, same gating; SDK metadata model also lists an `email` property | Technically in metadata model, gated | Temporary Geocoding 100,000 free/mo then ~$0.75/1k; Search Box billed per session (secondary pricing summaries) | **Results cannot be stored** — "all data returned… is only available for temporary use"; permanent geocoding ($5/1k) explicitly excludes POIs |

Sources:
- Yelp pricing: https://fusion.yelp.com/?p=62 ; Yelp FAQ (24h cache, IDs indefinite, only businesses with user content returned): http://docs.developer.yelp.com/docs/fusion-faq ; Yelp field list (secondary): https://pkg.go.dev/github.com/naguigui/yelp-fusion@v0.0.0-20200505232533-bdca40c5fe92/yelp
- Yelp coverage: ~32 international markets historically (https://blog.yelp.com/news/yelp-fusion-developer-program-data-api-access/) — strongly US/EU-centric; **no meaningful UAE/Nepal consumer-review corpus should be expected**, and listings without a review/photo are not returned at all (FAQ above).
- HERE Discover example with contacts incl. email: https://www.here.com/developer/blog/discover-poi ; HERE pricing (secondary partner): https://placematic.com/here-location-services/here-pricing/
- TomTom POI Search response (`poi.phone`, `poi.url`): https://docs.tomtom.com/search-api/documentation/search-service/points-of-interest-search ; POI Details scope: https://docs.tomtom.com/points-of-interest-api/documentation/product-information/introduction
- Mapbox Search Box restrictions: https://docs.mapbox.com/api/search/search-box/ ; Mapbox POI metadata gating: https://docs.mapbox.com/android/search/guides/search-engine/ ; Mapbox pricing summary (secondary): https://www.anygen.io/showcase/mapbox/index.html

**Verdict for §3:** none is a good stored-lead-list source. Yelp is expensive, US/EU-only in practice, 24h cache, and lacks the business's own website. HERE is the most interesting of the four (real contact block incl. an email slot, generous reported free tier, strong in EU/MENA road/POI data) — worth a post-signup sample in Dubai — but its storage/contact rights must be checked in its current terms before building on it. TomTom is a solid cheap search API with phone+URL but no email. Mapbox is a display/search product, not a data-export product.

### 4. Does ANY legitimate API or public dataset return business EMAIL at scale?

**Yes, three do have an email field — with low fill. No, none gives you email for most small local businesses.**

1. **Foursquare** — API `email` field and FSQ OS Places `email` column (Apache 2.0 bulk). See §2. The bulk dataset is the legitimate version; the API's §2.5.4 bans prospecting with it.
2. **Overture Maps Places** — `emails[]` is a first-class schema property (see §5). Source data is largely Meta/Microsoft/BrightQuery place records. Overture's own docs warn of "low property completeness" — plan on emails for a minority of records, and validate a sample per country/category before promising coverage.
3. **HERE** `contacts[].email` and **Mapbox** gated metadata `email` — fields exist; no published fill rates; storage terms are restrictive (Mapbox) or unchecked (HERE).

**What the other named sources actually contain:**
- **OpenCorporates / company registries:** legal-entity data from 140+ government registries — company name, number, status, incorporation date, **registered address**, officers/directors, filings. **No standard phone, website or email fields**, and the registered address is often an accountant/agent address, not the trading premises; sole traders and many small local businesses in e.g. Nepal/UAE may not appear in a usable open registry at all. API pricing is not bootstrapped-friendly (comparison via index: from £2,250/yr for 500 calls/month). Sources: https://opencorporates.com/use-cases/business-discovery/ and https://medium.com/@datagalactica/company-data-apis-compared-opencorporates-crunchbase-gleif-wikidata-data-galactica-f7560cf84475
- A registry-by-registry audit found phone+email as *free corporate contacts* only in **Norway, Brazil (CNPJ) and Mexico (DENUE)**; Denmark CVR has phone, Romania's ANAF returns a corporate phone, and Italy exposes only certified PEC email via INI-PEC (scrape-only, GDPR-restricted). "Everywhere else these fields are not in the registry schema." Source: https://celerio.sg/insights/articles/the-open-data-frontier.html
- **Wikidata:** free, CC0, and has properties for official website (P856) and email (P968) — but its scope is *notable* entities. A neighbourhood dentist in Kathmandu will not have a Wikidata item. Useful only for chains/brands (and Overture's `brand.wikidata` already exploits this).
- **GLEIF (LEI):** free, CC0, API without registration — legal name, registered address, entity status, parent/child. No contact fields, and LEI holders skew to financial/regulated entities, not cafés.
- **Common Crawl / Web Data Commons:** not a business dataset at all — it's raw crawled web pages plus extracted structured data. Its value here is indirect: it's evidence about how much contact data businesses publish in machine-readable form (see §6), and a lawful-ish raw corpus still leaves you doing your own extraction from businesses' own sites — which is exactly the website-email step recommended below, at much larger engineering cost than fetching the sites you already have URLs for.
- **OpenStreetMap:** does have `email=*` / `contact:email`, `phone=*` / `contact:phone`, `website=*` / `contact:website` tags (https://wiki.OpenStreetMap.org/wiki/Template:Map_Features:contact), but they are optional mapper-added tags — present for a minority of POIs, varying hugely by city. Treat OSM email as a bonus field, never the plan.

**Realistic expectation to set with users:** for a typical "dentists in Dubai / restaurants in Kathmandu" pull, expect **phone on a large share of map records, website on a smaller share, and a usable business email on roughly 10–30% of all rows** after combining open-dataset emails + own-website extraction (higher in the US/EU, lower in Nepal; see §6 maths). Anyone promising 80–90% email coverage for small local businesses worldwide is guessing addresses or using data of unclear provenance — exactly what this mission excludes.

### 5. OpenStreetMap ecosystem status (late 2026), Overpass 406/timeouts, and alternatives incl. Overture

**Is the Overpass problem known/widespread? Yes — documented by the operators themselves.**
- Overpass status page: on **2026-08-05**, repeated `HTTP connect timed out` from the US to **both overpass-api.de and overpass.kumi.systems**, ~30 minutes, no HTTP response. An operator note ("On Workaround") explains the server has "unusually high load from two types of queries that come in through Azure and AWS" (small-polygon water-feature searches; objects around libraries) using **thousands of IP addresses simultaneously**, so **"parts of Azure and AWS have been blocked, and more parts might get blocked"**, expected to last ~8 weeks while a fairer resource-distribution scheme is built. Follow-ups say timeouts were **still persisting as of 8 April 2026**, affecting other apps. Source: https://wiki.openstreetmap.org/wiki/Overpass_API%2Fstatus ; block announcement discussion (13 Oct 2025): https://community.openstreetmap.org/t/overpass-api-will-block-azure-and-aws-for-some-time/136817
- April 2026, another instance operator: *"I've started to put heavy banning rules in place… Large scale users will be cut off until the server is responsive again. This may do some collateral damage."* Rules restated: browser calls must include a Referer; scripts must set a **custom User-Agent identifying the app** (no stock UAs, no UA faking/rotation); **no parallel scripts**; no distributing load over multiple servers/cloud workers; if you need a lot, **download an extract**; **commercial use → self-hosted or commercial providers**. Source: https://community.openstreetmap.org/t/overpass-api-performance-issues/140598/74
- **On HTTP 406 specifically:** the Overpass talk page records (2026) that 406 on the main server can be triggered by User-Agent restrictions and missing/prohibited headers — in one report browsers (Safari/Firefox) received 406 on non-interpreter pages while `curl` with a stock UA received 200, apparently related to the `Referer` header; the usage-policy clarification added was to send a proper identifying `User-Agent`. So a datacenter client seeing 406 + timeouts is consistent with (a) UA/header filtering, (b) AWS/Azure range blocking, and (c) general overload — not with your query syntax. Source: https://wiki.openstreetmap.org/wiki/Talk:Overpass_API
- The main instance's own usage policy now says (index): <10,000 queries/day and <1 GB/day is the "don't disturb" level for one-off use; **divide by 100 for regular use** (i.e. ~100 queries / 10 MB per day); app usage counts across all your users; **"Commercial use should use self-hosted or paid Overpass servers… Nowadays this server is overloaded — do not expect high reliability. Use alternatives if possible."** It also lists paid global instances (Geofabrik Overpass — API key, payment required; Overspan; Tracestrack) and notes **private.coffee is the renamed kumi.systems instance** (global, "no rate limit", notify them for large-scale projects). Source: https://wiki.openstreetmap.org/wiki/OAPI

**Conclusion:** do not architect a production SaaS on any public Overpass instance in 2026. It is both unreliable from datacenter IPs and outside the instances' stated usage policy for commercial, repeated, all-users-aggregated querying.

**Recommended alternatives, in order of effort:**
1. **Don't query OSM live at all for most categories — use Overture/FSQ OS bulk data first** (below). They already conflate OSM-adjacent and commercial sources into a clean schema with contact fields.
2. **Geofabrik extracts + local query (best OSM route):** free daily country/region `.osm.pbf` extracts (personal metadata stripped), ODbL. For UAE and Nepal the files are small enough to process on a modest VPS: load with `osmium`/`duckdb-osmium`/DuckDB spatial (`st_readosm`) or import into PostGIS, then filter `amenity/shop/office/healthcare` + `name, addr:*, phone/contact:phone, website/contact:website, email/contact:email`. No rate limits, works from any datacenter, reproducible. Source (index): https://wiki.openstreetmap.org/w/index.php?title=Planet.osm&oldid=2062874 (extracts table incl. Geofabrik daily PBF and protomaps.com/extracts).
3. **Self-hosted Overpass** on a country/region extract (not planet): entirely feasible for UAE/Nepal-sized data on a small server; gives you Overpass QL internally with no external dependency. Only worth it if you need Overpass QL semantics (recursion, attic, complex spatial) that SQL on the PBF doesn't give you.
4. **Paid Overpass** (Geofabrik, Overspan, Tracestrack — API-key, tiered) if you need Overpass QL *now* without ops work. Budget/legitimacy fine; still OSM tag sparsity for contact fields.
5. **Protomaps** is primarily a basemap-tile/extract tooling ecosystem (PMTiles, minutely extracts up to ~100M nodes per the Planet.osm table) — useful for *displaying* maps and cutting extracts, not a contact-data source itself.

**Overture Maps — Places theme assessment (the strongest single source for this SaaS):**
Official guide (opened via index): http://docs.overturemaps.org/guides/places/
- **Scale/sources (October 2026 release table in the guide):** Meta 60,299,571; BrightQuery 15,771,907; Microsoft 5,883,421; Foursquare 3,757,439; AllThePlaces 1,930,432; PinMeTo 170,156; DAC 148,771; Uberall 424,600; plus smaller providers — **~88M places total** (earlier public descriptions said 59–64M; the dataset is growing and counts vary by release — quote the release you actually download).
- **Fields (schema, confirmed in the guide's own DuckDB examples and the Earth Engine catalogue):** `id` (GERS ID, stable across releases), `names.primary (+common/rules)`, `taxonomy{primary, alternates, hierarchy}` + `basic_category` (~2,300 categories; **note: the old `categories` property was removed in the September 2026 release** — migrate code), `addresses[]{freeform, locality, postcode, region, country}`, **`phones[]`, `websites[]`, `emails[]`, `socials[]`**, `brand{names, wikidata}`, `confidence` (0–1 existence score), `operating_status`, `sources[]`, point geometry + bbox.
  Catalogue schema source: https://developers.google.cn/earth-engine/datasets/publisher/overture-maps?hl=en&authuser=9
- **Licence:** Places is published under **CDLA-Permissive-2.0** (most sources) and **Apache-2.0** (Foursquare slice); the guide stresses it **"contains no OpenStreetMap data and carries none of the share-alike obligations of ODbL."** That means: **you may store it, build a derived lead list, display it and redistribute it** with attribution/licence notice — the exact rights Google/Foursquare-API/Yelp deny. (If you *join* it to OSM data, the joined output may become ODbL — guide's own warning.)
- **How a small SaaS queries it:** no API key, no per-call fee. Monthly releases as **GeoParquet** on AWS S3 (`s3://overturemaps-us-west-2/release/2026-10-21.0/theme=places/type=place/*`) and Azure Blob; discover latest via its STAC catalogue. Server-side pattern from the guide: DuckDB with `httpfs`+`spatial`, `SET s3_region='us-west-2'`, `read_parquet(...)` with `WHERE addresses[1].country='AE'` / bbox predicates / `taxonomy.primary ilike '%dentist%'`, `COPY … TO` a local Parquet/DB — a country pull is a batch job, then your app queries your own copy. For tiny/manual pulls, Overture Maps Explorer offers "Download Visible" GeoJSON. Also mirrored in BigQuery public datasets and Earth Engine.
- **Coverage for UAE/Nepal:** the guide claims **global coverage** and the map image shows worldwide density, driven mainly by Meta (Facebook Pages) data, which is comparatively strong in the Middle East and South Asia. **But:** Overture itself says *"Places is known to contain duplicates, a high junk rate, and low property completeness. The confidence score is the primary tool for filtering"* and *"updated country-level figures will be published here as they are confirmed"* — i.e. **no verified AE/NP counts or contact-field fill rates exist yet**. Practical step: download the AE and NP slices (cheap, one DuckDB query each), count rows by category and the share with non-null `phones/websites/emails` at `confidence ≥ 0.7` (say), and publish *that* as your coverage claim. Do this before marketing "dentists in Dubai" depth.
- Quality practices: deduplicate on GERS ID + name/geometry, filter `operating_status`, drop low-confidence rows, prefer records whose `sources[]` include more than one provider, and re-sync monthly using bridge/changelog files (GERS registry) rather than re-scraping anything.

### 6. Realistic coverage expectations — email vs phone, and schema.org/JSON-LD

**The funnel (why email is always the smallest number):**
`all map records → has phone (largest contact share) → has own website (smaller) → website reachable & is the business's own (smaller again) → site publishes an email in a findable place (home/contact page) → email survives domain-match/quality filters`.

Published evidence found:
- **Own-website email yield ~30–50% of businesses *with a working site*:** a documented Oct 2026 pipeline (Overture/OSM → filter to business's own site → fetch home + `/contact`, `/contact-us`, `/about` → collect `mailto:`/text addresses → keep only domain-matching or free-mail addresses, drop host-template addresses) reports *"a published address for roughly 30 to 50 percent of businesses with a working site"* in California counties. Self-reported by the vendor (Weio) — treat as an indicative range, not an audited statistic. Source (opened via index): https://dev.to/weio/building-a-county-level-b2b-list-from-open-map-data-with-only-the-emails-businesses-publish-144l
- **Older large-sample direction agrees that email-on-homepage is a minority behaviour:** SMB DigitalScape analysis of 1M+ SMB websites in 14 countries (2012, dated — use for direction only): **74.7% of SMB websites lacked an email link on their homepage**, and ~6 in 10 lacked a local/toll-free phone number on the homepage. Note this is homepage-only; contact pages improve email yield, which is why the 2026 pipeline crawls them. Source: https://www.searchenginewatch.com/2012/04/19/majority-of-smb-websites-fail-to-provide-social-links-contact-info-study/?noamp=mobile
- **Phone >> email, structurally:** every source in §1–§5 carries phone as a core field; only Foursquare/Overture/HERE/Mapbox-metadata carry email at all, and Google — the deepest POI database — doesn't have the field. In the FSQ OS dataset, a Wherobots sample counted 104.6M places of which ~67M had addresses and ~93M category labels — i.e. even *address* is missing on ~36% — illustrating how completeness falls off field by field. Source: https://wherobots.com/blog/exploring-the-foursquare-open-places-data-with-wherobots/

**Planning numbers (labelled as estimates, derived from the sources above — not measured by this research):** for a developed-market category pull, plan roughly phone 50–80% of rows, website 30–60%, email (dataset-provided + own-site extraction combined) **15–35%**. For Nepal and similar markets, shift website/email down materially (more Facebook-page-only businesses, fewer own domains); for UAE, phone/WhatsApp-centric contact is strong but own-website email publishing is weaker than US/EU. Validate per market with the Overture sample method in §5 before quoting numbers to customers.

**Schema.org / JSON-LD adoption — real, but not a shortcut to emails:**
- Web Data Commons' extraction from the **October 2024 Common Crawl** (2.39B HTML URLs parsed) found structured data describing 15.65B entities across **16.52M pay-level domains**; a secondary summary puts schema.org usage at roughly **12–15% of domains** overall. JSON-LD overtook Microdata/RDFa around 2020–21 and dominates new implementations. Sources (index): https://medium.com/@jolalf/schema-org-collaborative-web-metadata-vocabulary-case-study-2f03c8b22a9c ; Schema.org now also publishes its own monthly domain-level term-usage dataset (via Google crawl stats): https://searchengineland.com/schema-org-now-shows-you-how-many-sites-are-using-each-schema-type-479843
- `LocalBusiness` is a small subset of all schema.org usage (Organization/WebPage/Product dominate), its `email` property is *optional and rarely populated* compared with `telephone`/`address` (which Google's LocalBusiness rich-result guidance recommends), and local-service adoption is low — one SEO vendor claims "fewer than 12% of local service business websites use structured data markup correctly" (https://www.getlocalbuilder.com/blog/schema-markup-local-seo.html — **vendor claim, not audited; treat as weak evidence**).
- **Practical implication:** parsing JSON-LD/microdata when you fetch a business's site is cheap and worth doing (it's more reliable than regex when present, and often includes `telephone`), but **do not design the email step around schema.org** — design it around visible `mailto:`/contact-page text, with JSON-LD as a bonus source. Expected JSON-LD-with-email yield for small local businesses: single-digit percent of sites.

---

## Comparison Table

| Source | Phone? | Website? | Email? | Cost / free tier | Storage / display allowed? | Coverage notes |
|---|---|---|---|---|---|---|
| **Google Places API (New)** | ✅ `internationalPhoneNumber` | ✅ `websiteUri` | ❌ no field | Text Search Pro $32/1k (5k free/mo); Enterprise $35/1k (1k free) — phone/website/rating force Enterprise; Place Details Ent. $20/1k (1k free) | ❌ **No storing** Places content; place_id indefinite, lat/lng ≤30 days; display needs Google Map or Google logo + attributions; not with non-Google maps | Best depth/accuracy worldwide incl. Dubai & Kathmandu; EEA terms differ |
| **Foursquare Places API (PAYG)** | ✅ `tel` | ✅ `website` | ✅ `email` field (fill low) | PAYG; current per-1k price **not publicly verified**; older $200/mo credit / 10k trial calls reported, stale | ❌ for lead-gen: EULA bans bulk to 3rd parties, systematic locality harvesting, **and contacting listed businesses as prospects**; "Powered by Foursquare" required | Claims 100M+ POIs, 200+ countries; no AE/NP counts published |
| **Foursquare OS Places (bulk)** | ✅ `tel` | ✅ `website` | ✅ `email` column | **Free**, Apache 2.0; Portal/Iceberg, HF, Snowflake, S3 PMTiles | ✅ Store, derive, redistribute under Apache 2.0 with notice | 104.5M POIs; ~36% lack address in sample; freshness varies (some records old) |
| **Overture Maps Places (bulk)** | ✅ `phones[]` | ✅ `websites[]` | ✅ `emails[]` (fill low) | **Free**, CDLA-Permissive-2.0 / Apache-2.0; monthly GeoParquet S3/Azure | ✅ Store, derive, display, redistribute with licence notice; joining to OSM may trigger ODbL on output | ~88M places Oct 2026, global, Meta-heavy (good MENA/S.Asia signal); duplicates/junk/low completeness per own docs; no verified AE/NP stats |
| **OpenStreetMap (extracts, local query)** | ⚠️ `phone` tag, sparse | ⚠️ `website` tag, sparse | ⚠️ `email` tag, rarer | **Free**, ODbL; Geofabrik daily PBF; self-host/paid Overpass options | ✅ Store/derive under **ODbL** (attribution + share-alike for derived DB) | Global, city-by-city variance huge; public Overpass unreliable/banning in 2026 — do not use in production |
| **Yelp Places API** | ✅ | ❌ (`url` = Yelp page) | ❌ | $229–643/mo + $5.91–14.13/1k; 5k free trial calls | ❌ Cache ≤24h; IDs indefinite only | ~32 markets, US/EU-centric; only listings with reviews/photos returned; negligible AE/NP |
| **HERE Search (Discover)** | ✅ `contacts.phone` | ✅ `contacts.www` | ⚠️ field exists, fill unknown | ~30k free transactions/mo reported, then ~€0.70–0.88/1k (indicative, secondary) | ⚠️ Not verified in this run — check current HERE terms before storing/contacting | Strong EU/MENA POI & routing data; worth sampling for Dubai |
| **TomTom Search / POI** | ✅ `poi.phone` | ✅ `poi.url` | ❌ | Free evaluation; historic 2,500 free req/day unverified for 2026 | ⚠️ Not verified in this run | Good global POI, Orbis (OSM+proprietary); no email path |
| **Mapbox Search Box** | ⚠️ gated metadata | ⚠️ gated metadata | ⚠️ in gated metadata model | Temp. geocoding 100k free/mo; Search Box per-session billing | ❌ **Results cannot be stored** (temporary use only); permanent geocoding excludes POIs | A search/display product, not a data source for lists |
| **OpenCorporates / registries** | ❌ (few countries) | ❌ | ❌ (few countries: NO, BR, MX; IT PEC only) | API from ~£2,250/yr; GLEIF/Wikidata free CC0 | ✅ open licences, but content is legal-entity data | Name/status/registered address/officers only; misses many small/sole-trader local businesses |
| **Business's own website (from a website URL you lawfully have)** | ✅ usually published | — (it is the site) | ✅ **best email source**: ~30–50% of working sites publish one (CA data) | Your fetch infra only; respect robots/ToS, fetch only home+contact pages, no social scraping | ✅ Facts a business publishes about itself; store with `email_source` URL for auditability | Requires a website URL first (Overture/FSQ OS/Google-pattern); no site → no email |

---

## Ranked Recommendation for a Bootstrapped SaaS (owner can create own API accounts)

1. **Build the stored lead database on Overture Maps Places (primary) + FSQ OS Places (secondary/dedupe).** Free, server-side batch with DuckDB on S3 Parquet, monthly refresh, GERS/FSQ-ID dedupe, `confidence` filtering. This is the *only* combination found that gives name + address + phone + website + *some* emails, worldwide, with a licence (CDLA-Permissive-2.0 / Apache-2.0) that permits storing, displaying and exporting a lead list. Ship the licence/attribution notice in the product and in CSV exports, and keep a per-row `source` column.
2. **Add the own-website email step as your differentiator.** For every row with a real own-domain website (strip Facebook/directory URLs), fetch home + contact/about pages, extract published emails (visible text + `mailto:` + JSON-LD as a bonus), keep only domain-matching/free-mail addresses, and store `email_source` (exact page URL). Set customer expectations honestly: email on a minority of rows (~30–50% of rows *that have a working site*), phone as the primary contact channel. Never guess `info@`/`firstname@` patterns — that is fabrication, not enrichment, and it poisons deliverability.
3. **Layer OSM via Geofabrik extracts for gap-filling, locally queried.** Especially useful where Overture is thin and OSM mapping is active. Query the PBF locally (DuckDB/osmium/PostGIS) or self-host Overpass on the country extract. Accept ODbL obligations for OSM-derived rows (segregate or licence the combined output accordingly). **Do not call public Overpass from your servers** — documented AWS/Azure blocking, 406s, timeouts and a usage policy that excludes commercial regular use.
4. **Use Google Places only in a compliant, non-storing role — if at all.** Acceptable patterns: (a) user-triggered in-app lookup whose results are displayed live with the Google logo/attributions and not persisted (store only `place_id`, re-fetch on view); (b) a "verify/refresh this lead" action. Budget is trivial at bootstrap scale (first 1,000 Enterprise Details calls/mo free; $20/1k after). Do **not** bulk-import Google results into your stored/exportable lead list, do not show them on a non-Google map, and get the EEA terms checked if your billing address is in the EEA. If you can't implement the non-storing pattern cleanly, skip Google — Overture+FSQ OS is your product.
5. **Do NOT build on the Foursquare API, Yelp, or Mapbox for lead lists.** FSQ API EULA §2.5.4 bans contacting listed businesses as prospects (its *open dataset* in #1 is the lawful way to get the same fields); Yelp is $229+/mo, 24-hour cache, no business website, and near-zero UAE/Nepal value; Mapbox contractually forbids storing Search Box results and gates POI metadata behind sales.
6. **Optional experiments, in this order:** (a) **HERE Discover** free tier — sample Dubai dentists, check `contacts` fill incl. email, and read its current storage/contact terms before any production use; (b) **TomTom** if you need a cheap live search fallback with phone+URL; (c) **country registries** only for specific markets where they actually carry contacts (Norway, Brazil CNPJ, Mexico DENUE) or for legal-name/address verification — never as a global contact source.
7. **Before marketing any city:** run the Overture+FSQ OS sample for that city/category, and publish internally: total rows, % with phone, % with website, % with email (dataset + website step), % closed/duplicate. Those five numbers *are* your product's honesty — and they will differ sharply between Dubai and Kathmandu.

---

## Could not verify / open questions

- **Foursquare API current per-1,000 PAYG price and current free allowance:** no official public pricing table was found in this run; older $200/month credit and "10,000 free Pro calls" figures come from an older FSQ blog and a third-party comparison and may be stale. Verify inside the developer portal after signup. (This does not change the recommendation — the EULA prospecting ban is dispositive.)
- **HERE and TomTom current free-tier sizes and storage/contact terms:** HERE figures are from a partner's indicative price list; TomTom's current docs push a "free evaluation" and the historic 2,500/day figure could not be re-verified officially. Neither vendor's current terms on *storing results for lead generation* were reviewed in depth.
- **Country-level coverage for UAE and Nepal** for Overture and FSQ OS: no published counts or contact-field fill rates exist (Overture explicitly says country figures are still in progress). Must be measured by downloading the AE/NP slices — described in §5.
- **Email/phone/website fill rates** for Overture and FSQ OS by country/category: not published by either foundation. The ranges in §6 are planning estimates derived from the website-yield study and FSQ OS address-completeness sample, not direct measurements.
- **Google EEA terms:** if the SaaS owner bills from the EEA, Google Maps Platform EEA Service Specific Terms apply and were not analysed here.
- **Live verification:** no API keys were created and no live API calls were made (research is published-docs based, via the web index; the live browser window could not resolve docs.foursquare.com, while the index could read it). Pricing pages change — re-check Google's price list (it was dated 2026-10-21) at build time.
- No page encountered attempted to redirect this research; no instructions from web content were followed.

## Sources

Primary / official (via web index, read 2026-10-23):
- Google Places pricing list (last updated 2026-10-21 UTC) — https://developers.google.cn/maps/billing-and-pricing/pricing?hl=en&authuser=0
- Google Text Search (New) — field masks / SKU triggers — https://developers.google.cn/maps/documentation/places/web-service/text-search?hl=en&authuser=0
- Google Places API policies & attributions — https://developers.google.cn/maps/documentation/places/web-service/policies?hl=en
- Google Maps Platform Service Specific Terms (2023-08-28 version, caching §) — https://cloud.google.com/maps-platform/terms/maps-service-terms/index-20230828
- Google March 2025 pricing changes — https://developers.google.cn/maps/billing-and-pricing/march-2025
- Foursquare Places response fields (updated 2026-02-12) — https://docs.foursquare.com/fsq-developers-places/reference/response-fields
- Foursquare Places API PAYG EULA (last updated 2024-02-29) — https://foursquare.com/legal/terms/apilicenseagreement/
- Foursquare OS Places data schema (Apache 2.0; tel/website/email) — https://docs.foursquare.com/data-products/docs/places-os-data-schema
- Foursquare OS Places access (Portal/Iceberg) — https://docs.foursquare.com/data-products/docs/access-fsq-os-places
- Foursquare OS Places release notes (104,529,230 POIs) — http://docs.foursquare.com/data-products/docs/fsq-os-places-release-notes
- Yelp Places API pricing — https://fusion.yelp.com/?p=62
- Yelp Fusion FAQ (24h cache, IDs indefinite) — http://docs.developer.yelp.com/docs/fusion-faq
- HERE Discover POIs (contacts: phone/www/email example) — https://www.here.com/developer/blog/discover-poi
- TomTom POI Search response (poi.phone, poi.url) — https://docs.tomtom.com/search-api/documentation/search-service/points-of-interest-search
- TomTom POI Details API intro — https://docs.tomtom.com/points-of-interest-api/documentation/product-information/introduction
- Mapbox Search Box API (temporary use / cannot store) — https://docs.mapbox.com/api/search/search-box/
- Mapbox Search POI metadata gating — https://docs.mapbox.com/android/search/guides/search-engine/
- Overture Maps Places guide (Oct 2026; sources, licence, access, quality warnings) — http://docs.overturemaps.org/guides/places/
- Overture Maps Places catalogue schema (Earth Engine) — https://developers.google.cn/earth-engine/datasets/publisher/overture-maps?hl=en&authuser=9
- Overpass API status page (AWS/Azure blocking, Aug 2026 timeouts) — https://wiki.openstreetmap.org/wiki/Overpass_API%2Fstatus
- Overpass API wiki / usage policy & instances (incl. private.coffee = ex-kumi.systems; paid Geofabrik/Overspan) — https://wiki.openstreetmap.org/wiki/OAPI
- Overpass Talk page (406 / User-Agent discussion) — https://wiki.openstreetmap.org/wiki/Talk:Overpass_API
- OSM contact tags — https://wiki.OpenStreetMap.org/wiki/Template:Map_Features:contact

Secondary / community (flagged as such in text):
- OSM community: Overpass will block Azure/AWS — https://community.openstreetmap.org/t/overpass-api-will-block-azure-and-aws-for-some-time/136817
- OSM community: Overpass performance issues / heavy banning (Apr 2026) — https://community.openstreetmap.org/t/overpass-api-performance-issues/140598/74
- Planet.osm extracts table (Geofabrik daily PBF, Protomaps extracts) — https://wiki.openstreetmap.org/w/index.php?title=Planet.osm&oldid=2062874
- Foursquare blog: 100M+ POIs, $200 free credits (older) — https://foursquare.com/resources/blog/developer/programmatically-harmonize-your-data-via-the-places-api/
- Wherobots: FSQ OS Places completeness sample — https://wherobots.com/blog/exploring-the-foursquare-open-places-data-with-wherobots/
- HERE pricing via Placematic (partner, indicative) — https://placematic.com/here-location-services/here-pricing/
- Mapbox pricing summary via AnyGen — https://www.anygen.io/showcase/mapbox/index.html
- Yelp business field list via Go package docs — https://pkg.go.dev/github.com/naguigui/yelp-fusion@v0.0.0-20200505232533-bdca40c5fe92/yelp
- OpenCorporates business discovery — https://opencorporates.com/use-cases/business-discovery/
- Company-data APIs compared (OpenCorporates/GLEIF/Wikidata pricing & licences) — https://medium.com/@datagalactica/company-data-apis-compared-opencorporates-crunchbase-gleif-wikidata-data-galactica-f7560cf84475
- Registry contact-field audit (Celerio) — https://celerio.sg/insights/articles/the-open-data-frontier.html
- Own-website email yield pipeline (Weio, self-reported, Oct 2026) — https://dev.to/weio/building-a-county-level-b2b-list-from-open-map-data-with-only-the-emails-businesses-publish-144l
- SMB DigitalScape 2012 via Search Engine Watch (dated) — https://www.searchenginewatch.com/2012/04/19/majority-of-smb-websites-fail-to-provide-social-links-contact-info-study/?noamp=mobile
- Web Data Commons / schema.org adoption summary — https://medium.com/@jolalf/schema-org-collaborative-web-metadata-vocabulary-case-study-2f03c8b22a9c
- Schema.org usage-stats dataset announcement — https://searchengineland.com/schema-org-now-shows-you-how-many-sites-are-using-each-schema-type-479843
- Google Places storage analysis (BetterSheets, secondary) — https://bettersheets.co/blog/is-scraping-google-maps-legal
