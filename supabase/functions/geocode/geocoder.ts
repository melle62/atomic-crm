// Pure geocoding logic for the `geocode` edge function: query building with a
// precision fallback, a cached + rate-limited lookup, and the queue loop.
// No Deno or Supabase imports here, so it runs under Vitest in Node.

export type Precision = "address" | "zipcode" | "city" | "county";

export type CompanyLocation = {
  id: number;
  address?: string | null;
  zipcode?: string | null;
  city?: string | null;
  state_abbr?: string | null;
  country?: string | null;
};

export type GeocodeQuery = {
  precision: Precision;
  params: Record<string, string>;
};

export type GeoPoint = {
  latitude: number;
  longitude: number;
  displayName?: string | null;
};

export type GeocodeOutcome =
  | { status: "ok"; precision: Precision; latitude: number; longitude: number }
  | { status: "failed"; error: string };

export type Lookup = (
  params: Record<string, string>,
) => Promise<GeoPoint | null>;

/** The geocoder could not answer now (network error, 429, 5xx): retry later. */
export class GeocoderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeocoderUnavailableError";
  }
}

export const NO_LOCATION_ERROR =
  "No address, zipcode, city or county to geocode";
export const NO_MATCH_ERROR =
  "No match for the address, zipcode, city or county";

const SWEDEN_ALIASES = new Set(["sweden", "sverige", "se", "swe"]);

const clean = (value?: string | null): string | undefined => {
  const trimmed = value?.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed : undefined;
};

/**
 * Builds the lookups to try, most precise first:
 * address → zipcode + city → city → county.
 */
export const buildQueries = (
  company: CompanyLocation,
  { defaultCountryCode = "se" }: { defaultCountryCode?: string } = {},
): GeocodeQuery[] => {
  const address = clean(company.address);
  const zipcode = clean(company.zipcode);
  const city = clean(company.city);
  const county = clean(company.state_abbr);
  const country = clean(company.country);

  // Restrict to the default country unless the company is clearly elsewhere.
  const scope: Record<string, string> =
    !country || SWEDEN_ALIASES.has(country.toLowerCase())
      ? { countrycodes: defaultCountryCode }
      : { country };

  const candidates: Array<GeocodeQuery | undefined> = [
    address
      ? {
          precision: "address",
          params: {
            street: address,
            ...(city ? { city } : {}),
            ...(zipcode ? { postalcode: zipcode } : {}),
            ...scope,
          },
        }
      : undefined,
    zipcode
      ? {
          precision: "zipcode",
          params: { postalcode: zipcode, ...(city ? { city } : {}), ...scope },
        }
      : undefined,
    city
      ? {
          precision: "city",
          params: { q: [city, county].filter(Boolean).join(", "), ...scope },
        }
      : undefined,
    county
      ? { precision: "county", params: { q: county, ...scope } }
      : undefined,
  ];

  const seen = new Set<string>();
  return candidates.filter((query): query is GeocodeQuery => {
    if (!query) return false;
    const key = queryKey(query.params);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/** Stable cache key: sorted, lowercased, whitespace-collapsed params. */
export const queryKey = (params: Record<string, string>): string =>
  JSON.stringify(
    Object.keys(params)
      .sort()
      .map((key) => [
        key,
        params[key].replace(/\s+/g, " ").trim().toLowerCase(),
      ]),
  );

/** Tries each query in order and returns the first hit, with its precision. */
export const geocodeCompany = async (
  company: CompanyLocation,
  lookup: Lookup,
  options?: { defaultCountryCode?: string },
): Promise<GeocodeOutcome> => {
  const queries = buildQueries(company, options);
  if (queries.length === 0)
    return { status: "failed", error: NO_LOCATION_ERROR };

  for (const query of queries) {
    const point = await lookup(query.params);
    if (point) {
      return {
        status: "ok",
        precision: query.precision,
        latitude: point.latitude,
        longitude: point.longitude,
      };
    }
  }
  return { status: "failed", error: NO_MATCH_ERROR };
};

const toNumber = (value: unknown): number =>
  typeof value === "number" ? value : Number.parseFloat(String(value));

/** Reads the first result of a Nominatim `format=jsonv2` search response. */
export const parseNominatimResponse = (json: unknown): GeoPoint | null => {
  if (!Array.isArray(json) || json.length === 0) return null;
  const first = json[0] as Record<string, unknown>;
  const latitude = toNumber(first?.lat);
  const longitude = toNumber(first?.lon);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return null;
  }
  const displayName =
    typeof first.display_name === "string" ? first.display_name : null;
  return { latitude, longitude, displayName };
};

// Bounding boxes (minLon, minLat, maxLon, maxLat) for country codes the app
// restricts searches to. Photon has no country filter, so we use a box and
// then check the country code of the result.
const COUNTRY_BBOXES: Record<string, string> = {
  se: "10.5,55.0,24.5,69.5",
};

/**
 * Turns Nominatim-style search params into a Photon (photon.komoot.io)
 * request. Photon is a fallback geocoder on the same OpenStreetMap data, used
 * when Nominatim refuses our server (HTTP 403 for blocked hosting IPs).
 */
export const toPhotonParams = (
  params: Record<string, string>,
): Record<string, string> => {
  const { countrycodes, country, q, street, postalcode, city } = params;
  const text =
    q ?? [street, postalcode, city].filter((part) => part).join(", ");
  const query = country ? `${text}, ${country}` : text;
  const bbox = countrycodes
    ? COUNTRY_BBOXES[countrycodes.toLowerCase()]
    : undefined;
  return { q: query, limit: "1", ...(bbox ? { bbox } : {}) };
};

/**
 * Reads the first Photon GeoJSON feature and returns it shaped like a
 * Nominatim `jsonv2` response, so the rest of the pipeline is unchanged.
 * A result outside the requested country counts as no match.
 */
export const photonToNominatimResponse = (
  json: unknown,
  countryCode?: string,
): Array<{ lat: number; lon: number; display_name: string }> => {
  const features = (json as { features?: unknown })?.features;
  if (!Array.isArray(features) || features.length === 0) return [];
  const feature = features[0] as {
    geometry?: { coordinates?: unknown };
    properties?: Record<string, unknown>;
  };
  const coordinates = feature?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return [];
  const properties = feature.properties ?? {};
  const resultCountry =
    typeof properties.countrycode === "string" ? properties.countrycode : "";
  if (
    countryCode &&
    resultCountry.toLowerCase() !== countryCode.toLowerCase()
  ) {
    return [];
  }
  const displayName = [
    properties.name,
    properties.postcode,
    properties.city,
    properties.county,
    properties.country,
  ]
    .filter((part): part is string => typeof part === "string" && part !== "")
    .join(", ");
  return [
    {
      lat: toNumber(coordinates[1]),
      lon: toNumber(coordinates[0]),
      display_name: displayName,
    },
  ];
};

export type CachedLookupDeps = {
  getCached: (
    key: string,
  ) => Promise<{ hit: true; point: GeoPoint | null } | { hit: false }>;
  setCached: (key: string, point: GeoPoint | null) => Promise<void>;
  /** Reserves the next shared request slot; resolves to the ms to wait for it. */
  reserveSlot: () => Promise<number>;
  sleep: (ms: number) => Promise<void>;
  fetchJson: (params: Record<string, string>) => Promise<unknown>;
  /** Give up instead of waiting longer than this for a slot (busy geocoder). */
  maxWaitMs?: number;
};

/**
 * Wraps the remote geocoder: answers from the cache when it can (misses are
 * cached too), otherwise waits for a rate-limit slot before calling it.
 */
export const createCachedLookup =
  ({
    getCached,
    setCached,
    reserveSlot,
    sleep,
    fetchJson,
    maxWaitMs = 15_000,
  }: CachedLookupDeps): Lookup =>
  async (params) => {
    const key = queryKey(params);
    const cached = await getCached(key);
    if (cached.hit) return cached.point;

    const waitMs = await reserveSlot();
    if (waitMs > maxWaitMs) {
      throw new GeocoderUnavailableError(
        "The geocoder is busy with another run, try again in a minute",
      );
    }
    if (waitMs > 0) await sleep(waitMs);

    const point = parseNominatimResponse(await fetchJson(params));
    await setCached(key, point);
    return point;
  };

export type QueueDeps = {
  claimNext: () => Promise<CompanyLocation | null>;
  geocode: (company: CompanyLocation) => Promise<GeocodeOutcome>;
  save: (id: number, outcome: GeocodeOutcome) => Promise<void>;
  /** Puts a claimed company back in the queue after a transient error. */
  release: (id: number) => Promise<void>;
  now: () => number;
  budgetMs: number;
};

export type QueueResult = {
  processed: number;
  placed: number;
  failed: number;
  stoppedReason: "empty" | "budget" | "unavailable";
  error?: string;
};

/** Geocodes pending companies one at a time until the queue or budget runs out. */
export const processQueue = async ({
  claimNext,
  geocode,
  save,
  release,
  now,
  budgetMs,
}: QueueDeps): Promise<QueueResult> => {
  const startedAt = now();
  let placed = 0;
  let failed = 0;

  while (now() - startedAt < budgetMs) {
    const company = await claimNext();
    if (!company) {
      return {
        processed: placed + failed,
        placed,
        failed,
        stoppedReason: "empty",
      };
    }
    let outcome: GeocodeOutcome;
    try {
      outcome = await geocode(company);
    } catch (error) {
      await release(company.id);
      if (error instanceof GeocoderUnavailableError) {
        return {
          processed: placed + failed,
          placed,
          failed,
          stoppedReason: "unavailable",
          error: error.message,
        };
      }
      throw error;
    }
    await save(company.id, outcome);
    if (outcome.status === "ok") placed += 1;
    else failed += 1;
  }
  return {
    processed: placed + failed,
    placed,
    failed,
    stoppedReason: "budget",
  };
};

export const MAX_PLACE_QUERY_LENGTH = 200;

/** Validates the request body of the edge function. */
export const parseRequestBody = (
  body: unknown,
):
  | { action: "process" }
  | { action: "search"; query: string }
  | { error: string } => {
  if (!body || typeof body !== "object") return { error: "Invalid body" };
  const { action, query } = body as Record<string, unknown>;
  if (action === "process") return { action };
  if (action === "search") {
    const trimmed = typeof query === "string" ? clean(query) : undefined;
    if (
      !trimmed ||
      trimmed.length < 2 ||
      trimmed.length > MAX_PLACE_QUERY_LENGTH
    ) {
      return {
        error: `query must be between 2 and ${MAX_PLACE_QUERY_LENGTH} characters`,
      };
    }
    return { action, query: trimmed };
  }
  return { error: "action must be 'process' or 'search'" };
};
