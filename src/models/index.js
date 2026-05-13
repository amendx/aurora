/**
 * Aurora — Internal Normalized Data Models
 *
 * These are shape definitions only. No runtime logic here.
 * All persistence goes through LocalCache. Firebase is a drop-in swap for LocalCache later.
 *
 * Key design choices:
 *  - All durations stored in INTEGER MINUTES. Never float hours mid-calculation.
 *  - All group colors normalized with "#" prefix.
 *  - coworkerIds[] in Shift — persons resolved separately from persons cache.
 *  - MonthSummary includes a financialConfigSnapshot for reproducible historical reports.
 */

/**
 * @typedef {Object} Shift
 * Normalized shift as stored internally. Derived from PlantaoAPI daily API response.
 *
 * @property {string}  id                       - Shift ID from API
 * @property {number}  userId                   - Owner user ID
 * @property {string}  date                     - "YYYY-MM-DD"
 * @property {string}  monthKey                 - "YYYY-MM" — primary partition key
 * @property {'M'|'T'|'N'|'D'} label           - Normalized: M=morning, T=afternoon, N=night, D=carryover
 * @property {string}  rawLabel                 - Original API field (label/type/shift_type)
 * @property {string}  startTime               - "HH:mm" (24h)
 * @property {string}  endTime                 - "HH:mm" (24h)
 * @property {number}  durationMinutes         - Full shift duration in integer minutes
 * @property {boolean} crossesMidnight         - true when endTime < startTime
 * @property {boolean} [carryover]             - true for D-label derived shifts from prev month
 * @property {{ minutesThisMonth: number, minutesNextMonth: number }|null} splitHours
 *   - Non-null only for night shifts on last day of month and carryover D shifts.
 *   - Use splitHours.minutesThisMonth for all calculations within this month.
 * @property {{ id: number, name: string, color: string, institutionId: number|null, institutionName: string|null }} group
 * @property {number[]} coworkerIds            - Person IDs; resolve from persons cache
 * @property {string}  syncedAt               - ISO timestamp of hydration
 */

/**
 * @typedef {Object} TimeEntry
 * Replaces the old `real_hours_{YYYY-MM-DD}` SecureStore keys.
 * One record per shift per day (keyed by shiftId in LocalCache).
 *
 * @property {string} shiftId
 * @property {number} userId
 * @property {string} date                  - "YYYY-MM-DD"
 * @property {string} monthKey              - "YYYY-MM"
 * @property {string} scheduledStart       - From shift startTime
 * @property {string} scheduledEnd         - From shift endTime
 * @property {string} actualStart          - User-entered "HH:mm"
 * @property {string} actualEnd            - User-entered "HH:mm"
 * @property {number} actualDurationMinutes - Integer, computed on save
 * @property {string} editedAt             - ISO timestamp
 */

/**
 * @typedef {Object} MonthSummary
 * Materialized totals for a user's month. Recomputed whenever isDirty=true.
 * Stored separately from shifts so reads are O(1) for the report screen.
 *
 * @property {number}  userId
 * @property {string}  monthKey
 * @property {number}  totalScheduledMinutes
 * @property {number}  totalActualMinutes
 * @property {number}  totalGrossValue          - Base pay (before bonuses), in BRL
 * @property {number}  totalBonusValue          - General bonus total, in BRL
 * @property {number}  totalLoyaltyValue        - Loyalty bonus total, in BRL
 * @property {number}  shiftCount
 * @property {number}  weekdayDayMinutes
 * @property {number}  weekdayNightMinutes
 * @property {number}  weekendDayMinutes
 * @property {number}  weekendNightMinutes
 * @property {number}  fridayNightMinutes       - Separate bucket when fridayNightAsWeekend=true
 * @property {number}  configVersion            - Financial config version used for this summary
 * @property {FinancialConfig} financialConfigSnapshot - Frozen copy of config at compute time
 * @property {string}  generatedAt             - ISO timestamp
 * @property {boolean} isDirty                 - true = shifts or config changed, needs recompute
 */

/**
 * @typedef {Object} FinancialConfig
 * Persisted per user, versioned. effectiveFrom marks which month this config was set.
 * Past summaries keep their snapshot and are not retroactively changed.
 *
 * @property {number}  userId
 * @property {number}  version               - Increment on every save
 * @property {string}  effectiveFrom         - "YYYY-MM"
 * @property {{ weekday: { day: number, night: number }, weekend: { day: number, night: number } }} hourValues
 * @property {boolean} loyaltyEnabled
 * @property {Array<{ minHours: number, percentage: number, active: boolean }>} loyaltyOptions
 * @property {boolean} bonusEnabled
 * @property {{ percentage: number, startMonth: string, endMonth: string }} bonus
 *   - startMonth / endMonth as "YYYY-MM" (migration converts legacy numeric month)
 * @property {boolean} fridayNightAsWeekend
 * @property {string}  updatedAt            - ISO timestamp
 */

/**
 * @typedef {Object} Group
 * Cached group. Refreshed lazily on GroupsScreen open.
 * memberIds[] is populated after full member pagination is complete.
 *
 * @property {number}   id
 * @property {string}   name
 * @property {string}   color               - Always with "#" prefix
 * @property {number|null} institutionId
 * @property {string|null} institutionName
 * @property {boolean}  is_personal
 * @property {boolean}  is_admin
 * @property {boolean}  has_workingtime
 * @property {boolean}  has_amount
 * @property {number}   total_users
 * @property {number[]} memberIds           - Full list (after pagination)
 * @property {string}   syncedAt
 */

/**
 * @typedef {Object} Person
 * Lightweight person record for coworker display. Shared across shifts.
 * Stored in a flat per-user persons cache — not embedded in each shift.
 *
 * @property {number}      id
 * @property {string}      name
 * @property {string|null} photo
 * @property {string}      role
 * @property {string}      council
 * @property {string|null} institution - Denormalized institution name for quick display
 */

// ═══════════════════════════════════════════════════════════════════════════════
// PlantaoAPI API response shapes (documented from real payloads)
// These are READ-ONLY shapes — not stored internally as-is, but used as the
// source for normalization into the internal models above.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} ApiUser
 * Person object as returned by PlantaoAPI API.
 * Appears in: shift.user, shift.coworkers[], dynamic_schedule.shifts[].user,
 *             vacancy.coworkers[], group members, etc.
 *
 * IMPORTANT: shift.coworkers[] does NOT include the shift owner (shift.user).
 *            vacancy.coworkers[] DOES include the shift owner.
 *            dynamic_schedule[].shifts[].user includes ALL people including the current user.
 *
 * @property {string}      id           - String ID (e.g. "OV8BOzQo_JD-")
 * @property {string|null} username
 * @property {string}      name         - Short/display name
 * @property {string}      full_name
 * @property {string|null} photo        - S3 URL or null
 * @property {string}      description  - e.g. "Médico / Pediatria"
 * @property {string}      council      - e.g. "21684 / CE"
 * @property {string}      role         - "member" | "admin" etc.
 * @property {number}      status
 * @property {boolean}     is_premium
 */

/**
 * @typedef {Object} ApiVacancy
 * Vacancy object embedded in user daily calendar items.
 * Source: GET /users/calendar/daily/{date} → items[].vacancy
 *
 * @property {string}    id
 * @property {string}    date        - "Terça-Feira, 17 de Março"
 * @property {string}    time        - "07h00 - 13h00 (M)"
 * @property {boolean}   is_past
 * @property {string}    label       - "M" | "T" | "N"
 * @property {number}    available   - open slots still available
 * @property {number}    total       - total slots in this vacancy posting
 * @property {ApiUser[]} coworkers   - people who filled this vacancy (INCLUDES current user)
 * @property {string}    created_at
 */

/**
 * @typedef {Object} ApiUserDailyShift
 * One item from GET /users/calendar/daily/{YYYY-MM-DD} → data.items[].
 * Represents the current user's own shift assignment.
 *
 * KEY PROPERTY SEMANTICS:
 *   user        → always the current (authenticated) user who owns this shift
 *   coworkers[] → other people in the same slot; does NOT include current user
 *   vacancy     → if non-null, this slot had/has open positions; vacancy.coworkers
 *                 lists who filled them (may include current user — must filter)
 *
 * @property {string}           id
 * @property {boolean}          is_personal
 * @property {string}           date         - "Terça-Feira, 17 de Março"
 * @property {string}           schedule     - "YYYY-MM"
 * @property {string}           time         - "07h00 - 13h00 (M)"
 * @property {boolean}          is_past
 * @property {'M'|'T'|'N'|'D'} label
 * @property {ApiVacancy|null}  vacancy
 * @property {ApiUser[]}        coworkers    - same-slot colleagues (excludes current user)
 * @property {string}           start_date   - "YYYY-MM-DD HH:mm:ss"
 * @property {string}           end_date     - "YYYY-MM-DD HH:mm:ss"
 * @property {ApiUser}          user         - the authenticated user (shift owner)
 * @property {{ id: string, name: string, institution: { id: string, name: string }, color: string }} group
 */

/**
 * @typedef {Object} ApiShiftDetail
 * Response from GET /groups/{groupId}/shifts/{shiftId} → data.
 * Represents a specific shift slot within a group.
 *
 * KEY PROPERTY SEMANTICS:
 *   user        → the person who "owns" this shift record (may be the current user)
 *   coworkers[] → other assigned people (excludes data.user)
 *   shifts[]    → all assigned people including data.user (use shifts[].user)
 *
 * @property {string}           id
 * @property {'M'|'T'|'N'|'D'} label
 * @property {string}           date         - "Sexta-Feira, 17 de Abril"
 * @property {string}           time         - "13h00 - 19h00 (T)"
 * @property {boolean}          is_past
 * @property {ApiUser|null}     vacancy
 * @property {ApiUser[]}        coworkers    - colleagues (excludes data.user)
 * @property {Array<{ id: string, user: ApiUser, transaction: any }>} shifts - all people including owner
 * @property {string}           start_date   - "YYYY-MM-DD HH:mm:ss"
 * @property {string}           end_date     - "YYYY-MM-DD HH:mm:ss"
 * @property {ApiUser}          user         - the shift owner
 * @property {{ id: string, name: string, institution: { id: string, name: string }, color: string }} group
 */

/**
 * @typedef {Object} ApiDynamicScheduleSlot
 * One entry in dynamic_schedule[] from GET /groups/{groupId}/calendar/daily/{date} → data.dynamic_schedule[].
 *
 * KEY PROPERTY SEMANTICS:
 *   label       → FULL string like "T - 13h00 às 19h00", NOT a single letter.
 *                 To match against internal shift.label ("T"), compare charAt(0).
 *   vacancy     → non-null when there are open positions in this slot.
 *                 vacancy.slots = number of OPEN/AVAILABLE positions remaining.
 *                 (total = shifts.length + vacancy.slots)
 *   shifts[]    → ALL people assigned to this slot including the current user.
 *                 Always exclude current user by checking user.id !== selfId.
 *   from_vacancy → true when a shift entry was filled via a vacancy posting
 *
 * @property {string} label   - e.g. "T - 13h00 às 19h00"
 * @property {{ id: string, slots: number }|null} vacancy
 * @property {Array<{
 *   id: string,
 *   user: ApiUser,
 *   transaction: any,
 *   from_vacancy: boolean,
 *   start_date: string,
 *   viewed: boolean
 * }>} shifts
 */

/**
 * @typedef {Object} ApiGroupDailyCalendar
 * Response from GET /groups/{groupId}/calendar/daily/{YYYY-MM-DD} → data.
 *
 * Use ONLY dynamic_schedule — ignore fixed_schedule.
 * fixed_schedule = original planned schedule (may differ from actual).
 * dynamic_schedule = actual current state, including swaps and vacancy fills.
 *
 * Vacancy semantics (confirmed from real payloads 2026-04-18, 2026-04-20):
 *   dynamic_schedule[i].vacancy = null  → slot is fully filled (no open spots)
 *   dynamic_schedule[i].vacancy = { id, slots: N } → N positions still open
 *   Even if the current user IS assigned (appears in shifts[]), vacancy can still be non-null.
 *   total_slots = shifts[].length + vacancy.slots
 *
 * fixed_schedule[i].vacancy.slots = originally planned number of vacancy positions.
 * These differ from dynamic_schedule vacancy (which reflects current fill state).
 *
 * @property {string}  id
 * @property {string}  name
 * @property {{ id: string, name: string }} institution
 * @property {string}  color
 * @property {ApiDynamicScheduleSlot[]} dynamic_schedule  ← USE THIS
 * @property {any[]}   fixed_schedule                     ← IGNORE
 *
 * LocalCache key: aurora_grpdaily_{groupId}_{YYYY-MM-DD}
 * TTL: 30 min for today, no expiry for past dates.
 * Stored shape: { dynamic_schedule: ApiDynamicScheduleSlot[], fetchedAt: ISO }
 */

export default {};
