"use client"

import { useState } from "react"
import { Target, Clock, CheckCircle2, ChevronDown } from "lucide-react"

interface StatCard {
  label: string
  value: string
  icon: React.ReactNode
}

const stats: StatCard[] = [
  {
    label: "Total Missions",
    value: "24",
    icon: <Target className="w-5 h-5 text-primary" />,
  },
  {
    label: "Avg Duration",
    value: "52 min",
    icon: <Clock className="w-5 h-5 text-[var(--info)]" />,
  },
  {
    label: "Inspections Done",
    value: "156",
    icon: <CheckCircle2 className="w-5 h-5 text-primary" />,
  },
]

export function StatCards() {
  const [isExpanded, setIsExpanded] = useState(true)

  return (
    <div className="bg-card rounded-2xl p-4">
      {/* Collapsible Statistics Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between w-full bg-white/80 dark:bg-muted/50 px-4 py-2.5 rounded-full mb-3 hover:bg-white/60 dark:hover:bg-muted/40 transition-colors border border-border/60 dark:border-border"
      >
        <span className="text-sm font-semibold text-foreground">Statistics</span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} />
      </button>

      {isExpanded && (
        <div className="grid grid-cols-3 gap-3">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="p-3 bg-white/80 dark:bg-muted/50 rounded-xl border border-border/60 dark:border-border"
            >
              <div className="flex items-center gap-2 mb-2">
                {stat.icon}
                <span className="text-xs text-muted-foreground">{stat.label}</span>
              </div>
              <p className="text-xl font-bold text-foreground">{stat.value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
