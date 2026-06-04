import { useState, useMemo, useContext } from 'react';
import {
  View, Text, Modal, Pressable, ScrollView, TouchableOpacity,
  StyleSheet, Image, ActivityIndicator, TextInput, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useColors, Typography, Spacing, BorderRadius } from '../constants/DesignSystem';
import { AuthContext } from '../context/AuthContext';
import { useGroups } from '../contexts/GroupsContext';
import { useOffers } from '../contexts/OffersContext';
import { useOpenings } from '../contexts/OpeningsContext';
import { useShifts } from '../contexts/ShiftsContext';

const _initials = (name = '') => name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const _labelName = (l) => ({ M: 'Manhã', T: 'Tarde', N: 'Noite', D: 'Noite' }[l] || l || 'Plantão');
const _fmtDate = (iso) => {
  if (!iso) return '';
  const raw = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
};
const _shiftSummary = (sh) => {
  if (!sh) return '';
  const date = sh.startISO || sh.date;
  const time = sh.time || '';
  return `${_labelName(sh.label)} · ${_fmtDate(date)}${time ? ' · ' + time : ''}`;
};

export default function CederFlowSheet({ visible, shift, onClose, onDone, initialMode = null, title }) {
  const C = useColors();
  const insets = useSafeAreaInsets();
  const s = makeStyles(C);
  const { user } = useContext(AuthContext);
  const { getShiftCapableGroupMembers } = useGroups();
  const { cedeOpenToGroup, cedeTargeted } = useOffers();
  const { refresh: refreshOpenings } = useOpenings();
  const { removeShiftLocally } = useShifts();

  const [mode, setMode]       = useState(initialMode); // 'open' | 'targeted'
  const [picked, setPicked]   = useState(null); // member object
  const [submitting, setSub]  = useState(false);
  const [query, setQuery]     = useState('');

  const groupId = String(shift?.group?.id || '');
  const members = useMemo(() => {
    if (!groupId) return [];
    return getShiftCapableGroupMembers(groupId)
      .filter(m => m?.person?.id != null && String(m.person.id) !== String(user?.id))
      .sort((a, b) => (a.person.name || '').localeCompare(b.person.name || '', 'pt-BR'));
  }, [groupId, getShiftCapableGroupMembers, user?.id]);

  const _councilStr = (c) => (typeof c === 'string' ? c : (c?.state || c?.uf || ''));

  const filteredMembers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter(m => {
      const p = m.person;
      const name = String(p.name || p.full_name || '').toLowerCase();
      const council = _councilStr(p.council).toLowerCase();
      return name.includes(q) || council.includes(q);
    });
  }, [members, query]);

  const reset = () => { setMode(initialMode); setPicked(null); setSub(false); setQuery(''); };
  const close = () => { reset(); onClose?.(); };

  const handleOpen = async () => {
    setSub(true);
    const r = await cedeOpenToGroup(shift);
    if (r?.success) {
      const monthKey = shift?.monthKey || (shift?.startISO || '').slice(0, 7);
      await removeShiftLocally?.(shift.id, monthKey);
      // Repopula myCededOpenings — sem isso a UI (Home/Trocas/Vagas) não vê
      // a cessão recém-criada até um pull-to-refresh manual.
      refreshOpenings?.(true);
    }
    setSub(false);
    if (r?.success) {
      onDone?.('open');
      close();
      Alert.alert(
        'Plantão cedido ao grupo',
        `${_shiftSummary(shift)}\n\nDisponível para ${shift?.group?.name || 'o grupo'}. Você pode cancelar a cessão em Histórico enquanto ninguém pegar.`,
      );
    } else {
      Alert.alert('Erro', 'Não foi possível ceder o plantão. Tente novamente.');
    }
  };

  const handleTargeted = async () => {
    if (!picked) return;
    setSub(true);
    const r = await cedeTargeted(shift, picked.person.id, picked.person.name);
    setSub(false);
    if (r?.success) {
      onDone?.('targeted');
      close();
      Alert.alert(
        'Cessão enviada',
        `${_shiftSummary(shift)}\n\nOferecido a ${picked.person.name}. Você pode cancelar em Histórico enquanto ${picked.person.name?.split(' ')[0] || 'ele(a)'} não responder.`,
      );
    } else {
      Alert.alert('Erro', 'Não foi possível enviar a cessão. Tente novamente.');
    }
  };

  if (!visible || !shift) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={close}>
      <Pressable style={s.backdrop} onPress={close} />
      <View style={[s.sheet, { paddingBottom: 16 + insets.bottom }]}>
        <View style={s.handle} />
        <View style={s.headerRow}>
          <Text style={s.title}>{title || (mode === 'targeted' ? 'Escolher colega' : 'Ceder plantão')}</Text>
          <Pressable onPress={close} hitSlop={10}><Ionicons name="close" size={22} color={C.text.secondary} /></Pressable>
        </View>

        {/* Step 1 — choose mode */}
        {!mode && (
          <View style={{ paddingHorizontal: 18, paddingTop: 4, paddingBottom: 8 }}>
            <Text style={s.eyebrow}>Como deseja ceder?</Text>

            <TouchableOpacity style={s.choiceCard} onPress={() => setMode('open')}>
              <View style={[s.choiceIcon, { backgroundColor: C.accentSoft }]}>
                <Ionicons name="people-outline" size={20} color={C.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.choiceTitle}>Abrir para o grupo</Text>
                <Text style={s.choiceDesc}>Qualquer colega de "{shift.group?.name || 'grupo'}" pode assumir.</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={C.text.tertiary} />
            </TouchableOpacity>

            <TouchableOpacity style={s.choiceCard} onPress={() => setMode('targeted')}>
              <View style={[s.choiceIcon, { backgroundColor: C.primary + '18' }]}>
                <Ionicons name="person-outline" size={20} color={C.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.choiceTitle}>Oferecer a um colega</Text>
                <Text style={s.choiceDesc}>Escolha alguém específico para receber o plantão.</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={C.text.tertiary} />
            </TouchableOpacity>
          </View>
        )}

        {/* Open-to-group confirmation */}
        {mode === 'open' && (
          <View style={{ paddingHorizontal: 18 }}>
            <Text style={s.eyebrow}>Confirmar</Text>
            <Text style={s.bodyLine}>
              O plantão de <Text style={s.bold}>{shift.group?.name}</Text> ficará disponível para outros membros do grupo. Você pode cancelar a qualquer momento antes que alguém assuma.
            </Text>
            <View style={s.ctaRow}>
              <Pressable style={s.secondaryBtn} onPress={() => setMode(null)}>
                <Text style={[s.secondaryBtnText, { color: C.text.secondary }]}>Voltar</Text>
              </Pressable>
              <Pressable style={[s.primaryBtn, { backgroundColor: C.primary, flex: 2 }]} onPress={handleOpen} disabled={submitting}>
                {submitting
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.primaryBtnText}>Abrir para o grupo</Text>}
              </Pressable>
            </View>
          </View>
        )}

        {/* Targeted — pick a member */}
        {mode === 'targeted' && (
          <View style={{ flex: 0, paddingHorizontal: 18 }}>
            <Text style={s.eyebrow}>
              {members.length} colegas em {shift.group?.name}
            </Text>
            <View style={s.searchBox}>
              <Ionicons name="search" size={16} color={C.text.tertiary} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Buscar por nome ou CRM"
                placeholderTextColor={C.text.tertiary}
                style={s.searchInput}
                autoCorrect={false}
                autoCapitalize="none"
              />
              {!!query && (
                <Pressable hitSlop={8} onPress={() => setQuery('')}>
                  <Ionicons name="close-circle" size={16} color={C.text.tertiary} />
                </Pressable>
              )}
            </View>
            <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
              {members.length === 0 ? (
                <Text style={[s.bodyLine, { color: C.text.tertiary }]}>Nenhum colega no grupo ainda.</Text>
              ) : filteredMembers.length === 0 ? (
                <Text style={[s.bodyLine, { color: C.text.tertiary }]}>Nenhum colega encontrado para "{query}".</Text>
              ) : filteredMembers.map(m => {
                const p = m.person;
                const sel = picked?.person?.id === p.id;
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[s.memberRow, sel && { backgroundColor: C.accentSoft + '60' }]}
                    onPress={() => setPicked(m)}
                  >
                    {p.photo
                      ? <Image source={{ uri: p.photo }} style={s.avatar} />
                      : <View style={[s.avatar, s.avatarFallback]}>
                          <Text style={s.avatarInitials}>{_initials(p.name)}</Text>
                        </View>
                    }
                    <View style={{ flex: 1 }}>
                      <Text style={s.memberName} numberOfLines={1}>{p.name}</Text>
                      {(() => {
                        const c = _councilStr(p.council);
                        return c ? <Text style={s.memberMeta}>{c}</Text> : null;
                      })()}
                    </View>
                    {sel && <Ionicons name="checkmark-circle" size={20} color={C.primary} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <View style={s.ctaRow}>
              <Pressable style={s.secondaryBtn} onPress={() => { if (initialMode) { close(); } else { setPicked(null); setMode(null); } }}>
                <Text style={[s.secondaryBtnText, { color: C.text.secondary }]}>Voltar</Text>
              </Pressable>
              <Pressable
                style={[s.primaryBtn, { backgroundColor: picked ? C.primary : C.border.medium, flex: 2 }]}
                onPress={handleTargeted}
                disabled={!picked || submitting}
              >
                {submitting
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.primaryBtnText}>Enviar oferta</Text>}
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const makeStyles = (C) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: C.background.elevated,
    borderTopLeftRadius: BorderRadius.xxl, borderTopRightRadius: BorderRadius.xxl,
    paddingTop: 8,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: C.border.medium, alignSelf: 'center', marginBottom: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingBottom: 12 },
  title: { fontSize: 18, fontFamily: Typography.fontFamily.display, fontWeight: '700', color: C.text.primary },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: C.text.tertiary, marginBottom: 10, marginTop: 4 },
  choiceCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: 14,
    borderWidth: 0.5, borderColor: C.border.light, marginBottom: 10,
    backgroundColor: C.background.secondary,
  },
  choiceIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  choiceTitle: { fontSize: 15, fontWeight: '700', color: C.text.primary },
  choiceDesc:  { fontSize: 12, color: C.text.tertiary, marginTop: 2, lineHeight: 16 },
  bodyLine: { fontSize: 14, color: C.text.secondary, lineHeight: 20, marginBottom: 16 },
  bold: { fontWeight: '700', color: C.text.primary },
  ctaRow: { flexDirection: 'row', gap: 10, marginTop: 12, marginBottom: 4 },
  secondaryBtn: { flex: 1, paddingVertical: 13, borderRadius: 14, alignItems: 'center', backgroundColor: C.background.secondary, borderWidth: 0.5, borderColor: C.border.light },
  secondaryBtnText: { fontSize: 14, fontWeight: '600' },
  primaryBtn: { paddingVertical: 13, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 8, borderRadius: 10 },
  avatar: { width: 40, height: 40, borderRadius: 10, backgroundColor: C.background.secondary },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: C.primary + '22' },
  avatarInitials: { fontSize: 13, fontWeight: '700', color: C.primary },
  memberName: { fontSize: 14, fontWeight: '600', color: C.text.primary },
  memberMeta: { fontSize: 11, color: C.text.tertiary, marginTop: 1 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: C.background.secondary,
    borderWidth: 0.5,
    borderColor: C.border.light,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: C.text.primary,
    paddingVertical: 0,
  },
});
