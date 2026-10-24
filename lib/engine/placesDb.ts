import "server-only";
import { serviceClient } from "@/lib/quota";

// Stored business listings: Overture Maps Places, ingested monthly into
// the Supabase `places` table by scripts/ingest_overture.py. Overture's
// licence (CDLA-Permissive-2.0 / Apache-2.0) permits storing this data —
// unlike places APIs whose terms forbid keeping their results. Rows
// carry the contacts from the listing itself (phone / website / email /
// socials), which makes this the engine's richest source: measured on
// the 2026-10 release, ~85% of Dubai rows have a phone and ~55% an
// email; Kathmandu ~86% phone, ~69% email. Every query fails open to [].
export type PlaceRow = {
  id: string;
  name: string;
  category: string | null;
  lat: number;
  lon: number;
  phone: string | null;
  website: string | null;
  email: string | null;
  socials: string[] | null;
  address: string | null;
  locality: string | null;
  confidence: number;
};

// Canonical niche -> Overture basic_category values.
const CATEGORY_MAP: Record<string, string[]> = {
  dentist: ["dental_clinic", "dentist"],
  restaurant: ["restaurant", "fast_food_restaurant", "food_truck", "pizza_restaurant", "seafood_restaurant", "steak_house"],
  cafe: ["cafe", "coffee_shop", "tea_house", "bakery"],
  hotel: ["hotel", "hostel", "motel", "bed_and_breakfast", "guest_house", "apartment_hotel"],
  pharmacy: ["pharmacy"],
  clinic: ["medical_clinic", "clinic", "hospital", "doctors_office"],
  gym: ["gym", "fitness_center", "sports_club"],
  salon: ["hair_salon", "beauty_salon", "barber_shop", "nail_salon", "spa"],
  plumber: ["plumber"],
  electrician: ["electrician"],
  lawyer: ["lawyer", "legal_services"],
  // Education & everyday services — category strings measured from the
  // loaded dataset itself (253 distinct categories, 2026-10-23).
  school: ["specialty_school", "high_school", "preschool", "elementary_school", "middle_school", "college_university", "educational_service", "education", "tutoring_service"],
  teacher: ["specialty_school", "high_school", "preschool", "elementary_school", "middle_school", "college_university", "educational_service", "education", "tutoring_service"],
  training: ["educational_service", "education", "specialty_school"],
  "real estate": ["real_estate_service"],
  bank: ["bank_or_credit_union"],
  "car dealer": ["auto_dealer", "automotive_service"],
  "travel agency": ["travel_service"],
};

const FIELDS = "id,name,category,lat,lon,phone,website,email,socials,address,locality,confidence";

/** Canonical niches the stored database can answer by category. */
export const KNOWN_NICHES = Object.keys(CATEGORY_MAP);

/**
 * Match free-text tokens against the category vocabulary (key words +
 * category strings, e.g. "dental" matches dental_clinic -> dentist).
 * Exact-token equality only — never substring, so "car" can't match
 * "care" or "carrefour". Returns the best-scoring canonical niche, or
 * null when no token matches anything.
 */
export function matchNicheByTokens(tokens: string[]): string | null {
  let best: string | null = null;
  let bestScore = 0;
  for (const [key, cats] of Object.entries(CATEGORY_MAP)) {
    const vocab = new Set<string>();
    for (const part of [key, ...cats]) {
      for (const t of part.split(/[^a-z0-9]+/)) if (t) vocab.add(t);
    }
    let score = 0;
    for (const tok of tokens) if (vocab.has(tok)) score++;
    if (score > bestScore) { bestScore = score; best = key; }
  }
  return bestScore > 0 ? best : null;
}

export async function queryPlaces(
  niche: string,
  terms: string[],
  lat: number,
  lon: number,
  radiusKm: number,
  limit: number,
): Promise<PlaceRow[]> {
  const sb = serviceClient();
  if (!sb) return [];
  const dLat = radiusKm / 111;
  const dLon = radiusKm / (111 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  try {
    let rows: PlaceRow[] = [];
    const cats = CATEGORY_MAP[niche];
    if (cats?.length) {
      const { data, error } = await sb
        .from("places")
        .select(FIELDS)
        .gte("lat", lat - dLat).lte("lat", lat + dLat)
        .gte("lon", lon - dLon).lte("lon", lon + dLon)
        .in("category", cats)
        .order("confidence", { ascending: false })
        .limit(limit * 3);
      if (!error && data) rows = data as PlaceRow[];
    }
    if (rows.length < Math.min(5, limit)) {
      // Name-term fallback: covers niches/categories the map doesn't know.
      const safeTerms = terms
        .map((t) => t.replace(/[%_,()]/g, "").trim())
        .filter((t) => t.length >= 3)
        .slice(0, 3);
      if (safeTerms.length) {
        const orClause = safeTerms.map((t) => `name.ilike.%${t}%`).join(",");
        const { data, error } = await sb
          .from("places")
          .select(FIELDS)
          .gte("lat", lat - dLat).lte("lat", lat + dLat)
          .gte("lon", lon - dLon).lte("lon", lon + dLon)
          .or(orClause)
          .order("confidence", { ascending: false })
          .limit(limit * 3);
        if (!error && data) {
          const seen = new Set(rows.map((r) => r.id));
          for (const r of data as PlaceRow[]) if (!seen.has(r.id)) rows.push(r);
        }
      }
    }
    return rows;
  } catch {
    return [];
  }
}
