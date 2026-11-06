import { useGetList } from "ra-core";

import type { Company, Contact, Deal, Sale, Tag } from "../types";
import type { MapData } from "./mapModel";

const ALL = { page: 1, perPage: 10000 };

/** Loads everything the map shows; the CRM holds a few hundred records at most. */
export const useMapData = (): MapData & {
  isPending: boolean;
  error: unknown;
} => {
  const companies = useGetList<Company>("companies", {
    pagination: ALL,
    sort: { field: "name", order: "ASC" },
  });
  const contacts = useGetList<Contact>("contacts", {
    pagination: ALL,
    sort: { field: "last_name", order: "ASC" },
  });
  const deals = useGetList<Deal>("deals", {
    pagination: ALL,
    sort: { field: "name", order: "ASC" },
    filter: { "archived_at@is": null },
  });
  const tags = useGetList<Tag>("tags", {
    pagination: ALL,
    sort: { field: "name", order: "ASC" },
  });
  const sales = useGetList<Sale>("sales", {
    pagination: ALL,
    sort: { field: "last_name", order: "ASC" },
  });

  return {
    companies: companies.data ?? [],
    contacts: contacts.data ?? [],
    deals: deals.data ?? [],
    tags: tags.data ?? [],
    sales: sales.data ?? [],
    isPending: companies.isPending || contacts.isPending || deals.isPending,
    error: companies.error ?? contacts.error ?? deals.error,
  };
};
