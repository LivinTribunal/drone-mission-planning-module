import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import Modal from "@/components/common/Modal";
import Button from "@/components/common/Button";

interface GeoJsonEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (geometry: GeoJSON.Geometry) => void;
}

export default function GeoJsonEditorModal({
  isOpen,
  onClose,
  onApply,
}: GeoJsonEditorModalProps) {
  /** modal textarea for pasting raw geojson geometry. */
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOpen) {
      setText("");
      setError("");
    }
  }, [isOpen]);

  function handleApply() {
    /** parse and validate geojson, then apply. */
    setError("");
    try {
      const parsed = JSON.parse(text);
      const validTypes = [
        "Point", "MultiPoint", "LineString", "MultiLineString",
        "Polygon", "MultiPolygon", "GeometryCollection",
      ];
      if (!parsed.type || !validTypes.includes(parsed.type)) {
        setError(t("coordinator.geoJsonEditor.invalidGeoJson"));
        return;
      }
      if (parsed.type === "GeometryCollection" && !Array.isArray(parsed.geometries)) {
        setError(t("coordinator.geoJsonEditor.invalidGeoJson"));
        return;
      }
      if (parsed.type !== "GeometryCollection" && !Array.isArray(parsed.coordinates)) {
        setError(t("coordinator.geoJsonEditor.invalidGeoJson"));
        return;
      }
      onApply(parsed as GeoJSON.Geometry);
      setText("");
      onClose();
    } catch {
      setError(t("coordinator.geoJsonEditor.invalidJson"));
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t("coordinator.geoJsonEditor.title")}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t("coordinator.geoJsonEditor.placeholder")}
        className="w-full h-48 px-3 py-2 rounded-xl text-sm font-mono border border-tv-border
          bg-tv-bg text-tv-text-primary placeholder:text-tv-text-muted
          focus:outline-none focus:border-tv-accent transition-colors resize-none"
        data-testid="geojson-textarea"
      />
      {error && <p className="text-xs text-tv-error mt-1">{error}</p>}
      <div className="flex justify-end gap-2 mt-3">
        <Button variant="secondary" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button onClick={handleApply} disabled={!text.trim()}>
          {t("coordinator.geoJsonEditor.apply")}
        </Button>
      </div>
    </Modal>
  );
}
