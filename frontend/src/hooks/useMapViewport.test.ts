import { describe, it, expect, beforeEach } from "vitest";
import {
  getSavedViewport,
  saveViewport,
  getSavedLayers,
  saveLayers,
} from "./useMapViewport";

const AIRPORT_ID = "airport-1";
const VIEWPORT_KEY = `tarmacview_mapViewport_${AIRPORT_ID}`;
const LAYERS_KEY = `tarmacview_mapLayers_${AIRPORT_ID}`;

describe("useMapViewport", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("getSavedViewport", () => {
    it("returns null when no data stored", () => {
      expect(getSavedViewport(AIRPORT_ID)).toBeNull();
    });

    it("returns saved viewport state", () => {
      const state = { center: [48.1, 17.2] as [number, number], zoom: 14, bearing: 0, pitch: 0 };
      localStorage.setItem(VIEWPORT_KEY, JSON.stringify(state));
      expect(getSavedViewport(AIRPORT_ID)).toEqual(state);
    });

    it("returns null for invalid data", () => {
      localStorage.setItem(VIEWPORT_KEY, JSON.stringify({ zoom: 14 }));
      expect(getSavedViewport(AIRPORT_ID)).toBeNull();
    });

    it("returns null for corrupted json", () => {
      localStorage.setItem(VIEWPORT_KEY, "not-json");
      expect(getSavedViewport(AIRPORT_ID)).toBeNull();
    });

    it("falls back to 0 for non-numeric bearing and pitch", () => {
      const tampered = { center: [48.1, 17.2], zoom: 14, bearing: "bad", pitch: null };
      localStorage.setItem(VIEWPORT_KEY, JSON.stringify(tampered));
      const result = getSavedViewport(AIRPORT_ID);
      expect(result).toEqual({ center: [48.1, 17.2], zoom: 14, bearing: 0, pitch: 0 });
    });

    it("falls back to 0 for missing bearing and pitch", () => {
      const partial = { center: [48.1, 17.2], zoom: 14 };
      localStorage.setItem(VIEWPORT_KEY, JSON.stringify(partial));
      const result = getSavedViewport(AIRPORT_ID);
      expect(result).toEqual({ center: [48.1, 17.2], zoom: 14, bearing: 0, pitch: 0 });
    });
  });

  describe("saveViewport", () => {
    it("persists viewport to localStorage", () => {
      const state = { center: [48.1, 17.2] as [number, number], zoom: 14, bearing: 0, pitch: 0 };
      saveViewport(AIRPORT_ID, state);
      expect(JSON.parse(localStorage.getItem(VIEWPORT_KEY)!)).toEqual(state);
    });
  });

  describe("getSavedLayers", () => {
    it("returns null when no data stored", () => {
      expect(getSavedLayers(AIRPORT_ID)).toBeNull();
    });

    it("returns saved layer config", () => {
      const layers = { runways: true, taxiways: false, obstacles: true };
      localStorage.setItem(LAYERS_KEY, JSON.stringify(layers));
      expect(getSavedLayers(AIRPORT_ID)).toEqual(layers);
    });

    it("strips unrecognized keys from stored data", () => {
      const tampered = {
        runways: true,
        taxiways: false,
        malicious: "payload",
        __proto__: "attack",
        extraFlag: true,
      };
      localStorage.setItem(LAYERS_KEY, JSON.stringify(tampered));

      const result = getSavedLayers(AIRPORT_ID);
      expect(result).toEqual({ runways: true, taxiways: false });
      expect(result).not.toHaveProperty("malicious");
      expect(result).not.toHaveProperty("extraFlag");
      expect(result).not.toHaveProperty("__proto__");
    });

    it("returns null when no known keys have boolean values", () => {
      localStorage.setItem(LAYERS_KEY, JSON.stringify({ unknown: true }));
      expect(getSavedLayers(AIRPORT_ID)).toBeNull();
    });

    it("returns null for non-object data", () => {
      localStorage.setItem(LAYERS_KEY, JSON.stringify([1, 2, 3]));
      expect(getSavedLayers(AIRPORT_ID)).toBeNull();
    });

    it("returns null for corrupted json", () => {
      localStorage.setItem(LAYERS_KEY, "not-json");
      expect(getSavedLayers(AIRPORT_ID)).toBeNull();
    });
  });

  describe("saveLayers", () => {
    it("persists layers to localStorage", () => {
      const layers = {
        runways: true,
        taxiways: true,
        obstacles: false,
        safetyZones: true,
        aglSystems: false,
        bufferZones: true,
        simplifiedTrajectory: false,
        trajectory: true,
        transitWaypoints: false,
        measurementWaypoints: true,
        path: false,
        takeoffLanding: true,
        cameraHeading: false,
        pathHeading: true,
      };
      saveLayers(AIRPORT_ID, layers);
      expect(JSON.parse(localStorage.getItem(LAYERS_KEY)!)).toEqual(layers);
    });
  });
});
