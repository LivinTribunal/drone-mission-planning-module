import type { Map as MaplibreMap } from "maplibre-gl";

/** creates a triangle icon for obstacle markers. */
function createTriangleIcon(size: number, color: string): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  const cx = size / 2;
  const pad = size * 0.15;

  ctx.beginPath();
  ctx.moveTo(cx, pad);
  ctx.lineTo(size - pad, size - pad);
  ctx.lineTo(pad, size - pad);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = size * 0.06;
  ctx.stroke();

  return ctx.getImageData(0, 0, size, size);
}

/** creates a rounded square icon with a centered letter. */
function createRoundedSquareIcon(
  size: number,
  bgColor: string,
  letter: string,
): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  const pad = size * 0.1;
  const r = size * 0.2;
  const w = size - pad * 2;

  ctx.beginPath();
  ctx.roundRect(pad, pad, w, w, r);
  ctx.fillStyle = bgColor;
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = size * 0.08;
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${size * 0.45}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(letter, size / 2, size / 2 + 1);

  return ctx.getImageData(0, 0, size, size);
}

/** creates a circle with two vertical pause bars. */
function createHoverIcon(size: number, color: string): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  const cx = size / 2;
  const r = size * 0.4;

  ctx.beginPath();
  ctx.arc(cx, cx, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = size * 0.06;
  ctx.stroke();

  // pause bars
  const barW = size * 0.08;
  const barH = size * 0.3;
  const gap = size * 0.06;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(cx - gap - barW, cx - barH / 2, barW, barH);
  ctx.fillRect(cx + gap, cx - barH / 2, barW, barH);

  return ctx.getImageData(0, 0, size, size);
}

/** creates a circle with a play triangle for recording start. */
function createRecordingStartIcon(size: number, color: string): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  const cx = size / 2;
  const r = size * 0.4;

  ctx.beginPath();
  ctx.arc(cx, cx, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = size * 0.06;
  ctx.stroke();

  // play triangle
  const triH = size * 0.3;
  const triW = size * 0.25;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(cx - triW * 0.4, cx - triH / 2);
  ctx.lineTo(cx - triW * 0.4, cx + triH / 2);
  ctx.lineTo(cx + triW * 0.6, cx);
  ctx.closePath();
  ctx.fill();

  return ctx.getImageData(0, 0, size, size);
}

/** creates a circle with a stop square for recording stop. */
function createRecordingStopIcon(size: number, color: string): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  const cx = size / 2;
  const r = size * 0.4;

  ctx.beginPath();
  ctx.arc(cx, cx, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = size * 0.06;
  ctx.stroke();

  // stop square
  const sqSize = size * 0.28;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(cx - sqSize / 2, cx - sqSize / 2, sqSize, sqSize);

  return ctx.getImageData(0, 0, size, size);
}

/** creates a tower icon - bold tapered structure with platform and antenna. */
function createTowerIcon(size: number, color: string): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  const cx = size / 2;
  const bot = size * 0.85;
  const top = size * 0.18;
  const legW = size * 0.28;

  // white outline for contrast
  ctx.strokeStyle = "#ffffff";
  ctx.lineCap = "round";

  // draw everything twice: first white outline, then colored fill
  for (let pass = 0; pass < 2; pass++) {
    const isOutline = pass === 0;
    ctx.strokeStyle = isOutline ? "#ffffff" : color;
    const extra = isOutline ? size * 0.04 : 0;

    // tapered legs
    ctx.lineWidth = size * 0.09 + extra;
    ctx.beginPath();
    ctx.moveTo(cx - legW, bot);
    ctx.lineTo(cx - size * 0.05, top + size * 0.15);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + legW, bot);
    ctx.lineTo(cx + size * 0.05, top + size * 0.15);
    ctx.stroke();

    // cross braces
    ctx.lineWidth = size * 0.06 + extra;
    const brace1Y = bot - (bot - top) * 0.35;
    const brace2Y = bot - (bot - top) * 0.6;
    const brace1W = legW * 0.6;
    const brace2W = legW * 0.35;
    ctx.beginPath();
    ctx.moveTo(cx - brace1W, brace1Y);
    ctx.lineTo(cx + brace1W, brace1Y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - brace2W, brace2Y);
    ctx.lineTo(cx + brace2W, brace2Y);
    ctx.stroke();

    // platform
    ctx.lineWidth = size * 0.08 + extra;
    const platW = size * 0.18;
    ctx.beginPath();
    ctx.moveTo(cx - platW, top + size * 0.14);
    ctx.lineTo(cx + platW, top + size * 0.14);
    ctx.stroke();

    // antenna spike
    ctx.lineWidth = size * 0.06 + extra;
    ctx.beginPath();
    ctx.moveTo(cx, top + size * 0.14);
    ctx.lineTo(cx, top);
    ctx.stroke();

    // tip dot
    ctx.fillStyle = isOutline ? "#ffffff" : color;
    ctx.beginPath();
    ctx.arc(cx, top, size * 0.05 + extra / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  return ctx.getImageData(0, 0, size, size);
}

/** creates an antenna icon - bold vertical mast with radiating wave arcs. */
function createAntennaIcon(size: number, color: string): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  const cx = size / 2;
  const bot = size * 0.85;
  const top = size * 0.15;
  const arcY = top + size * 0.15;

  ctx.lineCap = "round";

  // draw twice: white outline then colored fill
  for (let pass = 0; pass < 2; pass++) {
    const isOutline = pass === 0;
    ctx.strokeStyle = isOutline ? "#ffffff" : color;
    const extra = isOutline ? size * 0.04 : 0;

    // vertical mast
    ctx.lineWidth = size * 0.09 + extra;
    ctx.beginPath();
    ctx.moveTo(cx, bot);
    ctx.lineTo(cx, top);
    ctx.stroke();

    // base plate
    ctx.lineWidth = size * 0.07 + extra;
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.2, bot);
    ctx.lineTo(cx + size * 0.2, bot);
    ctx.stroke();

    // radiating wave arcs
    ctx.lineWidth = size * 0.05 + extra;
    for (let i = 1; i <= 3; i++) {
      const r = size * 0.09 * i;
      ctx.beginPath();
      ctx.arc(cx, arcY, r, -Math.PI * 0.75, -Math.PI * 0.25);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, arcY, r, Math.PI * 0.25, Math.PI * 0.75);
      ctx.stroke();
    }

    // tip
    ctx.fillStyle = isOutline ? "#ffffff" : color;
    ctx.beginPath();
    ctx.arc(cx, top, size * 0.06 + extra / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  return ctx.getImageData(0, 0, size, size);
}

/** creates a tree icon for vegetation obstacles with white outline. */
function createTreeIcon(size: number, color: string): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  const cx = size / 2;
  const bot = size * 0.85;
  const outline = size * 0.04;

  // white outline for trunk
  ctx.fillStyle = "#ffffff";
  const trunkW = size * 0.1;
  const trunkTop = size * 0.52;
  ctx.fillRect(cx - (trunkW + outline) / 2, trunkTop - outline, trunkW + outline, bot - trunkTop + outline * 2);

  // trunk
  ctx.fillStyle = "#8B6914";
  ctx.fillRect(cx - trunkW / 2, trunkTop, trunkW, bot - trunkTop);

  // white outline for crown
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = outline * 2;
  ctx.lineJoin = "round";

  ctx.beginPath();
  ctx.moveTo(cx, size * 0.1);
  ctx.lineTo(cx + size * 0.3, size * 0.48);
  ctx.lineTo(cx - size * 0.3, size * 0.48);
  ctx.closePath();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx, size * 0.25);
  ctx.lineTo(cx + size * 0.34, size * 0.6);
  ctx.lineTo(cx - size * 0.34, size * 0.6);
  ctx.closePath();
  ctx.stroke();

  // crown fill
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, size * 0.1);
  ctx.lineTo(cx + size * 0.3, size * 0.48);
  ctx.lineTo(cx - size * 0.3, size * 0.48);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(cx, size * 0.25);
  ctx.lineTo(cx + size * 0.34, size * 0.6);
  ctx.lineTo(cx - size * 0.34, size * 0.6);
  ctx.closePath();
  ctx.fill();

  return ctx.getImageData(0, 0, size, size);
}

/** creates a diagonal hatch pattern for safety zone fills. */
export function createHatchPattern(color: string, size = 16): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.4;

  ctx.beginPath();
  ctx.moveTo(0, size);
  ctx.lineTo(size, 0);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(-size * 0.5, size * 0.5);
  ctx.lineTo(size * 0.5, -size * 0.5);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(size * 0.5, size * 1.5);
  ctx.lineTo(size * 1.5, size * 0.5);
  ctx.stroke();

  return ctx.getImageData(0, 0, size, size);
}

/** creates a rounded square marker for agl systems. */
function createAglSquareIcon(size: number, color: string): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  const pad = size * 0.12;
  const r = size * 0.15;
  const w = size - pad * 2;

  ctx.beginPath();
  ctx.roundRect(pad, pad, w, w, r);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = size * 0.07;
  ctx.stroke();

  return ctx.getImageData(0, 0, size, size);
}

/** creates a chevron arrow icon for path direction indicators. */
function createPathArrowIcon(size: number): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  const cx = size / 2;
  const cy = size / 2;
  const w = size * 0.35;
  const h = size * 0.25;

  ctx.beginPath();
  ctx.moveTo(cx - w, cy - h);
  ctx.lineTo(cx + w, cy);
  ctx.lineTo(cx - w, cy + h);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = size * 0.15;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();

  return ctx.getImageData(0, 0, size, size);
}

/** creates a t-bar icon for runway threshold markers. */
function createThresholdIcon(size: number, color: string): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  const cx = size / 2;
  const pad = size * 0.15;

  // white outline pass then colored fill
  for (let pass = 0; pass < 2; pass++) {
    const isOutline = pass === 0;
    ctx.strokeStyle = isOutline ? "#ffffff" : color;
    ctx.lineCap = "round";
    const extra = isOutline ? size * 0.04 : 0;

    // horizontal bar
    ctx.lineWidth = size * 0.1 + extra;
    ctx.beginPath();
    ctx.moveTo(pad, pad + size * 0.05);
    ctx.lineTo(size - pad, pad + size * 0.05);
    ctx.stroke();

    // vertical stem
    ctx.lineWidth = size * 0.09 + extra;
    ctx.beginPath();
    ctx.moveTo(cx, pad + size * 0.05);
    ctx.lineTo(cx, size - pad);
    ctx.stroke();
  }

  return ctx.getImageData(0, 0, size, size);
}

/** creates a diamond icon for runway end position markers. */
function createEndPositionIcon(size: number, color: string): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  const cx = size / 2;
  const pad = size * 0.15;

  ctx.beginPath();
  ctx.moveTo(cx, pad);
  ctx.lineTo(size - pad, cx);
  ctx.lineTo(cx, size - pad);
  ctx.lineTo(pad, cx);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = size * 0.07;
  ctx.stroke();

  return ctx.getImageData(0, 0, size, size);
}

/** safely adds an image, skipping if it already exists. */
function safeAddImage(
  map: MaplibreMap,
  name: string,
  data: ImageData,
  opts?: { pixelRatio?: number },
): void {
  if (map.hasImage(name)) return;
  map.addImage(name, data, opts);
}

/** registers all custom map icons on the map instance. */
export function registerAllMapImages(map: MaplibreMap): void {
  const iconSize = 32;

  // per-type obstacle icons
  const obstacleIcons: Record<string, { color: string; create: (s: number, c: string) => ImageData }> = {
    building: { color: "#e54545", create: createTriangleIcon },
    tower: { color: "#9b59b6", create: createTowerIcon },
    antenna: { color: "#e5a545", create: createAntennaIcon },
    vegetation: { color: "#3bbb3b", create: createTreeIcon },
    other: { color: "#6b6b6b", create: createTriangleIcon },
  };
  for (const [type, { color, create }] of Object.entries(obstacleIcons)) {
    safeAddImage(map, `obstacle-${type}`, create(iconSize, color), { pixelRatio: 2 });
  }

  safeAddImage(map, "takeoff-square", createRoundedSquareIcon(iconSize, "#4595e5", "T"), { pixelRatio: 2 });
  safeAddImage(map, "landing-square", createRoundedSquareIcon(iconSize, "#e54545", "L"), { pixelRatio: 2 });
  safeAddImage(map, "hover-icon", createHoverIcon(iconSize, "#e5a545"), { pixelRatio: 2 });
  safeAddImage(map, "recording-start-icon", createRecordingStartIcon(iconSize, "#3bbb3b"), { pixelRatio: 2 });
  safeAddImage(map, "recording-stop-icon", createRecordingStopIcon(iconSize, "#e54545"), { pixelRatio: 2 });
  safeAddImage(map, "agl-square", createAglSquareIcon(iconSize, "#e91e90"), { pixelRatio: 2 });
  safeAddImage(map, "path-arrow", createPathArrowIcon(iconSize), { pixelRatio: 2 });
  safeAddImage(map, "threshold-marker", createThresholdIcon(iconSize, "#4595e5"), { pixelRatio: 2 });
  safeAddImage(map, "end-position-marker", createEndPositionIcon(iconSize, "#e54545"), { pixelRatio: 2 });
}
