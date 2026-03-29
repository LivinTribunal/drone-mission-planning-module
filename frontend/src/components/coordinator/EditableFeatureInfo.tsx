import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import Input from "@/components/common/Input";
import type { MapFeature } from "@/types/map";

interface EditableFeatureInfoProps {
  feature: MapFeature;
  onUpdate: (data: Record<string, unknown>) => void;
  onClose: () => void;
}

export default function EditableFeatureInfo({
  feature,
  onUpdate,
  onClose,
}: EditableFeatureInfoProps) {
  /** editable feature info panel for selected map features. */
  const { t } = useTranslation();
  const [formData, setFormData] = useState<Record<string, unknown>>(
    feature.data as unknown as Record<string, unknown>,
  );

  useEffect(() => {
    setFormData(feature.data as unknown as Record<string, unknown>);
  }, [feature]);

  function val(key: string): string {
    /** get form field value as string for input binding. */
    const v = formData[key];
    if (v == null) return "";
    return String(v);
  }

  function handleChange(field: string, value: string | number | boolean) {
    /** propagate field change to parent. */
    setFormData((prev) => ({ ...prev, [field]: value }));
    onUpdate({ [field]: value });
  }

  return (
    <div
      className="rounded-2xl border border-tv-border bg-tv-bg p-3"
      data-testid="editable-feature-info"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="rounded-full px-3 py-1 bg-tv-surface border border-tv-border text-xs font-semibold text-tv-text-primary">
          {t("coordinator.detail.featureInfo")}
        </span>
        <button
          onClick={onClose}
          className="rounded-full p-1 text-tv-text-muted hover:text-tv-text-primary transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {feature.type === "surface" && (
          <>
            <Input
              id="feat-identifier"
              label={t("coordinator.detail.surfaceIdentifier")}
              value={val("identifier")}
              onChange={(e) => handleChange("identifier", e.target.value)}
            />
            <div>
              <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
                {t("coordinator.detail.surfaceType")}
              </label>
              <select
                value={val("surface_type")}
                onChange={(e) => handleChange("surface_type", e.target.value)}
                className="w-full px-4 py-2.5 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors"
              >
                <option value="RUNWAY">{t("coordinator.detail.surfaceTypes.runway")}</option>
                <option value="TAXIWAY">{t("coordinator.detail.surfaceTypes.taxiway")}</option>
                <option value="APRON">{t("coordinator.detail.surfaceTypes.apron")}</option>
                <option value="HELIPAD">{t("coordinator.detail.surfaceTypes.helipad")}</option>
              </select>
            </div>
            <Input
              id="feat-heading"
              label={t("coordinator.detail.surfaceHeading")}
              type="number"
              value={val("heading")}
              onChange={(e) => handleChange("heading", parseFloat(e.target.value) || 0)}
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                id="feat-length"
                label={t("coordinator.detail.surfaceLength")}
                type="number"
                value={val("length")}
                onChange={(e) => handleChange("length", parseFloat(e.target.value) || 0)}
              />
              <Input
                id="feat-width"
                label={t("coordinator.detail.surfaceWidth")}
                type="number"
                value={val("width")}
                onChange={(e) => handleChange("width", parseFloat(e.target.value) || 0)}
              />
            </div>
          </>
        )}

        {feature.type === "obstacle" && (
          <>
            <Input
              id="feat-name"
              label={t("coordinator.detail.obstacleName")}
              value={val("name")}
              onChange={(e) => handleChange("name", e.target.value)}
            />
            <div>
              <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
                {t("coordinator.detail.obstacleType")}
              </label>
              <select
                value={val("type")}
                onChange={(e) => handleChange("type", e.target.value)}
                className="w-full px-4 py-2.5 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors"
              >
                <option value="BUILDING">{t("coordinator.detail.obstacleTypes.building")}</option>
                <option value="ANTENNA">{t("coordinator.detail.obstacleTypes.antenna")}</option>
                <option value="VEGETATION">{t("coordinator.detail.obstacleTypes.vegetation")}</option>
                <option value="TOWER">{t("coordinator.detail.obstacleTypes.tower")}</option>
                <option value="OTHER">{t("coordinator.detail.obstacleTypes.other")}</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input
                id="feat-height"
                label={t("coordinator.detail.obstacleHeight")}
                type="number"
                value={val("height")}
                onChange={(e) => handleChange("height", parseFloat(e.target.value) || 0)}
              />
              <Input
                id="feat-radius"
                label={t("coordinator.detail.obstacleRadius")}
                type="number"
                value={val("radius")}
                onChange={(e) => handleChange("radius", parseFloat(e.target.value) || 0)}
              />
            </div>
          </>
        )}

        {feature.type === "safety_zone" && (
          <>
            <Input
              id="feat-name"
              label={t("coordinator.detail.zoneName")}
              value={val("name")}
              onChange={(e) => handleChange("name", e.target.value)}
            />
            <div>
              <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
                {t("coordinator.detail.zoneType")}
              </label>
              <select
                value={val("type")}
                onChange={(e) => handleChange("type", e.target.value)}
                className="w-full px-4 py-2.5 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors"
              >
                <option value="CTR">{t("coordinator.detail.zoneTypes.ctr")}</option>
                <option value="RESTRICTED">{t("coordinator.detail.zoneTypes.restricted")}</option>
                <option value="PROHIBITED">{t("coordinator.detail.zoneTypes.prohibited")}</option>
                <option value="TEMPORARY_NO_FLY">{t("coordinator.detail.zoneTypes.temporaryNoFly")}</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input
                id="feat-floor"
                label={t("coordinator.detail.zoneFloor")}
                type="number"
                value={val("altitude_floor")}
                onChange={(e) => handleChange("altitude_floor", parseFloat(e.target.value) || 0)}
              />
              <Input
                id="feat-ceiling"
                label={t("coordinator.detail.zoneCeiling")}
                type="number"
                value={val("altitude_ceiling")}
                onChange={(e) => handleChange("altitude_ceiling", parseFloat(e.target.value) || 0)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-tv-text-primary">
              <input
                type="checkbox"
                checked={Boolean(formData.is_active)}
                onChange={(e) => handleChange("is_active", e.target.checked)}
                className="accent-tv-accent"
              />
              {t("coordinator.detail.zoneActive")}
            </label>
          </>
        )}

        {feature.type === "agl" && (
          <>
            <Input
              id="feat-name"
              label={t("coordinator.detail.aglName")}
              value={val("name")}
              onChange={(e) => handleChange("name", e.target.value)}
            />
            <Input
              id="feat-type"
              label={t("coordinator.detail.aglType")}
              value={val("agl_type")}
              onChange={(e) => handleChange("agl_type", e.target.value)}
            />
            <div>
              <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
                {t("coordinator.detail.aglSide")}
              </label>
              <select
                value={val("side")}
                onChange={(e) => handleChange("side", e.target.value)}
                className="w-full px-4 py-2.5 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors"
              >
                <option value="">—</option>
                <option value="LEFT">{t("coordinator.detail.aglSides.left")}</option>
                <option value="RIGHT">{t("coordinator.detail.aglSides.right")}</option>
              </select>
            </div>
            <Input
              id="feat-glide"
              label={t("coordinator.detail.aglGlideAngle")}
              type="number"
              step="0.1"
              value={val("glide_slope_angle")}
              onChange={(e) => handleChange("glide_slope_angle", parseFloat(e.target.value) || 0)}
            />
          </>
        )}

        {feature.type === "lha" && (
          <>
            <Input
              id="feat-unit"
              label={t("coordinator.detail.lhaUnitNumber")}
              type="number"
              value={val("unit_number")}
              onChange={(e) => handleChange("unit_number", parseInt(e.target.value) || 0)}
            />
            <Input
              id="feat-angle"
              label={t("coordinator.detail.lhaSettingAngle")}
              type="number"
              step="0.1"
              value={val("setting_angle")}
              onChange={(e) => handleChange("setting_angle", parseFloat(e.target.value) || 0)}
            />
            <div>
              <label className="block text-xs font-medium mb-1 text-tv-text-secondary">
                {t("coordinator.detail.lhaLampType")}
              </label>
              <select
                value={val("lamp_type")}
                onChange={(e) => handleChange("lamp_type", e.target.value)}
                className="w-full px-4 py-2.5 rounded-full text-sm border border-tv-border bg-tv-bg text-tv-text-primary focus:outline-none focus:border-tv-accent transition-colors"
              >
                <option value="HALOGEN">{t("coordinator.detail.lampTypes.halogen")}</option>
                <option value="LED">{t("coordinator.detail.lampTypes.led")}</option>
              </select>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
