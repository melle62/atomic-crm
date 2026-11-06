import type { Company } from "../types";

/**
 * Mirrors the `handle_company_location_changed` database trigger, for the
 * FakeRest demo provider: queue a company for geocoding when its address
 * changes, keep manual pins, and treat coordinates given on create as manual.
 */
type LocationFields = Partial<
  Pick<
    Company,
    | "address"
    | "zipcode"
    | "city"
    | "state_abbr"
    | "country"
    | "latitude"
    | "longitude"
    | "geocode_status"
    | "geocode_precision"
    | "geocoded_at"
    | "geocode_error"
  >
>;

const ADDRESS_FIELDS = [
  "address",
  "zipcode",
  "city",
  "state_abbr",
  "country",
] as const;

const hasPin = (data: LocationFields) =>
  data.latitude != null && data.longitude != null;

export const applyLocationChange = <T extends LocationFields>(
  next: T,
  previous?: LocationFields,
): T & LocationFields => {
  const status = next.geocode_status ?? previous?.geocode_status ?? "pending";

  if (!previous) {
    return hasPin(next) && status === "pending"
      ? {
          ...next,
          geocode_status: "manual",
          geocode_precision: "manual",
          geocoded_at: new Date().toISOString(),
        }
      : { ...next, geocode_status: status };
  }

  const merged = { ...previous, ...next };
  if (status === "manual") {
    return hasPin(merged)
      ? { ...next, geocode_status: "manual", geocode_precision: "manual" }
      : {
          ...next,
          geocode_status: "pending",
          geocode_precision: null,
          geocoded_at: null,
        };
  }

  const addressChanged = ADDRESS_FIELDS.some(
    (field) =>
      field in next && (next[field] ?? null) !== (previous[field] ?? null),
  );
  if (addressChanged) {
    return {
      ...next,
      geocode_status: "pending",
      latitude: null,
      longitude: null,
      geocode_precision: null,
      geocode_error: null,
      geocoded_at: null,
    };
  }
  return next;
};

/** Values to save when the user places or drags a pin by hand. */
export const manualPin = (latitude: number, longitude: number) => ({
  latitude,
  longitude,
  geocode_status: "manual" as const,
  geocode_precision: "manual" as const,
  geocode_error: null,
  geocoded_at: new Date().toISOString(),
});

/** Values to save to hand a company back to the automatic geocoder. */
export const automaticPin = () => ({
  latitude: null,
  longitude: null,
  geocode_status: "pending" as const,
  geocode_precision: null,
  geocode_error: null,
  geocoded_at: null,
});
