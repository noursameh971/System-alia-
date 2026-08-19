import { apiFetch } from "./apiClient";
import type { FlatBin, Warehouse, WarehouseBin, WarehouseZone } from "./types";

export function listWarehouses(): Promise<Warehouse[]> {
  return apiFetch<Warehouse[]>("/api/warehouses");
}

export function listZones(warehouseId: string): Promise<WarehouseZone[]> {
  return apiFetch<WarehouseZone[]>(`/api/warehouses/${warehouseId}/zones`);
}

export function listBins(zoneId: string): Promise<WarehouseBin[]> {
  return apiFetch<WarehouseBin[]>(`/api/warehouses/zones/${zoneId}/bins`);
}

/**
 * Flattens every bin across every zone of every warehouse into one list.
 * The business runs a single shared warehouse (Step 1 decision), so this is
 * a handful of requests at most — simpler than adding a dedicated
 * "list all bins" backend endpoint for what's a small, rarely-changing set.
 */
export async function listAllBins(): Promise<FlatBin[]> {
  const warehouses = await listWarehouses();
  const zonesByWarehouse = await Promise.all(warehouses.map((w) => listZones(w.id)));
  const zones = zonesByWarehouse.flat();

  const binsByZone = await Promise.all(
    zones.map(async (zone) => {
      const bins = await listBins(zone.id);
      return bins.map((bin) => ({ ...bin, zoneCode: zone.code }));
    }),
  );

  return binsByZone.flat();
}
