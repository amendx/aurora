/**
 * swapParts — peças visuais compartilhadas entre a lista de Trocas
 * (TrocasAbertasScreen) e o detalhe da troca (TrocaDetailSheet).
 *
 * Design: design/groups/troca/TODAS AS TROCAS.html + screenshots do detalhe.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Typography } from '../constants/DesignSystem';

export const LABEL_UP = { M: 'MANHÃ', T: 'TARDE', N: 'NOITE', D: 'NOITE' };
// Cores de turno do design (iguais ao GroupDayTeamScreen).
export const SHIFT_TYPE_COLOR = { M: '#3FA9A7', T: '#97CAFC', N: '#5B6FBF', D: '#5B6FBF' };
const WK_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export const normColor = (c, fb) => (!c ? fb : (String(c).startsWith('#') ? c : `#${c}`));

const _hhmm = (iso) => (typeof iso === 'string' && iso.length >= 16 && iso.includes('T') ? iso.slice(11, 16) : '');
export const shiftDateObj = (sh) => {
  const raw = sh?.startISO || (sh?.date ? `${sh.date}T12:00:00` : '');
  const d = raw ? new Date(raw) : null;
  return d && !isNaN(d.getTime()) ? d : null;
};
export const timeFull = (sh) => { const a = _hhmm(sh?.startISO), b = _hhmm(sh?.endISO); return a && b ? `${a}–${b}` : a; };
export const timeShort = (sh) => {
  const h = (x) => (x ? `${x.slice(0, 2)}h` : '');
  const a = _hhmm(sh?.startISO), b = _hhmm(sh?.endISO);
  return a && b ? `${h(a)}-${h(b)}` : h(a);
};

// "Hospital Luís de França" → "HLF" (iniciais de palavras significativas).
export const instAbbrev = (name) => {
  if (!name) return '';
  const skip = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
  const ini = String(name).trim().split(/\s+/)
    .filter(w => !skip.has(w.toLowerCase()))
    .map(w => w[0]?.toUpperCase() || '')
    .join('');
  return ini || String(name).slice(0, 3).toUpperCase();
};

export const initials = (name) => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return ((parts[0][0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
};

/**
 * Reputação de troca do colega.
 * STUB/MOCK — números derivados do nome (estáveis) só pra compor o layout.
 * TODO: substituir por agregação real de shiftSwaps (aceitas/recusadas + tempo
 * médio de resposta) por usuário. Enquanto isso NÃO são dados reais.
 */
export const getSwapRep = (name) => {
  if (!name) return null;
  let h = 0;
  for (let i = 0; i < String(name).length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  h = Math.abs(h);
  return { count: 5 + (h % 26), pct: 90 + (h % 11), fast: h % 3 === 0 };
};

// ── Bloco de plantão "Você dá / Você recebe" ────────────────────────────────
export function ShiftBlock({ shift, C }) {
  const st = makeStyles(C);
  const label = String(shift?.label || '').charAt(0).toUpperCase();
  const badgeColor = SHIFT_TYPE_COLOR[label] || C.primary;
  const gColor = normColor(shift?.group?.color, C.primary);
  const d = shiftDateObj(shift);
  const abbrev = instAbbrev(shift?.group?.institution?.name);

  return (
    <View style={st.block}>
      <View style={[st.strip, { backgroundColor: gColor }]} />
      <View style={st.dayCol}>
        <Text style={st.dayNum}>{d ? d.getDate() : ''}</Text>
        <Text style={st.dayWk}>{d ? WK_SHORT[d.getDay()] : ''}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <View style={st.line1}>
          <View style={[st.badge, { backgroundColor: badgeColor + '22' }]}>
            <Text style={[st.badgeText, { color: badgeColor }]}>{LABEL_UP[label] || 'PLANTÃO'}</Text>
          </View>
          {!!timeFull(shift) && <Text style={st.time}>{timeFull(shift)}</Text>}
        </View>
        <Text style={st.gname} numberOfLines={1}>{shift?.group?.name || 'Plantão'}</Text>
        <View style={st.instRow}>
          <View style={[st.dot, { backgroundColor: gColor }]} />
          <Text style={st.instText} numberOfLines={1}>
            {abbrev ? `${abbrev} · ` : ''}{timeShort(shift)}
          </Text>
        </View>
      </View>
    </View>
  );
}

export function SwapArrow({ C }) {
  const st = makeStyles(C);
  return (
    <View style={st.arrowWrap}>
      <View style={st.arrowCircle}>
        <Ionicons name="swap-horizontal" size={15} color={C.primary} />
      </View>
    </View>
  );
}

export function TeamChip({ group, C }) {
  const st = makeStyles(C);
  if (!group) return null;
  const gc = normColor(group.color, C.text.tertiary);
  return (
    <View style={[st.teamChip, { backgroundColor: gc + '14' }]}>
      <View style={[st.teamDot, { backgroundColor: gc }]} />
      <Text style={[st.teamChipText, { color: C.text.secondary }]} numberOfLines={1}>{group.name || 'Equipe'}</Text>
    </View>
  );
}

export function TeamPairRow({ give, receive, C }) {
  const st = makeStyles(C);
  const sameTeam = give?.group?.id && receive?.group?.id && String(give.group.id) === String(receive.group.id);
  return (
    <View style={st.relRow}>
      <Text style={st.relLabel}>{sameTeam ? 'MESMA EQUIPE' : 'ENTRE EQUIPES'}</Text>
      <View style={st.teamPair}>
        <TeamChip group={give?.group} C={C} />
        {!sameTeam && (
          <>
            <Ionicons name="swap-horizontal" size={13} color={C.text.tertiary} />
            <TeamChip group={receive?.group} C={C} />
          </>
        )}
      </View>
    </View>
  );
}

export function RepLine({ name, C }) {
  const st = makeStyles(C);
  const rep = getSwapRep(name);
  if (!rep) return null; // sem dados → some (ative quando houver backend de reputação)
  return (
    <View style={st.repRow}>
      <Ionicons name="checkmark-circle" size={13} color={C.money} />
      <Text style={st.repText}>{rep.count} trocas · {rep.pct}% aceitas</Text>
      {rep.fast && (
        <>
          <Ionicons name="sparkles" size={11} color={C.warning} style={{ marginLeft: 2 }} />
          <Text style={[st.repText, { color: C.warning }]}>rápido</Text>
        </>
      )}
    </View>
  );
}

// Council pode vir como string ou {crm, id, state, uf}. Formata pro display.
export const councilStr = (c) => {
  if (!c) return '';
  if (typeof c === 'string') return c;
  const parts = [c.crm || c.id, c.state || c.uf].filter(Boolean);
  return parts.join('/');
};

// Substitui RepLine. Mostra "CRM 12345/CE · 3 trocas" (count opcional).
export function CrmSwapCountLine({ council, swapCount, C }) {
  const st = makeStyles(C);
  const crm = councilStr(council);
  const hasCrm = !!crm;
  const hasCount = Number.isFinite(swapCount) && swapCount > 0;
  if (!hasCrm && !hasCount) return null;
  return (
    <View style={st.repRow}>
      {hasCrm && (
        <>
          <Ionicons name="card-outline" size={13} color={C.text.tertiary} />
          <Text style={st.repText} numberOfLines={1}>{crm}</Text>
        </>
      )}
      {hasCrm && hasCount && <Text style={[st.repText, { color: C.text.tertiary }]}>·</Text>}
      {hasCount && (
        <Text style={st.repText}>{swapCount} troca{swapCount === 1 ? '' : 's'}</Text>
      )}
    </View>
  );
}

export function HospitalRow({ group, C }) {
  const st = makeStyles(C);
  const name = group?.institution?.name || group?.name;
  if (!name) return null;
  return (
    <View style={st.hospRow}>
      <Ionicons name="business-outline" size={13} color={C.text.tertiary} />
      <Text style={st.hospText} numberOfLines={1}>{name}</Text>
    </View>
  );
}

// Card "Você ganha/perde Xh" no estilo do HospitalCard do detail.
// give.durationMinutes vs receive.durationMinutes — positivo = ganha tempo.
export function HourDeltaCard({ give, receive, C }) {
  const st = makeStyles(C);
  const g = Number(give?.durationMinutes) || 0;
  const r = Number(receive?.durationMinutes) || 0;
  if (!g && !r) return null;
  const delta = r - g;
  const abs = Math.abs(delta);
  const hours = Math.floor(abs / 60);
  const mins = abs % 60;
  const fmt = mins ? `${hours}h${String(mins).padStart(2, '0')}` : `${hours}h`;
  let label, value, color, icon;
  if (delta === 0) {
    label = 'Saldo'; value = 'Mesma duração'; color = C.text.secondary; icon = 'remove-outline';
  } else if (delta > 0) {
    label = 'Você ganha'; value = fmt; color = C.money; icon = 'trending-up-outline';
  } else {
    label = 'Você perde'; value = fmt; color = C.error; icon = 'trending-down-outline';
  }
  return (
    <View style={st.deltaCard}>
      <Ionicons name={icon} size={16} color={color} />
      <Text style={st.deltaLabel}>{label}</Text>
      <Text style={[st.deltaValue, { color }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

export const makeStyles = (C) => StyleSheet.create({
  block: {
    flexDirection: 'row', alignItems: 'stretch',
    backgroundColor: C.background.card,
    borderRadius: 12, borderWidth: 0.5, borderColor: C.border.light,
    overflow: 'hidden',
  },
  strip: { width: 4 },
  dayCol: { width: 46, alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
  dayNum: { fontSize: 22, fontFamily: Typography.fontFamily.bold, color: C.text.primary, lineHeight: 25 },
  dayWk: { fontSize: 10, fontFamily: Typography.fontFamily.semiBold, color: C.text.tertiary, textTransform: 'uppercase', letterSpacing: 0.4 },
  line1: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 10 },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 },
  badgeText: { fontSize: 9.5, fontFamily: Typography.fontFamily.bold, letterSpacing: 0.5 },
  time: { fontSize: 13, fontFamily: Typography.fontFamily.bold, color: C.text.primary },
  gname: { fontSize: 14, fontFamily: Typography.fontFamily.bold, color: C.text.primary, marginTop: 3 },
  instRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3, paddingBottom: 10 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  instText: { fontSize: 11.5, fontFamily: Typography.fontFamily.regular, color: C.text.tertiary },

  arrowWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 4 },
  arrowCircle: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.background.card, borderWidth: 1, borderColor: C.primary + '55',
  },

  relRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  relLabel: { fontSize: 10, fontFamily: Typography.fontFamily.bold, letterSpacing: 0.8, color: C.text.tertiary },
  teamPair: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  teamChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  teamDot: { width: 7, height: 7, borderRadius: 4 },
  teamChipText: { fontSize: 11, fontFamily: Typography.fontFamily.semiBold },

  repRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  repText: { fontSize: 11.5, fontFamily: Typography.fontFamily.semiBold, color: C.text.tertiary },

  capLabel: { fontSize: 10, fontFamily: Typography.fontFamily.bold, letterSpacing: 0.8, color: C.text.tertiary, marginBottom: 6 },

  hospRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  hospText: { fontSize: 11.5, fontFamily: Typography.fontFamily.regular, color: C.text.tertiary, flex: 1 },

  // HourDeltaCard — mesma estética do hospitalCard do TrocaDetailSheet
  deltaCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: C.background.card,
    borderRadius: 14, borderWidth: 0.5, borderColor: C.border.light,
    paddingHorizontal: 14, paddingVertical: 12,
    marginTop: 8,
  },
  deltaLabel: { fontSize: 13, fontFamily: Typography.fontFamily.regular, color: C.text.secondary },
  deltaValue: { flex: 1, textAlign: 'right', fontSize: 13.5, fontFamily: Typography.fontFamily.bold },
});
