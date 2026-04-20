export interface WebGLCheckResult {
  supported: boolean;
  version: "webgl2" | "webgl" | null;
}

export function checkWebGLSupport(): WebGLCheckResult {
  try {
    const canvas = document.createElement("canvas");
    const gl2 = canvas.getContext("webgl2");
    if (gl2) {
      return { supported: true, version: "webgl2" };
    }
    const gl1 =
      canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (gl1) {
      return { supported: true, version: "webgl" };
    }
    return { supported: false, version: null };
  } catch {
    return { supported: false, version: null };
  }
}
