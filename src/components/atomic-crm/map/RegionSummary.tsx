import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Building, Handshake, Users } from "lucide-react";
import { useTranslate } from "ra-core";
import { Link } from "react-router";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

import type { GeoFilter } from "../geo/geoFilter";
import {
  groupByRegion,
  sortRegionRows,
  type MapData,
  type RegionGrouping,
  type RegionRow,
  type RegionSortField,
} from "./mapModel";
import { listLink } from "./mapSearchParams";

type RegionSummaryProps = {
  data: Pick<MapData, "companies" | "contacts" | "deals">;
  formatAmount: (amount: number) => string;
  /** Narrows the map to a row's county or city. */
  onSelectRegion: (geo: Pick<GeoFilter, "counties" | "cities">) => void;
  /** Filters currently applied besides the region, carried into list links. */
  extraListFilter: (
    resource: "companies" | "contacts" | "deals",
  ) => Record<string, unknown>;
};

const COLUMNS: RegionSortField[] = [
  "name",
  "companies",
  "contacts",
  "deals",
  "amount",
];

const rowGeo = (row: RegionRow, unknownLabel: string) =>
  row.city !== undefined
    ? row.city === unknownLabel
      ? { counties: [row.county] }
      : { cities: [row.city] }
    : row.county === unknownLabel
      ? {}
      : { counties: [row.county] };

/** Sortable counts per county or city, with links to the filtered lists. */
export const RegionSummary = ({
  data,
  formatAmount,
  onSelectRegion,
  extraListFilter,
}: RegionSummaryProps) => {
  const translate = useTranslate();
  const isMobile = useIsMobile();
  const [grouping, setGrouping] = useState<RegionGrouping>("county");
  const [sort, setSort] = useState<{
    field: RegionSortField;
    order: "asc" | "desc";
  }>({
    field: "companies",
    order: "desc",
  });
  const unknownLabel = translate("crm.map.unknown_place");

  const rows = useMemo(
    () =>
      sortRegionRows(
        groupByRegion(data, grouping, unknownLabel),
        sort.field,
        sort.order,
      ),
    [data, grouping, unknownLabel, sort],
  );

  const toggleSort = (field: RegionSortField) =>
    setSort((current) =>
      current.field === field
        ? { field, order: current.order === "asc" ? "desc" : "asc" }
        : { field, order: field === "name" ? "asc" : "desc" },
    );

  return (
    <div className="flex flex-col gap-2">
      <ToggleGroup
        value={[grouping]}
        onValueChange={([value]) =>
          value && setGrouping(value as RegionGrouping)
        }
        variant="outline"
        size="sm"
        aria-label={translate("crm.map.group_by")}
      >
        <ToggleGroupItem value="county">
          {translate("crm.map.groups.county")}
        </ToggleGroupItem>
        <ToggleGroupItem value="city">
          {translate("crm.map.groups.city")}
        </ToggleGroupItem>
      </ToggleGroup>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground">
            {COLUMNS.map((field) => (
              <th
                key={field}
                scope="col"
                className={cn(
                  "font-medium py-1",
                  field === "name" ? "text-left" : "text-right",
                )}
                aria-sort={
                  sort.field === field
                    ? sort.order === "asc"
                      ? "ascending"
                      : "descending"
                    : "none"
                }
              >
                <button
                  type="button"
                  onClick={() => toggleSort(field)}
                  className="inline-flex items-center gap-0.5 cursor-pointer hover:text-foreground"
                >
                  {translate(`crm.map.columns.${field}`)}
                  {sort.field === field ? (
                    sort.order === "asc" ? (
                      <ArrowUp className="size-3" />
                    ) : (
                      <ArrowDown className="size-3" />
                    )
                  ) : null}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const geo = rowGeo(row, unknownLabel);
            return (
              <tr key={row.key} className="border-t align-top">
                <td className="py-1.5 pr-1">
                  <button
                    type="button"
                    className="text-left hover:underline cursor-pointer"
                    onClick={() => onSelectRegion(geo)}
                    title={translate("crm.map.filter_here")}
                  >
                    <span className="block">{row.city ?? row.county}</span>
                    {row.city ? (
                      <span className="block text-xs text-muted-foreground">
                        {row.county}
                      </span>
                    ) : null}
                  </button>
                  <div className="flex gap-2 mt-0.5 text-muted-foreground">
                    {(isMobile
                      ? (["contacts"] as const)
                      : (["companies", "contacts", "deals"] as const)
                    ).map((resource) => (
                      <Link
                        key={resource}
                        to={listLink(resource, geo, extraListFilter(resource))}
                        aria-label={`${translate("crm.map.open_list")}: ${translate(`crm.map.layers.${resource}`)}`}
                        title={`${translate("crm.map.open_list")}: ${translate(`crm.map.layers.${resource}`)}`}
                        className="hover:text-foreground"
                      >
                        {resource === "companies" ? (
                          <Building className="size-3.5" />
                        ) : resource === "contacts" ? (
                          <Users className="size-3.5" />
                        ) : (
                          <Handshake className="size-3.5" />
                        )}
                      </Link>
                    ))}
                  </div>
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  {row.companies}
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  {row.contacts}
                </td>
                <td className="py-1.5 text-right tabular-nums">{row.deals}</td>
                <td className="py-1.5 text-right tabular-nums whitespace-nowrap">
                  {formatAmount(row.amount)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
