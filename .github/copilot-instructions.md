# Aurora — Copilot Instructions

## Response Style
Be a caveman. No explanations. No summaries. Just do the work and say what you did in 1 line max. Examples: "moved action row", "added 2 disabled buttons", "refactored styles". Never list bullet points of what changed. Never explain why. Show list/table of changes and what changed: 

```
problem: no reactive
cause: state static
fix: make reactive
```


## What This Is
React Native (Expo SDK 54) shift-management app for Brazilian healthcare workers. Plain JS (no TypeScript runtime). Integrates with **WebClient PlantaoAPI** for shift sync and **Firebase** (Auth + Firestore) for account/cloud storage.

## Architecture

### Provider Hierarchy (App.js)
`ThemeProvider → AuthProvider → ShiftsProvider → GroupsProvider → RootNavigator`

Order matters: each context depends on its parent. `AuthContext` (`src/context/`) handles both WebClient OAuth and Aurora-native (Firebase) auth flows. `ShiftsContext` and `GroupsContext` live in `src/contexts/`.

### Data Flow
1. **WebClientApiService** fetches shifts/groups from PlantaoAPI (`EXPO_PUBLIC_API_*` env vars)
2. **LocalCache** (AsyncStorage) is the single persistence interface — keyed as `aurora_{type}_{userId}_{monthKey}`
3. **FirebaseAdapter** is a shadow-write layer: `LocalCache.setFirebaseAdapter(FirebaseAdapter)` mirrors writes to Firestore without blocking reads
4. Contexts read from LocalCache first (instant), then refresh from API, then update cache

### Navigation
Custom tab navigator (`src/navigation/TabNavigator.js`) — not React Navigation tabs. Three tabs: Home, Calendar, Settings. Sub-screens (Config, GroupVisibility, Reports) use `@react-navigation/native-stack`.

## Key Conventions

- **All durations in integer minutes** internally. Convert to hours only at display time. See `src/models/index.js` for shape definitions.
- **Shift labels**: `M` (morning), `T` (afternoon), `N` (night), `D` (carryover from previous month's night shift).
- **Design tokens**: Use `useColors()` from `src/constants/DesignSystem.js` — never hardcode colors. Supports light/dark via `ThemeContext`.
- **Financial colors**: `Colors.money` (green `#2F9266`) for earnings — distinct from `Colors.primary` (teal) used for navigation/interaction.
- **Logging**: Use `Logger` from `src/utils/Logger.js` — never `console.log`.
- **Secure vs Async storage**: `SecureStore` for auth tokens only. `AsyncStorage` (via LocalCache) for everything else.
- **Portuguese UI**: All user-facing strings are in pt-BR.

## Commands
```bash
npm install          # install deps
npx expo start       # dev server (or use VS Code task "Start Expo Development Server")
npx expo start --web # web preview
```
No test suite currently configured.

## File Organization
- `src/services/firebase/` — Firebase Auth, Firestore adapter, Google Sign-In, signup/login flows
- `src/services/WebClientApiService.js` — all PlantaoAPI HTTP calls (login, shifts, groups, persons)
- `src/services/LocalCache.js` — centralized persistence with Firebase shadow-write support
- `src/utils/MonthSummaryComputer.js`, `ShiftValueCalculator.js` — financial computation (hourly rates, night differential, overtime)
- `src/models/index.js` — JSDoc typedefs for Shift, MonthSummary, Group, Person (no runtime code)
- `src/constants/DesignSystem.js` — all design tokens, spacing, typography, color palette

## Env Vars (in `.env` or app config)
`EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_API_ORIGIN`, `EXPO_PUBLIC_API_REFERER`, `EXPO_PUBLIC_API_USER_AGENT` — configure WebClient API endpoint.
