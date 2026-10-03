# Mr Rassy Radio

An Expo app for iOS and Android that focuses on the Mr Rassy Radio experience: live playback, now-playing art, booth thoughts, saved notes, library browsing, story listening, and the roaming cat signal. It reuses the website's public radio APIs, so the website and mobile app share the same station and catalogue.

## Run

1. Install workspace dependencies from the monorepo root:

```bash
pnpm install
```

2. Point the app at the live site if you do not want the default public domain:

```bash
EXPO_PUBLIC_RASSY_SITE_URL=https://rassys.com
```

3. Start the iOS app from the monorepo root:

```bash
pnpm radio:ios
```

Start the Android app with `pnpm radio:android` when an Android emulator or device is connected.

Or open the Expo dev server without launching the simulator:

```bash
pnpm radio:mobile
```

The app can also be opened with Expo Go while developing. Production store builds need the normal Apple and Google developer accounts and signing credentials.

EAS Build profiles are provided for an internal Android APK and production iOS/Android builds. After installing the EAS CLI and signing in, run `eas build --platform android --profile preview` for an installable test build or `eas build --platform all --profile production` for store builds.

## Data it reuses

- `/api/radio/stream`
- `/api/radio/now`
- `/api/radio/dj`
- `/api/radio/hears`
- `/api/radio/notes`
- `/api/easter-eggs`
