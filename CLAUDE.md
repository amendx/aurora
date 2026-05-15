# CLAUDE.md

## Behavior
- speak caveman: no fluff, no filler, no greet, no apology, no wrap-up
- no explanations unless asked
- max compression, meaning over grammar
- no features beyond what was asked
- touch only what you must
- no comments unless WHY is non-obvious

## Output Format
default:
```
think: <intent>
do: <action>
out: <result>
```
code:
```
need: <goal>
code: <code>
```

## Project: Aurora
React Native (Expo SDK 54), plain JS, no TypeScript. Shift-management app for Brazilian healthcare workers.

### Provider order (App.js)
`ThemeProvider → AuthProvider → ShiftsProvider → GroupsProvider → RootNavigator`

### Data flow
1. `WebClientApiService` → PlantaoAPI (env: `EXPO_PUBLIC_API_*`)
2. `LocalCache` (AsyncStorage) — single persistence layer, keys: `aurora_{type}_{userId}_{monthKey}`
3. `FirebaseAdapter` — shadow-write to Firestore, never blocks reads
4. Contexts: read LocalCache first → refresh from API → update cache

### Navigation
Custom tab navigator at `src/navigation/TabNavigator.js`. Tabs: Home, Calendar, Settings. Sub-screens use `@react-navigation/native-stack`.

### Hard rules
- Durations: **integer minutes** internally. Display as hours only at render time.
- Shift labels: `M` morning, `T` afternoon, `N` night, `D` carryover night.
- Colors: always `useColors()` from `src/constants/DesignSystem.js`. Never hardcode.
- `Colors.money` (#2F9266) = earnings. `Colors.primary` (teal) = nav/interaction. Don't mix.
- Logging: `Logger` from `src/utils/Logger.js`. Never `console.log`.
- Auth tokens → `SecureStore`. Everything else → `LocalCache` (AsyncStorage).
- UI strings: pt-BR only.

### Key files
| path | what |
|------|------|
| `src/constants/DesignSystem.js` | all tokens: colors, spacing, typography, shadows |
| `src/services/WebClientApiService.js` | all PlantaoAPI calls |
| `src/services/LocalCache.js` | persistence + firebase shadow |
| `src/services/firebase/` | auth, firestore, google sign-in |
| `src/utils/MonthSummaryComputer.js` | financial computation |
| `src/utils/ShiftValueCalculator.js` | hourly rates, night diff, overtime |
| `src/models/index.js` | JSDoc typedefs only (no runtime) |

### Roadmap / Goals
Aurora is expanding to a **full platform** (mobile app + web app + docs).

**Web app** (`aurora-web` — not yet started):
- Mirror all mobile features: shifts, groups, calendar, reports
- Role-based: **Doctor** (personal shifts, earnings, calendar) vs **Manager** (team overview, group management, reports, approvals)
- Manager-exclusive: dashboard (KPIs, team utilization, financial summary), shift approval flow, group/person management, export reports
- Shared auth with mobile (Firebase). Same API backend (PlantaoAPI).
- Stack TBD — likely React + same design tokens from DesignSystem.js

**Documentation** (`aurora-docs` — not yet started):
- Full product docs covering mobile app, web app, API integration, auth flows

**Guiding principle**: web and mobile are the same product. Feature parity first, then manager-only extras. Design language must stay consistent.

### Commands
```bash
npx expo start        # dev server
npx expo start --web  # web preview
```
No test suite.
