# iOS / PWA Readiness

## Prereqs
- macOS with Xcode
- Node 20+ (`nvm use` from repo root)
- Capacitor CLI (`npx cap ...` is fine)

## Commands (from repo root)
- `npm --prefix apps/web install`
- `npm --prefix apps/web run build`
- `npm --prefix apps/web run ios:init` (first time; creates `ios/`, not committed)
- `npm --prefix apps/web run ios:sync`
- `npm --prefix apps/web run ios:open`

## Notes
- PWA manifest + icons in `apps/web/public/`. Service worker not added yet; add if offline is required.
- Capacitor webDir is `apps/web/.next`; if you move to static export, update `capacitor.config.ts`.
- Do not commit the generated `ios/` directory unless intentionally tracking native changes.
