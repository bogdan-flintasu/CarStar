# Prompt: Upgrade Tasks – Industrial Hall Configurator

## Changes Implemented

### 1. Landing Page Model Load Lock
- The landing page displays a full-screen branded loading screen (CarStar logo, glowing spinner, progress text) until the 3D background model is fully loaded.
- Uses `useProgress()` from `@react-three/drei` inside the Canvas to detect when all GLTF assets are done loading.
- The content smoothly fades in with `AnimatePresence` after readiness is confirmed.

### 2. Configuration Link Generation (Generează Link)
- Created `POST /api/configurations` and `GET /api/configurations/[token]` API routes.
- The configurator saves the full state (dimensions, toggles, openings list with positions) to a SQLite database via Prisma.
- A unique token (`nanoid`) is generated and returned. A shareable URL is built: `/configuration/[token]`.
- Visiting a shared link loads the configuration into Zustand stores and redirects to `/configurator`.

### 3. Trimite Cererea (Send Email)
- Created `POST /api/send-email` API route.
- If `RESEND_API_KEY` is set in `.env`, emails are sent via Resend SDK.
- Otherwise, a formatted email simulation is logged to the server console for local development.

### 4. Admin Dashboard (`/admin`)
- Login screen with credentials: `admin` / `admin`.
- **Prețuri tab**: Editable price table (structure per m³, foundation per m², sandwich per m², window, door, big door per unit). Prices are saved to and loaded from the database.
- **Configurări Salvate tab**: List of all generated configurations with token, date, client details, dimensions, price, and a link to view each.
- Prices from the admin panel are synced into the configurator via `GET /api/prices` on mount.

### 5. Closings Step UI (Windows, Doors, Garage Doors)
- Removed all emojis (🪟, 🚪, 🏗️).
- Replaced with clean, architectural SVG icon components (`WindowIcon`, `DoorIcon`, `GarageDoorIcon`).
- Icons are used consistently in tool selector buttons, summary cards, editor panel, and openings list.

### 6. Footer Summary Text
- The footer dynamically shows:
  - `L x W x H m | Structură Metalică | Fundație` when foundation is checked.
  - `L x W x H m | Structură Metalică` when foundation is not checked.
- Removed hardcoded "Panou Izolat" text.

### 7. Database
- Switched from PostgreSQL to SQLite for seamless local development.
- Database file: `prisma/dev.db` (browsable with any SQLite GUI tool).
- Schema: `Configuration` (id, token, data JSON, contact info) + `Prices` (unit prices, updatedAt).