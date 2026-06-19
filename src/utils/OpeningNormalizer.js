const LABEL_DURATIONS = { M: 360, T: 360, N: 720, D: 720 };

function durationMinutes(startISO, endISO) {
  const diff = new Date(endISO) - new Date(startISO);
  return Math.round(diff / 60000);
}

function safeISO(raw) {
  if (!raw) return null;
  // Try as-is; if invalid, normalize "YYYY-MM-DD HH:mm:ss" → "YYYY-MM-DDTHH:mm:ss"
  let d = new Date(raw);
  if (isNaN(d.getTime()) && typeof raw === 'string') {
    d = new Date(raw.replace(' ', 'T'));
  }
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function normalizeGroup(g) {
  if (!g) return null;
  const color = g.color ? (g.color.startsWith('#') ? g.color : `#${g.color}`) : '#888888';
  const inst = g.institution || {};
  return {
    id: g.public_id || String(g.id),
    name: g.name || '',
    color,
    institution: {
      id: inst.id,
      name: inst.popular_name || inst.name || '',
      city: inst.city || '',
      uf: inst.uf || '',
    },
  };
}

function normalizeCoworkers(coworkers = []) {
  return coworkers.map(u => ({
    id: String(u.id),
    name: u.name || '',
    photo: u.photo || null,
    description: [u.role, u.specialization].filter(Boolean).join(' / '),
    council: u.council || '',
  }));
}

/**
 * webClient item (assignment or vacancy) → Opening
 */
export function fromWebClient(item) {
  const t = item.transaction || {};
  const isVacancy = item.type === 'vacancy';

  const startISO = isVacancy
    ? safeISO(t.start_date)
    : safeISO(item.start_date || t.start_date || t.shift?.start_date);

  const endISO = isVacancy
    ? safeISO(t.end_date)
    : safeISO(t.shift?.end_date);

  if (!startISO) return null;

  const dateKey = startISO.slice(0, 10);
  const monthKey = startISO.slice(0, 7);
  const label = item.label || t.label || '';

  const dur = endISO
    ? durationMinutes(startISO, endISO)
    : (LABEL_DURATIONS[label] ?? 360);

  return {
    id: item.id || t.public_id,
    source: 'webClient',
    // Vacancies do PlantaoAPI são conceitualmente vagas admin temporárias.
    kind: isVacancy ? 'admin_temp' : 'cede',
    status: 'active',
    startISO,
    endISO,
    dateKey,
    monthKey,
    label,
    durationMinutes: dur,
    totalSlots: isVacancy ? (t.slots?.length ?? 1) : 1,
    availableSlots: isVacancy ? (t.available ?? 0) : 1,
    group: normalizeGroup(item.group),
    coworkers: normalizeCoworkers(item.coworkers),
    estimatedValue: null,
    claimable: false,
    claimedByUserId: null,
    schedulePublicId: t.shift?.schedule?.public_id || t.public_id || null,
    webClientTransactionId: item.id || t.public_id || null,
    createdAt: startISO,
    createdBy: null,
    createdByRole: 'doctor',
    targetUserId: null,
    recurrenceId: null,
    restrictedToGroupId: null,
    originShiftId: null,
    originUserId: null,
  };
}

/**
 * webClient dynamic_schedule (from GET /groups/{gid}/calendar/daily/{date})
 * → normalized DaySchedule with slots[] containing assignments + openings.
 *
 * Input shape (what PlantaoAPI returns under response.data):
 *   {
 *     dynamic_schedule: [
 *       {
 *         label: "T - 13h00 às 19h00",
 *         vacancy: { id, slots: 2 } | null,
 *         shifts: [{ id, user: { id, name, photo, council, ... }, transaction: { public_id, ... } }]
 *       }, ...
 *     ]
 *   }
 *
 * Returns:
 *   {
 *     date, groupId, groupName, groupColor, institution: { id, name },
 *     slots: [
 *       {
 *         label: "M" | "T" | "N",
 *         labelRaw,                // original "T - 13h00 às 19h00"
 *         time: "13h00 às 19h00",  // extracted suffix, or null
 *         capacity,                // filled + openings
 *         filledCount,
 *         available,               // open positions
 *         vacancyId,               // for "Pegar plantão" CTA
 *         assignments: [
 *           {
 *             userId,              // person id as string ("123" — webClient numeric or aurora uid)
 *             source: 'webClient', // resolver upgrades to 'aurora' later
 *             person: { id, name, full_name, photo, council, role },
 *             shiftId,             // PlantaoAPI shift id
 *             transactionId,       // PlantaoAPI public_id
 *           }
 *         ],
 *       }
 *     ]
 *   }
 *
 * Returns null if `dynamicSchedule` is missing or not an array.
 */
export function normalizeGroupDaySchedule(dateStr, group, dynamicSchedule) {
  if (!Array.isArray(dynamicSchedule)) return null;
  const g = normalizeGroup(group) || {
    id: group?.id ? String(group.id) : null,
    name: group?.name || '',
    color: '#888888',
    institution: { id: null, name: '', city: '', uf: '' },
  };

  const slots = dynamicSchedule.map(slot => {
    const labelRaw = slot?.label || '';
    const labelChar = labelRaw.charAt(0).toUpperCase();
    const label = ['M', 'T', 'N', 'D'].includes(labelChar) ? labelChar : labelChar;
    // Extract time after " - " or " – ". Tolerates dash variants.
    let time = null;
    const dashMatch = labelRaw.match(/\s[-–]\s(.+)$/);
    if (dashMatch) time = dashMatch[1].trim();

    const rawShifts = Array.isArray(slot?.shifts) ? slot.shifts : [];
    const seenIds = new Set();
    const assignments = rawShifts
      .map(sh => {
        if (!sh?.user?.id) return null;
        const u = sh.user;
        const id = String(u.id);
        if (seenIds.has(id)) return null;
        seenIds.add(id);
        const councilStr = typeof u.council === 'string'
          ? u.council
          : (u.council?.state || u.council?.uf || '');
        const transactionId = (sh.transaction?.public_id && typeof sh.transaction.public_id === 'string')
          ? sh.transaction.public_id
          : (typeof sh.transaction?.id === 'string' ? sh.transaction.id : null);
        return {
          userId: id,
          source: 'webClient',
          person: {
            id,
            name: typeof u.name === 'string' ? u.name : (u.full_name || ''),
            full_name: typeof u.full_name === 'string' ? u.full_name : (u.name || ''),
            photo: typeof u.photo === 'string' ? u.photo : null,
            council: councilStr,
            role: typeof u.role === 'string' ? u.role : '',
          },
          shiftId: sh.id != null ? String(sh.id) : null,
          transactionId,
        };
      })
      .filter(Boolean);

    const available = slot?.vacancy?.slots ?? 0;
    const vacancyId = slot?.vacancy?.id ?? null;
    const filledCount = assignments.length;
    const capacity = filledCount + available;

    return {
      label,
      labelRaw,
      time,
      capacity,
      filledCount,
      available,
      vacancyId,
      assignments,
    };
  });

  return {
    date: dateStr,
    groupId: g.id,
    groupName: g.name,
    groupColor: g.color,
    institution: g.institution,
    slots,
  };
}

/**
 * Aurora Firestore opening doc → Opening
 */
export function fromFirestore(doc) {
  const available = (doc.slots || []).filter(s => s.status === 'open').length;
  // kind discriminador. Legados sem kind viraram cessão ao grupo (comportamento atual).
  const kind = doc.kind === 'admin_temp' || doc.kind === 'admin_fixed' ? doc.kind : 'cede';
  return {
    id: doc.id,
    source: 'aurora',
    kind,                                  // 'cede' | 'admin_temp' | 'admin_fixed'
    status: doc.status || 'active',        // 'active' | 'cancelled' | 'claimed' | 'expired'
    startISO: doc.startISO,
    endISO: doc.endISO,
    dateKey: doc.dateKey,
    monthKey: doc.monthKey,
    label: doc.label || '',
    durationMinutes: durationMinutes(doc.startISO, doc.endISO),
    totalSlots: doc.totalSlots ?? (doc.slots?.length ?? 1),
    availableSlots: available,
    slots: doc.slots || [],
    interests: Array.isArray(doc.interests) ? doc.interests : [],  // vaga de escala: médicos interessados
    group: doc.group || null,
    coworkers: [],
    estimatedValue: doc.estimatedValue ?? null,
    claimable: available > 0 && doc.status === 'active',
    claimedByUserId: null,
    schedulePublicId: null,
    webClientTransactionId: null,
    createdAt: doc.createdAt,
    createdBy: doc.createdBy || null,
    createdByRole: doc.createdByRole || 'doctor', // legados: cessão de médico
    targetUserId: doc.targetUserId || null,       // null = ao grupo; uid = direcionada
    recurrenceId: doc.recurrenceId || null,       // só pra kind='admin_fixed'
    restrictedToGroupId: doc.restrictedToGroupId || null,
    // Audiência da web: 'todos' (qualquer membro do grupo) | 'selecionados'
    // (apenas eligibleUserIds). Antes era ignorado pelo app — agora filtra.
    audience: doc.audience || null,
    eligibleUserIds: Array.isArray(doc.eligibleUserIds) ? doc.eligibleUserIds.map(String) : null,
    originShiftId: doc.originShiftId || null,
    originUserId: doc.originUserId || null,
    originUserName: doc.originUserName || null,
    originShiftSnapshot: doc.originShiftSnapshot || null,
  };
}
