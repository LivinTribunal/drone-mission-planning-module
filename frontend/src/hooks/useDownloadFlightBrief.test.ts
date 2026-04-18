import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import useDownloadFlightBrief from "./useDownloadFlightBrief";
import { downloadFlightBrief } from "@/api/missions";

vi.mock("@/api/missions", () => ({
  downloadFlightBrief: vi.fn(),
}));

const mockedDownload = downloadFlightBrief as Mock;

describe("useDownloadFlightBrief", () => {
  let showNotification: Mock;
  let createObjectURL: Mock;
  let revokeObjectURL: Mock;
  let mockAnchor: { href: string; download: string; click: Mock };

  beforeEach(() => {
    vi.clearAllMocks();
    showNotification = vi.fn();

    createObjectURL = vi.fn().mockReturnValue("blob:fake-url");
    revokeObjectURL = vi.fn();
    window.URL.createObjectURL = createObjectURL;
    window.URL.revokeObjectURL = revokeObjectURL;

    mockAnchor = { href: "", download: "", click: vi.fn() };
    const realCreateElement = Document.prototype.createElement;
    vi.spyOn(document, "createElement").mockImplementation(function (
      this: Document,
      tag: string,
    ) {
      if (tag === "a") return mockAnchor as unknown as HTMLAnchorElement;
      return realCreateElement.call(this, tag);
    });
    vi.spyOn(document.body, "appendChild").mockImplementation(
      (node) => node,
    );
    vi.spyOn(document.body, "removeChild").mockImplementation(
      (node) => node,
    );
  });

  it("downloads blob, creates anchor, clicks it, and revokes url", async () => {
    const blob = new Blob(["pdf-content"], { type: "application/pdf" });
    mockedDownload.mockResolvedValue({ blob, filename: "brief.pdf" });

    const { result } = renderHook(() =>
      useDownloadFlightBrief("mission-1", "Test Mission", showNotification),
    );

    await act(async () => {
      await result.current.handleDownloadBrief();
    });

    expect(mockedDownload).toHaveBeenCalledWith("mission-1");
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(mockAnchor.href).toBe("blob:fake-url");
    expect(mockAnchor.download).toBe("brief.pdf");
    expect(mockAnchor.click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:fake-url");
    expect(document.body.removeChild).toHaveBeenCalled();
  });

  it("uses fallback filename when server returns null", async () => {
    const blob = new Blob(["pdf"], { type: "application/pdf" });
    mockedDownload.mockResolvedValue({ blob, filename: null });

    const { result } = renderHook(() =>
      useDownloadFlightBrief("m-2", "My Mission", showNotification),
    );

    await act(async () => {
      await result.current.handleDownloadBrief();
    });

    expect(mockAnchor.download).toBe("FlightBrief_My Mission.pdf");
  });

  it("shows error notification when download fails", async () => {
    mockedDownload.mockRejectedValue(new Error("network error"));

    const { result } = renderHook(() =>
      useDownloadFlightBrief("m-3", "Mission", showNotification),
    );

    await act(async () => {
      await result.current.handleDownloadBrief();
    });

    expect(showNotification).toHaveBeenCalledWith("mission.flightBrief.error");
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("returns early without calling api when missionId is undefined", async () => {
    const { result } = renderHook(() =>
      useDownloadFlightBrief(undefined, "Mission", showNotification),
    );

    await act(async () => {
      await result.current.handleDownloadBrief();
    });

    expect(mockedDownload).not.toHaveBeenCalled();
  });

  it("sets isDownloadingBrief to true during download, false after", async () => {
    let resolveDownload: (v: { blob: Blob; filename: string }) => void;
    mockedDownload.mockReturnValue(
      new Promise((resolve) => {
        resolveDownload = resolve;
      }),
    );

    const { result } = renderHook(() =>
      useDownloadFlightBrief("m-4", "Mission", showNotification),
    );

    expect(result.current.isDownloadingBrief).toBe(false);

    let downloadPromise: Promise<void>;
    act(() => {
      downloadPromise = result.current.handleDownloadBrief();
    });

    expect(result.current.isDownloadingBrief).toBe(true);

    await act(async () => {
      resolveDownload!({
        blob: new Blob(["ok"]),
        filename: "brief.pdf",
      });
      await downloadPromise!;
    });

    expect(result.current.isDownloadingBrief).toBe(false);
  });
});
