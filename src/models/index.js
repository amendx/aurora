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
 *
 * ─── GLOSSÁRIO DE MOVIMENTAÇÕES ────────────────────────────────────────────────
 *
 * Vocabulário central pra todo "tirar/dar plantão". Use estes termos no código,
 * UI e notificações pra não inventar variantes.
 *
 *   • Cessão ao grupo     — doação 1:n. Médico libera o plantão pra qualquer
 *                           membro do grupo pegar. Sem retorno. Coleção:
 *                           openings/{id} com kind='cede', targetUserId=null.
 *
 *   • Cessão direcionada  — doação 1:1. Médico oferece o plantão direto pra
 *                           um colega X. X aceita ou recusa. Sem retorno.
 *                           Coleção: shiftOffers/{id}.
 *
 *   • Troca direcionada   — 1:1 bidirecional. A propõe trocar shiftA por
 *                           shiftB de B. Só fecha quando B aceita.
 *                           Coleção: shiftSwaps/{id}.
 *
 *   • Intenção de troca   — "quero trocar este plantão por M/T no FDS". Sem
 *                           lances. Colegas com plantão compatível veem e
 *                           iniciam uma troca direcionada normal. Coleção:
 *                           tradeIntents/{id}. (Substitui swapAuctions.)
 *
 *   • Vaga admin temp     — vaga avulsa criada pelo coordenador. Pode ser
 *                           ao grupo OU direcionada. Coleção: openings/{id}
 *                           com kind='admin_temp'.
 *
 *   • Vaga admin fixa     — slot de escala fixa recorrente criada pelo coord
 *                           ("todo sábado N por 3 meses"). Gera N shifts. Pode
 *                           ser direcionada ou ao grupo. openings/{id} com
 *                           kind='admin_fixed' + recurrenceId.
 *
 *   • Substituição de     — coord muda escalistaUserId de uma escala fixa
 *     escalista             existente (ex: caco saiu, raquel virou fixa).
 *
 *   • Escalista           — dono original da escala fixa (`shift.escalistaUserId`).
 *                           NÃO muda em cessão/troca de plantão fixo. Só muda
 *                           via "substituição de escalista" pelo coord.
 *
 *   • Efetivo             — quem está cumprindo o plantão (`shift.currentHolderUserId`,
 *                           == userId do doc). MUDA em cessão/troca. Em plantão
 *                           NÃO-fixo: igual ao escalista (são a mesma pessoa).
 *
 *   • Doctor              — role default. Cede/troca seus plantões.
 *   • Coordenador         — médico com role 'coordinator' num grupo. Cria/edita
 *                           grupos, cria escalas fixas + vagas temp no grupo,
 *                           substitui escalistas.
 *   • Manager             — não-médico. Role 'manager' num hospital (institution).
 *                           Cria hospitais, vincula médicos, financeiro. SÓ atua
 *                           via web app — Aurora app ignora a flag.
 */

/**
 * @typedef {Object} Shift
 * Normalized shift as stored internally. Derived from PlantaoAPI daily API response
 * OR criado/recebido via fluxos aurora (criação manual, cessão, troca, vaga admin).
 *
 * @property {string}  id                       - Shift ID
 * @property {string|number} userId             - Owner = currentHolderUserId (path do doc)
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
 * @property {{ id: number|string, name: string, color: string, institutionId: number|string|null, institutionName: string|null }} group
 * @property {Array<number|string>} coworkerIds - Person IDs; resolve from persons cache
 * @property {string}  syncedAt               - ISO timestamp of hydration
 *
 * ── Movimentações (extensões — ver Glossário) ──
 *
 * @property {boolean} [isFixedSchedule]       - true = shift faz parte de uma escala
 *                                                 fixa recorrente (todo X de Y).
 *                                                 CRIADO APENAS pelo coordenador via
 *                                                 aurora-web. Médico não tem flag de
 *                                                 escala fixa em AddManualShiftModal.
 * @property {string|null} [escalistaUserId]   - Dono fixo da escala. Quando
 *                                                 isFixedSchedule===true: NÃO muda em
 *                                                 cessão/troca; só muda via "substituição
 *                                                 de escalista" (coord). Quando NÃO fixo:
 *                                                 igual ao currentHolderUserId (mesma pessoa).
 *                                                 null em shifts legados sem backfill.
 * @property {string|number} [currentHolderUserId] - Quem cumpre. == userId do doc.
 *                                                 Atualizado em toda cessão/troca.
 *                                                 Em shift não-fixo: igual ao escalistaUserId.
 * @property {string|null} [recurrenceId]      - Liga shifts da mesma escala fixa
 *                                                 recorrente. Só em isFixedSchedule.
 * @property {string|null} [originUserId]      - Recebido via cessão/troca: uid da origem.
 * @property {string|null} [originUserName]    - Nome da origem (display).
 * @property {boolean} [isFixedSchedule_origin] - O shift original (antes de transferência)
 *                                                 era de escala fixa? Mostra "Origem: fixa".
 * @property {'aurora'|'webClient'|'received'|'aurora_opening'} [source] - Origem do shift.
 * @property {boolean} [isManual]              - Criado manualmente pelo médico via
 *                                                 AddManualShiftModal. Tracking pessoal,
 *                                                 fora de escala/grupo formal.
 *                                                 NÃO é cedível nem trocável — gate em
 *                                                 ShiftBottomSheet bloqueia botões.
 * @property {string|null} [originalShiftId]   - ID do shift original antes de transfer.
 * @property {string|null} [transferredAt]     - ISO de quando foi transferido.
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
 * @property {Object<string, { autoFromHours?: boolean, loyaltyOptions?: Array, manualPercentage?: number }>} [institutionLoyalty]
 *   Per-hospital loyalty config (keyed by institution id). Pre-existing slot.
 * @property {Object<string, { percentage: number, minHours: number, hoursWorked?: number, earnedAt?: string }>} [currentInstitutionLoyalty]
 *   Per-hospital earned loyalty tier resolved at API-load time, keyed by institution id.
 * @property {Object<string, {
 *   hourValues?: { weekday: { day: number, night: number }, weekend: { day: number, night: number } },
 *   bonusEnabled?: boolean,
 *   bonus?: { percentage: number, startMonth: string|number, endMonth: string|number },
 *   fridayNightAsWeekend?: boolean
 * }>} [institutionConfig]
 *   Per-hospital overrides of the four global financial pieces (hour values,
 *   bonus, friday-night-as-weekend rule). Field-level fallback: any field
 *   absent on the institution uses the global value. Resolved by
 *   src/utils/HospitalConfigResolver.js.
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

/**
 * @typedef {Object} Opening
 * Unified model for a claimable shift slot. Cobre 3 tipos via `kind`:
 *   - 'cede'        → cessão ao grupo (médico cedeu seu plantão)
 *   - 'admin_temp'  → vaga avulsa criada por coordenador
 *   - 'admin_fixed' → slot de escala fixa pendente (sem efetivo definido)
 *
 * @property {string}           id
 * @property {'aurora'|'webClient'} source
 * @property {'cede'|'admin_temp'|'admin_fixed'} [kind] - Default 'cede' pra legados.
 * @property {'active'|'claimed'|'cancelled'|'expired'} status
 * @property {string}           startISO
 * @property {string|null}      endISO
 * @property {string}           dateKey       - "YYYY-MM-DD"
 * @property {string}           monthKey      - "YYYY-MM"
 * @property {string}           label         - M | T | N | D | REF | APO | custom
 * @property {number}           durationMinutes
 * @property {number}           totalSlots
 * @property {number}           availableSlots
 * @property {{ id: string, name: string, color: string, institution: { id: number, name: string, city: string, uf: string } }} group
 * @property {{ id: string, name: string, photo: string|null, description: string, council: string }[]} coworkers
 * @property {number|null}      estimatedValue
 * @property {boolean}          claimable
 * @property {string|null}      claimedByUserId
 * @property {string|null}      schedulePublicId
 * @property {string|null}      webClientTransactionId
 * @property {string}           createdAt
 * @property {string|null}      createdBy
 * @property {'doctor'|'coordinator'} [createdByRole] - Quem criou. Default 'doctor' em legados.
 * @property {string|null}      [targetUserId]        - Se setado: vaga direcionada a esse uid.
 *                                                       null = aberta ao grupo.
 * @property {string|null}      [recurrenceId]        - Liga vagas da mesma escala fixa (kind='admin_fixed').
 * @property {string|null}      [restrictedToGroupId] - Só membros desse grupo veem/pegam.
 * @property {string|null}      [originShiftId]       - Back-ref ao shift original (kind='cede').
 * @property {string|null}      [originUserId]        - Médico que cedeu (kind='cede').
 * @property {string|null}      [originUserName]
 * @property {Object|null}      [originShiftSnapshot] - Snapshot completo do shift origem.
 */

/**
 * @typedef {Object} TradeIntent
 * Intenção de troca aberta — substitui o leilão (swapAuctions). Sem lances:
 * publico "quero trocar este plantão por preferências X", colegas com plantão
 * compatível veem a intent e iniciam uma troca direcionada normal apontando
 * pra mim. Firestore: tradeIntents/{intentId}.
 *
 * @property {string} id
 * @property {string} initiatorUserId
 * @property {string} initiatorName
 * @property {Shift}  offeredShift                - Plantão que eu ofereço pra trocar.
 * @property {{
 *   labels: Array<'M'|'T'|'N'>,                  - Turnos que aceito receber.
 *   periodScope: 'any'|'weekday'|'weekend',      - Restrição de dia.
 *   groupIds: string[],                          - Grupos onde a troca pode rolar.
 * }} preferences
 * @property {'open'|'fulfilled'|'cancelled'|'expired'} status
 * @property {string|null} matchedSwapId          - Se virou troca: shiftSwaps/{id}.
 * @property {string} createdAt                    - ISO
 * @property {string} expiresAt                    - ISO = offeredShift.startISO
 * @property {string} [respondedAt]                - ISO, quando fulfilled/cancelled
 */

/**
 * @typedef {Object} ShiftOffer
 * A targeted cede — one doctor offers a specific shift to one colleague.
 * Firestore path: shiftOffers/{id}
 *
 * @property {string} id
 * @property {'cede'} kind
 * @property {string} fromUserId            - Firebase UID of the doctor giving up the shift
 * @property {string} toUserId              - Firebase UID of the targeted colleague
 * @property {Object} shiftSnapshot         - Immutable snapshot of the shift at offer time
 * @property {'pending'|'accepted'|'rejected'|'cancelled'|'expired'} status
 * @property {string} groupId               - Group of the shift (eligibility scope)
 * @property {string} monthKey
 * @property {string} createdAt             - ISO
 * @property {string|null} respondedAt      - ISO; null while pending
 * @property {string} expiresAt             - ISO = shiftSnapshot.startISO
 */

/**
 * @typedef {Object} ShiftSwap
 * A targeted swap — initiator picks both their shift AND the colleague's shift to trade.
 * Firestore path: shiftSwaps/{id}
 *
 * @property {string} id
 * @property {'swap'} kind
 * @property {string} initiatorUserId
 * @property {string} targetUserId
 * @property {Object} shiftA                - Initiator's shift snapshot
 * @property {Object} shiftB                - Target's shift snapshot
 * @property {'pending'|'accepted'|'rejected'|'cancelled'|'expired'} status
 * @property {string[]} eligibleGroupIds    - Groups both users are members of (audit)
 * @property {string[]} monthKeys           - [shiftA.monthKey, shiftB.monthKey]
 * @property {string} createdAt
 * @property {string|null} respondedAt
 * @property {string} expiresAt             - ISO = min(shiftA.startISO, shiftB.startISO)
 */

/**
 * @typedef {Opening|ShiftOffer|ShiftSwap|TradeIntent} Movement
 * União de todas as movimentações que aparecem em Movimentações/Vagas/Histórico.
 * Use `MovementHelpers.classifyMovement(item)` pra discriminar em runtime.
 */

/**
 * @typedef {Object} UserRoles
 * Roles do usuário, scoped por entidade. Default ausente = doctor.
 * Manager só atua via web — Aurora app ignora a flag.
 *
 * Shape: `users/{uid}.roles` é um Object com chaves variáveis:
 *   {
 *     [groupId]:                'coordinator',
 *     [`institution:${instId}`]: 'manager',
 *   }
 *
 * Exemplos:
 *   user.roles['xZ-BNeGG_joK'] === 'coordinator'  // coord do grupo X
 *   user.roles['institution:aurora_hospital_luis_franca'] === 'manager'  // manager do hospital
 *
 * @property {Object<string, 'coordinator'|'manager'>} [roles]
 */

/**
 * @typedef {Object} SwapAuction
 * [DEPRECATED-AUCTION] Substituído por TradeIntent (sem lances). Mantido
 * apenas pra ler histórico até a Fase 3 da refatoração de movimentações.
 *
 * Leilão de troca aberto ao grupo. Firestore: swapAuctions/{auctionId}
 * Subcoleção: swapAuctions/{auctionId}/bids/{bidId}
 *
 * Ciclo de vida do `status`:
 *   - 'open'      → aceitando lances. Filtrado da UI quando expiresAt passar.
 *   - 'matched'   → iniciador aceitou um lance; troca consumada.
 *   - 'cancelled' → iniciador cancelou manualmente.
 *   - 'expired'   → expiresAt (= startISO do plantão ofertado) passou e ninguém
 *                   pegou. Marcado automaticamente em SwapAuctionsContext.refresh
 *                   via FirebaseAdapter.expireSwapAuction.
 *
 * REGRA: `expiresAt` é setado como `offeredShift.startISO` no createAuction.
 *        Quando agora > expiresAt e status ainda é 'open', o leilão expira
 *        automaticamente no próximo refresh (qualquer cliente). Isso garante
 *        que leilão de plantão passado não fica "vivo" pra sempre.
 *
 * @property {string} id
 * @property {string} initiatorUserId
 * @property {string} initiatorName
 * @property {Shift}  offeredShift            - Plantão que o iniciador oferece
 * @property {{ labels: string[], periodScope: 'any'|'weekday'|'weekend', groupIds: string[] }} preferences
 * @property {'open'|'matched'|'cancelled'|'expired'} status
 * @property {string|null} matchedBidId
 * @property {string} createdAt               - ISO
 * @property {string} expiresAt               - ISO = offeredShift.startISO
 * @property {string} [expiredAt]             - ISO, quando foi auto-expirado
 * @property {string} [respondedAt]           - ISO, quando cancelado/matched
 */

/**
 * @typedef {Object} Notification
 * In-app inbox entry. Firestore path: users/{uid}/notifications/{id}
 *
 * Tipos atuais:
 *   - 'ceder_in_my_group'    → alguém do meu grupo abriu uma cessão
 *   - 'ceder_offered_to_me'  → me ofereceram cessão direcionada
 *   - 'swap_proposed_to_me'  → me propuseram troca direcionada
 *   - 'offer_outcome'        → resultado de movimento que eu iniciei
 *
 * Tipos novos (Fase 2/3 do plano de movimentações):
 *   - 'vaga_no_grupo'        → coord publicou vaga temp/fixa no meu grupo
 *   - 'vaga_direcionada'     → coord criou vaga direcionada pra mim
 *   - 'escalista_alterado'   → coord substituiu o escalista de uma escala minha
 *   - 'troca_compativel'     → intenção de troca de colega bate com meus plantões
 *
 * @property {string} id
 * @property {'ceder_in_my_group'|'ceder_offered_to_me'|'swap_proposed_to_me'|'offer_outcome'|'vaga_no_grupo'|'vaga_direcionada'|'escalista_alterado'|'troca_compativel'} type
 * @property {string} title
 * @property {string} body
 * @property {Object} payload               - Free-form per-type data (e.g. { offerId, swapId, openingId, intentId })
 * @property {boolean} read
 * @property {string} createdAt             - ISO
 */

/**
 * @typedef {Object} NotificationPrefs
 * Firestore path: users/{uid}/settings/notifications
 *
 * @property {boolean} enabled                  - Master switch
 * @property {boolean} cededInMyGroups          - Someone in my group opened a cede
 * @property {boolean} swapProposalsToMe        - Someone proposed a swap with me
 * @property {boolean} myOfferOutcomes          - Outcomes of offers/swaps I initiated
 * @property {boolean} [adminVagasInMyGroups]   - Vagas temp/fixas criadas pelo coord no meu grupo
 * @property {boolean} [directedToMe]           - Algo direcionado a mim (cessão direcionada, vaga direcionada, etc)
 * @property {boolean} [escalistaChanges]       - Substituição de escalista que me afeta
 * @property {boolean} [tradeIntentMatches]     - Intenções de troca compatíveis com meus plantões
 */

export default {};
