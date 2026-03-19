"use client"

import { ThemeProvider } from "@/components/theme-provider"
import { TopNav } from "@/components/dashboard/top-nav"
import { MissionList } from "@/components/dashboard/mission-list"
import { StatCards } from "@/components/dashboard/stat-cards"
import { DroneProfile } from "@/components/dashboard/drone-profile"
import { MapPanel } from "@/components/dashboard/map-panel"

export default function DashboardPage() {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      <div className="min-h-screen bg-background flex flex-col">
        {/* Top Navigation */}
        <TopNav />

        {/* Main Content */}
        <main className="flex-1 flex p-4 gap-4 overflow-hidden">
          {/* Left Panel - 30% */}
          <div className="w-[30%] flex flex-col gap-4 min-h-0">
            {/* Mission List Section - Collapsible */}
            <section className="flex-1 min-h-0 flex flex-col">
              <MissionList />
              {/* New Mission Button */}
              <button className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-full text-sm font-semibold hover:bg-[#2ea62e] transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New Mission
              </button>
            </section>

            {/* Statistics Section */}
            <section>
              <StatCards />
            </section>

            {/* Active Drone Profile Section */}
            <section>
              <DroneProfile />
            </section>
          </div>

          {/* Right Panel - 70% */}
          <div className="w-[70%] flex flex-col min-h-0">
            <MapPanel />
          </div>
        </main>
      </div>
    </ThemeProvider>
  )
}
