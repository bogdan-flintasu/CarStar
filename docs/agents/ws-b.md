# WS-B status (security & API) — branch ws-b (based on main b737f1d)

## Done: B1, B2, B3, B4, B6 (+ B7). B5 not started (next run; F6 calculatePrice is available).
- B1 `/admin/login` → `POST /api/auth/login` (bcrypt check, 10 tries/15 min/IP) sets httpOnly, SameSite=Strict,
  HMAC-SHA256-signed cookie `carstar_admin_session` (8 h). `POST /api/auth/logout`. `src/proxy.ts` redirects
  `/admin*` to login, returns 401 for `/api/admin/*`; handlers re-check with `requireAdmin()`. No credentials in client bundle.
- B2/B7 `GET /api/admin/configurations?take=1..100&cursor=<id>` → `{ items, nextCursor }`. Legacy `GET /api/configurations`
  is the same guarded handler. `GET /api/configurations/[token]` no longer returns name/email/phone.
- B3 `GET|PUT /api/admin/prices` (zod: finite, 0..1e6, all 6 fields, no extras). Legacy `PUT /api/prices` = same handler.
  Public `GET /api/prices` returns the 6 fields only; seeds from `DEFAULT_PRICES` in `@/lib/pricing` (copy removed).
- B4 send-email: zod (email, lengths), every field HTML-escaped, subject CR/LF stripped, `replyTo` = lead email,
  `configurationLink` must be `${APP_BASE_URL or request origin}/configuration/<12-char token>` for an existing
  token (else 400) and is rebuilt server-side; honeypot field `website`; 5 req/10 min/IP.
- B6 `POST /api/configurations`: `createConfigurationSchema`, 64 KB cap (413), 30 req/10 min/IP.
- Verified: tsc OK, 78/78 tests, build OK, 0 lint problems in B files; curl + browser login/logout on :3002.

## Exported interfaces
- `@/lib/validation` (client-safe): `configurationDataSchema`, `createConfigurationSchema`, `openingSchema`
  (= metric `{id,type,wallId,offsetX,sill,width,height}` | legacy `{...,posX,posY}`), `DIMENSION_LIMITS`,
  `pricesSchema`, `sendEmailSchema`, `HONEYPOT_FIELD`, `escapeHtml`, `loginSchema`, `parseConfigurationLink`.
- `@/lib/validation/body`: `parseJsonBody(req, schema, maxBytes)` (server only).
- `@/lib/auth/guard`: `requireAdmin(req)`, `getAdminSession(req)`; `@/lib/auth/rateLimit`: `createRateLimiter`.

## Decisions
- Signed cookie instead of NextAuth v5 beta (fewer moving parts). `src/proxy.ts`, not `middleware.ts` (Next 16 rename).
- Added dep `bcryptjs` (package.json/lockfile are A's files; one-line change).
- Schemas strip unknown keys (config data) but reject extras on prices/login. Ranges only, no step checks.
- Rate limits are in-memory per process; client IP from first X-Forwarded-For hop (trust only behind a proxy).
- Without APP_BASE_URL the request origin is the allowed link origin; set APP_BASE_URL in production.

## Handoffs
- A (.env.example): `AUTH_SECRET="<openssl rand -base64 48>"` (>= 32 chars), `ADMIN_USERNAME="admin"`,
  `ADMIN_PASSWORD_HASH=\$2b\$12\$...` (bcrypt; in .env escape every `$` as `\$`, Next expands `$VAR`;
  generate: `node -e "console.log(require('bcryptjs').hashSync(process.argv[1],12))" '<password>'`),
  `APP_BASE_URL="https://your-domain"`. `next-auth` is unused and can be removed. seed.ts: import DEFAULT_PRICES from `@/lib/pricing`.
- F (SummaryStep): add a hidden honeypot input `website` (send its value), show 400/429 errors to the user.
- B5 (next run): recompute `estimatedPrice` server-side with `calculatePrice` in POST configurations + send-email.
