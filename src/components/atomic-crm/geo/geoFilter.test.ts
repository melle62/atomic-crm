import { describe, expect, it, vi } from "vitest";

import {
  companyMatchesGeoFilter,
  describeGeoFilter,
  haversineKm,
  isGeoFilterActive,
  MAX_RADIUS_KM,
  sanitizeGeoFilter,
  type GeoCompany,
} from "./geoFilter";
import { resolveGeoFilterParams, withGeoFilters } from "./withGeoFilters";
import { applyLocationChange, automaticPin, manualPin } from "./locationChange";

const jonkoping = { lat: 57.7826, lng: 14.1618 };
const goteborg = { lat: 57.7089, lng: 11.9746 };

const companies: GeoCompany[] = [
  {
    id: 1,
    city: "Jönköping",
    state_abbr: "Jönköpings län",
    latitude: 57.78,
    longitude: 14.16,
  },
  {
    id: 2,
    city: "Gnosjö",
    state_abbr: "Jönköpings län",
    latitude: 57.36,
    longitude: 13.74,
  },
  {
    id: 3,
    city: "Göteborg",
    state_abbr: "Västra Götalands län",
    latitude: 57.71,
    longitude: 11.97,
  },
  {
    id: 4,
    city: "",
    state_abbr: "Hallands län",
    latitude: null,
    longitude: null,
  },
];

const matching = (filter: Parameters<typeof companyMatchesGeoFilter>[1]) =>
  companies.filter((c) => companyMatchesGeoFilter(c, filter)).map((c) => c.id);

describe("haversineKm", () => {
  it("measures Jönköping to Göteborg at about 130 km", () => {
    expect(haversineKm(jonkoping, goteborg)).toBeGreaterThan(125);
    expect(haversineKm(jonkoping, goteborg)).toBeLessThan(135);
  });
  it("is zero for the same point", () => {
    expect(haversineKm(jonkoping, jonkoping)).toBe(0);
  });
});

describe("companyMatchesGeoFilter", () => {
  it("matches everything without a filter", () => {
    expect(matching(undefined)).toEqual([1, 2, 3, 4]);
    expect(matching({})).toEqual([1, 2, 3, 4]);
  });

  it("filters by county, ignoring case and spacing", () => {
    expect(matching({ counties: ["jönköpings  län"] })).toEqual([1, 2]);
  });

  it("matches a company in any of the counties OR cities", () => {
    expect(
      matching({ counties: ["Hallands län"], cities: ["Göteborg"] }),
    ).toEqual([3, 4]);
  });

  it("keeps companies within the radius", () => {
    expect(matching({ radius: { ...jonkoping, km: 60 } })).toEqual([1, 2]);
    expect(matching({ radius: { ...jonkoping, km: 10 } })).toEqual([1]);
  });

  it("excludes companies without coordinates from radius and view filters", () => {
    expect(matching({ radius: { ...jonkoping, km: 1000 } })).not.toContain(4);
    expect(
      matching({ bounds: { south: -90, west: -180, north: 90, east: 180 } }),
    ).toEqual([1, 2, 3]);
  });

  it("keeps companies inside the visible map area", () => {
    expect(
      matching({ bounds: { south: 57.5, west: 13.5, north: 58, east: 14.5 } }),
    ).toEqual([1]);
  });

  it("combines region AND radius", () => {
    expect(
      matching({
        counties: ["Jönköpings län"],
        radius: { ...goteborg, km: 150 },
      }),
    ).toEqual([1, 2]);
    expect(
      matching({ cities: ["Göteborg"], radius: { ...jonkoping, km: 50 } }),
    ).toEqual([]);
  });
});

describe("sanitizeGeoFilter", () => {
  it("drops invalid parts and keeps valid ones", () => {
    expect(
      sanitizeGeoFilter({
        counties: ["Hallands län", "", 3, "Hallands län"],
        radius: { lat: "57.7", lng: 14, km: 50, label: " Jönköping " },
        bounds: { south: 60, west: 1, north: 50, east: 2 },
      }),
    ).toEqual({
      counties: ["Hallands län"],
      radius: { lat: 57.7, lng: 14, km: 50, label: "Jönköping" },
    });
  });

  it("rejects out-of-range coordinates and caps the radius", () => {
    expect(
      sanitizeGeoFilter({ radius: { lat: 120, lng: 0, km: 5 } }),
    ).toBeUndefined();
    expect(
      sanitizeGeoFilter({ radius: { lat: 1, lng: 0, km: -5 } }),
    ).toBeUndefined();
    expect(
      sanitizeGeoFilter({ radius: { lat: 1, lng: 0, km: 99999 } })?.radius?.km,
    ).toBe(MAX_RADIUS_KM);
  });

  it("returns undefined for nothing usable", () => {
    expect(sanitizeGeoFilter(null)).toBeUndefined();
    expect(sanitizeGeoFilter("x")).toBeUndefined();
    expect(sanitizeGeoFilter({ counties: [] })).toBeUndefined();
    expect(isGeoFilterActive(undefined)).toBe(false);
  });
});

describe("describeGeoFilter", () => {
  it("summarizes the filter", () => {
    expect(
      describeGeoFilter(
        {
          counties: ["Jönköpings län"],
          radius: { ...jonkoping, km: 50, label: "Jönköping" },
          bounds: { south: 0, west: 0, north: 1, east: 1 },
        },
        { km: "km of", inView: "in view" },
      ),
    ).toBe("Jönköpings län · 50 km of Jönköping · in view");
  });
});

describe("resolveGeoFilterParams", () => {
  const params = (filter: Record<string, unknown>) => ({
    filter,
    pagination: { page: 1, perPage: 25 },
    sort: { field: "id", order: "ASC" as const },
  });
  const fetchCompanies = async () => companies;

  it("filters companies by id", async () => {
    const result = await resolveGeoFilterParams(
      "companies",
      params({ sector: "x", geo: { counties: ["Jönköpings län"] } }),
      fetchCompanies,
    );
    expect(result.filter).toEqual({ sector: "x", "id@in": "(1,2)" });
  });

  it("filters contacts and deals by their company", async () => {
    for (const resource of ["contacts", "deals"]) {
      const result = await resolveGeoFilterParams(
        resource,
        params({ geo: { cities: ["Göteborg"] } }),
        fetchCompanies,
      );
      expect(result.filter).toEqual({ "company_id@in": "(3)" });
    }
  });

  it("returns an empty match list when nothing is in the region", async () => {
    const result = await resolveGeoFilterParams(
      "deals",
      params({ geo: { cities: ["Kiruna"] } }),
      fetchCompanies,
    );
    expect(result.filter).toEqual({ "company_id@in": "()" });
  });

  it("drops an empty region filter without fetching companies", async () => {
    const fetch = vi.fn(fetchCompanies);
    const result = await resolveGeoFilterParams(
      "companies",
      params({ geo: {}, q: "a" }),
      fetch,
    );
    expect(result.filter).toEqual({ q: "a" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("leaves other resources alone", async () => {
    const input = params({ geo: { cities: ["Göteborg"] } });
    expect(await resolveGeoFilterParams("tasks", input, fetchCompanies)).toBe(
      input,
    );
  });
});

describe("withGeoFilters", () => {
  it("resolves the region filter before calling the wrapped provider", async () => {
    const getList = vi.fn(async (resource: string) =>
      resource === "companies"
        ? { data: companies, total: companies.length }
        : { data: [], total: 0 },
    );
    const provider = withGeoFilters({ getList } as any);
    await provider.getList("contacts", {
      filter: { geo: { radius: { ...jonkoping, km: 60 } } },
      pagination: { page: 1, perPage: 10 },
      sort: { field: "id", order: "ASC" },
    });
    expect(getList).toHaveBeenLastCalledWith(
      "contacts",
      expect.objectContaining({ filter: { "company_id@in": "(1,2)" } }),
    );
  });
});

describe("applyLocationChange", () => {
  const placed = {
    city: "Jönköping",
    latitude: 57.78,
    longitude: 14.16,
    geocode_status: "ok" as const,
    geocode_precision: "city" as const,
  };

  it("queues a new company for geocoding", () => {
    expect(applyLocationChange({ city: "Gnosjö" }).geocode_status).toBe(
      "pending",
    );
  });

  it("treats coordinates given on create as a manual pin", () => {
    expect(applyLocationChange({ latitude: 1, longitude: 2 })).toMatchObject({
      geocode_status: "manual",
      geocode_precision: "manual",
    });
  });

  it("re-queues and clears the pin when the address changes", () => {
    expect(
      applyLocationChange({ ...placed, city: "Gnosjö" }, placed),
    ).toMatchObject({
      geocode_status: "pending",
      latitude: null,
      longitude: null,
    });
  });

  it("keeps the pin when only other fields change", () => {
    expect(applyLocationChange({ ...placed }, placed)).toMatchObject(placed);
  });

  it("never replaces a manual pin, even when the address changes", () => {
    const manual = { ...placed, ...manualPin(57.1, 14.1) };
    expect(
      applyLocationChange({ ...manual, city: "Gnosjö" }, manual),
    ).toMatchObject({
      geocode_status: "manual",
      latitude: 57.1,
      longitude: 14.1,
    });
  });

  it("hands a company back to the geocoder on reset", () => {
    const manual = { ...placed, ...manualPin(57.1, 14.1) };
    expect(applyLocationChange(automaticPin(), manual)).toMatchObject({
      geocode_status: "pending",
      latitude: null,
    });
  });
});
