# TarmacView Design System

This document defines the visual design system for TarmacView. All frontend components must follow these specifications. The v0 reference code in `docs/design-reference/` serves as a visual starting point — adapt it to React + Vite + react-router-dom (NOT Next.js).

## Color Palette

All colors defined as CSS custom properties in `:root` and `.dark`. Use Tailwind's `bg-[var(--color-name)]` or extend the Tailwind config to reference these variables.

### Light Mode (default)

```css
:root {
  --tv-bg: #ffffff;
  --tv-surface: #f5f5f5;
  --tv-surface-hover: #ebebeb;
  --tv-border: #e9e9e9;
  --tv-text-primary: #161616;
  --tv-text-secondary: #6b6b6b;
  --tv-text-muted: #9a9a9a;
  --tv-accent: #3bbb3b;
  --tv-accent-hover: #2ea62e;
  --tv-accent-text: #ffffff;
  --tv-error: #e54545;
  --tv-warning: #e5a545;
  --tv-info: #4595e5;
  --tv-nav-active-bg: #161616;
  --tv-nav-active-text: #ffffff;
}
```

### Dark Mode

```css
.dark {
  --tv-bg: #000000;
  --tv-surface: #1a1a1a;
  --tv-surface-hover: #252525;
  --tv-border: #2a2a2a;
  --tv-text-primary: #e9e9e9;
  --tv-text-secondary: #8a8a8a;
  --tv-text-muted: #5a5a5a;
  --tv-accent: #3bbb3b;
  --tv-accent-hover: #2ea62e;
  --tv-accent-text: #ffffff;
  --tv-error: #e54545;
  --tv-warning: #e5a545;
  --tv-info: #4595e5;
  --tv-nav-active-bg: #e9e9e9;
  --tv-nav-active-text: #161616;
}
```

### Status Badge Colors

Used for mission status badges throughout the app.

| Status | Light BG | Light Text | Dark BG | Dark Text |
|---|---|---|---|---|
| DRAFT | #e9e9e9 | #6b6b6b | #2a2a2a | #8a8a8a |
| PLANNED | #dbeafe | #2563eb | #1e3a5f | #60a5fa |
| VALIDATED | #dcfce7 | #16a34a | #14532d | #4ade80 |
| EXPORTED | #f3e8ff | #9333ea | #3b0764 | #c084fc |
| COMPLETED | #d1fae5 | #059669 | #064e3b | #34d399 |
| CANCELLED | #fee2e2 | #dc2626 | #450a0a | #f87171 |

### Inspection Colors (for path segments on map)

Used for line segments leading to measurement waypoints. Cycles for inspections 1-5+.

| Inspection | Color |
|---|---|
| Inspection 1 | #4595e5 (blue) |
| Inspection 2 | #3bbb3b (green) |
| Inspection 3 | #e5a545 (orange) |
| Inspection 4 | #9b59b6 (purple) |
| Inspection 5 | #e54545 (red) |

### Transit Path Color

| Element | Color |
|---|---|
| Transit/takeoff/landing path lines | #7eb8e5 (muted blue) |
| Direction arrows on all paths | #ffffff (white chevron, 0.6 scale, 80px spacing) |

### Map Icon Generation

All map icons are rendered as canvas ImageData at 32px with pixelRatio 2 in `mapImages.ts`:
- Obstacle icons: triangle (building), tower, antenna, tree, other
- Waypoint icons: rounded squares with letters (T=takeoff blue, L=landing red)
- Hover icon: circle with pause bars (orange)
- AGL marker: rounded square (#e91e90)
- Path arrow: white chevron for direction indication

### Safety Zone Colors (for map polygons)

| Type | Fill (20% opacity) | Border |
|---|---|---|
| CTR | rgba(69, 149, 229, 0.2) | #4595e5 |
| RESTRICTED | rgba(229, 165, 69, 0.2) | #e5a545 |
| PROHIBITED | rgba(229, 69, 69, 0.2) | #e54545 |
| TEMPORARY_NO_FLY | rgba(229, 229, 69, 0.2) | #e5e545 |

## Typography

Font: `Inter` (primary), system sans-serif fallback.

| Use | Size | Weight | Variable |
|---|---|---|---|
| Page title | 24px (text-2xl) | 600 (semibold) | -- |
| Section title | 16px (text-base) | 600 (semibold) | -- |
| Body text | 14px (text-sm) | 400 (normal) | -- |
| Label | 12px (text-xs) | 500 (medium) | -- |
| Caption / muted | 12px (text-xs) | 400 (normal) | --tv-text-muted |
| Nav item | 14px (text-sm) | 500 (medium) | -- |
| Button | 14px (text-sm) | 600 (semibold) | -- |
| Status badge | 12px (text-xs) | 600 (semibold) | -- |
| Stat value (large number) | 28px (text-3xl) | 700 (bold) | -- |

## Spacing

Use Tailwind's spacing scale. The design uses generous whitespace.

| Context | Value |
|---|---|
| Page padding | 16px (p-4) |
| Gap between panels | 16px (gap-4) |
| Card internal padding | 16px (p-4) |
| Gap between items in a list | 8px (gap-2) |
| Gap between sections in left panel | 16px (gap-4) |
| Nav bar padding | 16px horizontal (px-4), 16px vertical (py-4) |

## Border Radius

Everything is rounded. The design uses a bubble/pill aesthetic.

| Element | Radius | Tailwind class |
|---|---|---|
| Cards / containers | 16px | rounded-2xl |
| Inputs / text fields | 9999px (full pill) | rounded-full |
| Buttons | 9999px (full pill) | rounded-full |
| Nav items | 9999px (full pill) | rounded-full |
| Status badges | 9999px (full pill) | rounded-full |
| Dropdowns (open menu) | 16px | rounded-2xl |
| Map container | 16px | rounded-2xl |
| Map overlay controls | 9999px (full pill) | rounded-full |

## Borders

Flat design — no shadows, no blur, no gradients.

| Element | Border |
|---|---|
| Cards | 1px solid var(--tv-border) |
| Inputs | 1px solid var(--tv-border) |
| Nav bar container | none (uses background color only) |
| Dropdown menus | 1px solid var(--tv-border) |
| Map overlay controls | 1px solid var(--tv-border) |
| Buttons (primary) | none |
| Buttons (secondary) | 1px solid var(--tv-border) |

CRITICAL: No `box-shadow`, no `drop-shadow`, no `backdrop-blur`. Flat design only.

## Layout

### Navigation Bar

Top horizontal bar, full width. Contains three aligned sections:

```
[App Title (30%)]  [Nav Pills + Airport Dropdown + User Dropdown (70%)]
```

- Left section (30% width): "TarmacView Mission Control Center" with logo icon, inside a pill-shaped container with surface background. This section aligns with the left panel below.
- Right section (70% width): contains the pill-shaped nav items (Dashboard, Missions, Airport, Results), airport dropdown, and user dropdown. This section aligns with the right panel / map below.
- Nav items are inside a pill-shaped container with surface background. Active item has `--tv-nav-active-bg` background and `--tv-nav-active-text` text. Disabled items (Results) are 50% opacity and non-clickable.
- Airport dropdown and user dropdown are pill-shaped with surface background.
- User dropdown menu contains: Settings, Dark/Light mode toggle, Logout, and (for Coordinator role) "Configurator Center" link.

### Dashboard Page Layout

```
[Left Panel 30%] [Right Panel 70%]
```

- Left panel: scrollable, contains collapsible sections stacked vertically with gap-4 between them.
- Right panel: map filling the full height, with overlay controls (layers, legend, terrain switcher).

### Left Panel Collapsible Sections

Each section is a single card container (surface background, rounded-2xl, 1px border) with:
- A header row: section title (semibold) + chevron icon that rotates on expand/collapse
- Content below the header, inside the same container (NOT a separate card)
- When collapsed: only the header row is visible
- When expanded: header + content visible, no additional borders between them

This means the section title and its content are visually part of the same rounded card. The user always knows which content belongs to which section because they share a container.

### Map Panel

- Dark background (#1a1a1a light mode, #0a0a0a dark mode) with rounded-2xl corners
- Overlay controls use pill-shaped containers with surface background and border
- **Top-left column** (stacked, scrollable): LayerPanel (checkboxes per layer group), WaypointListPanel (sortable waypoint table, appears when waypoints exist), PoiInfoPanel (entity details on click)
- **Top-right**: LegendPanel (collapsible sections: ground surfaces, safety zones, obstacles, features, flight plan with waypoint type swatches and transit path swatch)
- **Bottom-left**: MapHelpPanel (keyboard shortcuts)
- **Bottom-right**: TerrainToggle (pill-shaped segmented control: Map | Satellite)
- Legend swatch types: rectangle, circle, circle-outline, circle-border, triangle, dashed-hatch, tower, antenna, tree, rounded-square-letter, hover-icon, line-arrow

## Component Patterns

### Buttons

| Type | Style |
|---|---|
| Primary | bg: --tv-accent, text: --tv-accent-text, rounded-full, no border |
| Secondary | bg: transparent, text: --tv-text-primary, border: --tv-border, rounded-full |
| Danger | bg: --tv-error, text: white, rounded-full, no border |
| Disabled | opacity: 50%, cursor: not-allowed |
| Icon button | same as secondary but square with rounded-full (circle) |

### Inputs

- Pill-shaped (rounded-full) with 1px border
- Padding: px-4 py-2.5
- Placeholder text uses --tv-text-muted
- Focus: border color changes to --tv-accent

### Cards

- Background: --tv-surface
- Border: 1px solid --tv-border
- Border radius: rounded-2xl
- Padding: p-4
- No shadow

### Status Badges

- Pill-shaped (rounded-full)
- Padding: px-2.5 py-0.5
- Font: text-xs font-semibold
- Background and text colors from Status Badge Colors table above

### Dropdowns

- Trigger: pill-shaped button with chevron icon
- Menu: rounded-2xl container with --tv-surface background and --tv-border border
- Menu items: rounded-xl with hover state using --tv-surface-hover
- Padding: p-2 on menu, px-4 py-2.5 on items

### Tables / Lists

- Mission list: cards stacked vertically, not a traditional HTML table
- Each mission is a card (rounded-2xl, surface bg, border) with content inside
- Hover state: background changes to --tv-surface-hover
- Click: navigates to mission detail

### Collapsible Sections

- Single container card wrapping both the header and content
- Header: flex row with title + chevron, clickable
- Content: below header, same card, no border between header and content
- Chevron rotates 180deg when expanded
- Transition: smooth height animation on expand/collapse

## Dark Mode Implementation

- Use Tailwind's `dark:` variant for all color references
- Theme toggle in user dropdown menu
- Persist theme choice to localStorage
- Default: light mode
- The `.dark` class is applied to `<html>` element

## What NOT to Do

- No shadows (box-shadow, drop-shadow) anywhere
- No gradients
- No backdrop-blur or glassmorphism effects
- No rounded-lg or rounded-md — use rounded-2xl for cards, rounded-full for interactive elements
- No serif fonts
- No uppercase text transforms on buttons or labels
- No heavy borders (max 1px)
- No colored backgrounds on the page itself (only white/black)

## Reference Implementation

The v0 reference code in `docs/design-reference/` demonstrates the visual direction. Key files:
- `components/dashboard/top-nav.tsx` — nav bar pattern (adapt from Next.js to react-router-dom)
- `components/dashboard/mission-list.tsx` — card list pattern with collapsible section
- `components/dashboard/map-panel.tsx` — map panel with overlay controls
- `components/dashboard/stat-cards.tsx` — stat card layout
- `components/dashboard/drone-profile.tsx` — small info card pattern
- `styles/globals.css` — CSS variable structure (replace oklch values with the hex values from this document)

These are visual references only. Do NOT copy Next.js patterns (no "use client", no next-themes, no app/ directory). Implement using React 18 + Vite + react-router-dom + Tailwind CSS.
