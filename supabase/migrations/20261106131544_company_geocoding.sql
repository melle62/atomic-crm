-- Company geocoding: coordinates + status on companies, a lookup cache and a
-- shared rate-limit slot for the `geocode` edge function.
-- Hand-adjusted from `supabase db diff`: the diff dropped and re-created the
-- views (losing security_invoker) and dropped pgjwt; neither is wanted.

alter table "public"."companies" add column "latitude" double precision;
alter table "public"."companies" add column "longitude" double precision;
-- Existing companies start as 'pending' so the backfill picks them up.
alter table "public"."companies" add column "geocode_status" text not null default 'pending'::text;
alter table "public"."companies" add column "geocode_precision" text;
alter table "public"."companies" add column "geocoded_at" timestamp with time zone;
alter table "public"."companies" add column "geocode_error" text;

alter table "public"."companies" add constraint "companies_geocode_status_check" CHECK ((geocode_status = ANY (ARRAY['pending'::text, 'ok'::text, 'failed'::text, 'manual'::text])));
alter table "public"."companies" add constraint "companies_geocode_precision_check" CHECK (((geocode_precision IS NULL) OR (geocode_precision = ANY (ARRAY['address'::text, 'zipcode'::text, 'city'::text, 'county'::text, 'manual'::text]))));
alter table "public"."companies" add constraint "companies_latitude_check" CHECK (((latitude IS NULL) OR ((latitude >= ('-90'::integer)::double precision) AND (latitude <= (90)::double precision))));
alter table "public"."companies" add constraint "companies_longitude_check" CHECK (((longitude IS NULL) OR ((longitude >= ('-180'::integer)::double precision) AND (longitude <= (180)::double precision))));

CREATE INDEX companies_geocode_status_idx ON public.companies USING btree (geocode_status);

create table "public"."geocode_cache" (
    "query_key" text not null primary key,
    "latitude" double precision,
    "longitude" double precision,
    "display_name" text,
    "created_at" timestamp with time zone not null default now()
);

create table "public"."geocode_rate_limit" (
    "id" integer not null default 1 primary key,
    "next_slot_at" timestamp with time zone not null default now(),
    constraint "geocode_rate_limit_singleton" CHECK ((id = 1))
);

-- Server-only tables: RLS on, no policies, no API-role grants.
alter table "public"."geocode_cache" enable row level security;
alter table "public"."geocode_rate_limit" enable row level security;

revoke all on table "public"."geocode_cache" from "anon";
revoke all on table "public"."geocode_cache" from "authenticated";
grant all on table "public"."geocode_cache" to "service_role";

revoke all on table "public"."geocode_rate_limit" from "anon";
revoke all on table "public"."geocode_rate_limit" from "authenticated";
grant all on table "public"."geocode_rate_limit" to "service_role";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.handle_company_location_changed()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
    if tg_op = 'INSERT' then
        -- Coordinates given on create (e.g. an import) count as a manual pin.
        if new.latitude is not null and new.longitude is not null and new.geocode_status = 'pending' then
            new.geocode_status := 'manual';
            new.geocode_precision := 'manual';
            new.geocoded_at := now();
        end if;
        return new;
    end if;

    -- A manual pin is never replaced by re-geocoding, even when the address changes.
    if new.geocode_status = 'manual' then
        if new.latitude is null or new.longitude is null then
            new.geocode_status := 'pending';
            new.geocode_precision := null;
            new.geocoded_at := null;
        else
            new.geocode_precision := 'manual';
        end if;
        return new;
    end if;

    if (new.address, new.zipcode, new.city, new.state_abbr, new.country)
        is distinct from (old.address, old.zipcode, old.city, old.state_abbr, old.country) then
        new.geocode_status := 'pending';
        new.latitude := null;
        new.longitude := null;
        new.geocode_precision := null;
        new.geocode_error := null;
        new.geocoded_at := null;
    elsif new.geocode_status = 'pending' and old.geocode_status <> 'pending' then
        -- Re-queued by hand: make it claimable right away.
        new.geocoded_at := null;
    end if;
    return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.geocode_reserve_slot(p_interval_ms integer)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
    slot timestamp with time zone;
begin
    insert into public.geocode_rate_limit (id) values (1) on conflict (id) do nothing;
    -- The row lock serializes concurrent callers: each one gets the next free slot.
    update public.geocode_rate_limit
       set next_slot_at = greatest(clock_timestamp(), next_slot_at) + make_interval(secs => p_interval_ms / 1000.0)
     where id = 1
    returning next_slot_at - make_interval(secs => p_interval_ms / 1000.0) into slot;
    return greatest(0, ceil(extract(epoch from (slot - clock_timestamp())) * 1000))::integer;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.geocode_claim_next_company(p_stale_after_seconds integer DEFAULT 300)
 RETURNS TABLE(id bigint, address text, zipcode text, city text, state_abbr text, country text)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
    -- geocoded_at doubles as a claim marker while the row is pending, so two
    -- concurrent runs never work on the same company. A stale claim (crashed run)
    -- becomes claimable again after p_stale_after_seconds.
    return query
    update public.companies c
       set geocoded_at = clock_timestamp()
     where c.id = (
        select c2.id
          from public.companies c2
         where c2.geocode_status = 'pending'
           and (c2.geocoded_at is null or c2.geocoded_at < clock_timestamp() - make_interval(secs => p_stale_after_seconds))
         order by c2.id
         limit 1
           for update skip locked
     )
    returning c.id, c.address, c.zipcode, c.city, c.state_abbr, c.country;
end;
$function$
;

grant all on function public.handle_company_location_changed() to anon;
grant all on function public.handle_company_location_changed() to authenticated;
grant all on function public.handle_company_location_changed() to service_role;

revoke all on function public.geocode_reserve_slot(integer) from public;
revoke all on function public.geocode_reserve_slot(integer) from anon;
revoke all on function public.geocode_reserve_slot(integer) from authenticated;
grant all on function public.geocode_reserve_slot(integer) to service_role;

revoke all on function public.geocode_claim_next_company(integer) from public;
revoke all on function public.geocode_claim_next_company(integer) from anon;
revoke all on function public.geocode_claim_next_company(integer) from authenticated;
grant all on function public.geocode_claim_next_company(integer) to service_role;

CREATE TRIGGER company_location_changed BEFORE INSERT OR UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.handle_company_location_changed();

-- New columns go at the end so the view can be replaced in place.
create or replace view "public"."companies_summary" with (security_invoker = on) as  SELECT c.id,
    c.created_at,
    c.name,
    c.sector,
    c.size,
    c.linkedin_url,
    c.website,
    c.phone_number,
    c.address,
    c.zipcode,
    c.city,
    c.state_abbr,
    c.sales_id,
    c.context_links,
    c.country,
    c.description,
    c.revenue,
    c.tax_identifier,
    c.logo,
    count(DISTINCT d.id) AS nb_deals,
    count(DISTINCT co.id) AS nb_contacts,
    c.latitude,
    c.longitude,
    c.geocode_status,
    c.geocode_precision,
    c.geocoded_at,
    c.geocode_error
   FROM ((public.companies c
     LEFT JOIN public.deals d ON ((c.id = d.company_id)))
     LEFT JOIN public.contacts co ON ((c.id = co.company_id)))
  GROUP BY c.id;
