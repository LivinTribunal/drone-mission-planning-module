import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { OPTICAL_ZOOM_MIN, OPTICAL_ZOOM_MAX } from "@/constants/camera";

interface ZoomSliderProps {
  value: number;
  onChange: (value: number) => void;
  maxOpticalZoom?: number | null;
  size?: "sm" | "md";
  testId?: string;
}

export default function ZoomSlider({
  value,
  onChange,
  maxOpticalZoom,
  size = "md",
  testId,
}: ZoomSliderProps) {
  const { t } = useTranslation();
  const range = OPTICAL_ZOOM_MAX - OPTICAL_ZOOM_MIN;
  const trackH = size === "sm" ? "h-1.5" : "h-2";
  const tickH = size === "sm" ? "h-1.5" : "h-2";
  const fontSize = size === "sm" ? "text-[10px]" : "text-[11px]";

  const ticks = useMemo(() => {
    const vals: number[] = [];
    for (let v = OPTICAL_ZOOM_MIN; v <= OPTICAL_ZOOM_MAX; v++) {
      vals.push(v);
    }
    if (maxOpticalZoom && !vals.includes(maxOpticalZoom)) {
      vals.push(maxOpticalZoom);
      vals.sort((a, b) => a - b);
    }
    return vals;
  }, [maxOpticalZoom]);

  const pct = (v: number) => ((v - OPTICAL_ZOOM_MIN) / range) * 100;
  // native range thumb is ~16px wide; thumb center travels from 8px to (width-8px)
  const THUMB = 16;
  const trackPos = (v: number) => {
    const p = pct(v);
    return `calc(${p}% - ${(p * THUMB) / 100}px + ${THUMB / 2}px)`;
  };

  return (
    <div>
      <input
        type="range"
        min={OPTICAL_ZOOM_MIN}
        max={OPTICAL_ZOOM_MAX}
        step="0.5"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className={`w-full ${trackH} rounded-full appearance-none cursor-pointer accent-tv-accent bg-tv-border`}
        data-testid={testId}
      />
      <div className="relative w-full mt-1" style={{ height: "18px" }}>
        {ticks.map((v) => {
          const isOpticalLimit = maxOpticalZoom != null && v === maxOpticalZoom;
          const isEndpoint = v === OPTICAL_ZOOM_MIN || v === OPTICAL_ZOOM_MAX;
          const showLabel = isEndpoint || isOpticalLimit || v % 5 === 0;

          return (
            <div
              key={v}
              className="absolute flex flex-col items-center"
              style={{ left: trackPos(v), transform: "translateX(-50%)" }}
            >
              <div
                className={`${tickH} ${isOpticalLimit ? "w-0.5 bg-tv-accent" : "w-px bg-tv-text-primary"}`}
              />
              {showLabel && (
                <span
                  className={`${fontSize} leading-none mt-0.5 ${isOpticalLimit ? "text-tv-accent font-semibold" : "text-tv-text-primary"}`}
                >
                  {v}x
                </span>
              )}
            </div>
          );
        })}
      </div>
      {maxOpticalZoom && (
        <div className="relative text-[10px] mt-1 font-medium" style={{ height: "14px" }}>
          <span
            className="absolute left-0 text-tv-accent"
            style={{ width: trackPos(maxOpticalZoom) }}
          >
            {t("mission.config.cameraSettings.optical")}
          </span>
          <span
            className="absolute right-0 text-tv-text-primary text-right"
            style={{ left: trackPos(maxOpticalZoom) }}
          >
            {t("mission.config.cameraSettings.digital")}
          </span>
        </div>
      )}
    </div>
  );
}
