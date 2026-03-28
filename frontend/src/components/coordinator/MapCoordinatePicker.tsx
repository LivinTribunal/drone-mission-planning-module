import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import maplibregl from "maplibre-gl";
import Button from "@/components/common/Button";
import Input from "@/components/common/Input";

interface MapCoordinatePickerProps {
  onConfirm: (coords: { lat: number; lon: number; alt: number }) => void;
  onClose: () => void;
  initialLat?: number;
  initialLon?: number;
}

export default function MapCoordinatePicker({
  onConfirm,
  onClose,
  initialLat,
  initialLon,
}: MapCoordinatePickerProps) {
  /** small map modal for clicking to pick coordinates. */
  const { t } = useTranslation();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const [lat, setLat] = useState(initialLat ?? 48.17);
  const [lon, setLon] = useState(initialLon ?? 17.21);
  const [alt, setAlt] = useState(0);

  useEffect(() => {
    if (!mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapRef.current,
      style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
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
      <div className="w-full max-w-lg rounded-2xl border border-tv-border bg-tv-surface p-4">
        <h3 className="text-sm font-semibold text-tv-text-primary mb-2">
          {t("coordinator.coordinatePicker.title")}
        </h3>
        <p className="text-xs text-tv-text-secondary mb-3">
          {t("coordinator.coordinatePicker.instructions")}
        </p>

        <div
          ref={mapRef}
          className="w-full h-64 rounded-xl overflow-hidden border border-tv-border mb-3"
        />

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
