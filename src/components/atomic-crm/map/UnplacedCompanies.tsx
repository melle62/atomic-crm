import { Loader2, MapPinOff, RefreshCw } from "lucide-react";
import { useNotify, useTranslate, useUpdateMany } from "ra-core";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useIsMobile } from "@/hooks/use-mobile";

import { automaticPin } from "../geo/locationChange";
import type { Company } from "../types";
import { useGeocodeRun } from "./useGeocodeRun";

const placeOf = (company: Company) =>
  [company.address, company.zipcode, company.city, company.state_abbr]
    .filter(Boolean)
    .join(", ");

/** Companies the geocoder could not place (or has not reached yet), to fix by hand. */
export const UnplacedCompanies = ({ companies }: { companies: Company[] }) => {
  const translate = useTranslate();
  const notify = useNotify();
  // Companies can only be edited on desktop; the phone opens the company page.
  const isMobile = useIsMobile();
  const { progress, run } = useGeocodeRun();
  const [updateMany, { isPending: isRequeuing }] = useUpdateMany();

  const unplaced = companies.filter(
    (company) => company.latitude == null || company.longitude == null,
  );
  const pending = unplaced.filter(
    (company) => company.geocode_status === "pending",
  );
  const failed = unplaced.filter(
    (company) => company.geocode_status === "failed",
  );
  const total = progress.placed + progress.failed + (progress.remaining ?? 0);

  const retryFailed = () =>
    updateMany(
      "companies",
      { ids: failed.map((company) => company.id), data: automaticPin() },
      {
        onSuccess: () => run(),
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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={run}
          disabled={progress.running || pending.length === 0}
          className="gap-2"
        >
          {progress.running ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          {translate("crm.map.geocode_now")} ({pending.length})
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={retryFailed}
          disabled={progress.running || isRequeuing || failed.length === 0}
        >
          {translate("crm.map.retry_failed")} ({failed.length})
        </Button>
      </div>

      {progress.running || progress.done ? (
        <div className="flex flex-col gap-1 text-sm" aria-live="polite">
          {progress.running && total > 0 ? (
            <Progress
              value={((progress.placed + progress.failed) / total) * 100}
            />
          ) : null}
          <span>
            {translate(
              progress.running
                ? "crm.map.geocoding_progress"
                : "crm.map.geocoding_done",
              {
                placed: progress.placed,
                failed: progress.failed,
                remaining: progress.remaining ?? "…",
              },
            )}
          </span>
          {progress.error ? (
            <span className="text-destructive">
              {translate("crm.map.geocoding_error", { error: progress.error })}
            </span>
          ) : null}
        </div>
      ) : null}

      {unplaced.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {translate("crm.map.unplaced_empty")}
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {translate("crm.map.unplaced_help")}
          </p>
          <ul className="flex flex-col divide-y">
            {unplaced.map((company) => (
              <li key={company.id} className="py-2 flex gap-2 items-start">
                <MapPinOff className="size-4 mt-0.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex flex-col">
                  <Link
                    to={`/companies/${company.id}${isMobile ? "/show" : ""}`}
                    className="text-sm font-medium hover:underline truncate"
                  >
                    {company.name}
                  </Link>
                  <span className="text-xs text-muted-foreground truncate">
                    {placeOf(company) || "—"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {company.geocode_status === "pending"
                      ? translate("crm.map.pending")
                      : company.geocode_error}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
};
