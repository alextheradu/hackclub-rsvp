import { useSyncExternalStore } from "react";

let zonesCache: string[] | null = null;
function getZones(): string[] {
  zonesCache ??= ["UTC", ...Intl.supportedValuesOf("timeZone")];
  return zonesCache;
}
const NO_ZONES: string[] = [];
const subscribeNothing = () => () => {};

// Every IANA timezone for a datalist. Empty during server rendering.
export function useTimeZones(): string[] {
  return useSyncExternalStore(subscribeNothing, getZones, () => NO_ZONES);
}
