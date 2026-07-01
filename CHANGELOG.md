# Changelog

All notable changes to Box Claws will be documented in this file.

## [0.2.0] - 2026-07-01

### Added
- **shadcn/ui component library** — Complete UI redesign using shadcn/ui components
  - Button, Card, Badge, Dialog, Input, Select, Label, Progress components
  - Sonner toast notifications for success/error feedback
  - Lucide React icons throughout
- **3-step deployment wizard** — Cleaner create flow: Persona → Config → Channels
- **Real-time deployment progress** — Deploying agents appear in sidebar with spinner and live status messages
- **Server-Sent Events (SSE)** — E2B deployments stream progress updates to the client
- **Emerald theme** — New color scheme using oklch color space CSS variables
- **Pulse animations** — Running agents show animated status indicator
- **Toast notifications** — Success/error messages appear in bottom-right corner

### Changed
- Migrated from custom CSS to Tailwind CSS with shadcn/ui design tokens
- Replaced inline modal styles with Dialog component
- Improved sidebar agent list with status dots and progress text
- Cleaner header with gradient logo text

### Removed
- Old `tailwind.config.ts` (now using CSS-based Tailwind v4 config)
- Legacy inline styles and custom component implementations

### Technical
- Added `components.json` for shadcn/ui configuration (new-york style, zinc base)
- Added `lib/utils.ts` with `cn()` utility for class merging
- Updated `tsconfig.json` with `@/` path aliases
- Added streaming endpoint `/api/boxes/deploy-stream` for E2B progress

## [0.1.0] - 2026-06-30

### Added
- Initial release
- Docker and E2B provider support
- VNC screen sharing
- 8 pre-configured agent personas
- Basic dashboard UI
- REST API for agent management
- WebSocket for real-time updates
