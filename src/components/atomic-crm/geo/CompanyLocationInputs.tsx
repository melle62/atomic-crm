import { useEffect, useRef } from "react";
import { MapPin } from "lucide-react";
import { maxValue, minValue, useTranslate } from "ra-core";
import { useFormContext, useWatch } from "react-hook-form";
import { NumberInput } from "@/components/admin/number-input";
import { Button } from "@/components/ui/button";

import type { GeocodePrecision, GeocodeStatus } from "../types";
import { automaticPin } from "./locationChange";

const LOCATION_FIELDS = [
  "latitude",
  "longitude",
  "geocode_status",
  "geocode_precision",
  "geocode_error",
] as const;

const validateLatitude = [minValue(-90), maxValue(90)];
const validateLongitude = [minValue(-180), maxValue(180)];

const LocationStatus = ({
  status,
  precision,
  error,
}: {
  status?: GeocodeStatus;
  precision?: GeocodePrecision | null;
  error?: string | null;
}) => {
  const translate = useTranslate();
  if (!status) return null;
  return (
    <p className="text-sm text-muted-foreground flex items-start gap-2">
      <MapPin className="size-4 mt-0.5 shrink-0" />
      {translate(`crm.geo.status.${status}`, {
        precision: precision
          ? translate(`crm.map.precisions.${precision}`)
          : "",
        error: error ?? "",
      })}
    </p>
  );
};

/**
 * Latitude / longitude of a company. Typing coordinates pins it by hand
 * ('manual'), which re-geocoding never overwrites; the button hands it back to
 * the automatic geocoder.
 */
export const CompanyLocationInputs = () => {
  const translate = useTranslate();
  const { setValue, getFieldState } = useFormContext();
  const [latitude, longitude, status, precision, error] = useWatch({
    name: [...LOCATION_FIELDS],
  });
  const resetting = useRef(false);

  useEffect(() => {
    if (resetting.current) {
      resetting.current = false;
      return;
    }
    const edited =
      getFieldState("latitude").isDirty || getFieldState("longitude").isDirty;
    if (
      edited &&
      latitude != null &&
      longitude != null &&
      status !== "manual"
    ) {
      setValue("geocode_status", "manual", { shouldDirty: true });
      setValue("geocode_precision", "manual", { shouldDirty: true });
      setValue("geocode_error", null, { shouldDirty: true });
    }
  }, [latitude, longitude, status, getFieldState, setValue]);

  const useAutomatic = () => {
    resetting.current = true;
    Object.entries(automaticPin()).forEach(([field, value]) =>
      setValue(field, value, { shouldDirty: true }),
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <h6 className="text-lg font-semibold">{translate("crm.geo.location")}</h6>
      <LocationStatus status={status} precision={precision} error={error} />
      <div className="flex gap-4">
        <NumberInput
          source="latitude"
          label="crm.geo.latitude"
          step={0.0001}
          validate={validateLatitude}
          helperText={false}
          className="flex-1"
        />
        <NumberInput
          source="longitude"
          label="crm.geo.longitude"
          step={0.0001}
          validate={validateLongitude}
          helperText={false}
          className="flex-1"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {translate("crm.geo.manual_help")}
      </p>
      {status === "manual" ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={useAutomatic}
        >
          {translate("crm.geo.use_automatic")}
        </Button>
      ) : null}
    </div>
  );
};
