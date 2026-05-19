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
    restrictedToGroupId: null,
    originShiftId: null,
    originUserId: null,
  };
}

/**
 * Aurora Firestore opening doc → Opening
 */
export function fromFirestore(doc) {
  const available = (doc.slots || []).filter(s => s.status === 'open').length;
  return {
    id: doc.id,
    source: 'aurora',
    startISO: doc.startISO,
    endISO: doc.endISO,
    dateKey: doc.dateKey,
    monthKey: doc.monthKey,
    label: doc.label || '',
    durationMinutes: durationMinutes(doc.startISO, doc.endISO),
    totalSlots: doc.totalSlots ?? (doc.slots?.length ?? 1),
    availableSlots: available,
    group: doc.group || null,
    coworkers: [],
    estimatedValue: doc.estimatedValue ?? null,
    claimable: available > 0 && doc.status === 'active',
    claimedByUserId: null,
    schedulePublicId: null,
    webClientTransactionId: null,
    createdAt: doc.createdAt,
    createdBy: doc.createdBy || null,
    restrictedToGroupId: doc.restrictedToGroupId || null,
    originShiftId: doc.originShiftId || null,
    originUserId: doc.originUserId || null,
  };
}
