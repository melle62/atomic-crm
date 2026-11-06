import { useCallback, useEffect, useMemo, useState } from "react";
import { Maximize, SlidersHorizontal } from "lucide-react";
import { useNotify, useTranslate, useUpdate, type Identifier } from "ra-core";
import { useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsMobile } from "@/hooks/use-mobile";

import { readRadiusKm, type GeoBounds, type GeoFilter } from "../geo/geoFilter";
import { manualPin } from "../geo/locationChange";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Company, Contact, Deal } from "../types";
import { MapCanvas } from "./MapCanvas";
import { MapFilters } from "./MapFilters";
import {
  buildLegend,
  buildMarkers,
  filterMapData,
  listPlaces,
  type MapMarker,
} from "./mapModel";
import { parseMapSearch, toMapSearch, type MapState } from "./mapSearchParams";
import { MarkerCard, type MarkerCardContext } from "./MarkerCard";
import { RegionSummary } from "./RegionSummary";
import { UnplacedCompanies } from "./UnplacedCompanies";
import { useMapData } from "./useMapData";

const byId = <T extends { id: Identifier }>(records: T[]) =>
  new Map(records.map((record) => [String(record.id), record]));

const MapPage = () => {
  const translate = useTranslate();
  const notify = useNotify();
  const isMobile = useIsMobile();
  const { dealStages, dealPipelineStatuses, currency } =
    useConfigurationContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const state = useMemo(() => parseMapSearch(searchParams), [searchParams]);
  const [viewBounds, setViewBounds] = useState<GeoBounds>();
  const [picking, setPicking] = useState(false);
  const [editPins, setEditPins] = useState(false);
  const [fitKey, setFitKey] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const data = useMapData();
  const [update] = useUpdate<Company>();

  const updateState = useCallback(
    (patch: Partial<MapState>) =>
      setSearchParams(toMapSearch({ ...state, ...patch }), { replace: true }),
    [setSearchParams, state],
  );

  // Zoom to the region when the user picks counties, cities or a radius.
  const geoKey = JSON.stringify(state.geo ?? {});
  useEffect(() => {
    setFitKey((key) => key + 1);
  }, [geoKey, state.layer]);

  const closedStages = useMemo(
    () => [...new Set([...(dealPipelineStatuses ?? []), "lost"])],
    [dealPipelineStatuses],
  );
  const stageOrder = useMemo(
    () => dealStages.map((stage) => stage.value),
    [dealStages],
  );

  const geo: GeoFilter | undefined = useMemo(
    () =>
      state.inView && viewBounds
        ? { ...state.geo, bounds: viewBounds }
        : state.geo,
    [state.geo, state.inView, viewBounds],
  );

  const filtered = useMemo(
    () =>
      filterMapData(data, {
        geo,
        salesId: state.salesId,
        sector: state.sector,
        tagIds: state.tagIds,
        stages: state.stages,
        categories: state.categories,
      }),
    // `data` changes identity every render; depend on its arrays instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.companies, data.contacts, data.deals, data.tags, geo, state],
  );

  // Markers ignore the in-view bounds so panning never makes pins disappear.
  const markerData = useMemo(
    () =>
      state.inView
        ? filterMapData(data, {
            geo: state.geo,
            salesId: state.salesId,
            sector: state.sector,
            tagIds: state.tagIds,
            stages: state.stages,
            categories: state.categories,
          })
        : filtered,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, data.companies, data.contacts, data.deals, data.tags, state],
  );

  const markers = useMemo(
    () =>
      buildMarkers(editPins ? "companies" : state.layer, markerData, {
        colorBy: state.colorBy,
        stageOrder,
        closedStages,
      }),
    [
      markerData,
      state.layer,
      state.colorBy,
      stageOrder,
      closedStages,
      editPins,
    ],
  );

  const legend = useMemo(
    () =>
      buildLegend(markers, state.colorBy, {
        stages: dealStages,
        sales: data.sales,
        none:
          state.colorBy === "stage" && state.layer !== "deals"
            ? translate("crm.map.no_open_deal")
            : translate("crm.map.no_value"),
      }),
    [markers, state.colorBy, state.layer, dealStages, data.sales, translate],
  );
  const colors = useMemo(
    () => new Map(legend.map((entry) => [entry.key, entry.color])),
    [legend],
  );

  const formatAmount = useCallback(
    (amount: number) =>
      (amount || 0).toLocaleString("sv-SE", {
        style: "currency",
        currency,
        currencyDisplay: "narrowSymbol",
        notation: "compact",
        maximumFractionDigits: 1,
      }),
    [currency],
  );

  const cardContext: MarkerCardContext = useMemo(() => {
    const tagsById = byId(data.tags);
    return {
      companiesById: byId(data.companies),
      contactsById: byId<Contact>(data.contacts),
      dealsById: byId<Deal>(data.deals),
      dealsByCompany: data.deals.reduce((acc, deal) => {
        const key = String(deal.company_id);
        acc.set(key, [...(acc.get(key) ?? []), deal]);
        return acc;
      }, new Map<string, Deal[]>()),
      tagNames: (ids) =>
        (ids ?? [])
          .map((id) => tagsById.get(String(id))?.name)
          .filter(Boolean) as string[],
      stageLabel: (stage) =>
        dealStages.find((s) => s.value === stage)?.label ?? stage,
      closedStages,
      formatAmount,
    };
  }, [
    data.companies,
    data.contacts,
    data.deals,
    data.tags,
    dealStages,
    closedStages,
    formatAmount,
  ]);

  const renderPopup = useCallback(
    (marker: MapMarker) => <MarkerCard marker={marker} context={cardContext} />,
    [cardContext],
  );

  const onMapClick = useCallback(
    (lat: number, lng: number) => {
      if (!picking) return;
      setPicking(false);
      updateState({
        geo: {
          ...state.geo,
          radius: {
            lat: Number(lat.toFixed(5)),
            lng: Number(lng.toFixed(5)),
            km: readRadiusKm(state.geo?.radius),
          },
        },
      });
    },
    [picking, state.geo, updateState],
  );

  const onMoveCompany = useCallback(
    (companyId: Identifier, lat: number, lng: number) => {
      const previousData = cardContext.companiesById.get(String(companyId));
      if (!previousData) return;
      update(
        "companies",
        { id: companyId, data: manualPin(lat, lng), previousData },
        {
          mutationMode: "undoable",
          onSuccess: () => notify("crm.map.pin_moved", { undoable: true }),
          onError: (error) =>
            notify(
              error instanceof Error
                ? error.message
                : "ra.notification.http_error",
              {
                type: "error",
              },
            ),
        },
      );
    },
    [cardContext.companiesById, notify, update],
  );

  const places = useMemo(() => listPlaces(data.companies), [data.companies]);
  const placedCount = data.companies.filter(
    (c) => c.latitude != null && c.longitude != null,
  ).length;
  const unplacedCount = data.companies.length - placedCount;

  const extraListFilter = useCallback(
    (resource: "companies" | "contacts" | "deals") => ({
      ...(state.salesId ? { sales_id: state.salesId } : {}),
      ...(resource === "companies" && state.sector
        ? { sector: state.sector }
        : {}),
      ...(resource === "contacts" && state.tagIds.length
        ? { "tags@cs": `{${state.tagIds.join(",")}}` }
        : {}),
    }),
    [state.salesId, state.sector, state.tagIds],
  );

  const panel = (
    <Tabs defaultValue="filters" className="flex flex-col gap-3 min-h-0">
      <TabsList className="w-full">
        <TabsTrigger value="filters">
          {translate("crm.map.filters")}
        </TabsTrigger>
        <TabsTrigger value="summary">
          {translate("crm.map.summary")}
        </TabsTrigger>
        <TabsTrigger value="unplaced">
          {translate("crm.map.unplaced")}
          {unplacedCount ? ` (${unplacedCount})` : ""}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="filters">
        <MapFilters
          state={state}
          update={updateState}
          places={places}
          tags={data.tags}
          sales={data.sales}
          legend={legend}
          picking={picking}
          onPickOnMap={() => {
            setPicking((value) => !value);
            setPanelOpen(false);
          }}
          editPins={editPins}
          onEditPinsChange={setEditPins}
        />
      </TabsContent>
      <TabsContent value="summary">
        <RegionSummary
          data={filtered}
          formatAmount={formatAmount}
          onSelectRegion={(region) => {
            updateState({ geo: { ...region, radius: state.geo?.radius } });
            setPanelOpen(false);
          }}
          extraListFilter={extraListFilter}
        />
      </TabsContent>
      <TabsContent value="unplaced">
        <UnplacedCompanies companies={data.companies} />
      </TabsContent>
    </Tabs>
  );

  const counts = translate("crm.map.counts", { smart_count: markers.length });

  const canvas = (
    <div className="relative h-full w-full" data-no-pull-to-refresh>
      <MapCanvas
        markers={markers}
        colors={colors}
        renderPopup={renderPopup}
        radius={state.geo?.radius}
        onBoundsChange={setViewBounds}
        onMapClick={onMapClick}
        picking={picking}
        onMoveCompany={editPins ? onMoveCompany : undefined}
        fitKey={fitKey}
        initialBounds={state.initialBounds}
      />
      <div className="absolute top-2 right-2 z-[1000] flex flex-col items-end gap-2">
        <Button
          size="sm"
          variant="secondary"
          className="shadow gap-1"
          onClick={() => setFitKey((key) => key + 1)}
        >
          <Maximize className="size-4" />
          {translate("crm.map.reset_view")}
        </Button>
        {picking ? (
          <span className="rounded-md bg-primary text-primary-foreground text-xs px-2 py-1 shadow">
            {translate("crm.geo.picking")}
          </span>
        ) : null}
      </div>
      <div className="absolute bottom-6 left-2 z-[1000] rounded-md bg-background/90 px-2 py-1 text-xs shadow">
        {data.isPending ? translate("crm.map.loading") : counts}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      // Fills the space between the fixed mobile navigation bar and the top of the screen.
      <div className="fixed inset-x-0 top-0 bottom-14">
        {canvas}
        <Button
          className="absolute bottom-8 right-3 z-[1000] shadow-lg gap-2"
          onClick={() => setPanelOpen(true)}
        >
          <SlidersHorizontal className="size-4" />
          {translate("crm.map.filters")}
        </Button>
        <Sheet open={panelOpen} onOpenChange={setPanelOpen}>
          <SheetContent
            side="bottom"
            className="max-h-[80dvh] overflow-y-auto p-4"
          >
            <SheetHeader className="p-0">
              <SheetTitle>{translate("crm.map.title")}</SheetTitle>
            </SheetHeader>
            {panel}
          </SheetContent>
        </Sheet>
      </div>
    );
  }

  return (
    <div className="flex gap-4 h-[calc(100dvh-7rem)] min-h-[480px]">
      <aside className="w-80 shrink-0 overflow-y-auto pr-1">{panel}</aside>
      <div className="flex-1 rounded-lg overflow-hidden border">{canvas}</div>
    </div>
  );
};

MapPage.path = "/map";

export default MapPage;
