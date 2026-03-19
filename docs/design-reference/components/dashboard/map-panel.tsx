"use client"

import { useState } from "react"
import { Map, Satellite, Layers, ChevronDown } from "lucide-react"

const layerToggles = [
  { id: "runways", label: "Runways", color: "#3bbb3b" },
  { id: "obstacles", label: "Obstacles", color: "#e54545" },
  { id: "safety", label: "Safety Zones", color: "#e5a545" },
  { id: "agl", label: "AGL Systems", color: "#4595e5" },
]

export function MapPanel() {
  const [activeView, setActiveView] = useState<"map" | "satellite">("map")
  const [activeLayers, setActiveLayers] = useState<string[]>(["runways", "safety"])
  const [layersOpen, setLayersOpen] = useState(false)

  const toggleLayer = (id: string) => {
    setActiveLayers((prev) =>
      prev.includes(id) ? prev.filter((l) => l !== id) : [...prev, id]
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Map Placeholder */}
      <div className="flex-1 bg-[#1a1a1a] dark:bg-[#0a0a0a] rounded-2xl flex items-center justify-center relative overflow-hidden">
        {/* Grid pattern overlay */}
        <div 
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `
              linear-gradient(to right, #3bbb3b20 1px, transparent 1px),
              linear-gradient(to bottom, #3bbb3b20 1px, transparent 1px)
            `,
            backgroundSize: '40px 40px'
          }}
        />
        
        {/* Runway mockup lines */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-[80%] h-[8px] bg-[#3a3a3a] dark:bg-[#2a2a2a] rounded-full relative">
            {/* Runway centerline dashes */}
            <div className="absolute inset-0 flex items-center justify-around px-8">
              {[...Array(12)].map((_, i) => (
                <div key={i} className="w-4 h-0.5 bg-[#5a5a5a]" />
              ))}
            </div>
          </div>
        </div>

        {/* PAPI lights indicator */}
        <div className="absolute left-[12%] top-1/2 -translate-y-1/2 flex gap-1">
          {[...Array(4)].map((_, i) => (
            <div 
              key={i} 
              className={`w-2 h-2 rounded-full ${i < 2 ? 'bg-red-500' : 'bg-white'}`}
            />
          ))}
        </div>

        <div className="relative z-10 text-center">
          <p className="text-[#5a5a5a] text-lg font-medium">MapLibre GL JS</p>
          <p className="text-[#4a4a4a] text-sm mt-1">Interactive map view</p>
        </div>

        {/* Top Left: Layers Dropdown */}
        <div className="absolute top-4 left-4">
          <div className="relative">
            <button
              onClick={() => setLayersOpen(!layersOpen)}
              className="flex items-center gap-2 bg-card/90 backdrop-blur-sm px-4 py-2 rounded-full border-2 border-border/60 dark:border-border text-sm font-medium text-foreground hover:bg-card transition-colors"
            >
              <Layers className="w-4 h-4" />
              <span>Layers</span>
              <span className="text-xs bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full">
                {activeLayers.length}
              </span>
              <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${layersOpen ? "rotate-180" : ""}`} />
            </button>

            {layersOpen && (
              <div className="absolute left-0 top-full mt-2 w-48 bg-card border-2 border-border/60 dark:border-border rounded-2xl overflow-hidden z-50">
                <div className="p-2">
                  {layerToggles.map((layer) => (
                    <button
                      key={layer.id}
                      onClick={() => toggleLayer(layer.id)}
                      className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm transition-colors ${
                        activeLayers.includes(layer.id)
                          ? "bg-primary/10 text-primary"
                          : "text-foreground hover:bg-muted"
                      }`}
                    >
                      <span>{layer.label}</span>
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        activeLayers.includes(layer.id)
                          ? "border-primary bg-primary"
                          : "border-muted-foreground"
                      }`}>
                        {activeLayers.includes(layer.id) && (
                          <div className="w-1.5 h-1.5 bg-white rounded-full" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Top Right: Legend */}
        <div className="absolute top-4 right-4 bg-card/90 backdrop-blur-sm px-4 py-3 rounded-2xl border-2 border-border/60 dark:border-border">
          <p className="text-xs font-semibold text-foreground mb-2">Legend</p>
          <div className="space-y-1.5">
            {layerToggles
              .filter((layer) => activeLayers.includes(layer.id))
              .map((layer) => (
                <div key={layer.id} className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-sm" 
                    style={{ backgroundColor: layer.color }}
                  />
                  <span className="text-xs text-muted-foreground">{layer.label}</span>
                </div>
              ))}
            {activeLayers.length === 0 && (
              <p className="text-xs text-muted-foreground">No layers selected</p>
            )}
          </div>
        </div>

        {/* Bottom Right: Map/Satellite Toggle */}
        <div className="absolute bottom-4 right-4 flex items-center bg-card/90 backdrop-blur-sm rounded-full p-1 border-2 border-border/60 dark:border-border">
          <button
            onClick={() => setActiveView("map")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              activeView === "map"
                ? "bg-primary text-primary-foreground"
                : "text-foreground hover:bg-muted"
            }`}
          >
            <Map className="w-3 h-3" />
            Map
          </button>
          <button
            onClick={() => setActiveView("satellite")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              activeView === "satellite"
                ? "bg-primary text-primary-foreground"
                : "text-foreground hover:bg-muted"
            }`}
          >
            <Satellite className="w-3 h-3" />
            Satellite
          </button>
        </div>
      </div>
    </div>
  )
}
