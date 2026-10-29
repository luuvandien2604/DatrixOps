---
name: DatrixOps Design System
description: High-density utilitarian design system for infrastructure observability
colors:
  background-root: "#080c12"
  background-sidebar: "#0d121a"
  background-header: "#101620"
  surface-1: "#111821"
  surface-2: "#151d28"
  surface-3: "#1a2430"
  border-subtle: "#202b38"
  border-default: "#2a3746"
  border-strong: "#3a4a5d"
  text-primary: "#edf2f7"
  text-secondary: "#9aa8b8"
  text-tertiary: "#6f7d8d"
  accent-primary: "#4c8dff"
  accent-subtle: "#142541"
  status-healthy: "#28c7a0"
  status-warning: "#e5a83b"
  status-critical: "#ef5b68"
  status-info: "#56a8e8"
typography:
  interface:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.4
  data:
    fontFamily: "'IBM Plex Mono', 'SFMono-Regular', Consolas, monospace"
    fontSize: "0.8125rem"
    fontWeight: 500
    letterSpacing: "-0.01em"
rounded:
  sm: "4px"
  md: "6px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
---

# Design System: DatrixOps Technical Observability

## Overview
DatrixOps follows an **Operate Mode** design philosophy: high density, crisp 1px hairline panel borders, dark-first utilitarian hierarchy, and purposeful telemetry data visualization. Chrome is strictly neutral; color is reserved for operational metrics and state indicators.

## Colors
- **Ground / Canvas:** `#080c12` (dark slate-charcoal).
- **Panels & Surfaces:** `#111821` (primary panels), `#151d28` (elevated cards/sub-sections).
- **Hairline Borders:** `#202b38` (subtle 1px border), `#2a3746` (active/hover border).
- **Text Palette:**
  - Primary: `#edf2f7` (high-contrast readable white/slate).
  - Secondary: `#9aa8b8` (muted metadata, table headers, descriptions).
  - Tertiary: `#6f7d8d` (subtle hints, inactive indicators).
- **Semantic Status Signals:**
  - Healthy / Live: `#28c7a0` (emerald teal).
  - Warning / Attention: `#e5a83b` (warm amber).
  - Critical / Incident: `#ef5b68` (vivid coral rose).
  - Info / Accent: `#4c8dff` (precision cobalt blue).

## Typography
- **UI Chrome & Text:** Strictly Sans-serif (`Inter` or system sans). Applied to page titles, card headers, table headers, buttons, navigation labels, and modal text.
- **Numbers & Metrics:** Strictly Monospace (`font-mono tabular-nums`). Applied exclusively to data values (e.g. `98.4%`, `2.4 GB / 8.0 GB`, `192.168.1.1`, `12:45:00`).

## Layout
- **Scaffold:** 12-column flex/grid system with compact 12px to 16px gaps.
- **Header:** Slim command bar with live telemetry pulse, snapshot timestamp, and action triggers.
- **Panels:** Sharp rectangular panels (`rounded-md` ~ 6px), 1px solid border `#202b38`, no soft blurred box-shadows.

## Elevation & Depth
- **Zero heavy drop-shadows.** Depth is achieved purely through 1px border contrast and solid tone shifts (`#080c12` -> `#111821` -> `#151d28`).

## Shapes
- Micro border-radius only (`rounded-sm`: 4px, `rounded-md`: 6px).
- Status indicators are small 6px-8px geometric dots, not giant pill badges or decorative icon bubbles.

## Components
- **Metric Cards:** Clean label in sans-serif, high-contrast monospace metric value, micro-sparkline or status dot. No icons in colored square backgrounds.
- **Data Tables:** Border-collapsed rows, 1px horizontal dividers, right-aligned numeric data, no zebra striping.
- **Telemetry Charts:** Area or line charts with clean hairline gridlines and minimal legend chrome.
- **Buttons:** Crisp rectangular controls with 150ms transitions, subtle hover states, no bouncy animations.

## Do's and Don'ts
- **DO** use `font-mono tabular-nums` for all telemetry values, percentages, IPs, and timestamps.
- **DO** keep panels flat with 1px hairline borders (`border-[var(--border-subtle)]`).
- **DON'T** use purple/pink gradients, blurred glassmorphism, or colored card borders.
- **DON'T** apply `font-mono` to the entire UI or headings.
- **DON'T** use giant circular gauges or donut charts that consume excessive screen real estate.

