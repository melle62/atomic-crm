import "leaflet/dist/leaflet.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.Default.css";
import "./map.css";

import L from "leaflet";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import type { Identifier } from "ra-core";
import {
  Circle,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";

import type { GeoBounds, GeoRadius } from "../geo/geoFilter";
import { NEUTRAL_COLOR, type MapMarker } from "./mapModel";

// Southern and central Sweden, where the companies are.
const DEFAULT_CENTER: [number, number] = [59.5, 15.5];
const DEFAULT_ZOOM = 5;

const iconCache = new Map<string, L.DivIcon>();
const markerIcon = (color: string, draggable: boolean) => {
  const key = `${color}-${draggable}`;
  const cached = iconCache.get(key);
  if (cached) return cached;
  const icon = L.divIcon({
    className: "crm-map-marker",
    html: `<span class="crm-map-pin${draggable ? " crm-map-pin--draggable" : ""}" style="background:${color}"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -10],
  });
  iconCache.set(key, icon);
  return icon;
};

const toBounds = (bounds: L.LatLngBounds): GeoBounds => ({
  south: Number(bounds.getSouth().toFixed(5)),
  west: Number(bounds.getWest().toFixed(5)),
  north: Number(bounds.getNorth().toFixed(5)),
  east: Number(bounds.getEast().toFixed(5)),
});

const MapEvents = ({
  onBoundsChange,
  onMapClick,
}: {
  onBoundsChange: (bounds: GeoBounds) => void;
  onMapClick?: (lat: number, lng: number) => void;
}) => {
  const map = useMapEvents({
    moveend: () => onBoundsChange(toBounds(map.getBounds())),
    click: (event) => onMapClick?.(event.latlng.lat, event.latlng.lng),
  });
  useEffect(() => {
    onBoundsChange(toBounds(map.getBounds()));
    // Report the first view once; later moves come from moveend.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);
  return null;
};

/**
 * Fits the view on first load and whenever `fitKey` changes: to the radius
 * circle when there is one, otherwise to the markers.
 */
const FitView = ({
  markers,
  fitKey,
  initialBounds,
  radius,
}: {
  markers: MapMarker[];
  fitKey: number;
  initialBounds?: GeoBounds;
  radius?: GeoRadius;
}) => {
  const map = useMap();
  const fittedFor = useRef<number | null>(null);
  const usedInitialBounds = useRef(false);

  useEffect(() => {
    if (initialBounds && !usedInitialBounds.current) {
      usedInitialBounds.current = true;
      fittedFor.current = fitKey;
      map.fitBounds([
        [initialBounds.south, initialBounds.west],
        [initialBounds.north, initialBounds.east],
      ]);
      return;
    }
    if (fittedFor.current === fitKey) return;
    if (radius) {
      fittedFor.current = fitKey;
      map.fitBounds(
        L.latLng(radius.lat, radius.lng).toBounds(radius.km * 2000),
        { padding: [16, 16] },
      );
      return;
    }
    if (markers.length === 0) return;
    fittedFor.current = fitKey;
    const bounds = L.latLngBounds(
      markers.map((m) => [m.latitude, m.longitude]),
    );
    map.fitBounds(bounds, { padding: [32, 32], maxZoom: 11 });
  }, [map, markers, fitKey, initialBounds, radius]);
  return null;
};

/** Leaflet sizes itself on mount; re-measure when the container changes size. */
const InvalidateOnResize = () => {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(container);
    return () => observer.disconnect();
  }, [map]);
  return null;
};

export type MapCanvasProps = {
  markers: MapMarker[];
  colors: Map<string, string>;
  renderPopup: (marker: MapMarker) => ReactNode;
  radius?: GeoRadius;
  onBoundsChange: (bounds: GeoBounds) => void;
  onMapClick?: (lat: number, lng: number) => void;
  picking?: boolean;
  /** When set, markers can be dragged and clustering is off. */
  onMoveCompany?: (companyId: Identifier, lat: number, lng: number) => void;
  fitKey: number;
  initialBounds?: GeoBounds;
};

export const MapCanvas = ({
  markers,
  colors,
  renderPopup,
  radius,
  onBoundsChange,
  onMapClick,
  picking,
  onMoveCompany,
  fitKey,
  initialBounds,
}: MapCanvasProps) => {
  const draggable = !!onMoveCompany;
  const markerElements = useMemo(
    () =>
      markers.map((marker) => (
        <Marker
          key={marker.key}
          position={[marker.latitude, marker.longitude]}
          icon={markerIcon(
            colors.get(marker.colorKey) ?? NEUTRAL_COLOR,
            draggable,
          )}
          title={marker.title}
          alt={marker.title}
          draggable={draggable}
          eventHandlers={
            draggable
              ? {
                  dragend: (event) => {
                    const position = (event.target as L.Marker).getLatLng();
                    onMoveCompany?.(
                      marker.companyId,
                      position.lat,
                      position.lng,
                    );
                  },
                }
              : undefined
          }
        >
          <Popup>{renderPopup(marker)}</Popup>
        </Marker>
      )),
    [markers, colors, renderPopup, draggable, onMoveCompany],
  );

  return (
    <div
      className={`isolate h-full w-full ${picking ? "crm-map-picking" : ""}`}
    >
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        className="h-full w-full"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <MapEvents onBoundsChange={onBoundsChange} onMapClick={onMapClick} />
        <FitView
          markers={markers}
          fitKey={fitKey}
          initialBounds={initialBounds}
          radius={radius}
        />
        <InvalidateOnResize />
        {radius ? (
          <Circle
            center={[radius.lat, radius.lng]}
            radius={radius.km * 1000}
            pathOptions={{ color: "#2563eb", weight: 2, fillOpacity: 0.06 }}
            interactive={false}
          />
        ) : null}
        {draggable ? (
          markerElements
        ) : (
          <MarkerClusterGroup chunkedLoading maxClusterRadius={45}>
            {markerElements}
          </MarkerClusterGroup>
        )}
      </MapContainer>
    </div>
  );
};

export default MapCanvas;
