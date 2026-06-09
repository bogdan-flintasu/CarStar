# Prompt: Full Upgrade – Industrial Hall Configurator (React + R3F)

## Project Context

I have an existing project built in **React + React Three Fiber (R3F)** — a 3D configurator for industrial steel halls. There is currently no backend. I want to do a major upgrade: adding a company presentation landing page and significantly improving the configurator itself.

---

## PART 1 – Company Landing Page

### Visual Concept

- The page background is the **3D model of the industrial hall**, rendered from the interior using R3F, in a standard configuration: no closings (windows/doors), no sandwich panels, with foundation, with preset representative dimensions.
- The camera starts at the **entrance of the hall** and moves progressively toward the **far end** as the user scrolls (scroll-driven camera animation using `@react-spring/three` or `framer-motion-3d` + scroll events).
- At the end of the scroll (camera reaches the far end of the hall), a clear **CTA** appears – "Configure your hall" – which takes the user into the configurator.
- The 3D model has a **semi-opaque overlay** (a `div` with `background: rgba(0,0,0,0.45)` or similar) so the foreground text is readable and the focus stays on the content.

### Page Content (in Romanian, general and professional)

Sections overlaid on top of the 3D model:

1. **Hero Section** – Large heading: *"Hale Industriale la Cheie"* + subtitle: *"Proiectăm și construim hale metalice personalizate, adaptate nevoilor tale."* + scroll-down button.
2. **About Us** – *"Cu peste [X] ani de experiență în construcții metalice industriale, oferim soluții complete – de la proiectare și producție până la montaj și finisaje. Fiecare hală este gândită pentru durabilitate, eficiență și estetică."*
3. **Why Us?** – 3 cards: *Certified Quality / Fast Delivery / Transparent Pricing*
4. **Services** – *"Hale de producție, depozitare, agricole și comerciale. Panouri sandwich, fundații, închideri personalizate."*
5. **Final CTA** – *"Configurează-ți hala acum"* → link to configurator.

---

## PART 2 – The Configurator (Major Upgrade)

### UI Design – Inspired by the Range Rover Configurator

- **Layout**: 70% left – interactive 3D viewport / 30% right – configuration panel.
- **Premium feel**: dark background (dark mode), elegant typography (e.g. `Inter` or `Neue Haas Grotesk`), minimal thin-border buttons, smooth transitions.
- Fixed **header** with the company logo and current step indicator.
- Fixed **footer** showing: *"Floor area: X m²"*, current dimensions (L × W × H), and the estimated price updated in real time.
- The right panel changes based on the active step, with transition animations via `framer-motion`.

---

### STEP 1 – Dimensions (Length, Width, Height)

**Right panel UI:**

- Sliders or numeric inputs for:
  - **Length** (total hall length, must be a multiple of the bay span)
  - **Width**
  - **Ridge/eave Height**
- Auto-calculated and displayed:
  - *Number of bays* (Length / bay span)
  - *Floor area / footprint* (Length × Width)

**3D functionality:**

- **"Remove walls"** toggle button – when pressed, the hall walls become invisible (opacity 0 or removed from scene).
- When walls are removed, **visual dimension lines (cotes)** appear in the scene:
  - Distance between 2 consecutive arches (bay span)
  - Hall height
  - Total length
  - Total width
- Dimension lines are rendered as SVG overlay on top of the canvas, or as `<Text>` components from `@react-three/drei`.

---

### STEP 2 – Sandwich Panels & Foundation

**Right panel UI:**

- Toggle: *"Sandwich panels on walls"* – YES / NO
- Toggle: *"Foundation"* – YES / NO
- *(Note: functionality is not yet implemented – these are UI placeholders for future implementation. Mark clearly in code with `// TODO: implement`)*

**3D:**

- In this step, **walls are visible** (regardless of the toggle from Step 1).
- When sandwich panels are enabled (once implemented): walls adopt a different material/texture compared to the bare steel structure.

---

### STEP 3 – Closings (Windows, Doors, Large Industrial Doors)

*(This functionality is already implemented – it is integrated into the new design and flow.)*

**Right panel UI:**

- Add/remove windows, pedestrian doors, large industrial doors.
- Specify dimensions for each closing.
- List of currently added closings.

---

### STEP 4 – Summary & Estimated Price

**Right panel UI:**

- Full configuration summary:
  - Dimensions (L × W × H)
  - Floor footprint
  - Sandwich panels: YES/NO
  - Foundation: YES/NO
  - List of closings with their dimensions
- **Estimated price** calculated based on the formula:

```
Price = (L × W × H × structure_coeff)
      + (num_windows × price_window)
      + (num_doors × price_door)
      + (num_large_doors × price_large_door)
      + (if foundation: L × W × price_foundation_m2)
      + (if sandwich: wall_area × price_sandwich_m2)
```

- All unit prices are configurable from the `/admin` page.

**Configuration link:**

- Upon completion, a **unique token** is generated (e.g. via `nanoid()` or `uuid`) that encodes the full configuration as JSON.
- The configuration is saved in the **backend** associated with the token.
- A URL is generated in the format: `https://domain.com/configuration/[TOKEN]`
- The user can **copy the link** or **send it via email**.

**Email submission:**

- Simple form: Name, Email, Phone + optional message field.
- On submit, an email is sent to the company containing:
  - User contact details
  - Configuration summary
  - The unique link to the saved configuration
- Implementation: **Resend** or **EmailJS** (simple to integrate without a complex backend) or a simple API endpoint.

---

## PART 3 – `/admin` Page

- Route protected by simple authentication (hardcoded username + password initially, then JWT).
- Dashboard with an editable price table:
  - Price per m³ of steel structure
  - Foundation price per m²
  - Sandwich panel price per m²
  - Window price (per unit or per m²)
  - Pedestrian door price
  - Large industrial door price
- Prices saved to the database (see backend architecture below).
- List of all generated configurations (token, date, user contact details, link).

---

## PART 4 – Recommended Backend Architecture

Since the project currently has no backend, the recommended stack is:

### Recommended Stack

- **Next.js 14** (App Router) – for SSR, integrated API Routes, and full R3F compatibility.
- **Prisma ORM** + **PostgreSQL** (e.g. on Supabase – generous free tier) – for storing configurations and prices.
- **NextAuth.js** – for `/admin` page authentication.
- **Resend** – for sending emails (easy to integrate, clean API).
- **nanoid** – for generating configuration tokens.

### Database Schema (Prisma)

```prisma
model Configuration {
  id        String   @id @default(cuid())
  token     String   @unique
  data      Json     // full configuration as JSON
  createdAt DateTime @default(now())
  userEmail String?
  userName  String?
  userPhone String?
}

model Prices {
  id               String   @id @default(cuid())
  structurePerM3   Float
  foundationPerM2  Float
  sandwichPerM2    Float
  windowPerUnit    Float
  doorPerUnit      Float
  bigDoorPerUnit   Float
  updatedAt        DateTime @updatedAt
}
```

### API Routes (Next.js)

- `POST /api/configurations` – saves the configuration, returns the token
- `GET /api/configurations/[token]` – retrieves the configuration by token
- `GET /api/prices` – retrieves current prices
- `PUT /api/prices` – updates prices (admin only)
- `POST /api/send-email` – sends the configuration email

---

## Technical Summary – Required Libraries

```bash
# 3D
@react-three/fiber
@react-three/drei
three

# Animations
framer-motion
framer-motion-3d  # or @react-spring/three for scroll camera

# UI
tailwindcss
@headlessui/react  # for toggles and modals

# Backend / Data
next  # migrate to Next.js
prisma
@prisma/client
next-auth

# Email
resend  # or emailjs-com

# Utils
nanoid
uuid
zod  # form data validation
```