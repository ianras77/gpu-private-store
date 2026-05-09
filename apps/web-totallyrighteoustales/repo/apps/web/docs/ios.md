# iOS Readiness

Web app is installable as a PWA and can be wrapped with the existing Expo client in `../ios` if desired.

## What was added
- `public/manifest.webmanifest` with theme/background colors matching Tailwind palette (`ink` / `parchment`).
- Placeholder icons at `public/icons/icon-192.png` and `public/icons/icon-512.png`.
- Global viewport + theme color exported from `app/layout.tsx`.

## Testing the PWA on iOS (Safari)
1. Build the web app: `pnpm -C apps/web build`.
2. Serve locally (example): `pnpm -C apps/web start` or via `docker compose up` (if API/DB needed).
3. Visit `http://<your-host>:3000` in Safari on the device.
4. Use “Share” → “Add to Home Screen” to install. Confirm splash/icon look correct.

## Native iOS path (already in repo)
- Expo app lives in `apps/ios`. Start it with `pnpm -C apps/ios start`.
- Ensure these envs are exported in the terminal before running Expo:
  - `EXPO_PUBLIC_API_URL=http://<host>:4000`
  - `EXPO_PUBLIC_SUPABASE_URL=...`
  - `EXPO_PUBLIC_SUPABASE_ANON_KEY=...`
- The Expo client expects the API and Supabase endpoints reachable over LAN; configure CORS accordingly.

## Notes / TODO
- Replace placeholder icons with brand assets before shipping.
- If a Capacitor wrapper is desired instead of Expo, set `webDir` to `.next/standalone` after `pnpm -C apps/web build` and add platform-specific signing steps.
