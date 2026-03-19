"use client"

import { useState } from "react"
import { Search, Plus, Clock, Layers, ChevronDown } from "lucide-react"

type MissionStatus = "DRAFT" | "PLANNED" | "VALIDATED" | "EXPORTED"

interface Mission {
  id: string
  name: string
  status: MissionStatus
  droneName: string
  inspectionCount: number
  estimatedDuration: string
  createdDate: string
}

const missions: Mission[] = [
  {
    id: "1",
    name: "PAPI Inspection - RWY 09L",
    status: "VALIDATED",
    droneName: "DJI Matrice 300",
    inspectionCount: 4,
    estimatedDuration: "45 min",
    createdDate: "Mar 18, 2026",
  },
  {
    id: "2",
    name: "AGL System Check - RWY 27R",
    status: "PLANNED",
    droneName: "DJI Matrice 300",
    inspectionCount: 6,
    estimatedDuration: "1h 15min",
    createdDate: "Mar 17, 2026",
  },
  {
    id: "3",
    name: "Obstacle Survey - North Zone",
    status: "DRAFT",
    droneName: "DJI Mavic 3E",
    inspectionCount: 2,
    estimatedDuration: "30 min",
    createdDate: "Mar 16, 2026",
  },
  {
    id: "4",
    name: "PAPI Calibration - RWY 18C",
    status: "EXPORTED",
    droneName: "DJI Matrice 300",
    inspectionCount: 4,
    estimatedDuration: "50 min",
    createdDate: "Mar 15, 2026",
  },
  {
    id: "5",
    name: "Safety Zone Mapping",
    status: "DRAFT",
    droneName: "DJI Mavic 3E",
    inspectionCount: 8,
    estimatedDuration: "2h",
    createdDate: "Mar 14, 2026",
  },
]

const statusStyles: Record<MissionStatus, { bg: string; text: string }> = {
  DRAFT: { bg: "bg-[var(--status-draft-bg)]", text: "text-[var(--status-draft)]" },
  PLANNED: { bg: "bg-[var(--status-planned-bg)]", text: "text-[var(--status-planned)]" },
  VALIDATED: { bg: "bg-[var(--status-validated-bg)]", text: "text-[var(--status-validated)]" },
  EXPORTED: { bg: "bg-[var(--status-exported-bg)]", text: "text-[var(--status-exported)]" },
}

function StatusBadge({ status }: { status: MissionStatus }) {
  const styles = statusStyles[status]
  return (
    <span className={`px-3 py-1 rounded-full text-xs font-medium ${styles.bg} ${styles.text}`}>
      {status}
    </span>
  )
}

export function MissionList() {
  const [isExpanded, setIsExpanded] = useState(true)

  return (
    <div className="bg-card rounded-2xl p-4 flex flex-col h-full">
      {/* Collapsible Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between w-full bg-white/80 dark:bg-muted/50 px-4 py-2.5 rounded-full mb-3 hover:bg-white/60 dark:hover:bg-muted/40 transition-colors border border-border/60 dark:border-border"
      >
        <span className="text-sm font-semibold text-foreground">Missions</span>
        <div className="flex items-center gap-2">
          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
            {missions.length}
          </span>
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} />
        </div>
      </button>

      {isExpanded && (
        <>
          {/* Search Bar */}
          <div className="relative mb-3">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search missions..."
              className="w-full pl-11 pr-4 py-2.5 bg-white/80 dark:bg-muted/50 border border-border/60 dark:border-border rounded-full text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* Mission Cards */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {missions.map((mission) => (
              <div
                key={mission.id}
                className="p-3 bg-white/80 dark:bg-muted/50 rounded-xl hover:bg-white/60 dark:hover:bg-muted/40 transition-colors cursor-pointer border border-border/60 dark:border-border"
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-sm font-semibold text-foreground">{mission.name}</h3>
                  <StatusBadge status={mission.status} />
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{mission.droneName}</span>
                  <span className="flex items-center gap-1">
                    <Layers className="w-3 h-3" />
                    {mission.inspectionCount}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {mission.estimatedDuration}
                  </span>
                </div>
              </div>
            ))}
          </div>

        </>
      )}
    </div>
  )
}
