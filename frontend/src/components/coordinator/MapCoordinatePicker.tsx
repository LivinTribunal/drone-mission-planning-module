import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import maplibregl from "maplibre-gl";
import { Maximize2, Minimize2, Loader2 } from "lucide-react";
import Button from "@/components/common/Button";
import Input from "@/components/common/Input";

interface MapCoordinatePickerProps {
  onConfirm: (coords: { lat: number; lon: number; alt: number }) => void;
  onClose: () => void;
  initialLat?: number;
  initialLon?: number;
}

const ESRI_IMAGERY_TILES =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ESRI_REFERENCE_TILES =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";
const ESRI_ATTRIBUTION = "Tiles © Esri";

function makeSatelliteStyle(): maplibregl.StyleSpecification {
  /** satellite base + esri reference overlay for country lines, cities, labels. */
  return {
    version: 8,
    sources: {
      satellite: {
        type: "raster",
        tiles: [ESRI_IMAGERY_TILES],
        tileSize: 256,
        maxzoom: 18,
        attribution: ESRI_ATTRIBUTION,
      },
      reference: {
        type: "raster",
        tiles: [ESRI_REFERENCE_TILES],
        tileSize: 256,
        maxzoom: 18,
      },
    },
    layers: [
      { id: "satellite-base", type: "raster", source: "satellite" },
      { id: "reference-overlay", type: "raster", source: "reference" },
    ],
  };
}

async function fetchElevation(lat: number, lon: number): Promise<number | null> {
  /** query open-elevation for point altitude. returns null on failure. */
  try {
    const url = `https://api.open-elevation.com/api/v1/lookup?locations=${lat},${lon}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const elev = data?.results?.[0]?.elevation;
    return typeof elev === "number" ? elev : null;
  } catch {
    return null;
  }
}

export default function MapCoordinatePicker({
  onConfirm,
  onClose,
  initialLat,
  initialLon,
}: MapCoordinatePickerProps) {
  /** map modal with satellite tiles + enlarge for clicking to pick coordinates. */
  const { t } = useTranslation();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const [lat, setLat] = useState(initialLat ?? 48.17);
  const [lon, setLon] = useState(initialLon ?? 17.21);
  const [alt, setAlt] = useState(0);
  const [altLoading, setAltLoading] = useState(false);
  const [enlarged, setEnlarged] = useState(false);
  // tracks whether the user has manually edited altitude since the last map click;
  // if so, auto-fetch must not overwrite their value.
  const altUserTouchedRef = useRef(false);
  // monotonic token to discard stale elevation responses when user clicks again.
  const elevReqRef = useRef(0);

  useEffect(() => {
    if (!mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapRef.current,
      style: makeSatelliteStyle(),
      center: [lon, lat],
      zoom: 4,
      attributionControl: { compact: true },
    });

    map.on("click", async (e) => {
      const { lat: clat, lng: clon } = e.lngLat;
      setLat(clat);
      setLon(clon);
      if (markerRef.current) {
        markerRef.current.setLngLat(e.lngLat);
      } else {
        markerRef.current = new maplibregl.Marker()
          .setLngLat(e.lngLat)
          .addTo(map);
      }
      // new click resets manual-edit flag and invalidates any in-flight request
      altUserTouchedRef.current = false;
      const token = ++elevReqRef.current;
      setAltLoading(true);
      const elev = await fetchElevation(clat, clon);
      // discard if a newer click superseded us or the user typed in the meantime
      if (token !== elevReqRef.current) return;
      setAltLoading(false);
      if (elev !== null && !altUserTouchedRef.current) setAlt(elev);
    });

    mapInstanceRef.current = map;
    return () => map.remove();
  }, []);

  useEffect(() => {
    if (markerRef.current) {
      markerRef.current.setLngLat([lon, lat]);
    }
  }, [lat, lon]);

  // resize map when enlarged state toggles
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const frame = requestAnimationFrame(() => map.resize());
    return () => cancelAnimationFrame(frame);
  }, [enlarged]);

  // escape collapses from enlarged, or closes modal
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (enlarged) {
        setEnlarged(false);
      } else {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enlarged, onClose]);

  const mapHeightClass = enlarged ? "h-[70vh]" : "h-64";
  const shellClass = enlarged
    ? "fixed inset-4 max-w-none flex flex-col rounded-2xl border border-tv-border bg-tv-surface p-4"
    : "w-full max-w-lg rounded-2xl border border-tv-border bg-tv-surface p-4";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      data-testid="coordinate-picker-modal"
    >
      <div className={shellClass}>
        <h3 className="text-sm font-semibold text-tv-text-primary mb-2">
          {t("coordinator.coordinatePicker.title")}
        </h3>
        <p className="text-xs text-tv-text-secondary mb-3">
          {t("coordinator.coordinatePicker.instructions")}
        </p>

        <div className={`relative w-full ${mapHeightClass} rounded-xl overflow-hidden border border-tv-border mb-3 ${enlarged ? "flex-1" : ""}`}>
          <div ref={mapRef} className="w-full h-full" />
          <button
            type="button"
            onClick={() => setEnlarged((v) => !v)}
            className="absolute top-2 right-2 z-10 flex items-center justify-center h-8 w-8 rounded-full border border-tv-border bg-tv-surface text-tv-text-primary hover:bg-tv-surface-hover transition-colors"
            aria-label={
              enlarged
                ? t("coordinator.coordinatePicker.collapse")
                : t("coordinator.coordinatePicker.enlarge")
            }
            title={
              enlarged
                ? t("coordinator.coordinatePicker.collapse")
                : t("coordinator.coordinatePicker.enlarge")
            }
            data-testid="coordinate-picker-enlarge"
          >
            {enlarged ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3">
          <Input
            id="picker-lat"
            label={t("coordinator.createAirport.latitude")}
            type="number"
            step="any"
            value={lat.toFixed(6)}
            onChange={(e) => setLat(parseFloat(e.target.value) || 0)}
          />
          <Input
            id="picker-lon"
            label={t("coordinator.createAirport.longitude")}
            type="number"
            step="any"
            value={lon.toFixed(6)}
            onChange={(e) => setLon(parseFloat(e.target.value) || 0)}
          />
          <div className="relative">
            <Input
              id="picker-alt"
              label={t("coordinator.createAirport.altitude")}
              type="number"
              step="any"
              value={altLoading ? "" : alt.toString()}
              onChange={(e) => {
                altUserTouchedRef.current = true;
                // cancel any in-flight elevation fetch and hide spinner immediately
                elevReqRef.current++;
                setAltLoading(false);
                setAlt(parseFloat(e.target.value) || 0);
              }}
            />
            {altLoading && (
              <Loader2
                className="absolute right-3 bottom-3 h-4 w-4 animate-spin text-tv-text-secondary pointer-events-none"
                aria-label={t("coordinator.coordinatePicker.altitudeLoading")}
              />
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => onConfirm({ lat, lon, alt })}>
            {t("coordinator.coordinatePicker.confirm")}
          </Button>
        </div>
      </div>
    </div>
  );
}
