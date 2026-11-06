import type { Company } from "../types";

/** List filter key holding the region filter, e.g. `?filter={"geo":{...}}`. */
export const GEO_FILTER_KEY = "geo";

export type GeoRadius = {
  lat: number;
  lng: number;
  km: number;
  label?: string;
};

export type GeoBounds = {
  south: number;
  west: number;
  north: number;
  east: number;
};

/**
 * Region filter shared by the map and the Companies, Contacts and Deals lists.
 * A company matches when it is in one of the counties OR one of the cities (if
 * any are given), AND within the radius, AND inside the bounds.
 */
export type GeoFilter = {
  counties?: string[];
  cities?: string[];
  radius?: GeoRadius;
  bounds?: GeoBounds;
};

export type GeoCompany = Pick<
  Company,
  "id" | "city" | "state_abbr" | "latitude" | "longitude"
>;

export const MAX_RADIUS_KM = 2000;
export const DEFAULT_RADIUS_KM = 50;

/** km to use when the user picks a new centre: keep the current radius. */
export const readRadiusKm = (radius?: GeoRadius) =>
  radius?.km ?? DEFAULT_RADIUS_KM;

const EARTH_RADIUS_KM = 6371;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle distance in km. */
export const haversineKm = (
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number => {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) *
      Math.cos(toRadians(b.lat)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
};

export const normalizePlaceName = (value?: string | null): string =>
  (value ?? "").replace(/\s+/g, " ").trim().toLocaleLowerCase("sv");

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const asNumber = (value: unknown): number | undefined => {
  const parsed = typeof value === "string" ? Number(value) : value;
  return isFiniteNumber(parsed) ? parsed : undefined;
};

const cleanNames = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const names = [
    ...new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.replace(/\s+/g, " ").trim())
        .filter(Boolean),
    ),
  ].slice(0, 100);
  return names.length ? names : undefined;
};

const cleanRadius = (value: unknown): GeoRadius | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const lat = asNumber(raw.lat);
  const lng = asNumber(raw.lng);
  const km = asNumber(raw.km);
  if (lat === undefined || lng === undefined || km === undefined)
    return undefined;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180 || km <= 0) return undefined;
  return {
    lat,
    lng,
    km: Math.min(km, MAX_RADIUS_KM),
    ...(typeof raw.label === "string" && raw.label.trim()
      ? { label: raw.label.trim().slice(0, 200) }
      : {}),
  };
};

const cleanBounds = (value: unknown): GeoBounds | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const south = asNumber(raw.south);
  const west = asNumber(raw.west);
  const north = asNumber(raw.north);
  const east = asNumber(raw.east);
  if ([south, west, north, east].some((v) => v === undefined)) return undefined;
  if (south! > north!) return undefined;
  return { south: south!, west: west!, north: north!, east: east! };
};

/** Validates a region filter read from the URL or a form; drops invalid parts. */
export const sanitizeGeoFilter = (value: unknown): GeoFilter | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const filter: GeoFilter = {
    counties: cleanNames(raw.counties),
    cities: cleanNames(raw.cities),
    radius: cleanRadius(raw.radius),
    bounds: cleanBounds(raw.bounds),
  };
  const entries = Object.entries(filter).filter(([, v]) => v !== undefined);
  return entries.length
    ? (Object.fromEntries(entries) as GeoFilter)
    : undefined;
};

export const isGeoFilterActive = (filter?: GeoFilter | null): boolean =>
  !!filter &&
  !!(
    filter.counties?.length ||
    filter.cities?.length ||
    filter.radius ||
    filter.bounds
  );

const hasCoordinates = (
  company: GeoCompany,
): company is GeoCompany & { latitude: number; longitude: number } =>
  isFiniteNumber(company.latitude) && isFiniteNumber(company.longitude);

const insideBounds = (lat: number, lng: number, bounds: GeoBounds) => {
  if (lat < bounds.south || lat > bounds.north) return false;
  // Bounds crossing the antimeridian have west > east.
  return bounds.west <= bounds.east
    ? lng >= bounds.west && lng <= bounds.east
    : lng >= bounds.west || lng <= bounds.east;
};

export const companyMatchesGeoFilter = (
  company: GeoCompany,
  filter?: GeoFilter | null,
): boolean => {
  if (!filter || !isGeoFilterActive(filter)) return true;

  const counties = filter.counties?.map(normalizePlaceName) ?? [];
  const cities = filter.cities?.map(normalizePlaceName) ?? [];
  if (counties.length || cities.length) {
    const inCounty = counties.includes(normalizePlaceName(company.state_abbr));
    const inCity = cities.includes(normalizePlaceName(company.city));
    if (!inCounty && !inCity) return false;
  }

  if (filter.radius || filter.bounds) {
    if (!hasCoordinates(company)) return false;
    const position = { lat: company.latitude, lng: company.longitude };
    if (
      filter.radius &&
      haversineKm(position, filter.radius) > filter.radius.km
    ) {
      return false;
    }
    if (
      filter.bounds &&
      !insideBounds(position.lat, position.lng, filter.bounds)
    ) {
      return false;
    }
  }
  return true;
};

/** Short human description, e.g. "Jönköpings län, Gnosjö · 50 km of Jönköping". */
export const describeGeoFilter = (
  filter: GeoFilter | undefined,
  labels: { km: string; inView: string },
): string => {
  if (!filter) return "";
  const parts: string[] = [];
  const places = [...(filter.counties ?? []), ...(filter.cities ?? [])];
  if (places.length) parts.push(places.join(", "));
  if (filter.radius) {
    parts.push(
      `${filter.radius.km} ${labels.km}${filter.radius.label ? ` ${filter.radius.label}` : ""}`,
    );
  }
  if (filter.bounds) parts.push(labels.inView);
  return parts.join(" · ");
};
