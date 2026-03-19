"use client"

import { useState, useRef, useEffect } from "react"
import { ChevronDown, Moon, Sun, Plane, LogOut, Settings, User } from "lucide-react"
import { useTheme } from "next-themes"

const navItems = [
  { label: "Dashboard", active: true },
  { label: "Missions", active: false },
  { label: "Airport", active: false },
  { label: "Results", active: false, disabled: true },
]

export function TopNav() {
  const { theme, setTheme } = useTheme()
  const [userDropdownOpen, setUserDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setUserDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  return (
    <header className="flex items-center px-4 py-4 bg-background gap-4">
      {/* Left: App Title in Bubble - 30% width */}
      <div className="w-[30%] flex">
        <div className="w-full flex items-center gap-2 bg-card px-4 py-2.5 rounded-full">
          <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center shrink-0">
            <Plane className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="text-sm font-semibold text-foreground">
            TarmacView Mission Control Center
          </span>
        </div>
      </div>

      {/* Right: Nav + Dropdowns - 70% width */}
      <div className="w-[70%] flex items-center justify-between">
        {/* Navigation Pills */}
        <nav className="flex items-center gap-1 bg-card rounded-full p-1">
          {navItems.map((item) => (
            <button
              key={item.label}
              disabled={item.disabled}
              className={`
                px-5 py-2 rounded-full text-sm font-medium transition-colors
                ${item.active 
                  ? "bg-primary text-primary-foreground" 
                  : item.disabled 
                    ? "text-muted-foreground cursor-not-allowed opacity-50" 
                    : "text-foreground hover:bg-muted"
                }
              `}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Dropdowns */}
        <div className="flex items-center gap-3">
          {/* Airport Dropdown */}
          <button className="flex items-center gap-2 px-4 py-2.5 bg-card rounded-full text-sm font-medium text-foreground hover:bg-muted transition-colors">
            <span>New York, JFK International Airport</span>
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </button>

        {/* User Dropdown with Theme Toggle */}
        <div className="relative" ref={dropdownRef}>
          <button 
            onClick={() => setUserDropdownOpen(!userDropdownOpen)}
            className="flex items-center gap-2 px-4 py-2.5 bg-card rounded-full text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-xs text-primary-foreground font-semibold">
              JD
            </div>
            <span>John Doe</span>
            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${userDropdownOpen ? "rotate-180" : ""}`} />
          </button>

          {/* Dropdown Menu */}
          {userDropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-card border border-border rounded-2xl overflow-hidden z-50">
              <div className="p-2">
                <button className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm text-foreground hover:bg-muted transition-colors">
                  <User className="w-4 h-4 text-muted-foreground" />
                  Profile
                </button>
                <button className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm text-foreground hover:bg-muted transition-colors">
                  <Settings className="w-4 h-4 text-muted-foreground" />
                  Settings
                </button>
                
                {/* Theme Toggle */}
                <button 
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm text-foreground hover:bg-muted transition-colors"
                >
                  <span className="flex items-center gap-3">
                    {theme === "dark" ? (
                      <Sun className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <Moon className="w-4 h-4 text-muted-foreground" />
                    )}
                    {theme === "dark" ? "Light Mode" : "Dark Mode"}
                  </span>
                </button>
              </div>
              
              <div className="border-t border-border p-2">
                <button className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm text-destructive hover:bg-muted transition-colors">
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
        </div>
      </div>
    </header>
  )
}
