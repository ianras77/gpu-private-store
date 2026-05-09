# Brand Playbook

## Add a New Brand
1. Add a config to `packages/brands/src/brands.ts`.
   - Include `id`, `name`, `domain`, `toneKeywords`, `tabooList`, `tokens`, and `focusModules`.
   - Point `assets` to new placeholders in `packages/brands/assets/<brand>`.
2. Add assets in `packages/brands/assets/<brand>`.
   - `icon.png`, `splash.png`, `og.png`.
3. Create a web app:
   - Copy one of `apps/web-*` and update the `brand` import.
   - Adjust `package.json` name and any copy.
4. Update Expo build scripts:
   - Add a new `ios:<brand>` script in `apps/mobile/package.json`.
   - Build with `APP_BRAND=<brand>`.
5. Update Playwright config if you want a smoke test project for the brand.

## Tokens & Voice
- Keep the accent color bold and singular.
- Use short tone keywords that can be embedded into prompts.
- Taboo list should include phrases the model should avoid.

## Lens Modules
- Each module should map to a distinct UI callout or card.
- Use short titles that can stand alone in the UI.
- Provide a promptKey for prompt engineering extensions.
