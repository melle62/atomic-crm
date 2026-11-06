import { useGetList } from "ra-core";

import { listPlaces } from "../map/mapModel";
import type { Company } from "../types";

/** Distinct counties and cities of all companies, for the region pickers. */
export const useCompanyPlaces = () => {
  const { data = [] } = useGetList<Company>("companies", {
    pagination: { page: 1, perPage: 10000 },
    sort: { field: "name", order: "ASC" },
  });
  return listPlaces(data);
};
