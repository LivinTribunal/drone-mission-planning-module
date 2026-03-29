import { useState } from "react";
import { useTranslation } from "react-i18next";
import Modal from "@/components/common/Modal";
import Input from "@/components/common/Input";
import Button from "@/components/common/Button";
import MapCoordinatePicker from "./MapCoordinatePicker";
import { createAirport } from "@/api/airports";
import type { AxiosError } from "axios";

interface CreateAirportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}

const ICAO_REGEX = /^[A-Z]{4}$/;

export default function CreateAirportDialog({
  isOpen,
  onClose,
  onCreated,
}: CreateAirportDialogProps) {
  /** modal form to create a new airport with validation. */
  const { t } = useTranslation();
  const [icaoCode, setIcaoCode] = useState("");
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [alt, setAlt] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(false);

  function validate(): boolean {
    /** validate form fields, return true if valid. */
    const errs: Record<string, string> = {};
    if (!ICAO_REGEX.test(icaoCode)) {
      errs.icaoCode = t("coordinator.createAirport.icaoRequired");
    }
    if (!name.trim()) {
      errs.name = t("coordinator.createAirport.nameRequired");
    }
    const parsedLat = parseFloat(lat);
    const parsedLon = parseFloat(lon);
    if (!lat.trim() || isNaN(parsedLat) || parsedLat < -90 || parsedLat > 90) {
      errs.lat = t("coordinator.createAirport.latRequired");
    }
    if (!lon.trim() || isNaN(parsedLon) || parsedLon < -180 || parsedLon > 180) {
      errs.lon = t("coordinator.createAirport.lonRequired");
    }
    if (!alt.trim() || isNaN(parseFloat(alt))) {
      errs.alt = t("coordinator.createAirport.altRequired");
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    /** submit the create airport form. */
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      const result = await createAirport({
        icao_code: icaoCode,
        name: name.trim(),
        city: city.trim() || undefined,
        country: country.trim() || undefined,
        elevation: parseFloat(alt) || 0,
        location: {
          type: "Point",
          coordinates: [parseFloat(lon) || 0, parseFloat(lat) || 0, parseFloat(alt) || 0],
        },
      });
      onCreated(result.id);
    } catch (err) {
      const axiosErr = err as AxiosError<{ detail?: string }>;
      if (axiosErr.response?.status === 409) {
        setErrors({ icaoCode: t("coordinator.createAirport.icaoConflict") });
      } else {
        setErrors({ form: t("coordinator.createAirport.createError") });
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleMapPick(coords: { lat: number; lon: number; alt: number }) {
    /** set coordinates from map picker. */
    setLat(coords.lat.toFixed(6));
    setLon(coords.lon.toFixed(6));
    setAlt(coords.alt.toFixed(1));
    setShowMapPicker(false);
  }

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={t("coordinator.createAirport.title")}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3" data-testid="create-airport-form">
          <Input
            id="icao-code"
            label={t("coordinator.createAirport.icaoCode")}
            value={icaoCode}
            onChange={(e) => setIcaoCode(e.target.value.toUpperCase().slice(0, 4))}
            placeholder={t("coordinator.createAirport.icaoCodePlaceholder")}
            maxLength={4}
          />
          {errors.icaoCode && (
            <p className="text-xs text-tv-error -mt-2" data-testid="icao-error">{errors.icaoCode}</p>
          )}

          <Input
            id="airport-name"
            label={t("coordinator.createAirport.name")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("coordinator.createAirport.namePlaceholder")}
          />
          {errors.name && (
            <p className="text-xs text-tv-error -mt-2">{errors.name}</p>
          )}

          <Input
            id="airport-city"
            label={t("coordinator.createAirport.city")}
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder={t("coordinator.createAirport.cityPlaceholder")}
          />

          <Input
            id="airport-country"
            label={t("coordinator.createAirport.country")}
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            placeholder={t("coordinator.createAirport.countryPlaceholder")}
          />

          {/* location */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-tv-text-secondary">
                {t("coordinator.createAirport.location")}
              </span>
              <button
                type="button"
                onClick={() => setShowMapPicker(true)}
                className="text-xs text-tv-accent hover:underline"
                data-testid="pick-on-map-button"
              >
                {t("coordinator.createAirport.pickOnMap")}
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Input
                  id="airport-lat"
                  label={t("coordinator.createAirport.latitude")}
                  type="number"
                  step="any"
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                />
                {errors.lat && (
                  <p className="text-xs text-tv-error mt-0.5">{errors.lat}</p>
                )}
              </div>
              <div>
                <Input
                  id="airport-lon"
                  label={t("coordinator.createAirport.longitude")}
                  type="number"
                  step="any"
                  value={lon}
                  onChange={(e) => setLon(e.target.value)}
                />
                {errors.lon && (
                  <p className="text-xs text-tv-error mt-0.5">{errors.lon}</p>
                )}
              </div>
              <div>
                <Input
                  id="airport-alt"
                  label={t("coordinator.createAirport.altitude")}
                  type="number"
                  step="any"
                  value={alt}
                  onChange={(e) => setAlt(e.target.value)}
                />
                {errors.alt && (
                  <p className="text-xs text-tv-error mt-0.5">{errors.alt}</p>
                )}
              </div>
            </div>
          </div>

          {errors.form && (
            <p className="text-xs text-tv-error">{errors.form}</p>
          )}

          <div className="flex justify-end gap-2 mt-2">
            <Button variant="secondary" type="button" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "..." : t("coordinator.createAirport.add")}
            </Button>
          </div>
        </form>
      </Modal>

      {showMapPicker && (
        <MapCoordinatePicker
          onConfirm={handleMapPick}
          onClose={() => setShowMapPicker(false)}
        />
      )}
    </>
  );
}
