import type { GroupRoutingStatus } from "./routing-status.svelte";

export type RouteIndicator = {
  label: string;
  kind: "healthy" | "error" | "pending" | "disabled";
};

/** Present the *applied* route, never the preferred or uncommitted selection. */
export function routeIndicator(
  status: GroupRoutingStatus | undefined,
  enabled: boolean,
): RouteIndicator {
  if (!enabled) return { label: "Disabled", kind: "disabled" };
  if (!status) return { label: "Checking", kind: "pending" };
  if (!status.applied) return { label: "Unavailable", kind: "error" };
  const active = status.active_interface;
  if (!active || active === "blackhole") {
    return { label: "Unavailable", kind: "error" };
  }
  const check = status.interfaces.find((item) => item.interface === active);
  if (!check?.checked) return { label: "Checking", kind: "pending" };
  return check.healthy
    ? { label: active, kind: "healthy" }
    : { label: "Unavailable", kind: "error" };
}
