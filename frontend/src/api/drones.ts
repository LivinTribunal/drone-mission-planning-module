import type { DeleteResponse, ListMeta } from "@/types/common";
import type { DroneCreate, DroneResponse, DroneUpdate } from "@/types/drone";
import client from "./client";

export async function listAirportDrones(
  airportId: string,
): Promise<{ data: DroneResponse[]; meta: ListMeta }> {
  const res = await client.get(`/airports/${airportId}/drones`);
  return res.data;
}

export async function getAirportDrone(
  airportId: string,
  droneId: string,
): Promise<DroneResponse> {
  const res = await client.get(`/airports/${airportId}/drones/${droneId}`);
  return res.data;
}

export async function createAirportDrone(
  airportId: string,
  data: DroneCreate,
): Promise<DroneResponse> {
  const res = await client.post(`/airports/${airportId}/drones`, data);
  return res.data;
}

export async function updateAirportDrone(
  airportId: string,
  droneId: string,
  data: DroneUpdate,
): Promise<DroneResponse> {
  const res = await client.put(
    `/airports/${airportId}/drones/${droneId}`,
    data,
  );
  return res.data;
}

export async function deleteAirportDrone(
  airportId: string,
  droneId: string,
): Promise<DeleteResponse> {
  const res = await client.delete(`/airports/${airportId}/drones/${droneId}`);
  return res.data;
}
