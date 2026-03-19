"use client"

import { useState } from "react"
import { Battery, Timer, ChevronDown } from "lucide-react"

export function DroneProfile() {
  const [isExpanded, setIsExpanded] = useState(true)

  return (
    <div className="bg-card rounded-2xl p-4">
      {/* Collapsible Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between w-full bg-white/80 dark:bg-muted/50 px-4 py-2.5 rounded-full mb-3 hover:bg-white/60 dark:hover:bg-muted/40 transition-colors border border-border/60 dark:border-border"
      >
        <span className="text-sm font-semibold text-foreground">Active Drone</span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} />
      </button>
      
      {isExpanded && (
        <div className="p-3 bg-white/80 dark:bg-muted/50 rounded-xl border border-border/60 dark:border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-base font-semibold text-foreground">DJI Matrice 300 RTK</p>
              <p className="text-xs text-muted-foreground mt-1">Enterprise Series</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <Battery className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-foreground">85%</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Timer className="w-4 h-4 text-[var(--info)]" />
                <span className="text-sm font-medium text-foreground">55 min</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
