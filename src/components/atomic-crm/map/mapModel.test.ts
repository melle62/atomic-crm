import { describe, expect, it } from "vitest";

import type { Company, Contact, Deal, Tag } from "../types";
import {
  buildLegend,
  buildMarkers,
  filterMapData,
  formatFit,
  groupByRegion,
  listPlaces,
  parseFit,
  sortRegionRows,
  type MapData,
} from "./mapModel";

const company = (overrides: Partial<Company>): Company =>
  ({
    id: 1,
    name: "Plåt AB",
    city: "Jönköping",
    state_abbr: "Jönköpings län",
    latitude: 57.78,
    longitude: 14.16,
    description: "",
    sales_id: 1,
    sector: "manufacturing",
    ...overrides,
  }) as Company;

const contact = (overrides: Partial<Contact>): Contact =>
  ({
    id: 10,
    first_name: "Anna",
    last_name: "Berg",
    company_id: 1,
    tags: [],
    sales_id: 1,
    ...overrides,
  }) as Contact;

const deal = (overrides: Partial<Deal>): Deal =>
  ({
    id: 100,
    name: "Laser line",
    company_id: 1,
    stage: "opportunity",
    amount: 1000,
    categories: [],
    sales_id: 1,
    ...overrides,
  }) as Deal;

const tags: Tag[] = [
  { id: 1, name: "fit-5", color: "#fff" },
  { id: 2, name: "fit-b", color: "#fff" },
  { id: 3, name: "elmia-2026", color: "#fff" },
];

const data: MapData = {
  companies: [
    company({ id: 1, description: "Fit 4/5 (tier A; points: …)" }),
    company({
      id: 2,
      name: "Svets AB",
      city: "Gnosjö",
      latitude: 57.36,
      longitude: 13.74,
      description: "Fit tier C.",
    }),
    company({
      id: 3,
      name: "Hallands Plåt",
      city: null as any,
      state_abbr: "Hallands län",
      latitude: null,
      longitude: null,
      sales_id: 2,
    }),
  ],
  contacts: [
    contact({ id: 10, company_id: 1, tags: [3] }),
    contact({ id: 11, company_id: 2, tags: [1, 2] }),
    contact({ id: 12, company_id: 3 }),
  ],
  deals: [
    deal({ id: 100, company_id: 1, stage: "proposal-sent", amount: 5000 }),
    deal({ id: 101, company_id: 1, stage: "won", amount: 2000 }),
    deal({
      id: 102,
      company_id: 3,
      stage: "opportunity",
      amount: 700,
      sales_id: 2,
    }),
  ],
  tags,
  sales: [],
};

const stageOrder = [
  "opportunity",
  "proposal-sent",
  "in-negociation",
  "won",
  "lost",
  "delayed",
];
const options = { stageOrder, closedStages: ["won", "lost"] };

describe("parseFit", () => {
  it("reads score and tier from the description", () => {
    expect(parseFit("Fit 5/5 (tier A; points: …)")).toEqual({
      score: 5,
      tier: "A",
    });
    expect(parseFit("Fit tier B. Wire, sheet and tube")).toEqual({
      score: undefined,
      tier: "B",
    });
  });

  it("falls back to fit-* tags and prefers the description", () => {
    expect(parseFit("", ["fit-3", "fit-b"])).toEqual({ score: 3, tier: "B" });
    expect(parseFit("Fit 2/5 (tier C", ["fit-5", "fit-a"])).toEqual({
      score: 2,
      tier: "C",
    });
    expect(parseFit(null, ["lead"])).toEqual({
      score: undefined,
      tier: undefined,
    });
  });

  it("formats for the marker card", () => {
    expect(formatFit({ score: 4, tier: "A" })).toBe("4/5, tier A");
    expect(formatFit({})).toBeUndefined();
  });
});

describe("buildMarkers", () => {
  it("places companies with coordinates, coloured by tier", () => {
    const markers = buildMarkers("companies", data, {
      ...options,
      colorBy: "tier",
    });
    expect(markers.map((m) => [m.id, m.colorKey])).toEqual([
      [1, "A"],
      [2, "C"],
    ]);
  });

  it("puts contacts and deals at their company's location", () => {
    const contacts = buildMarkers("contacts", data, {
      ...options,
      colorBy: "tag",
    });
    expect(contacts.map((m) => [m.id, m.latitude, m.colorKey])).toEqual([
      [10, 57.78, "elmia-2026"],
      [11, 57.36, "fit-5"],
    ]);
    const deals = buildMarkers("deals", data, { ...options, colorBy: "stage" });
    expect(deals.map((m) => [m.id, m.colorKey])).toEqual([
      [100, "proposal-sent"],
      [101, "won"],
    ]);
  });

  it("colours a contact by its own fit tag when the company has no tier", () => {
    const markers = buildMarkers("contacts", data, {
      ...options,
      colorBy: "tier",
    });
    expect(markers.find((m) => m.id === 11)?.colorKey).toBe("C");
  });

  it("colours a company by its most advanced open deal", () => {
    const markers = buildMarkers("companies", data, {
      ...options,
      colorBy: "stage",
    });
    expect(markers.map((m) => m.colorKey)).toEqual(["proposal-sent", "none"]);
  });
});

describe("buildLegend", () => {
  it("lists stages in pipeline order with the neutral entry last", () => {
    const markers = buildMarkers("companies", data, {
      ...options,
      colorBy: "stage",
    });
    const legend = buildLegend(markers, "stage", {
      stages: stageOrder.map((value) => ({
        value,
        label: value.toUpperCase(),
      })),
      sales: [],
      none: "No open deal",
    });
    expect(legend.map((e) => e.label)).toEqual([
      "PROPOSAL-SENT",
      "No open deal",
    ]);
  });
});

describe("filterMapData", () => {
  it("keeps contacts and deals of companies in the region", () => {
    const result = filterMapData(data, { geo: { counties: ["Hallands län"] } });
    expect(result.companies.map((c) => c.id)).toEqual([3]);
    expect(result.contacts.map((c) => c.id)).toEqual([12]);
    expect(result.deals.map((d) => d.id)).toEqual([102]);
  });

  it("combines with sales rep, tag, stage and category filters", () => {
    expect(filterMapData(data, { salesId: 2 }).deals.map((d) => d.id)).toEqual([
      102,
    ]);
    expect(
      filterMapData(data, { tagIds: [3] }).contacts.map((c) => c.id),
    ).toEqual([10]);
    expect(
      filterMapData(data, { stages: ["won"] }).deals.map((d) => d.id),
    ).toEqual([101]);
  });

  it("drops unplaced companies from radius filters", () => {
    const result = filterMapData(data, {
      geo: { radius: { lat: 57.78, lng: 14.16, km: 500 } },
    });
    expect(result.companies.map((c) => c.id)).toEqual([1, 2]);
  });
});

describe("groupByRegion", () => {
  it("counts per county with deal totals", () => {
    const rows = groupByRegion(data, "county", "Unknown");
    expect(rows).toEqual([
      {
        key: "jönköpings län|",
        county: "Jönköpings län",
        city: undefined,
        companies: 2,
        contacts: 2,
        deals: 2,
        amount: 7000,
      },
      {
        key: "hallands län|",
        county: "Hallands län",
        city: undefined,
        companies: 1,
        contacts: 1,
        deals: 1,
        amount: 700,
      },
    ]);
  });

  it("splits by city and labels missing places", () => {
    const rows = groupByRegion(data, "city", "Unknown");
    expect(rows.map((r) => `${r.county}/${r.city}`)).toEqual([
      "Jönköpings län/Jönköping",
      "Jönköpings län/Gnosjö",
      "Hallands län/Unknown",
    ]);
  });

  it("sorts by any column", () => {
    const rows = groupByRegion(data, "city", "Unknown");
    expect(sortRegionRows(rows, "amount", "desc").map((r) => r.city)).toEqual([
      "Jönköping",
      "Unknown",
      "Gnosjö",
    ]);
    expect(sortRegionRows(rows, "name", "asc").map((r) => r.county)[0]).toBe(
      "Hallands län",
    );
  });
});

describe("listPlaces", () => {
  it("returns distinct sorted names", () => {
    expect(
      listPlaces([
        { state_abbr: "Västra Götalands län", city: "Borås" },
        { state_abbr: " Jönköpings län", city: "Gnosjö" },
        { state_abbr: "Jönköpings län", city: null as any },
      ]),
    ).toEqual({
      counties: ["Jönköpings län", "Västra Götalands län"],
      cities: ["Borås", "Gnosjö"],
    });
  });
});
