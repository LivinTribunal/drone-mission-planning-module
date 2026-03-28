/** custom cursor data URIs for map tools - arrow cursor with tool badge. */

function svgCursor(svg: string, hotX = 0, hotY = 0): string {
  const encoded = encodeURIComponent(svg);
  return `url("data:image/svg+xml,${encoded}") ${hotX} ${hotY}, default`;
}

// arrow cursor with a small move icon badge in the bottom-right
const moveCompositeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
  <path d="M2 1 L2 18 L6.5 14 L10 22 L13 20.5 L9.5 12.5 L15 12.5 Z" fill="white" stroke="black" stroke-width="1.2" stroke-linejoin="round"/>
  <g transform="translate(13,13)">
    <rect x="0" y="0" width="14" height="14" rx="3" fill="rgba(0,0,0,0.75)"/>
    <g transform="translate(7,7)" fill="none" stroke="white" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <path d="M0-5v10M-5 0h10M-3.5-2.5l-1.5 2.5 1.5 2.5M3.5-2.5l1.5 2.5-1.5 2.5M-2.5-3.5l2.5-1.5 2.5 1.5M-2.5 3.5l2.5 1.5 2.5-1.5"/>
    </g>
  </g>
</svg>`;

// arrow cursor with a small ruler icon badge in the bottom-right
const measureCompositeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
  <path d="M2 1 L2 18 L6.5 14 L10 22 L13 20.5 L9.5 12.5 L15 12.5 Z" fill="white" stroke="black" stroke-width="1.2" stroke-linejoin="round"/>
  <g transform="translate(13,13)">
    <rect x="0" y="0" width="14" height="14" rx="3" fill="rgba(0,0,0,0.75)"/>
    <g transform="translate(3,3)" fill="none" stroke="orange" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
      <rect x="0" y="2" width="8" height="4" rx="0.5"/>
      <path d="M2 2v2M4 2v1.5M6 2v2"/>
    </g>
  </g>
</svg>`;

export const TOOL_CURSOR_MOVE = svgCursor(moveCompositeSvg, 2, 1);
export const TOOL_CURSOR_MEASURE = svgCursor(measureCompositeSvg, 2, 1);
