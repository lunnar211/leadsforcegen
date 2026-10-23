-- LeadsForceGen: stored business-listings table (Overture Maps Places).
-- Data comes from the Overture Maps places dataset (CDLA-Permissive-2.0 /
-- Apache-2.0), which permits storing and redistributing — unlike places
-- APIs whose terms forbid keeping their data. Ingested by
-- scripts/ingest_overture.py and loaded via CSV import.
-- Service-role only: RLS is enabled with no client policies, exactly like
-- search_cache. The lead engine reads it server-side.
create table if not exists places (
  id text primary key,
  name text not null,
  category text,
  lat double precision not null,
  lon double precision not null,
  phone text,
  website text,
  email text,
  socials jsonb not null default '[]'::jsonb,
  address text,
  locality text,
  country text,
  confidence double precision not null default 0,
  source text not null default 'overture',
  updated_at timestamptz not null default now()
);
create index if not exists idx_places_country_cat on places (country, category);
create index if not exists idx_places_lat_lon on places (lat, lon);
alter table places enable row level security;
