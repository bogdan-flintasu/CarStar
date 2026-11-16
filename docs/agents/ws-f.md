# WS-F status (UI, state & pricing) — branch ws-f

## Part 1 done: F1, F2, F6, F7, F8 (+ lint fixes in my files)
- **F6 DONE.** `src/lib/pricing.ts` (pure, Vitest in `pricing.test.ts`). B5 can use it now:
  - `calculatePrice(params: PriceParams, openings: OpeningsInput, prices: Prices = DEFAULT_PRICES): number`
  - `PriceParams = { length, width, height: number; showFoundation, hasSandwichPanels: boolean }`
  - `OpeningsInput = {windows, doors, garageDoors: number} | ReadonlyArray<{type: string}>` (`'window'|'door'|'garageDoor'`)
  - also exports `DEFAULT_PRICES` (single source), `Prices`, `OpeningCounts`, `countOpenings()`.
  - Formula unchanged: L*W*H*structure + foundation*L*W + sandwich*wallArea + openings per unit; rounded to EUR.
- F1/F2: `DimensionsStep` uses a `DimensionField` (local draft string, commit on blur/Enter, clamp + inline Romanian notice).
- F7/F8: layout uses selectors + `useShallow` (openings reduced to counts); Panels/Summary/Footer use selectors.
  `ConfiguratorEngine.tsx` (D) still calls `useConfiguratorStore()` without selector: D should switch to selectors.
- Lint: fixed page.tsx, configuration/[token]/page.tsx, ConfiguratorLayout.tsx (useSyncExternalStore instead of
  setState-in-effect; `Link`; unused `loading` removed). Remaining lint errors are in D/E-owned files.
- Store keeps its API (`getEstimatedPrice`, `DEFAULT_PRICES` re-export) and delegates to `calculatePrice`.

## Decisions
- F2 business question: should length be free (any integer m) or on the 6 m bay grid? Default: input and slider
  both snap to the 6 m grid (12..102); typing 15 becomes 18 with a notice. Revisit when D supports free lengths
  (change `step` in DimensionsStep and `getNumberOfBays`).

## Open pricing questions for the business (formula untouched)
1. Should roof area and gable (fronton) area be priced (sandwich panels today: walls only)?
2. Insulation thickness tiers (30/50/80 mm?) are ignored today; should they change the €/m²?
3. Should window/door prices scale with opening size?
4. Is structure priced by volume (€/m³) intentionally, or by floor area / steel weight?
5. VAT included? Rounding to EUR vs 10 EUR?

## Handoffs
- B (api) and A (seed): import `DEFAULT_PRICES` from `@/lib/pricing` (still duplicated in api/prices/route.ts, prisma/seed.ts).
- B5: call `calculatePrice` server-side; pass `openingsList` as the openings argument.
- D: ConfiguratorEngine selectors (F8), and F3 will need `effectiveWallsVisible` removed there (part 2).
- E: ClosingsStep still calls `useConfiguratorStore()` unselected and counts openings itself (could use `countOpenings`).

## Part 2 (not started): F3, F4, F5, F9, F10, F11-F13
