import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import Modal from "@/components/common/Modal";
import Input from "@/components/common/Input";
import Button from "@/components/common/Button";
import MapCoordinatePicker from "./MapCoordinatePicker";
import {
  createAirport,
  createObstacle,
  createSafetyZone,
  createSurface,
  lookupAirport,
} from "@/api/airports";
import { isAxiosError } from "@/api/client";
import type {
  AirportLookupResponse,
  ObstacleSuggestion,
  RunwaySuggestion,
  SafetyZoneSuggestion,
} from "@/types/airport";

interface CreateAirportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}

const ICAO_REGEX = /^[A-Z]{4}$/;

interface SuggestionState {
  runways: Array<RunwaySuggestion & { checked: boolean }>;
  obstacles: Array<ObstacleSuggestion & { checked: boolean }>;
  safetyZones: Array<SafetyZoneSuggestion & { checked: boolean }>;
}

export default function CreateAirportDialog({
  isOpen,
  onClose,
  onCreated,
}: CreateAirportDialogProps) {
  /** modal form to create a new airport with validation and openaip lookup. */
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
  const [looking, setLooking] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupEmpty, setLookupEmpty] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestionState | null>(null);
  const [createdAirportId, setCreatedAirportId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<{ runways: boolean; safetyZones: boolean; obstacles: boolean }>({
    runways: true,
    safetyZones: true,
    obstacles: true,
  });

  function toggleSection(key: "runways" | "safetyZones" | "obstacles") {
    /** toggle expanded state for a suggestion section. */
    setExpanded((s) => ({ ...s, [key]: !s[key] }));
  }

  useEffect(() => {
    if (isOpen) {
      setIcaoCode("");
      setName("");
      setCity("");
      setCountry("");
      setLat("");
      setLon("");
      setAlt("");
      setErrors({});
      setLookupError(null);
      setLookupEmpty(false);
      setSuggestions(null);
      setCreatedAirportId(null);
    }
  }, [isOpen]);

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

  function applyLookup(data: AirportLookupResponse) {
    /** fill the form from a successful lookup response. */
    setName(data.name || "");
    setCity(data.city || "");
    setCountry(data.country || "");
    const [lonVal, latVal, altVal] = data.location.coordinates;
    setLat(latVal.toFixed(6));
    setLon(lonVal.toFixed(6));
    setAlt((altVal ?? data.elevation ?? 0).toFixed(1));
    setSuggestions({
      runways: data.runways.map((r) => ({ ...r, checked: true })),
      obstacles: data.obstacles.map((o) => ({ ...o, checked: true })),
      safetyZones: data.safety_zones.map((z) => ({ ...z, checked: true })),
    });
    setLookupEmpty(
      data.runways.length === 0 &&
        data.obstacles.length === 0 &&
        data.safety_zones.length === 0,
    );
  }

  async function handleLookup() {
    /** call openaip lookup and fill form with the result. */
    if (!ICAO_REGEX.test(icaoCode)) {
      setErrors({ icaoCode: t("coordinator.createAirport.icaoRequired") });
      return;
    }

    setLooking(true);
    setLookupError(null);
    setLookupEmpty(false);
    setSuggestions(null);
    try {
      const result = await lookupAirport(icaoCode);
      applyLookup(result);
    } catch (err) {
      if (isAxiosError(err)) {
        const status = err.response?.status;
        if (status === 404) {
          setLookupError(t("coordinator.createAirport.lookup.notFound"));
        } else if (status === 503) {
          setLookupError(t("coordinator.createAirport.lookup.noApiKey"));
        } else {
          setLookupError(t("coordinator.createAirport.lookup.apiDown"));
        }
      } else {
        setLookupError(t("coordinator.createAirport.lookup.apiDown"));
      }
    } finally {
      setLooking(false);
    }
  }

  function toggleRunway(index: number) {
    /** toggle checked state for a runway suggestion. */
    setSuggestions((s) =>
      s
        ? {
            ...s,
            runways: s.runways.map((r, i) =>
              i === index ? { ...r, checked: !r.checked } : r,
            ),
          }
        : s,
    );
  }

  function toggleObstacle(index: number) {
    /** toggle checked state for an obstacle suggestion. */
    setSuggestions((s) =>
      s
        ? {
            ...s,
            obstacles: s.obstacles.map((o, i) =>
              i === index ? { ...o, checked: !o.checked } : o,
            ),
          }
        : s,
    );
  }

  function setSectionChecked(
    key: "runways" | "obstacles" | "safetyZones",
    checked: boolean,
  ) {
    /** set checked state on every item in a section. */
    setSuggestions((s) =>
      s
        ? {
            ...s,
            [key]: s[key].map((item) => ({ ...item, checked })),
          }
        : s,
    );
  }

  function setAllChecked(checked: boolean) {
    /** set checked state on every suggestion across all sections. */
    setSuggestions((s) =>
      s
        ? {
            runways: s.runways.map((r) => ({ ...r, checked })),
            obstacles: s.obstacles.map((o) => ({ ...o, checked })),
            safetyZones: s.safetyZones.map((z) => ({ ...z, checked })),
          }
        : s,
    );
  }

  function toggleSafetyZone(index: number) {
    /** toggle checked state for a safety zone suggestion. */
    setSuggestions((s) =>
      s
        ? {
            ...s,
            safetyZones: s.safetyZones.map((z, i) =>
              i === index ? { ...z, checked: !z.checked } : z,
            ),
          }
        : s,
    );
  }

  async function createCheckedSuggestions(airportId: string): Promise<number> {
    /** create surfaces / obstacles / safety zones; return count of failures. */
    if (!suggestions) return 0;

    const trackFailure = (err: unknown) => {
      console.warn("failed to create suggested item", err);
      return null;
    };

    const runwayPromises = suggestions.runways
      .filter((r) => r.checked)
      .map((r) =>
        createSurface(airportId, {
          identifier: r.identifier,
          surface_type: "RUNWAY",
          geometry: r.geometry,
          boundary: r.boundary,
          heading: r.heading,
          length: r.length,
          width: r.width,
          threshold_position: r.threshold_position,
          end_position: r.end_position,
        }).catch(trackFailure),
      );
    const obstaclePromises = suggestions.obstacles
      .filter((o) => o.checked)
      .map((o) =>
        createObstacle(airportId, {
          name: o.name,
          type: o.type,
          height: o.height,
          boundary: o.boundary,
        }).catch(trackFailure),
      );
    const zonePromises = suggestions.safetyZones
      .filter((z) => z.checked)
      .map((z) =>
        createSafetyZone(airportId, {
          name: z.name,
          type: z.type,
          geometry: z.geometry,
          altitude_floor: z.altitude_floor,
          altitude_ceiling: z.altitude_ceiling,
          is_active: true,
        }).catch(trackFailure),
      );

    const results = await Promise.all([
      ...runwayPromises,
      ...obstaclePromises,
      ...zonePromises,
    ]);
    return results.filter((r) => r === null).length;
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

      const failedCount = await createCheckedSuggestions(result.id);
      if (failedCount > 0) {
        // keep the modal open so the user sees which items failed; they can dismiss to proceed.
        setErrors({
          form: t("coordinator.createAirport.lookup.partialFailure", {
            count: failedCount,
          }),
        });
        setCreatedAirportId(result.id);
        return;
      }

      onCreated(result.id);
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 409) {
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

  const icaoValid = ICAO_REGEX.test(icaoCode);

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={t("coordinator.createAirport.title")}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3" data-testid="create-airport-form">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input
                id="icao-code"
                label={t("coordinator.createAirport.icaoCode")}
                value={icaoCode}
                onChange={(e) => setIcaoCode(e.target.value.toUpperCase().slice(0, 4))}
                placeholder={t("coordinator.createAirport.icaoCodePlaceholder")}
                maxLength={4}
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={handleLookup}
              disabled={!icaoValid || looking}
              data-testid="lookup-airport-button"
            >
              {looking
                ? t("coordinator.createAirport.lookup.looking")
                : t("coordinator.createAirport.lookup.button")}
            </Button>
          </div>
          {errors.icaoCode && (
            <p className="text-xs text-tv-error -mt-2" data-testid="icao-error">{errors.icaoCode}</p>
          )}
          {lookupError && (
            <p className="text-xs text-tv-error" data-testid="lookup-error">{lookupError}</p>
          )}
          {lookupEmpty && !lookupError && (
            <p className="text-xs text-tv-text-secondary" data-testid="lookup-empty">
              {t("coordinator.createAirport.lookup.noSuggestions")}
            </p>
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

          {/* suggestion preview */}
          {suggestions &&
            (suggestions.runways.length > 0 ||
              suggestions.obstacles.length > 0 ||
              suggestions.safetyZones.length > 0) && (
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-tv-text-secondary">
                    {t("coordinator.createAirport.lookup.previewTitle")}
                  </p>
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setAllChecked(true)}
                      className="text-tv-accent hover:underline"
                    >
                      {t("coordinator.createAirport.lookup.selectAll")}
                    </button>
                    <span className="text-tv-text-secondary">|</span>
                    <button
                      type="button"
                      onClick={() => setAllChecked(false)}
                      className="text-tv-accent hover:underline"
                    >
                      {t("coordinator.createAirport.lookup.deselectAll")}
                    </button>
                  </div>
                </div>
                <div
                  className="border border-tv-border rounded p-2 flex flex-col gap-2 max-h-64 overflow-y-auto"
                  data-testid="lookup-suggestions"
                >
                {suggestions.runways.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => toggleSection("runways")}
                        className="text-xs font-semibold text-tv-text-secondary flex items-center gap-1 text-left"
                      >
                        <span>{expanded.runways ? "▾" : "▸"}</span>
                        <span>
                          {t("coordinator.createAirport.lookup.runways")} ({suggestions.runways.length})
                        </span>
                      </button>
                      <div className="flex items-center gap-1 text-xs">
                        <button
                          type="button"
                          onClick={() => setSectionChecked("runways", true)}
                          className="text-tv-accent hover:underline"
                        >
                          {t("coordinator.createAirport.lookup.all")}
                        </button>
                        <span className="text-tv-text-secondary">|</span>
                        <button
                          type="button"
                          onClick={() => setSectionChecked("runways", false)}
                          className="text-tv-accent hover:underline"
                        >
                          {t("coordinator.createAirport.lookup.none")}
                        </button>
                      </div>
                    </div>
                    {expanded.runways && (
                      <ul className="text-xs flex flex-col gap-1 mt-1">
                        {suggestions.runways.map((r, i) => (
                          <li key={`rw-${i}`} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={r.checked}
                              onChange={() => toggleRunway(i)}
                              data-testid={`runway-suggestion-${i}`}
                            />
                            <span>
                              {r.identifier} ({r.length.toFixed(0)}m x {r.width.toFixed(0)}m)
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {suggestions.safetyZones.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => toggleSection("safetyZones")}
                        className="text-xs font-semibold text-tv-text-secondary flex items-center gap-1 text-left"
                      >
                        <span>{expanded.safetyZones ? "▾" : "▸"}</span>
                        <span>
                          {t("coordinator.createAirport.lookup.safetyZones")} ({suggestions.safetyZones.length})
                        </span>
                      </button>
                      <div className="flex items-center gap-1 text-xs">
                        <button
                          type="button"
                          onClick={() => setSectionChecked("safetyZones", true)}
                          className="text-tv-accent hover:underline"
                        >
                          {t("coordinator.createAirport.lookup.all")}
                        </button>
                        <span className="text-tv-text-secondary">|</span>
                        <button
                          type="button"
                          onClick={() => setSectionChecked("safetyZones", false)}
                          className="text-tv-accent hover:underline"
                        >
                          {t("coordinator.createAirport.lookup.none")}
                        </button>
                      </div>
                    </div>
                    {expanded.safetyZones && (
                      <ul className="text-xs flex flex-col gap-1 mt-1">
                        {suggestions.safetyZones.map((z, i) => (
                          <li key={`sz-${i}`} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={z.checked}
                              onChange={() => toggleSafetyZone(i)}
                              data-testid={`safety-zone-suggestion-${i}`}
                            />
                            <span>
                              {z.type} {z.name}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {suggestions.obstacles.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => toggleSection("obstacles")}
                        className="text-xs font-semibold text-tv-text-secondary flex items-center gap-1 text-left"
                      >
                        <span>{expanded.obstacles ? "▾" : "▸"}</span>
                        <span>
                          {t("coordinator.createAirport.lookup.obstacles")} ({suggestions.obstacles.length})
                        </span>
                      </button>
                      <div className="flex items-center gap-1 text-xs">
                        <button
                          type="button"
                          onClick={() => setSectionChecked("obstacles", true)}
                          className="text-tv-accent hover:underline"
                        >
                          {t("coordinator.createAirport.lookup.all")}
                        </button>
                        <span className="text-tv-text-secondary">|</span>
                        <button
                          type="button"
                          onClick={() => setSectionChecked("obstacles", false)}
                          className="text-tv-accent hover:underline"
                        >
                          {t("coordinator.createAirport.lookup.none")}
                        </button>
                      </div>
                    </div>
                    {expanded.obstacles && (
                      <ul className="text-xs flex flex-col gap-1 mt-1">
                        {suggestions.obstacles.map((o, i) => (
                          <li key={`ob-${i}`} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={o.checked}
                              onChange={() => toggleObstacle(i)}
                              data-testid={`obstacle-suggestion-${i}`}
                            />
                            <span>
                              {o.type} {o.name} ({o.height.toFixed(0)}m)
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                </div>
              </div>
            )}

          {errors.form && (
            <p className="text-xs text-tv-error">{errors.form}</p>
          )}

          <div className="flex justify-end gap-2 mt-2">
            {createdAirportId ? (
              <Button
                type="button"
                onClick={() => onCreated(createdAirportId)}
                data-testid="continue-after-partial-failure"
              >
                {t("common.continue")}
              </Button>
            ) : (
              <>
                <Button variant="secondary" type="button" onClick={onClose}>
                  {t("common.cancel")}
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? t("coordinator.createAirport.adding") : t("coordinator.createAirport.add")}
                </Button>
              </>
            )}
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
