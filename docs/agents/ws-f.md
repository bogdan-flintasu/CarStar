# WS-F status (UI, state & pricing) — branch ws-f2

## Part 1 done: F1, F2, F6, F7, F8
- `src/lib/pricing.ts` pure `calculatePrice(params, openings, prices)`, `DEFAULT_PRICES`, `countOpenings` (tests in pricing.test.ts).

## Part 2 done: F3, F4, F5, F9, F10, F11 (partly), F13; F12 not verified
- F3: `wallsToggle` = user choice, `wallsVisible` derived (`step !== 1 || toggle`), recomputed in setStep/next/prev/toggle/merge.
  Engine/useOpeningsLayout keep reading `wallsVisible` unchanged.
- F4: persist has `partialize` (dims, wallsToggle, options only), `version: 1`, `migrate` (drops prices/step/wallsVisible).
- F5: token page validates with B's `configurationDataSchema`, then `resetConfigurator()` + `resetOpenings()`, applies data, `requestHallFraming()`.
- F9: store flag `hallReady` / `setHallReady`; loader hides on it (or on useProgress done). NOT yet set by the 3D scene.
- F10: `skipHydration` + `persist.rehydrate()` in an effect; shell now renders on the server.
- F11: `src/lib/i18n/ro.ts` (`wallLabelRo`) created; ClosingsStep (E) still has inline replace chains.
- F13: `getNumberOfBays` now `ceil(L/6)` like the engine.
- F12: bottom sheet not checked (no browser this run).
- Handoffs: reset reframes camera; "Continuă" disabled with a Romanian message while openings overlap; contact form
  sends honeypot `website` and shows 400/429 messages; length slider/input free over HALL_LIMITS (step 1);
  footer label now "Preț estimativ" (server recomputes, client value is an estimate). 7 lint warnings fixed (0 left).

## Needs other owners
- D: call `useConfiguratorStore.getState().setHallReady(true)` after the first rendered frame (and false on unmount).
- E: ClosingsStep use `wallLabelRo`; B: /api/send-email must read `website` (honeypot) and reject/ignore if non-empty.

## Open business questions
1. Price: should roof/gable area be priced? insulation tiers (30/50/80 mm) change €/m²?
2. Window/door prices scale with size? Structure by volume (€/m³) intentional?
3. VAT included? Round to EUR or 10 EUR?
4. Length: free (any metre) now; confirm the business accepts non-6 m bays.
