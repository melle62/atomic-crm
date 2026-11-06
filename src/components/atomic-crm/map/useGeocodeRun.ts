import { useCallback, useRef, useState } from "react";
import { useDataProvider, useRefresh } from "ra-core";

import type { CrmDataProvider } from "../providers/types";

export type GeocodeProgress = {
  running: boolean;
  placed: number;
  failed: number;
  remaining?: number;
  error?: string;
  done: boolean;
};

const INITIAL: GeocodeProgress = {
  running: false,
  placed: 0,
  failed: 0,
  done: false,
};
// Safety net: 86 companies need 1-3 runs; never loop forever on a stuck queue.
const MAX_RUNS = 30;

/**
 * Runs the server-side geocoder until the queue is empty. Each call works for
 * about 100 s (the edge function time limit), so a backfill takes several calls;
 * progress and the map refresh after each one.
 */
export const useGeocodeRun = () => {
  const dataProvider = useDataProvider<CrmDataProvider>();
  const refresh = useRefresh();
  const [progress, setProgress] = useState<GeocodeProgress>(INITIAL);
  const running = useRef(false);

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    let totals = { ...INITIAL, running: true };
    setProgress(totals);
    try {
      for (let runIndex = 0; runIndex < MAX_RUNS; runIndex += 1) {
        const result = await dataProvider.geocodeCompanies();
        totals = {
          ...totals,
          placed: totals.placed + result.placed,
          failed: totals.failed + result.failed,
          remaining: result.remaining,
          error: result.error,
        };
        setProgress(totals);
        refresh();
        if (result.stoppedReason !== "budget" || result.remaining === 0) break;
      }
      setProgress({ ...totals, running: false, done: true });
    } catch (error) {
      setProgress({
        ...totals,
        running: false,
        done: true,
        error: error instanceof Error ? error.message : String(error),
      });
      refresh();
    } finally {
      running.current = false;
    }
  }, [dataProvider, refresh]);

  return { progress, run };
};
