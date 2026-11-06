import { useState, type FormEvent } from "react";
import { Crosshair, Loader2, Search, X } from "lucide-react";
import { useDataProvider, useNotify, useTranslate } from "ra-core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type { CrmDataProvider } from "../providers/types";
import {
  DEFAULT_RADIUS_KM,
  MAX_RADIUS_KM,
  type GeoFilter,
  type GeoRadius,
} from "./geoFilter";
import { MultiSelect } from "./MultiSelect";

export type RegionValue = Omit<GeoFilter, "bounds">;

const toOptions = (values: string[]) =>
  values.map((value) => ({ value, label: value }));

type RegionFieldsProps = {
  value: RegionValue;
  onChange: (value: RegionValue) => void;
  places: { counties: string[]; cities: string[] };
  /** Lets the user click the map to set the radius centre (map page only). */
  onPickOnMap?: () => void;
  picking?: boolean;
};

/** County, city and "within X km of a place" inputs, shared by the map and lists. */
export const RegionFields = ({
  value,
  onChange,
  places,
  onPickOnMap,
  picking,
}: RegionFieldsProps) => {
  const translate = useTranslate();

  return (
    <div className="flex flex-col gap-2">
      <MultiSelect
        label={translate("crm.geo.counties")}
        options={toOptions(places.counties)}
        value={value.counties ?? []}
        onChange={(counties) => onChange({ ...value, counties })}
      />
      <MultiSelect
        label={translate("crm.geo.cities")}
        options={toOptions(places.cities)}
        value={value.cities ?? []}
        onChange={(cities) => onChange({ ...value, cities })}
      />
      <RadiusField
        radius={value.radius}
        onChange={(radius) => onChange({ ...value, radius })}
        onPickOnMap={onPickOnMap}
        picking={picking}
      />
    </div>
  );
};

const RadiusField = ({
  radius,
  onChange,
  onPickOnMap,
  picking,
}: {
  radius?: GeoRadius;
  onChange: (radius?: GeoRadius) => void;
  onPickOnMap?: () => void;
  picking?: boolean;
}) => {
  const translate = useTranslate();
  const notify = useNotify();
  const dataProvider = useDataProvider<CrmDataProvider>();
  const [place, setPlace] = useState("");
  const [km, setKm] = useState<string>(String(radius?.km ?? DEFAULT_RADIUS_KM));
  const [searching, setSearching] = useState(false);

  const kmValue = () => {
    const parsed = Number(km);
    return Number.isFinite(parsed) && parsed > 0
      ? Math.min(parsed, MAX_RADIUS_KM)
      : DEFAULT_RADIUS_KM;
  };

  const search = async (event: FormEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const query = place.trim();
    if (query.length < 2) return;
    setSearching(true);
    try {
      const result = await dataProvider.searchPlace(query);
      if (!result) {
        notify("crm.geo.place_not_found", { type: "warning" });
        return;
      }
      onChange({
        lat: result.latitude,
        lng: result.longitude,
        km: kmValue(),
        label: query,
      });
      setPlace("");
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "crm.geo.place_not_found",
        {
          type: "error",
        },
      );
    } finally {
      setSearching(false);
    }
  };

  const updateKm = (next: string) => {
    setKm(next);
    const parsed = Number(next);
    if (radius && Number.isFinite(parsed) && parsed > 0) {
      onChange({ ...radius, km: Math.min(parsed, MAX_RADIUS_KM) });
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border p-2">
      <div className="flex items-center gap-2">
        <Label htmlFor="geo-radius-km" className="text-sm font-normal shrink-0">
          {translate("crm.geo.radius")}
        </Label>
        <Input
          id="geo-radius-km"
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_RADIUS_KM}
          value={km}
          onChange={(event) => updateKm(event.target.value)}
          className="h-8 w-20"
        />
        <span className="text-sm text-muted-foreground">
          {translate("crm.geo.km_of")}
        </span>
      </div>
      {radius ? (
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="truncate">
            {radius.label ??
              `${radius.lat.toFixed(3)}, ${radius.lng.toFixed(3)}`}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={translate("crm.geo.clear")}
            onClick={() => onChange(undefined)}
          >
            <X className="size-4" />
          </Button>
        </div>
      ) : null}
      <form className="flex gap-2" onSubmit={search}>
        <Input
          value={place}
          onChange={(event) => setPlace(event.target.value)}
          placeholder={translate("crm.geo.place_placeholder")}
          aria-label={translate("crm.geo.place")}
          className="h-8"
          maxLength={200}
        />
        <Button
          type="submit"
          variant="outline"
          size="icon"
          className="size-8 shrink-0"
          aria-label={translate("crm.geo.search_place")}
          disabled={searching || place.trim().length < 2}
        >
          {searching ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Search className="size-4" />
          )}
        </Button>
      </form>
      {onPickOnMap ? (
        <Button
          variant={picking ? "default" : "outline"}
          size="sm"
          onClick={onPickOnMap}
          className="gap-2"
        >
          <Crosshair className="size-4" />
          {translate(picking ? "crm.geo.picking" : "crm.geo.pick_on_map")}
        </Button>
      ) : null}
    </div>
  );
};
