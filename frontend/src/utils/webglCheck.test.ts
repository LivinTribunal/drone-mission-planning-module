import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkWebGLSupport } from "./webglCheck";

describe("checkWebGLSupport", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns webgl2 when webgl2 context is available", () => {
    vi.spyOn(document, "createElement").mockReturnValue({
      getContext: (id: string) => (id === "webgl2" ? {} : null),
    } as unknown as HTMLCanvasElement);

    const result = checkWebGLSupport();
    expect(result).toEqual({ supported: true, version: "webgl2" });
  });

  it("returns webgl when only webgl context is available", () => {
    vi.spyOn(document, "createElement").mockReturnValue({
      getContext: (id: string) => (id === "webgl" ? {} : null),
    } as unknown as HTMLCanvasElement);

    const result = checkWebGLSupport();
    expect(result).toEqual({ supported: true, version: "webgl" });
  });

  it("returns unsupported when no context is available", () => {
    vi.spyOn(document, "createElement").mockReturnValue({
      getContext: () => null,
    } as unknown as HTMLCanvasElement);

    const result = checkWebGLSupport();
    expect(result).toEqual({ supported: false, version: null });
  });

  it("returns unsupported when createElement throws", () => {
    vi.spyOn(document, "createElement").mockImplementation(() => {
      throw new Error("DOM not available");
    });

    const result = checkWebGLSupport();
    expect(result).toEqual({ supported: false, version: null });
  });

  it("falls back to experimental-webgl", () => {
    vi.spyOn(document, "createElement").mockReturnValue({
      getContext: (id: string) =>
        id === "experimental-webgl" ? {} : null,
    } as unknown as HTMLCanvasElement);

    const result = checkWebGLSupport();
    expect(result).toEqual({ supported: true, version: "webgl" });
  });
});
