import {
  sanitizeGeoFilter,
  type GeoBounds,
  type GeoFilter,
} from "../geo/geoFilter";
import {
  COLOR_OPTIONS,
  DEFAULT_COLOR_BY,
  type ColorBy,
  type MapLayer,
} from "./mapModel";

/** Map page state, kept in the URL so a filtered map can be shared or bookmarked. */
export type MapState = {
  layer: MapLayer;
  colorBy: ColorBy;
  /** County, city and radius parts; the in-view bounds come from the live map. */
  geo?: Omit<GeoFilter, "bounds">;
  inView: boolean;
  /** Area to show first, e.g. when coming back from a list filtered "in view". */
  initialBounds?: GeoBounds;
  salesId?: string;
  sector?: string;
  tagIds: string[];
  stages: string[];
  categories: string[];
};

const LAYERS: MapLayer[] = ["companies", "contacts", "deals"];

const list = (value: string | null) =>
  value
    ? value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

const parseJson = (value: string | null): unknown => {
  if (!value) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
};

export const parseMapSearch = (params: URLSearchParams): MapState => {
  const layerParam = params.get("layer") as MapLayer | null;
  const layer =
    layerParam && LAYERS.includes(layerParam) ? layerParam : "companies";
  const colorParam = params.get("color") as ColorBy | null;
  const colorBy =
    colorParam && COLOR_OPTIONS[layer].includes(colorParam)
      ? colorParam
      : DEFAULT_COLOR_BY[layer];
  const { bounds, ...geo } =
    sanitizeGeoFilter(parseJson(params.get("geo"))) ?? {};
  return {
    layer,
    colorBy,
    geo: sanitizeGeoFilter(geo),
    inView: params.get("inView") === "1" || !!bounds,
    initialBounds: bounds,
    salesId: params.get("sales") || undefined,
    sector: params.get("sector") || undefined,
    tagIds: list(params.get("tags")),
    stages: list(params.get("stages")),
    categories: list(params.get("categories")),
  };
};

export const toMapSearch = (state: MapState): URLSearchParams => {
  const params = new URLSearchParams();
  if (state.layer !== "companies") params.set("layer", state.layer);
  if (state.colorBy !== DEFAULT_COLOR_BY[state.layer])
    params.set("color", state.colorBy);
  const cleanGeo = sanitizeGeoFilter(state.geo);
  if (cleanGeo) params.set("geo", JSON.stringify(cleanGeo));
  if (state.inView) params.set("inView", "1");
  if (state.salesId) params.set("sales", state.salesId);
  if (state.sector) params.set("sector", state.sector);
  if (state.tagIds.length) params.set("tags", state.tagIds.join(","));
  if (state.stages.length) params.set("stages", state.stages.join(","));
  if (state.categories.length)
    params.set("categories", state.categories.join(","));
  return params;
};

/** `/companies?filter=…` link carrying the region filter (and the rep). */
export const listLink = (
  resource: MapLayer,
  geo: GeoFilter | undefined,
  extra: Record<string, unknown> = {},
): string => {
  const cleanGeo = sanitizeGeoFilter(geo);
  const filter = { ...extra, ...(cleanGeo ? { geo: cleanGeo } : {}) };
  return Object.keys(filter).length
    ? `/${resource}?filter=${encodeURIComponent(JSON.stringify(filter))}`
    : `/${resource}`;
};

/** `/map?…` link from a list's region filter back to the map. */
export const mapLink = (
  layer: MapLayer,
  geo: GeoFilter | undefined,
): string => {
  const params = toMapSearch({
    layer,
    colorBy: DEFAULT_COLOR_BY[layer],
    geo,
    inView: false,
    tagIds: [],
    stages: [],
    categories: [],
  });
  // Keep an "in view" area: the map opens on it with "only what is in view" on.
  const cleanGeo = sanitizeGeoFilter(geo);
  if (cleanGeo) params.set("geo", JSON.stringify(cleanGeo));
  const query = params.toString();
  return query ? `/map?${query}` : "/map";
};
