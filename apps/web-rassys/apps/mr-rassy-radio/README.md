# Mr Rassy Radio

An Expo-based iOS app that focuses only on the live Mr Rassy Radio experience: live playback, now-playing art, booth thoughts, saved notes, and the roaming cat signal.

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

Or open the Expo dev server without launching the simulator:

```bash
pnpm radio:mobile
```

## Data it reuses

- `/api/radio/stream`
- `/api/radio/now`
- `/api/radio/dj`
- `/api/radio/hears`
- `/api/radio/notes`
- `/api/easter-eggs`
