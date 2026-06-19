# Handoff — Aurora: notificações (feito) + calendário de grupos (em investigação)

> Documento de passagem para outro agente. Auto-contido: assume **zero** contexto prévio.
> Data: 2026-06-16. UI sempre **pt-BR**.

## Repositórios

- **Web (coordenador/gestor)**: `/home/amandaesmeraldo/Documentos/Git/misc/aurora-web`
  React 19 + Vite + TS, TanStack Query, Zustand, Firestore. Branch atual: `feat/surge-windows`.
- **Mobile (médico)**: `/home/amandaesmeraldo/Documentos/Git/misc/Aurora`
  React Native + Expo (JS, não TS). Firestore + Cloud Functions (`functions/index.js`).
- **Firebase**: projeto `aurora-7cce3`. Web = fonte da verdade da escala; app consome.
  ⚠️ Org policies chatas nesse projeto (ver final do doc).

O app é a superfície mobile; a web é onde o gestor monta a escala. Mesmos ids canônicos nos dois.

---

# PARTE 1 — Notificações (CONCLUÍDO + DEPLOY FEITO)

Quatro pedidos do usuário, todos implementados no **app + Cloud Function**. Functions já deployadas.

### 1. Data formatada na notificação (era cru "2026-06-16")
- `Aurora/functions/index.js`: adicionado `fmtDateBR()` (+ arrays `MONTHS_ABBR`/`WEEKDAYS_ABBR`,
  parse via regex e `Date.UTC` p/ ser TZ-safe). `humanShift()` passa a data por ele →
  `"Manhã · ter, 16 jun"`.
- `Aurora/src/utils/formatDate.js` (NOVO): mesma `fmtDateBR` p/ o lado app.
- Usado em `Aurora/src/contexts/OffersContext.js` (`_humanShiftLabel`) e no body do claim em
  `Aurora/src/contexts/OpeningsContext.js` (linha do `body:` com `opening.dateKey`).
- Avisos **já gravados** no inbox mantêm o texto cru; só os novos saem formatados.

### 2. Toque no push → cai na tela certa (deep-link)
- `Aurora/src/utils/notificationRoute.js` (NOVO): `routeForNotification(data)` mapeia
  `type`/`kind` → tela:
  - `ceder_in_my_group` + `kind!=='cede'` (vaga publicada) → `OpeningsScreen`
  - `ceder_in_my_group` + `kind==='cede'` (cessão ao grupo) → `TrocasAbertas`
  - `ceder_offered_to_me` / `swap_proposed_to_me` → `AvisosScreen`
  - `offer_outcome` → `TrocasAbertas`
- `Aurora/src/screens/MainScreen.js`: `expo-notifications` carregado lazy; `useEffect`
  registra `addNotificationResponseReceivedListener` (toque com app vivo) e
  `getLastNotificationResponseAsync` (cold start) — este consumido **1×/processo** via flag
  módulo `_consumedLaunchResponse` p/ não re-navegar a cada login. Navega via `stableNav`.
  (MainScreen é navegador custom: tabs home/calendar/settings; resto é overlay via `SCREEN_MAP`.)

### 3. Bolinha vermelha na tile "Vagas" (igual à de Movimentações)
- `Aurora/src/screens/HomeScreen.js`: destrutura `openings` de `useOpenings()`;
  `hasVagas = (openings?.length||0)>0`; passa `hasDot: hasVagas` no `renderActionTile` de Vagas.

### 4. Avisos clicáveis → redireciona
- `Aurora/src/screens/AvisosScreen.js`: recebe `navigate` (passado em
  `MainScreen.renderOverlayContent` case `'avisos'`); rows de "Atividade recente" chamam
  `onOutcomePress(n)` → marca lido + `routeForNotification({type:n.type, ...n.payload})`.
  Chevron `chevron-forward` adicionado na row.

---

# PARTE 2 — Calendário de grupos (EM INVESTIGAÇÃO, NÃO RESOLVIDO)

**Pedido do usuário (verbatim):** "a funcionalidade do calendário de grupos não está
funcionando, você consegue investigar por que? agora queremos que seja como o aurora-web e
vejamos os plantões dos grupos que fazemos parte."

⚠️ **Sintoma exato ainda NÃO confirmado.** Antes de mexer em código, pergunte ao usuário:
**o calendário de grupos aparece totalmente vazio, ou mostra alguma coisa (ex.: só os seus
próprios plantões)?** Isso separa problema de **escrita** (web) de problema de **leitura/render** (app).

## Fluxo de dados (web grava → app lê)

**Web grava** `groupSchedules/{groupId}/months/{mk}/days/{date}` com `assignments[]` +
projeção `slots[]` + doc de metadata `groupSchedules/{groupId}/months/{mk}` com
`authoritative:true` + `syncedAt`.
- Materialização: `aurora-web/src/features/schedule/api/useMaterializeMonth.ts`
  (`materializeMonthCore`/`materializeForward`, horizonte = mês atual + 2). Dispara via
  `useAutoMaterializeForward` **quando o gestor abre a Escala fixa do grupo** e há `fixedSlots`.
- Projeção de edições pontuais: `aurora-web/src/features/schedule/api/useSyncScheduleProjection.ts`
  (`syncDayProjection` — só projeta se o day doc já existe).
- Shape do slot: `aurora-web/src/features/schedule/api/scheduleProjection.ts` (`buildSlots`):
  `{label, labelRaw, time, capacity, filledCount, available, vacancyId,
  assignments:[{userId, source:'aurora', person, shiftId, transactionId}]}`.
  `capacity` vem de `group.config.shifts[].max` (se o grupo não tem config → `filled+vacancies`).

**App lê** via `Aurora/src/services/GroupScheduleService.js` → `getMonth`:
1. LocalCache (`aurora_grpsched_{gid}_{YYYY-MM}`, respeita `isMonthStale`).
2. `FirebaseAdapter.fetchGroupScheduleMonth(gid, mk)` — se metadata existe e `authoritative` →
   **usa direto** (não re-agrega/sobrescreve).
3. Fallback `FirebaseAdapter.aggregateAuroraGroupSchedule(group, mk, uid)` — lê
   `users/{uid}/groupMembers/{gid}` e os shifts de cada membro em
   `users/{memberId}/months/{mk}/shifts` filtrando `shift.group.id===gid`.
- Consumido em `Aurora/src/screens/CalendarScreen.js` modo `'groups'`: `getMultipleMonths`
  (linha ~262-286) → `groupTypesByDay`/`groupTotals` → picker + `GroupSummaryCard` + dots no grid.
  `isAurora = userSource==='aurora' || auroraOnlyMode===true`.

## Já verificado e DESCARTADO (estático)

- **IDs batem**: web cria auroraGroup com `id: ref.id` (== doc id, ver
  `aurora-web/.../groups/api/useAuroraGroupMutations.ts`); web lê `d.data().id`
  (`useAuroraGroupsQuery.ts`); app `FirebaseAdapter.subscribeAuroraGroups` faz
  `{id:d.id, ...d.data()}` (o `data.id` sobrescreve, mas é igual ao doc id) →
  `GroupsContext.normalizeAuroraGroup` usa `data.id`. Mesmo id em groupSchedules, shift.group.id,
  auroraGroups e groupMembers.
- **Rules não bloqueiam** (`Aurora/firestore.rules`): `groupSchedules/**` read liberado;
  `users/{uid}/months/**/shifts` read liberado (cross-user, p/ trocas); `groupMembers` lê o doc
  do próprio user. Logo, ambos os caminhos de leitura são permitidos.
- **Shapes compatíveis** entre web `buildSlots` e app `_normalizeScheduleDays`/render.

## Hipóteses prováveis (não confirmadas)

1. **Web nunca materializou** aquele mês/grupo (gestor não abriu a Escala fixa, ou grupo sem
   `fixedSlots`) → sem doc `authoritative`; aí o fallback `aggregateAuroraGroupSchedule` só acha
   algo se os **membros tiverem shifts individuais** em `users/{uid}/months/.../shifts` — e a web
   pode **não** estar gravando esses (seção B do spec é "faça também", talvez pendente).
   → resultado típico: calendário vazio ou só com o próprio usuário.
2. Bug de runtime que a análise estática não pega.

## Próximos passos (ordem sugerida)

1. **Confirmar sintoma** com o usuário (vazio vs. só você).
2. **Inspecionar Firestore real** (projeto `aurora-7cce3`): existe
   `groupSchedules/{gid}/months/{mk}` com `authoritative:true`? Tem subcoleção `days/*` populada?
   - Se **não** → o problema é de **escrita** (web/materialize). Verificar se o gestor abriu a
     Escala fixa do grupo e se há `fixedSlots`; possivelmente acionar materialização / garantir
     gravação dos shifts por usuário (seção B do spec).
   - Se **sim** → o problema é de **leitura/render** no app. Logar `getMonth`/`getMultipleMonths`
     e o estado `groupSchedules` no `CalendarScreen` p/ ver onde some.
3. Conferir `userSource`/`auroraOnlyMode` do usuário de teste (se não for `'aurora'`, o app tenta
   o caminho webClient).

## Arquivos-chave

**Web:** `aurora-web/src/features/schedule/api/{useMaterializeMonth,useSyncScheduleProjection,
scheduleProjection,useScheduleMutations,useOpeningMutations}.ts`,
`aurora-web/src/features/groups/api/{useAuroraGroupsQuery,useAuroraGroupMutations}.ts`.

**App:** `Aurora/src/services/GroupScheduleService.js`,
`Aurora/src/services/firebase/FirebaseAdapter.js` (`aggregateAuroraGroupSchedule` ~359,
`fetchGroupScheduleMonth` ~464, `subscribeAuroraGroups` ~1676),
`Aurora/src/screens/CalendarScreen.js` (modo groups ~232-406, render ~840),
`Aurora/src/contexts/GroupsContext.js`, `Aurora/firestore.rules` (~118-138, ~230-241).

**Contrato/spec:** `Aurora/docs/aurora-web-group-schedule-spec.md`.

---

## GCP / deploy gotchas (projeto aurora-7cce3)

- Cada nova Cloud Function Gen2 callable precisa de role do Cloud Build SA (manual) +
  "Permitir acesso público" no console. **HTML 401 = falta invoker, não é bug de código.**
- Deploy de functions: `cd Aurora && firebase deploy --only functions`.
