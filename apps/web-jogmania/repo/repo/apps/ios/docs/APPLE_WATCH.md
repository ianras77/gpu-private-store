# Apple Watch: The Outdoor Arcade

The native watchOS target in `apps/ios/` is the real run path. Its source includes a course picker, a cached adventure card, live workout/location capture, four distance-triggered story beats, optional haptics, pause/resume/finish controls, a post-run report, a local retry queue for saved workouts, and HealthKit crash recovery. An active run draft is atomically saved in the Watch app's Application Support folder; the HealthKit session is reattached after relaunch, and if HealthKit cannot restore it the runner can save the captured portion as a normal offline postcard. Heart-rate and active-energy collection are opt-in and default off; draft and upload health fields are omitted while consent is off.

**Status:** crash recovery and offline run saving are implemented in source; physical pairing, recovery after forced termination, haptic timing, battery use, and a complete run-to-world-change cycle have not yet been qualified on a device.

## What a runner sees

- Before the run: choose a course, receive a runner-aware mission cartridge from the API/Mastra, and cache it locally.
- During the run: the Watch fires tiny story beats at measured distances. No tap or model request is needed to trigger a beat; haptics follow the saved runner preference.
- During a pause: active time stops accumulating; the runner can resume or finish the run while paused.
- After the run: the Watch shows its mission postcard and uploads the workout. A completed workout can still upload with a selected saved course when GPS points are missing.
- Offline: a previously cached course and cartridge keep the live story moving. Finished workouts wait in the Watch's saved-run queue and can be retried from the Watch.
- After a crash: HealthKit's recovery callback reattaches the live workout session and builder. A separate local draft restores the course, story beats, route trace, active time, and consented health summary; if the HealthKit session is gone, the runner can finish and queue the captured portion instead of losing it.
- On the phone/web: the API validates beat IDs against the saved cartridge, calculates sparks and keepsakes, and records a world light. Mastra writes a grounded recap after the workout is safe.

## Pairing and setup

The Watch uses `WCSession` to receive the signed-in user's API URL, token, phone device ID, courses, and active world from the iPhone app. Open Jogmania on iPhone and sign in before launching the Watch app.

From the monorepo root:

1. Run `pnpm install`.
2. Run `pnpm native:apple:bootstrap:force`.
3. On macOS, run `cd apps/ios/ios && pod install`.
4. Open `apps/ios/ios/Jogmania.xcworkspace` in Xcode and set the Apple Developer Team on all targets.
5. Set the iPhone API base URL to an address reachable from both devices; `127.0.0.1` is not reachable from the Watch.
6. Launch the iPhone app, sign in, then launch the Watch companion on a paired Watch.

The iPhone stores `jm-token` and `jm-phone-device-id` in Secure Store with the `app` keychain service. Native iPhone code shares these with the Watch over WatchConnectivity.

## Offline and retry behavior

The Watch stores the last course context and a course-specific cartridge in local app storage. If preparing a fresh cartridge fails, it uses the cached cartridge, or an authored Lost Arcade cartridge if it has never cached one. Story beats and haptics are local and continue without network access. HealthKit heart-rate and active-energy read permissions are requested only when the runner enables the health-data setting; those values are omitted from uploads while it is off. Workout and location access remain part of recording distance, time, and the route trace.

At finish, the workout payload is queued before upload. A successful API response removes it; a failed response leaves the run queued. Refreshing the companion retries pending runs, and the visible send button provides an explicit retry. Uploads use stable workout timestamps and the API's duplicate handling to avoid awarding the same run twice.

The Watch queue is local to the Watch app installation. It is not an independent HealthKit backup; preserve the paired app data until all pending runs have synced.

## Device qualification checklist

- Confirm the Watch receives the correct course and saved runner preference from a signed-in iPhone.
- With health-data collection off (the default), confirm heart-rate and active-energy permissions are not requested and those samples are omitted; then separately qualify the explicit opt-in flow.
- Pause, resume, and finish while paused; verify active duration excludes paused time and the workout remains uploadable.
- Test a short route, a typical route, and a route longer than its historical median; inspect each live beat and haptic setting.
- Disable network after mission prep, complete a run, restore network, and confirm one workout, one recap, one award, and one world change appear.
- Finish with zero GPS points while a saved course is selected; confirm HealthKit distance/time and the run upload, and confirm the map correctly has no trace.
- Interrupt the upload, relaunch Watch and iPhone, retry, and confirm no duplicate rewards/events.
- Force-quit or crash the Watch app during a run, relaunch it, and confirm HealthKit recovery reattaches; separately deny recovery and confirm the local draft can still be saved without inflating paused time.
- Confirm VoiceOver, large text, glanceability, battery use, route permission messaging, and haptics are suitable for an actual run.

The Expo `Watch Sync` panel remains a QA/import helper and is not the native Watch gameplay screen.
