import type { Identifier } from "ra-core";

import type { Company, Contact, Deal, Sale, Tag } from "../types";
import {
  companyMatchesGeoFilter,
  normalizePlaceName,
  type GeoFilter,
} from "../geo/geoFilter";

export type MapLayer = "companies" | "contacts" | "deals";
export type ColorBy = "tier" | "stage" | "tag" | "sales";

export const DEFAULT_COLOR_BY: Record<MapLayer, ColorBy> = {
  companies: "tier",
  contacts: "tier",
  deals: "stage",
};

export const COLOR_OPTIONS: Record<MapLayer, ColorBy[]> = {
  companies: ["tier", "stage", "sales"],
  contacts: ["tier", "tag", "sales"],
  deals: ["stage", "tier", "sales"],
};

export type Fit = { score?: number; tier?: string };

const FIT_SCORE_REGEX = /\bfit\s*(\d)\s*\/\s*5/i;
const FIT_TIER_REGEX = /\btier\s+([A-D])\b/i;
const FIT_TAG_REGEX = /^fit-(\d|[a-d])$/i;

/** Reads "Fit 4/5 (tier A …" from a description, completed by `fit-5` / `fit-a` tags. */
export const parseFit = (
  description?: string | null,
  tagNames: string[] = [],
): Fit => {
  const score = description?.match(FIT_SCORE_REGEX)?.[1];
  const tier = description?.match(FIT_TIER_REGEX)?.[1];
  const fromTags = tagNames.reduce<Fit>((acc, name) => {
    const value = name.trim().match(FIT_TAG_REGEX)?.[1];
    if (!value) return acc;
    return /\d/.test(value)
      ? { ...acc, score: acc.score ?? Number(value) }
      : { ...acc, tier: acc.tier ?? value.toUpperCase() };
  }, {});
  return {
    score: score ? Number(score) : fromTags.score,
    tier: tier ? tier.toUpperCase() : fromTags.tier,
  };
};

export const formatFit = (fit: Fit): string | undefined => {
  const parts = [
    fit.score !== undefined ? `${fit.score}/5` : undefined,
    fit.tier ? `tier ${fit.tier}` : undefined,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : undefined;
};

/** Categorical palette, readable on OSM tiles in light and dark mode. */
export const PALETTE = [
  "#2563eb",
  "#16a34a",
  "#ea580c",
  "#9333ea",
  "#0891b2",
  "#db2777",
  "#ca8a04",
  "#4f46e5",
  "#059669",
  "#dc2626",
];
export const NEUTRAL_COLOR = "#6b7280";

export const TIER_COLORS: Record<string, string> = {
  A: "#16a34a",
  B: "#2563eb",
  C: "#ca8a04",
  D: "#dc2626",
};

export type LegendEntry = { key: string; label: string; color: string };

export type MapMarker = {
  key: string;
  kind: MapLayer;
  id: Identifier;
  companyId: Identifier;
  latitude: number;
  longitude: number;
  title: string;
  colorKey: string;
};

export type MapData = {
  companies: Company[];
  contacts: Contact[];
  deals: Deal[];
  tags: Tag[];
  sales: Sale[];
};

export type MapFilters = {
  geo?: GeoFilter;
  salesId?: Identifier;
  sector?: string;
  tagIds?: Identifier[];
  stages?: string[];
  categories?: string[];
};

export type ClosedStageOptions = { closedStages: string[] };

export const isOpenDeal = (deal: Deal, { closedStages }: ClosedStageOptions) =>
  !deal.archived_at && !closedStages.includes(deal.stage);

export const hasPosition = (
  company?: Company,
): company is Company & { latitude: number; longitude: number } =>
  company?.latitude != null && company?.longitude != null;

const sameId = (a?: Identifier | null, b?: Identifier | null) =>
  a != null && b != null && String(a) === String(b);

/**
 * Applies the region filter and the usual list filters. Contacts and deals
 * follow their company's location; companies without a pin stay in the
 * result (for the summary) but get no marker.
 */
export const filterMapData = (data: MapData, filters: MapFilters): MapData => {
  const companies = data.companies.filter(
    (company) =>
      companyMatchesGeoFilter(company, filters.geo) &&
      (!filters.sector || company.sector === filters.sector),
  );
  const companyIds = new Set(companies.map((company) => String(company.id)));
  const inRegion = (companyId?: Identifier | null) =>
    companyId != null && companyIds.has(String(companyId));

  const contacts = data.contacts.filter(
    (contact) =>
      inRegion(contact.company_id) &&
      (filters.salesId == null || sameId(contact.sales_id, filters.salesId)) &&
      (!filters.tagIds?.length ||
        filters.tagIds.some((tagId) =>
          contact.tags?.some((id) => sameId(id, tagId)),
        )),
  );
  const deals = data.deals.filter(
    (deal) =>
      inRegion(deal.company_id) &&
      (filters.salesId == null || sameId(deal.sales_id, filters.salesId)) &&
      (!filters.stages?.length || filters.stages.includes(deal.stage)) &&
      (!filters.categories?.length ||
        filters.categories.some((category) =>
          deal.categories?.includes(category),
        )),
  );
  return {
    ...data,
    companies: companies.filter(
      (company) =>
        filters.salesId == null || sameId(company.sales_id, filters.salesId),
    ),
    contacts,
    deals,
  };
};

type ColorContext = {
  colorBy: ColorBy;
  companiesById: Map<string, Company>;
  tagsById: Map<string, Tag>;
  dealsByCompany: Map<string, Deal[]>;
  stageOrder: string[];
  closedStages: string[];
};

const tagNames = (ids: Identifier[] | undefined, tagsById: Map<string, Tag>) =>
  (ids ?? [])
    .map((id) => tagsById.get(String(id))?.name)
    .filter(Boolean) as string[];

/** Most advanced open deal stage of a company, for colouring companies by stage. */
const leadingStage = (company: Company, context: ColorContext) => {
  const deals = (context.dealsByCompany.get(String(company.id)) ?? []).filter(
    (deal) => isOpenDeal(deal, context),
  );
  return deals
    .map((deal) => deal.stage)
    .sort(
      (a, b) => context.stageOrder.indexOf(b) - context.stageOrder.indexOf(a),
    )[0];
};

const colorKeyFor = (
  kind: MapLayer,
  record: Company | Contact | Deal,
  company: Company,
  context: ColorContext,
): string => {
  switch (context.colorBy) {
    case "stage":
      return kind === "deals"
        ? (record as Deal).stage
        : (leadingStage(company, context) ?? "none");
    case "sales":
      return record.sales_id != null ? String(record.sales_id) : "none";
    case "tag": {
      const names =
        kind === "contacts"
          ? tagNames((record as Contact).tags, context.tagsById)
          : [];
      return names[0] ?? "none";
    }
    case "tier":
    default: {
      const names =
        kind === "contacts"
          ? tagNames((record as Contact).tags, context.tagsById)
          : [];
      return parseFit(company.description, names).tier ?? "none";
    }
  }
};

export const buildMarkers = (
  layer: MapLayer,
  data: MapData,
  options: { colorBy: ColorBy; stageOrder: string[]; closedStages: string[] },
): MapMarker[] => {
  const companiesById = new Map(data.companies.map((c) => [String(c.id), c]));
  const dealsByCompany = data.deals.reduce((acc, deal) => {
    const key = String(deal.company_id);
    acc.set(key, [...(acc.get(key) ?? []), deal]);
    return acc;
  }, new Map<string, Deal[]>());
  const context: ColorContext = {
    ...options,
    companiesById,
    dealsByCompany,
    tagsById: new Map(data.tags.map((tag) => [String(tag.id), tag])),
  };

  const toMarker = (
    kind: MapLayer,
    record: Company | Contact | Deal,
    companyId: Identifier | null | undefined,
    title: string,
  ): MapMarker[] => {
    const company =
      companyId != null ? companiesById.get(String(companyId)) : undefined;
    if (!company || !hasPosition(company)) return [];
    return [
      {
        key: `${kind}-${record.id}`,
        kind,
        id: record.id,
        companyId: company.id,
        latitude: company.latitude,
        longitude: company.longitude,
        title,
        colorKey: colorKeyFor(kind, record, company, context),
      },
    ];
  };

  switch (layer) {
    case "contacts":
      return data.contacts.flatMap((contact) =>
        toMarker(
          "contacts",
          contact,
          contact.company_id,
          `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim(),
        ),
      );
    case "deals":
      return data.deals.flatMap((deal) =>
        toMarker("deals", deal, deal.company_id, deal.name),
      );
    case "companies":
    default:
      return data.companies.flatMap((company) =>
        toMarker("companies", company, company.id, company.name),
      );
  }
};

/** Maps each colour key in use to a colour, in a stable order, for the legend. */
export const buildLegend = (
  markers: MapMarker[],
  colorBy: ColorBy,
  labels: {
    stages: Array<{ value: string; label: string }>;
    sales: Sale[];
    none: string;
  },
): LegendEntry[] => {
  const keys = [...new Set(markers.map((marker) => marker.colorKey))];
  const ordered =
    colorBy === "stage"
      ? labels.stages
          .map((stage) => stage.value)
          .filter((value) => keys.includes(value))
      : keys
          .filter((key) => key !== "none")
          .sort((a, b) => a.localeCompare(b, "sv"));
  const withUnknown = [
    ...ordered,
    ...keys.filter((key) => key !== "none" && !ordered.includes(key)),
    ...(keys.includes("none") ? ["none"] : []),
  ];

  return withUnknown.map((key, index) => {
    if (key === "none")
      return { key, label: labels.none, color: NEUTRAL_COLOR };
    if (colorBy === "tier") {
      return {
        key,
        label: `Tier ${key}`,
        color: TIER_COLORS[key] ?? PALETTE[index % PALETTE.length],
      };
    }
    if (colorBy === "stage") {
      const label =
        labels.stages.find((stage) => stage.value === key)?.label ?? key;
      return { key, label, color: PALETTE[index % PALETTE.length] };
    }
    if (colorBy === "sales") {
      const sale = labels.sales.find((s) => String(s.id) === key);
      const label = sale ? `${sale.first_name} ${sale.last_name}` : key;
      return { key, label, color: PALETTE[index % PALETTE.length] };
    }
    return { key, label: key, color: PALETTE[index % PALETTE.length] };
  });
};

export type RegionRow = {
  key: string;
  county: string;
  city?: string;
  companies: number;
  contacts: number;
  deals: number;
  amount: number;
};

export type RegionGrouping = "county" | "city";
export type RegionSortField =
  "name" | "companies" | "contacts" | "deals" | "amount";

const placeLabel = (value: string | null | undefined, fallback: string) =>
  value?.replace(/\s+/g, " ").trim() || fallback;

/** Counts companies, contacts, deals and deal amount per county (or county + city). */
export const groupByRegion = (
  data: Pick<MapData, "companies" | "contacts" | "deals">,
  grouping: RegionGrouping,
  unknownLabel: string,
): RegionRow[] => {
  const rows = new Map<string, RegionRow>();
  const companyRow = new Map<string, string>();

  for (const company of data.companies) {
    const county = placeLabel(company.state_abbr, unknownLabel);
    const city =
      grouping === "city" ? placeLabel(company.city, unknownLabel) : undefined;
    const key = `${normalizePlaceName(county)}|${normalizePlaceName(city)}`;
    const row = rows.get(key) ?? {
      key,
      county,
      city,
      companies: 0,
      contacts: 0,
      deals: 0,
      amount: 0,
    };
    rows.set(key, { ...row, companies: row.companies + 1 });
    companyRow.set(String(company.id), key);
  }

  const bump = (
    companyId: Identifier | null | undefined,
    field: "contacts" | "deals",
    amount = 0,
  ) => {
    const key =
      companyId != null ? companyRow.get(String(companyId)) : undefined;
    const row = key ? rows.get(key) : undefined;
    if (!key || !row) return;
    rows.set(key, {
      ...row,
      [field]: row[field] + 1,
      amount: row.amount + amount,
    });
  };
  data.contacts.forEach((contact) => bump(contact.company_id, "contacts"));
  data.deals.forEach((deal) =>
    bump(deal.company_id, "deals", Number(deal.amount) || 0),
  );

  return [...rows.values()];
};

export const sortRegionRows = (
  rows: RegionRow[],
  field: RegionSortField,
  order: "asc" | "desc",
): RegionRow[] => {
  const direction = order === "asc" ? 1 : -1;
  const name = (row: RegionRow) =>
    row.city ? `${row.county} ${row.city}` : row.county;
  return [...rows].sort((a, b) => {
    const diff =
      field === "name"
        ? name(a).localeCompare(name(b), "sv")
        : (a[field] as number) - (b[field] as number);
    return diff !== 0 ? diff * direction : name(a).localeCompare(name(b), "sv");
  });
};

/** Distinct, sorted county and city names, for the region pickers. */
export const listPlaces = (
  companies: Array<Pick<Company, "state_abbr" | "city">>,
) => {
  const distinct = (values: Array<string | null | undefined>) =>
    [
      ...new Map(
        values
          .map((value) => value?.replace(/\s+/g, " ").trim())
          .filter((value): value is string => !!value)
          .map((value) => [normalizePlaceName(value), value]),
      ).values(),
    ].sort((a, b) => a.localeCompare(b, "sv"));
  return {
    counties: distinct(companies.map((c) => c.state_abbr)),
    cities: distinct(companies.map((c) => c.city)),
  };
};
