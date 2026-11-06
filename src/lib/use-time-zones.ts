import { useSyncExternalStore } from "react";

let zonesCache: string[] | null = null;
function getZones(): string[] {
  zonesCache ??= ["UTC", ...Intl.supportedValuesOf("timeZone")];
  return zonesCache;
}
const NO_ZONES: string[] = [];
const subscribeNothing = () => () => {};

export function useTimeZones(): string[] {
  return useSyncExternalStore(subscribeNothing, getZones, () => NO_ZONES);
}
