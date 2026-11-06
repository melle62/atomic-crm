import type { DataProvider, GetListParams } from "ra-core";

import {
  companyMatchesGeoFilter,
  GEO_FILTER_KEY,
  isGeoFilterActive,
  sanitizeGeoFilter,
  type GeoCompany,
} from "./geoFilter";

/** Which column holds the company id for each resource with a region filter. */
export const GEO_FILTERED_RESOURCES: Record<string, string> = {
  companies: "id",
  contacts: "company_id",
  deals: "company_id",
};

const MAX_COMPANIES = 10_000;

/** Turns company ids into a PostgREST/FakeRest `@in` value. */
export const toInFilterValue = (ids: Array<string | number>): string =>
  `(${ids.join(",")})`;

/**
 * Replaces the virtual `geo` filter with a `<column>@in` filter on the ids of the
 * matching companies. Returns params untouched when there is no region filter.
 */
export const resolveGeoFilterParams = async (
  resource: string,
  params: GetListParams,
  fetchCompanies: () => Promise<GeoCompany[]>,
): Promise<GetListParams> => {
  const column = GEO_FILTERED_RESOURCES[resource];
  if (!column || !params.filter || !(GEO_FILTER_KEY in params.filter)) {
    return params;
  }
  const { [GEO_FILTER_KEY]: rawGeo, ...filter } = params.filter;
  const geo = sanitizeGeoFilter(rawGeo);
  if (!geo || !isGeoFilterActive(geo)) return { ...params, filter };

  const companies = await fetchCompanies();
  const ids = companies
    .filter((company) => companyMatchesGeoFilter(company, geo))
    .map((company) => company.id);

  return {
    ...params,
    filter: { ...filter, [`${column}@in`]: toInFilterValue(ids) },
  };
};

/** Data provider decorator adding the region filter to companies, contacts and deals. */
export const withGeoFilters = <T extends DataProvider>(dataProvider: T): T => {
  // The exact match runs in companyMatchesGeoFilter; the company list is small.
  const fetchCompanies = async (): Promise<GeoCompany[]> => {
    const { data } = await dataProvider.getList<GeoCompany & { id: number }>(
      "companies",
      {
        filter: {},
        pagination: { page: 1, perPage: MAX_COMPANIES },
        sort: { field: "id", order: "ASC" },
      },
    );
    return data;
  };

  return {
    ...dataProvider,
    getList: async (resource: string, params: GetListParams) =>
      dataProvider.getList(
        resource,
        await resolveGeoFilterParams(resource, params, fetchCompanies),
      ),
  };
};
