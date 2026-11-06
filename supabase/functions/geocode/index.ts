import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import {
  createCachedLookup,
  geocodeCompany,
  GeocoderUnavailableError,
  parseRequestBody,
  photonToNominatimResponse,
  processQueue,
  toPhotonParams,
  type CompanyLocation,
  type GeocodeOutcome,
  type GeoPoint,
} from "./geocoder.ts";

// Nominatim usage policy (https://operations.osmfoundation.org/policies/nominatim/):
// at most 1 request per second, an identifying User-Agent, and cached results.
const NOMINATIM_URL =
  Deno.env.get("GEOCODER_URL") ?? "https://nominatim.openstreetmap.org";
const USER_AGENT =
  Deno.env.get("GEOCODER_USER_AGENT") ??
  "AtomicCRM-geocoder/1.0 (+https://github.com/melle62/atomic-crm)";
const CONTACT_EMAIL = Deno.env.get("GEOCODER_EMAIL");
const COUNTRY_CODE = Deno.env.get("GEOCODER_COUNTRY_CODE") ?? "se";
const MIN_INTERVAL_MS = 1100;
// Edge functions are stopped after ~150s of wall clock; leave headroom.
const BUDGET_MS = Number(Deno.env.get("GEOCODER_BUDGET_MS") ?? 100_000);
const REQUEST_TIMEOUT_MS = 10_000;

// Fallback geocoder on the same OpenStreetMap data. Nominatim blocks many
// hosting IP ranges (it answers HTTP 403 to our Supabase functions), so when
// that happens we switch to Photon. Set GEOCODER_FALLBACK_URL="" to disable.
const PHOTON_URL =
  Deno.env.get("GEOCODER_FALLBACK_URL") ?? "https://photon.komoot.io";

class GeocoderForbiddenError extends GeocoderUnavailableError {}

const getJson = async (url: URL, label: string): Promise<unknown> => {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "sv,en" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new GeocoderUnavailableError(
      `${label} unreachable: ${error instanceof Error ? error.message : error}`,
    );
  }
  if (response.status === 403) {
    throw new GeocoderForbiddenError(`${label} answered HTTP 403`);
  }
  if (!response.ok) {
    throw new GeocoderUnavailableError(
      `${label} answered HTTP ${response.status}`,
    );
  }
  return response.json();
};

const fetchNominatim = (params: Record<string, string>) => {
  const url = new URL("/search", NOMINATIM_URL);
  url.search = new URLSearchParams({
    ...params,
    format: "jsonv2",
    limit: "1",
    ...(CONTACT_EMAIL ? { email: CONTACT_EMAIL } : {}),
  }).toString();
  return getJson(url, "Geocoder");
};

const fetchPhoton = async (params: Record<string, string>) => {
  const url = new URL("/api/", PHOTON_URL);
  url.search = new URLSearchParams(toPhotonParams(params)).toString();
  return photonToNominatimResponse(
    await getJson(url, "Fallback geocoder"),
    params.countrycodes,
  );
};

// Once Nominatim has refused this function instance, stop asking it.
let nominatimForbidden = false;

const fetchGeocoder = async (params: Record<string, string>) => {
  if (!nominatimForbidden) {
    try {
      return await fetchNominatim(params);
    } catch (error) {
      if (!(error instanceof GeocoderForbiddenError) || !PHOTON_URL) {
        throw error;
      }
      console.warn("geocode: Nominatim refused us (403), using Photon");
      nominatimForbidden = true;
    }
  }
  return fetchPhoton(params);
};

const lookup = createCachedLookup({
  getCached: async (key) => {
    const { data, error } = await supabaseAdmin
      .from("geocode_cache")
      .select("latitude, longitude, display_name")
      .eq("query_key", key)
      .maybeSingle();
    if (error) throw error;
    if (!data) return { hit: false };
    const point: GeoPoint | null =
      data.latitude == null || data.longitude == null
        ? null
        : {
            latitude: data.latitude,
            longitude: data.longitude,
            displayName: data.display_name,
          };
    return { hit: true, point };
  },
  setCached: async (key, point) => {
    const { error } = await supabaseAdmin.from("geocode_cache").upsert({
      query_key: key,
      latitude: point?.latitude ?? null,
      longitude: point?.longitude ?? null,
      display_name: point?.displayName ?? null,
      created_at: new Date().toISOString(),
    });
    if (error) console.error("geocode: cache write failed", error);
  },
  reserveSlot: async () => {
    const { data, error } = await supabaseAdmin.rpc("geocode_reserve_slot", {
      p_interval_ms: MIN_INTERVAL_MS,
    });
    if (error) throw error;
    return Number(data ?? 0);
  },
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  fetchJson: fetchGeocoder,
});

const claimNext = async (): Promise<CompanyLocation | null> => {
  const { data, error } = await supabaseAdmin.rpc("geocode_claim_next_company");
  if (error) throw error;
  return (data as CompanyLocation[] | null)?.[0] ?? null;
};

const save = async (id: number, outcome: GeocodeOutcome) => {
  const now = new Date().toISOString();
  const values =
    outcome.status === "ok"
      ? {
          geocode_status: "ok",
          geocode_precision: outcome.precision,
          latitude: outcome.latitude,
          longitude: outcome.longitude,
          geocode_error: null,
          geocoded_at: now,
        }
      : {
          geocode_status: "failed",
          geocode_precision: null,
          latitude: null,
          longitude: null,
          geocode_error: outcome.error,
          geocoded_at: now,
        };
  // Only write while still pending: a pin placed by hand meanwhile wins.
  const { error } = await supabaseAdmin
    .from("companies")
    .update(values)
    .eq("id", id)
    .eq("geocode_status", "pending");
  if (error) throw error;
};

const release = async (id: number) => {
  const { error } = await supabaseAdmin
    .from("companies")
    .update({ geocoded_at: null })
    .eq("id", id)
    .eq("geocode_status", "pending");
  if (error) console.error("geocode: release failed", id, error);
};

const countPending = async () => {
  const { count, error } = await supabaseAdmin
    .from("companies")
    .select("id", { count: "exact", head: true })
    .eq("geocode_status", "pending");
  if (error) throw error;
  return count ?? 0;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

const handle = async (req: Request) => {
  if (req.method !== "POST")
    return createErrorResponse(405, "Method Not Allowed");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return createErrorResponse(400, "Body must be JSON");
  }
  const request = parseRequestBody(body);
  if ("error" in request) return createErrorResponse(400, request.error);

  try {
    if (request.action === "search") {
      const point = await lookup({
        q: request.query,
        countrycodes: COUNTRY_CODE,
      });
      return json({ result: point });
    }

    const result = await processQueue({
      claimNext,
      geocode: (company) =>
        geocodeCompany(company, lookup, { defaultCountryCode: COUNTRY_CODE }),
      save,
      release,
      now: () => Date.now(),
      budgetMs: BUDGET_MS,
    });
    return json({ ...result, remaining: await countPending() });
  } catch (error) {
    if (error instanceof GeocoderUnavailableError) {
      return createErrorResponse(503, error.message);
    }
    console.error("geocode failed:", error);
    return createErrorResponse(500, "Geocoding failed, see the function logs");
  }
};

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) =>
    AuthMiddleware(req, async (req) =>
      UserMiddleware(req, async (req) => handle(req)),
    ),
  ),
);
