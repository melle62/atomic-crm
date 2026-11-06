// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  buildQueries,
  createCachedLookup,
  geocodeCompany,
  GeocoderUnavailableError,
  NO_LOCATION_ERROR,
  NO_MATCH_ERROR,
  parseNominatimResponse,
  parseRequestBody,
  processQueue,
  queryKey,
  type CompanyLocation,
  type GeoPoint,
  type GeocodeOutcome,
} from "./geocoder";

const full: CompanyLocation = {
  id: 1,
  address: "Storgatan 1",
  zipcode: "553 18",
  city: "Jönköping",
  state_abbr: "Jönköpings län",
  country: "Sweden",
};

const point: GeoPoint = { latitude: 57.78, longitude: 14.16 };

describe("buildQueries", () => {
  it("orders the fallbacks address → zipcode → city → county", () => {
    expect(buildQueries(full).map((q) => q.precision)).toEqual([
      "address",
      "zipcode",
      "city",
      "county",
    ]);
  });

  it("skips the levels a company has no data for", () => {
    expect(
      buildQueries({ id: 2, state_abbr: "Hallands län" }).map(
        (q) => q.precision,
      ),
    ).toEqual(["county"]);
    expect(
      buildQueries({ id: 3, city: "Gnosjö" }).map((q) => q.precision),
    ).toEqual(["city"]);
  });

  it("returns nothing for a company without any location", () => {
    expect(buildQueries({ id: 4, address: "  ", city: null })).toEqual([]);
  });

  it("restricts to Sweden unless the company is clearly in another country", () => {
    expect(buildQueries({ id: 5, city: "Malmö" })[0].params).toMatchObject({
      countrycodes: "se",
    });
    expect(
      buildQueries({ id: 6, city: "Malmö", country: "Sverige" })[0].params,
    ).toMatchObject({ countrycodes: "se" });
    const norway = buildQueries({ id: 7, city: "Oslo", country: "Norway" })[0];
    expect(norway.params).toMatchObject({ country: "Norway" });
    expect(norway.params.countrycodes).toBeUndefined();
  });

  it("adds the county to a city lookup to tell same-named towns apart", () => {
    const city = buildQueries(full).find((q) => q.precision === "city");
    expect(city?.params.q).toBe("Jönköping, Jönköpings län");
  });
});

describe("queryKey", () => {
  it("ignores param order, case and extra spaces", () => {
    expect(queryKey({ q: "Jönköping  ", countrycodes: "se" })).toBe(
      queryKey({ countrycodes: "SE", q: "jönköping" }),
    );
  });
});

describe("geocodeCompany", () => {
  it("stops at the first level that matches and records its precision", async () => {
    const lookup = vi
      .fn()
      .mockResolvedValueOnce(null) // address
      .mockResolvedValueOnce(point); // zipcode
    const outcome = await geocodeCompany(full, lookup);
    expect(outcome).toEqual({ status: "ok", precision: "zipcode", ...point });
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it("falls all the way back to the county", async () => {
    const lookup = vi.fn(async (params: Record<string, string>) =>
      params.q === "Jönköpings län" ? point : null,
    );
    const outcome = await geocodeCompany(full, lookup);
    expect(outcome).toMatchObject({ status: "ok", precision: "county" });
    expect(lookup).toHaveBeenCalledTimes(4);
  });

  it("fails with a reason when nothing matches", async () => {
    expect(await geocodeCompany(full, async () => null)).toEqual({
      status: "failed",
      error: NO_MATCH_ERROR,
    });
  });

  it("fails without calling the geocoder when there is no location", async () => {
    const lookup = vi.fn();
    expect(await geocodeCompany({ id: 9 }, lookup)).toEqual({
      status: "failed",
      error: NO_LOCATION_ERROR,
    });
    expect(lookup).not.toHaveBeenCalled();
  });
});

describe("parseNominatimResponse", () => {
  it("reads the first result", () => {
    expect(
      parseNominatimResponse([
        { lat: "57.78", lon: "14.16", display_name: "Jönköping, Sverige" },
        { lat: "1", lon: "1" },
      ]),
    ).toEqual({
      latitude: 57.78,
      longitude: 14.16,
      displayName: "Jönköping, Sverige",
    });
  });

  it("treats empty or malformed responses as no match", () => {
    expect(parseNominatimResponse([])).toBeNull();
    expect(parseNominatimResponse({ error: "x" })).toBeNull();
    expect(parseNominatimResponse([{ lat: "abc", lon: "1" }])).toBeNull();
    expect(parseNominatimResponse([{ lat: "95", lon: "1" }])).toBeNull();
  });
});

const makeLookupDeps = () => {
  const cache = new Map<string, GeoPoint | null>();
  return {
    cache,
    deps: {
      getCached: vi.fn(async (key: string) =>
        cache.has(key)
          ? { hit: true as const, point: cache.get(key) ?? null }
          : { hit: false as const },
      ),
      setCached: vi.fn(async (key: string, value: GeoPoint | null) => {
        cache.set(key, value);
      }),
      reserveSlot: vi.fn(async () => 0),
      sleep: vi.fn(async () => {}),
      fetchJson: vi.fn(async () => [{ lat: "57.78", lon: "14.16" }]),
    },
  };
};

describe("createCachedLookup", () => {
  it("answers a repeated query from the cache without a new request", async () => {
    const { deps } = makeLookupDeps();
    const lookup = createCachedLookup(deps);
    await lookup({ q: "Jönköping" });
    await lookup({ q: "jönköping " });
    expect(deps.fetchJson).toHaveBeenCalledTimes(1);
    expect(deps.reserveSlot).toHaveBeenCalledTimes(1);
  });

  it("caches misses too", async () => {
    const { deps } = makeLookupDeps();
    deps.fetchJson.mockResolvedValue([]);
    const lookup = createCachedLookup(deps);
    expect(await lookup({ q: "Nowhere" })).toBeNull();
    expect(await lookup({ q: "Nowhere" })).toBeNull();
    expect(deps.fetchJson).toHaveBeenCalledTimes(1);
  });

  it("waits for the reserved rate-limit slot before each request", async () => {
    const { deps } = makeLookupDeps();
    const calls: string[] = [];
    let nextSlot = 0;
    deps.reserveSlot.mockImplementation(async () => {
      const wait = nextSlot;
      nextSlot += 1100;
      return wait;
    });
    deps.sleep.mockImplementation(async (ms: number) => {
      calls.push(`sleep ${ms}`);
    });
    deps.fetchJson.mockImplementation(async () => {
      calls.push("fetch");
      return [];
    });
    const lookup = createCachedLookup(deps);
    await lookup({ q: "a" });
    await lookup({ q: "b" });
    await lookup({ q: "c" });
    expect(calls).toEqual([
      "fetch",
      "sleep 1100",
      "fetch",
      "sleep 2200",
      "fetch",
    ]);
  });

  it("refuses to wait behind a long queue of other callers", async () => {
    const { deps } = makeLookupDeps();
    deps.reserveSlot.mockResolvedValue(60_000);
    const lookup = createCachedLookup({ ...deps, maxWaitMs: 15_000 });
    await expect(lookup({ q: "a" })).rejects.toBeInstanceOf(
      GeocoderUnavailableError,
    );
    expect(deps.fetchJson).not.toHaveBeenCalled();
  });
});

describe("processQueue", () => {
  const makeQueue = (companies: CompanyLocation[]) => {
    const queue = [...companies];
    const saved: Array<[number, GeocodeOutcome]> = [];
    const released: number[] = [];
    let clock = 0;
    return {
      saved,
      released,
      deps: {
        claimNext: async () => queue.shift() ?? null,
        save: async (id: number, outcome: GeocodeOutcome) => {
          saved.push([id, outcome]);
        },
        release: async (id: number) => {
          released.push(id);
        },
        now: () => clock,
        tick: (ms: number) => {
          clock += ms;
        },
        budgetMs: 10_000,
      },
    };
  };

  it("geocodes every pending company until the queue is empty", async () => {
    const { deps, saved } = makeQueue([{ id: 1, city: "A" }, { id: 2 }]);
    const result = await processQueue({
      ...deps,
      geocode: (company) => geocodeCompany(company, async () => point),
    });
    expect(result).toEqual({
      processed: 2,
      placed: 1,
      failed: 1,
      stoppedReason: "empty",
    });
    expect(saved.map(([id, o]) => [id, o.status])).toEqual([
      [1, "ok"],
      [2, "failed"],
    ]);
  });

  it("stops when the time budget is spent, leaving the rest pending", async () => {
    const { deps, saved } = makeQueue([
      { id: 1, city: "A" },
      { id: 2, city: "B" },
      { id: 3, city: "C" },
    ]);
    const result = await processQueue({
      ...deps,
      geocode: async () => {
        deps.tick(6_000);
        return { status: "ok", precision: "city", ...point };
      },
    });
    expect(result.stoppedReason).toBe("budget");
    expect(saved).toHaveLength(2);
  });

  it("puts the company back in the queue when the geocoder is unavailable", async () => {
    const { deps, saved, released } = makeQueue([{ id: 1, city: "A" }]);
    const result = await processQueue({
      ...deps,
      geocode: async () => {
        throw new GeocoderUnavailableError("HTTP 503");
      },
    });
    expect(result).toMatchObject({
      stoppedReason: "unavailable",
      error: "HTTP 503",
    });
    expect(saved).toEqual([]);
    expect(released).toEqual([1]);
  });
});

describe("parseRequestBody", () => {
  it("accepts the two actions", () => {
    expect(parseRequestBody({ action: "process" })).toEqual({
      action: "process",
    });
    expect(
      parseRequestBody({ action: "search", query: " Jönköping " }),
    ).toEqual({
      action: "search",
      query: "Jönköping",
    });
  });

  it("rejects anything else", () => {
    expect(parseRequestBody(null)).toHaveProperty("error");
    expect(parseRequestBody({ action: "drop" })).toHaveProperty("error");
    expect(parseRequestBody({ action: "search", query: "a" })).toHaveProperty(
      "error",
    );
    expect(
      parseRequestBody({ action: "search", query: "x".repeat(201) }),
    ).toHaveProperty("error");
  });
});
