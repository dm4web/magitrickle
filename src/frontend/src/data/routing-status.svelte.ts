import { fetcher } from "../utils/fetcher";

export type InterfaceCheck = {
  interface: string;
  healthy: boolean;
  checked: boolean;
  method: "link" | "tcp" | "pending";
  detail: string;
  latency_ms?: number;
  checked_at?: string;
};

export type GroupRoutingStatus = {
  id: string;
  enabled: boolean;
  primary_interface: string;
  active_interface: string;
  selected_interface: string;
  applied: boolean;
  check_target?: string;
  failover: boolean;
  interfaces: InterfaceCheck[];
};

export const routingStatus = $state({
  groups: [] as GroupRoutingStatus[],
  loaded: false,
});

export async function fetchRoutingStatus() {
  const response = await fetcher.get<{ groups: GroupRoutingStatus[] }>("/system/routing-status");
  routingStatus.groups = response.groups ?? [];
  routingStatus.loaded = true;
}
