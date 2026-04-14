import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import maplibregl from "maplibre-gl";
import { Maximize2, Minimize2 } from "lucide-react";
import Button from "@/components/common/Button";
import Input from "@/components/common/Input";

interface MapCoordinatePickerProps {
  onConfirm: (coords: { lat: number; lon: number; alt: number }) => void;
  onClose: () => void;
  initialLat?: number;
  initialLon?: number;
}

const ESRI_TILES =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ESRI_ATTRIBUTION =
  "Tiles © Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community";

function makeSatelliteStyle(): maplibregl.StyleSpecification {
  /** inline maplibre style with esri world imagery raster tiles. */
  return {
    version: 8,
    sources: {
      satellite: {
        type: "raster",
        tiles: [ESRI_TILES],
        tileSize: 256,
        maxzoom: 18,
        attribution: ESRI_ATTRIBUTION,
      },
    },
    layers: [{ id: "satellite-base", type: "raster", source: "satellite" }],
  };
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
  const [enlarged, setEnlarged] = useState(false);

  useEffect(() => {
    if (!mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapRef.current,
      style: makeSatelliteStyle(),
      center: [lon, lat],
      zoom: 4,
    });

    map.on("click", (e) => {
      setLat(e.lngLat.lat);
      setLon(e.lngLat.lng);
      if (markerRef.current) {
        markerRef.current.setLngLat(e.lngLat);
      } else {
        markerRef.current = new maplibregl.Marker()
          .setLngLat(e.lngLat)
          .addTo(map);
      }
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
          <Input
            id="picker-alt"
            label={t("coordinator.createAirport.altitude")}
            type="number"
            step="any"
            value={alt.toString()}
            onChange={(e) => setAlt(parseFloat(e.target.value) || 0)}
          />
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
