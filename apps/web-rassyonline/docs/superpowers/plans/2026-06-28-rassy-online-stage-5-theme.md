# Stage 5 Plan - Magical Theme Loop

## Goal

Add a polished customization loop so Rassy Online feels distinct from a default chat clone: users can change the interface atmosphere directly, and chat prompts can ask the site to shift visual themes.

## Scope

- Client-side theme presets in this stage.
- Visible theme selector in the workbench.
- Natural-language theme intent detection for prompts such as "make the site look ember".
- Local persistence so anonymous and signed-in users keep the last selected look in the browser.
- Keep the layout stable on desktop and mobile.

## Implementation Loop

1. Add tests for theme intent parsing.
2. Add theme metadata and parser helpers.
3. Wire theme state into the chat workbench and document root.
4. Add theme controls and prompt-triggered theme switching.
5. Add CSS variables for multiple magical palettes without turning the UI into a one-hue wash.
6. Verify with tests, TypeScript, build, compose, screenshots, and Runtipi validators.

## Acceptance

- A user can switch themes with controls.
- A prompt can switch themes before sending.
- Theme choice survives refresh in local storage.
- The page remains readable and non-overlapping.
- All existing chat, auth, and document behavior remains intact.
