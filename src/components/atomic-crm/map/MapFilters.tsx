import { useTranslate } from "ra-core";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import { MultiSelect } from "../geo/MultiSelect";
import { RegionFields } from "../geo/RegionFields";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Sale, Tag } from "../types";
import type { LegendEntry, MapLayer } from "./mapModel";
import { COLOR_OPTIONS, DEFAULT_COLOR_BY } from "./mapModel";
import type { MapState } from "./mapSearchParams";

const ALL = "__all__";

type MapFiltersProps = {
  state: MapState;
  update: (patch: Partial<MapState>) => void;
  places: { counties: string[]; cities: string[] };
  tags: Tag[];
  sales: Sale[];
  legend: LegendEntry[];
  picking: boolean;
  onPickOnMap: () => void;
  editPins: boolean;
  onEditPinsChange: (value: boolean) => void;
};

const Field = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <div className="flex flex-col gap-1.5">
    <span className="text-xs font-medium text-muted-foreground">{label}</span>
    {children}
  </div>
);

export const MapFilters = ({
  state,
  update,
  places,
  tags,
  sales,
  legend,
  picking,
  onPickOnMap,
  editPins,
  onEditPinsChange,
}: MapFiltersProps) => {
  const translate = useTranslate();
  const { dealStages, dealCategories, companySectors } =
    useConfigurationContext();

  const colorItems = COLOR_OPTIONS[state.layer].map((value) => ({
    value,
    label: translate(`crm.map.colors.${value}`),
  }));
  const salesItems = [
    { value: ALL, label: translate("crm.map.all_sales") },
    ...sales.map((sale) => ({
      value: String(sale.id),
      label: `${sale.first_name} ${sale.last_name}`,
    })),
  ];
  const sectorItems = [
    { value: ALL, label: translate("crm.map.all_sectors") },
    ...companySectors.map((sector) => ({
      value: sector.value,
      label: sector.label,
    })),
  ];

  return (
    <div className="flex flex-col gap-4">
      <Field label={translate("crm.map.layer")}>
        <ToggleGroup
          value={[state.layer]}
          onValueChange={([value]) =>
            value &&
            update({
              layer: value as MapLayer,
              colorBy: DEFAULT_COLOR_BY[value as MapLayer],
            })
          }
          variant="outline"
          size="sm"
          className="w-full"
        >
          {(["companies", "contacts", "deals"] as const).map((layer) => (
            <ToggleGroupItem key={layer} value={layer} className="flex-1">
              {translate(`crm.map.layers.${layer}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>

      <Field label={translate("crm.map.color_by")}>
        <Select
          value={state.colorBy}
          onValueChange={(value) =>
            value && update({ colorBy: value as MapState["colorBy"] })
          }
          items={colorItems}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {colorItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {legend.length ? (
          <ul
            className="flex flex-wrap gap-x-3 gap-y-1 text-xs"
            aria-label={translate("crm.map.color_by")}
          >
            {legend.map((entry) => (
              <li key={entry.key} className="flex items-center gap-1">
                <span
                  className="inline-block size-2.5 rounded-full"
                  style={{ backgroundColor: entry.color }}
                />
                {entry.label}
              </li>
            ))}
          </ul>
        ) : null}
      </Field>

      <Field label={translate("crm.geo.region")}>
        <RegionFields
          value={state.geo ?? {}}
          onChange={(geo) => update({ geo })}
          places={places}
          onPickOnMap={onPickOnMap}
          picking={picking}
        />
        <div className="flex items-center gap-2">
          <Switch
            id="map-in-view"
            checked={state.inView}
            onCheckedChange={(checked) => update({ inView: checked })}
          />
          <Label htmlFor="map-in-view" className="text-sm font-normal">
            {translate("crm.map.in_view")}
          </Label>
        </div>
      </Field>

      <Field label={translate("crm.map.filters")}>
        <Select
          value={state.salesId ?? ALL}
          onValueChange={(value) =>
            update({ salesId: !value || value === ALL ? undefined : value })
          }
          items={salesItems}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {salesItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={state.sector ?? ALL}
          onValueChange={(value) =>
            update({ sector: !value || value === ALL ? undefined : value })
          }
          items={sectorItems}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sectorItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <MultiSelect
          label={translate("crm.map.tags")}
          options={tags.map((tag) => ({
            value: String(tag.id),
            label: tag.name,
          }))}
          value={state.tagIds}
          onChange={(tagIds) => update({ tagIds })}
        />
        <MultiSelect
          label={translate("crm.map.stages")}
          options={dealStages.map((stage) => ({
            value: stage.value,
            label: stage.label,
          }))}
          value={state.stages}
          onChange={(stages) => update({ stages })}
        />
        <MultiSelect
          label={translate("crm.map.categories")}
          options={dealCategories.map((category) => ({
            value: category.value,
            label: category.label,
          }))}
          value={state.categories}
          onChange={(categories) => update({ categories })}
        />
      </Field>

      {state.layer === "companies" ? (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Switch
              id="map-edit-pins"
              checked={editPins}
              onCheckedChange={onEditPinsChange}
            />
            <Label htmlFor="map-edit-pins" className="text-sm font-normal">
              {translate("crm.map.edit_pins")}
            </Label>
          </div>
          {editPins ? (
            <p className="text-xs text-muted-foreground">
              {translate("crm.map.edit_pins_help")}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
