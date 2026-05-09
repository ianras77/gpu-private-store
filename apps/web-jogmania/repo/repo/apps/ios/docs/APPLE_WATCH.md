# Apple Watch Companion

Jogmania now includes a real native Apple project in the monorepo at `apps/ios/ios/` with:

- `Jogmania`: the iPhone app host for the Expo Router experience.
- `JogmaniaWatch`: the watch app shell embedded in the iPhone target.
- `JogmaniaWatchExtension`: a SwiftUI + HealthKit + CoreLocation watch extension that captures runs and uploads them into the user’s active adventure course.

## What the companion does

- Pulls the signed-in token and iPhone device id from the iPhone app through `WCSession`.
- Loads the user’s parties and adventure courses from the existing FastAPI backend.
- Lets the runner switch the active course from Apple Watch.
- Starts a real `HKWorkoutSession` for outdoor runs.
- Captures GPS points and live metrics on watch.
- Registers the watch as a paired backend device.
- Uploads the workout to `/workouts` with reward and world-event payloads.

## Monorepo commands

From the repo root:

- `pnpm native:apple:bootstrap`
- `pnpm native:apple:bootstrap:force`
- `pnpm native:apple:pods`
- `pnpm typecheck:ios`

From `apps/ios/`:

- `pnpm native:bootstrap`
- `pnpm native:bootstrap:force`
- `pnpm native:pod-install`

## Bring-up on macOS

1. Run `pnpm install` at the repo root.
2. Regenerate the native Apple project with `pnpm native:apple:bootstrap:force`.
3. On a Mac, run `cd apps/ios/ios && pod install`.
4. Open `apps/ios/ios/Jogmania.xcworkspace` in Xcode after pods finish installing.
5. Set your Apple Developer Team for:
   - `Jogmania`
   - `JogmaniaWatch`
   - `JogmaniaWatchExtension`
6. Make the API reachable from a physical iPhone and Apple Watch.
   - Do not leave `JOGMANIA_API_BASE_URL` pointed at `http://127.0.0.1:3178` for device testing.
   - Use a LAN URL such as `http://YOUR-MAC-IP:3178` or a public HTTPS tunnel.
7. Run the iPhone app once, register or log in, and let it finish device registration.
8. Launch the watch companion from Xcode on a paired Apple Watch.
9. Open the watch app and start a run. The workout should upload into the active course and return rewards/world events.

## Important integration note

The watch companion depends on the Expo iPhone app having already stored:

- `jm-token`
- `jm-phone-device-id`

Those values are read natively from Expo Secure Store on iPhone and then handed to the watch via `WCSession`.

## QA fallback

The Expo `Watch Sync` tab still exists for simulated uploads, which is useful for backend QA even when a physical watch is not connected.
