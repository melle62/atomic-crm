import { Map as MapIcon, MapPin, X } from "lucide-react";
import { useListContext, useTranslate } from "ra-core";
import { Link } from "react-router";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import { FilterCategory } from "../filters/FilterCategory";
import { mapLink } from "../map/mapSearchParams";
import type { MapLayer } from "../map/mapModel";
import {
  describeGeoFilter,
  GEO_FILTER_KEY,
  isGeoFilterActive,
  sanitizeGeoFilter,
  type GeoFilter,
} from "./geoFilter";
import { RegionFields } from "./RegionFields";
import { useCompanyPlaces } from "./useCompanyPlaces";

const useRegionFilter = () => {
  const { filterValues, displayedFilters, setFilters } = useListContext();
  const geo = sanitizeGeoFilter(filterValues?.[GEO_FILTER_KEY]);

  const setGeo = (next?: GeoFilter) => {
    const { [GEO_FILTER_KEY]: _previous, ...rest } = filterValues ?? {};
    const clean = sanitizeGeoFilter(next);
    setFilters(
      clean ? { ...rest, [GEO_FILTER_KEY]: clean } : rest,
      displayedFilters,
    );
  };
  return { geo, setGeo };
};

const RegionPopover = ({
  geo,
  setGeo,
  className,
}: {
  geo?: GeoFilter;
  setGeo: (geo?: GeoFilter) => void;
  className?: string;
}) => {
  const translate = useTranslate();
  const places = useCompanyPlaces();
  const active = isGeoFilterActive(geo);
  const summary = describeGeoFilter(geo, {
    km: translate("crm.geo.km_of"),
    inView: translate("crm.geo.in_view"),
  });

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant={active ? "secondary" : "outline"}
            size="sm"
            className={cn("justify-start gap-2 max-w-full", className)}
          />
        }
      >
        <MapPin className="size-4 shrink-0" />
        <span className="truncate">
          {active ? summary : translate("crm.geo.choose")}
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-3">
        <RegionFields
          value={geo ?? {}}
          onChange={(value) => setGeo({ ...value, bounds: geo?.bounds })}
          places={places}
        />
        {geo?.bounds ? (
          <div className="flex items-center justify-between text-sm">
            <span>{translate("crm.map.in_view")}</span>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={translate("crm.geo.clear")}
              onClick={() => setGeo({ ...geo, bounds: undefined })}
            >
              <X className="size-4" />
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
};

const ClearAndMapLinks = ({
  geo,
  setGeo,
  layer,
}: {
  geo?: GeoFilter;
  setGeo: (geo?: GeoFilter) => void;
  layer: MapLayer;
}) => {
  const translate = useTranslate();
  return (
    <div className="flex items-center gap-1">
      <Link
        to={mapLink(layer, geo)}
        className={buttonVariants({
          variant: "ghost",
          size: "sm",
          className: "gap-1 px-2",
        })}
      >
        <MapIcon className="size-4" />
        {translate("crm.geo.view_on_map")}
      </Link>
      {isGeoFilterActive(geo) ? (
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={translate("crm.geo.clear")}
          onClick={() => setGeo(undefined)}
        >
          <X className="size-4" />
        </Button>
      ) : null}
    </div>
  );
};

/** "Region" block for the Companies and Contacts filter sidebars. */
export const RegionFilter = ({ layer }: { layer: MapLayer }) => {
  const { geo, setGeo } = useRegionFilter();
  return (
    <FilterCategory
      icon={<MapPin className="h-4 w-4" />}
      label="crm.geo.region"
    >
      <div className="flex flex-col gap-1 w-full">
        <RegionPopover geo={geo} setGeo={setGeo} className="w-full" />
        <ClearAndMapLinks geo={geo} setGeo={setGeo} layer={layer} />
      </div>
    </FilterCategory>
  );
};

/** Compact region filter for toolbars (Deals list). */
export const RegionFilterButton = ({ layer }: { layer: MapLayer }) => {
  const { geo, setGeo } = useRegionFilter();
  return (
    <div className="flex items-center gap-1">
      <RegionPopover geo={geo} setGeo={setGeo} className="max-w-64" />
      <ClearAndMapLinks geo={geo} setGeo={setGeo} layer={layer} />
    </div>
  );
};
