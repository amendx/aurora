# Aurora-web → Firestore: escala de grupos para o app mobile

O app mobile (calendário de grupos, "quem está de plantão", vagas, "falta gente com você")
consome dados do Firestore. O aurora-web precisa escrever **2 coisas**:

- **(A)** a escala denormalizada por grupo — fonte principal e barata;
- **(B)** os shifts individuais de cada usuário (verdade individual);
- **(C)** grupos + membros frescos.

Use **os mesmos ids canônicos** em tudo.

---

## Convenções de id e formato (regra de ouro)

- `groupId`: o **mesmo** id em todo lugar — no doc do grupo (`users/{uid}/groups/{groupId}`),
  em `shift.group.id`, em `groupSchedules/{groupId}` e em `groupMembers`. Se hoje há divergência
  `public_id` vs `id` numérico, **padronize um só** e use ele sempre.
- `userId` (em assignments e paths): o **uid canônico** = id do doc em `users/{uid}`. É com ele
  que o app identifica "sou eu" e cruza trocas/ofertas. Nunca use o id numérico legado da
  PlantãoAPI aqui.
- `monthKey`: `"YYYY-MM"` (ex. `"2026-06"`).
- `dateStr`: `"YYYY-MM-DD"`.
- `label` do turno: **1 char** — `"M"` (manhã), `"T"` (tarde), `"N"` (noite),
  `"D"` (noite que vira o dia / carryover).
- timestamps: ISO 8601 (`new Date().toISOString()`).

---

## (A) PRINCIPAL — escala denormalizada do grupo

### Doc de metadata do mês

Path: `groupSchedules/{groupId}/months/{monthKey}`

```json
{
  "groupId": "LIDER1_HLF",
  "monthKey": "2026-06",
  "syncedAt": "2026-06-04T12:00:00.000Z",
  "authoritative": true
}
```

- `syncedAt`: atualize a cada mudança. O app usa isso pra decidir se o cache venceu.
- `authoritative: true`: marca que veio do aurora-web. O app respeita: se for `true`, **só lê**,
  não reescreve por cima.
- **A existência deste doc é o gatilho** pro app usar essa fonte. Sem ele, o app cai no fallback
  caro (agregar shift por shift de cada membro).

### Um doc por dia

Path: `groupSchedules/{groupId}/months/{monthKey}/days/{dateStr}`

```json
{
  "date": "2026-06-08",
  "groupId": "LIDER1_HLF",
  "groupName": "Líder 1 HLF",
  "groupColor": "#3FA9A7",
  "institution": { "id": "hlf", "name": "Hospital Luís de França" },
  "slots": [
    {
      "label": "N",
      "labelRaw": "N - 19h00 às 07h00",
      "time": "19:00 – 07:00",
      "capacity": 3,
      "filledCount": 2,
      "available": 1,
      "vacancyId": null,
      "assignments": [
        {
          "userId": "ozQ81bIxlFfjqx8zCjEtJB9v3Dt1",
          "source": "aurora",
          "person": {
            "id": "ozQ81bIxlFfjqx8zCjEtJB9v3Dt1",
            "name": "Caco Ribeiro",
            "full_name": "Caco Ribeiro",
            "photo": "https://…/avatar.jpg",
            "council": "CRM 12345/CE",
            "role": "Médico"
          },
          "shiftId": "shift_abc123",
          "transactionId": null
        }
      ]
    }
  ]
}
```

**Semântica dos números do slot (essencial — é o que falta hoje):**

- `capacity` = nº total de posições daquele turno (definido pela escala).
- `filledCount` = `assignments.length`.
- `available` = `capacity - filledCount` (vagas em aberto). **É isso que liga "vaga disponível",
  o marcador no calendário e "Falta gente com você".** Sem `capacity`/`available`, o app só
  mostra quem está, nunca as vagas.
- `assignments[]` = quem está escalado. `userId` e `person.id` = uid canônico. `council` como
  string. `photo` URL ou `null`.
- Só inclua dias que têm algo (turno com gente ou com vaga). Dia sem nada → não crie o doc.

> Se preferir não denormalizar e só escrever os shifts de cada usuário (opção B abaixo), o app
> **agrega sozinho** e mostra "quem está" — mas **sem vagas** (não tem como saber `capacity`).
> Pra ter vagas, o caminho (A) com `capacity` é obrigatório.

---

## (B) Shifts por usuário (faça também, é a verdade individual)

Path: `users/{userId}/months/{monthKey}/shifts/{shiftId}`

```json
{
  "id": "shift_abc123",
  "userId": "ozQ81bIxlFfjqx8zCjEtJB9v3Dt1",
  "date": "2026-06-08",
  "startISO": "2026-06-08T19:00:00",
  "endISO": "2026-06-09T07:00:00",
  "label": "N",
  "time": "19:00 – 07:00",
  "durationMinutes": 720,
  "monthKey": "2026-06",
  "group": {
    "id": "LIDER1_HLF",
    "name": "Líder 1 HLF",
    "color": "#3FA9A7",
    "institution": { "id": "hlf", "name": "Hospital Luís de França" }
  }
}
```

- `group.id` **igual** ao `groupId` de (A). É por aqui que o app casa o plantão ao grupo.
- `durationMinutes` em **minutos inteiros**.
- Faz o plantão aparecer no calendário pessoal do médico **e** alimenta a agregação de fallback
  do grupo.

---

## (C) Grupos e membros (pra o grupo aparecer e o seletor de colegas funcionar)

Pra cada usuário que enxerga o grupo:

- Doc do grupo: `users/{userId}/groups/{groupId}`
  → `{ id, name, color, institution, isAuroraGroup: true, ... }` (o app lista grupos daqui).
- Membros: `users/{userId}/groupMembers/{groupId}`

```json
{
  "userId": "<dono do doc>",
  "groupId": "LIDER1_HLF",
  "memberIds": ["uid1", "uid2", "uid3"],
  "members": [
    {
      "id": "uid1",
      "userId": "uid1",
      "name": "Caco Ribeiro",
      "photo": "…",
      "council": "CRM…",
      "role": "Médico",
      "memberType": "member",
      "canHaveShifts": true
    }
  ],
  "syncedAt": "2026-06-04T12:00:00.000Z"
}
```

- `memberType: "manager"` ou `canHaveShifts: false` → o app entende que não recebe escala
  (não conta como vaga preenchível).
- Mantenha `memberIds`/`members` sincronizados quando alguém entra/sai (senão dá drift na lista
  de colegas no fluxo de ceder/trocar).

---

## Cadência

- Ao publicar/editar a escala de um mês: reescreva os `days/{dateStr}` afetados **e** atualize
  `syncedAt` no doc de metadata (A). Recalcule `filledCount`/`available` no mesmo write.
- Mês passado pode ser escrito uma vez e não mexer mais.

## O que NÃO fazer

- Não usar id numérico legado da PlantãoAPI em `userId`/`group.id`.
- Não omitir `capacity` se quiser que vagas apareçam.
- Não criar day docs vazios.

---

## ⚠️ Devolva a saída pra adaptarmos o app

Depois de implementar, **gere de volta um relatório** com o que de fato ficou, pra eu (lado mobile)
adaptar o consumo e fechar a integração. Inclua:

1. **Paths exatos** que você escreve (com um exemplo real de cada: metadata do mês, day doc,
   shift de usuário, grupo, groupMembers).
2. **Dumps JSON reais** de 1 doc de cada tipo (não o template — o dado de verdade gravado), com os
   ids reais.
3. **Qual id virou canônico** pra grupo e pra usuário (e se houve migração de `public_id`/numérico).
4. **Divergências do contrato acima**: qualquer campo que você nomeou diferente, formato diferente
   de `time`/`label`/datas, ou algo que não conseguiu preencher (ex.: `capacity` ausente em alguns
   grupos, `photo`/`council` faltando).
5. **Cobertura**: quais grupos/meses já têm dados escritos vs. ainda pendentes.
6. **Regras do Firestore** que você (se) ajustou pra permitir esses reads/writes.

Com esse relatório eu alinho os normalizadores do app (`OpeningNormalizer`, `GroupScheduleService`,
`FirebaseAdapter`) ao que você realmente gravou.
