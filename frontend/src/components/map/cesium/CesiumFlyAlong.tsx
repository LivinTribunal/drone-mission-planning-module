import { useEffect, useRef } from "react";
import { Entity } from "resium";
import {
  Cartesian3,
  Color,
  Math as CesiumMath,
} from "cesium";
import type { Viewer as CesiumViewer } from "cesium";
import type { WaypointResponse } from "@/types/flightPlan";
import type { FlyAlongState } from "@/types/map";

interface CesiumFlyAlongProps {
  viewer: CesiumViewer | null;
  waypoints: WaypointResponse[];
  flyAlongState: FlyAlongState;
  terrainOffset: number;
}

/** animates camera along the flight trajectory and shows a drone marker at current position. */
export default function CesiumFlyAlong({
  viewer,
  waypoints,
  flyAlongState,
  terrainOffset,
}: CesiumFlyAlongProps) {
  const prevIndexRef = useRef(-1);

  // animate camera to current waypoint
  useEffect(() => {
    if (!viewer || flyAlongState.status !== "playing") return;
    if (flyAlongState.currentIndex === prevIndexRef.current) return;
    prevIndexRef.current = flyAlongState.currentIndex;

    const wp = waypoints[flyAlongState.currentIndex];
    if (!wp) return;

    const [lng, lat, alt] = wp.position.coordinates;
    const position = Cartesian3.fromDegrees(lng, lat, (alt ?? 0) + terrainOffset + 30);

    // compute heading towards next waypoint or camera target
    let heading = 0;
    if (wp.camera_target && wp.waypoint_type === "MEASUREMENT") {
      const [tLng, tLat] = wp.camera_target.coordinates;
      heading = CesiumMath.toRadians(
        bearing(lat, lng, tLat, tLng),
      );
    } else if (flyAlongState.currentIndex < waypoints.length - 1) {
      const next = waypoints[flyAlongState.currentIndex + 1];
      const [nLng, nLat] = next.position.coordinates;
      heading = CesiumMath.toRadians(bearing(lat, lng, nLat, nLng));
    }

    viewer.camera.cancelFlight();
    viewer.camera.flyTo({
      destination: position,
      orientation: {
        heading,
        pitch: CesiumMath.toRadians(-30),
        roll: 0,
      },
      duration: 1.5 / flyAlongState.speed,
    });
  }, [viewer, waypoints, flyAlongState.currentIndex, flyAlongState.status, flyAlongState.speed, terrainOffset]);

  // current position marker
  const currentWp = waypoints[flyAlongState.currentIndex];
  if (!currentWp || flyAlongState.status === "idle") return null;

  const [lng, lat, alt] = currentWp.position.coordinates;

  return (
    <Entity
      key="fly-along-marker"
      position={Cartesian3.fromDegrees(lng, lat, (alt ?? 0) + terrainOffset)}
      point={{
        pixelSize: 18,
        color: Color.CYAN,
        outlineColor: Color.WHITE,
        outlineWidth: 3,
      }}
    />
  );
}

/** compute bearing between two geographic points in degrees. */
function bearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLng = CesiumMath.toRadians(lng2 - lng1);
  const lat1Rad = CesiumMath.toRadians(lat1);
  const lat2Rad = CesiumMath.toRadians(lat2);
  const y = Math.sin(dLng) * Math.cos(lat2Rad);
  const x =
    Math.cos(lat1Rad) * Math.sin(lat2Rad) -
    Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng);
  return (CesiumMath.toDegrees(Math.atan2(y, x)) + 360) % 360;
}
