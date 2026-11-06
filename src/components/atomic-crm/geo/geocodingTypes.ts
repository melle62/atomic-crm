/** Result of one run of the `geocode` edge function over the pending queue. */
export type GeocodeRunResult = {
  processed: number;
  placed: number;
  failed: number;
  remaining: number;
  stoppedReason: "empty" | "budget" | "unavailable";
  error?: string;
};

export type PlaceSearchResult = {
  latitude: number;
  longitude: number;
  displayName?: string | null;
};
