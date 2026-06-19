/**
 * MinhasEscalasFixasScreen — o médico vê as células de escala fixa em que é
 * titular ou co-escalista e pode ENTREGAR (definitivo) ou TRANSFERIR TEMPORÁRIO
 * (premium, colega do mesmo grupo cobre um período). As escritas vão por Cloud
 * Function (entregarEscala/transferirEscala/reverterEscalaTemp) — a regra de
 * fixedSlots é write-staff, então o app não escreve direto.
 */
import { useState, useEffect, useCallback, useContext, useMemo } from 'react';
import {
  View, Text, ScrollView, Pressable, ActivityIndicator, Alert,
  Modal, TextInput, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons as Ico } from '@expo/vector-icons';
import { useColors, Typography, Spacing, BorderRadius, Shadows } from '../constants/DesignSystem';
import { AuthContext } from '../context/AuthContext';
import { useGroups } from '../contexts/GroupsContext';
import FirebaseAdapter from '../services/firebase/FirebaseAdapter';
import Logger from '../utils/Logger';

const WD_FULL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const TURNO = { M: 'Manhã', T: 'Tarde', N: 'Noite', FN: 'Sex. noite', D: 'Noite' };
const isISO = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

export default function MinhasEscalasFixasScreen() {
  const C = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useContext(AuthContext);
  const { groupsById, coworkersById } = useGroups();

  const groupIds = useMemo(() => Object.keys(groupsById || {}), [groupsById]);
  const groupName = (gid) => groupsById?.[gid]?.name || 'Grupo';
  const personName = (uid) => coworkersById?.[uid]?.name || coworkersById?.[uid]?.full_name || 'Colega';

  const [slots, setSlots] = useState(null); // null = carregando
  const [busy, setBusy] = useState(false);
  const [transferFor, setTransferFor] = useState(null);

  const load = useCallback(async () => {
    if (!user?.id || groupIds.length === 0) { setSlots([]); return; }
    try {
      const out = await FirebaseAdapter.getMyFixedSlots(user.id, groupIds);
      setSlots(out);
    } catch (e) {
      Logger.warn(`MinhasEscalasFixas load: ${e?.message}`);
      setSlots([]);
    }
  }, [user?.id, groupIds]);

  useEffect(() => { load(); }, [load]);

  const run = async (fn, data, okMsg) => {
    setBusy(true);
    const r = await FirebaseAdapter.callFixedFn(fn, data);
    setBusy(false);
    if (r?.ok) { if (okMsg) Alert.alert('Pronto', okMsg); await load(); }
    else Alert.alert('Não deu', r?.reason || 'Tente novamente.');
    return r?.ok;
  };

  const confirmEntregar = (slot) => {
    const isCo = slot.co && String(slot.co.userId) === String(user?.id);
    Alert.alert(
      isCo ? 'Sair como co-escalista?' : 'Entregar a escala?',
      isCo
        ? 'Você deixa de dividir esta escala. O titular fica com a escala inteira.'
        : 'Definitivo: a célula volta ao pool de vagas e você deixa de ser o titular.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: isCo ? 'Sair' : 'Entregar',
          style: 'destructive',
          onPress: () => run('entregarEscala', { groupId: slot.groupId, slotId: slot.id }),
        },
      ],
    );
  };

  return (
    <View style={[s.root, { backgroundColor: C.background.secondary }]}>
      <ScrollView contentContainerStyle={{ padding: Spacing.screen, paddingBottom: 120 + insets.bottom }}>
        {slots === null ? (
          <ActivityIndicator size="small" color={C.primary} style={{ marginTop: 40 }} />
        ) : slots.length === 0 ? (
          <View style={[s.empty, { backgroundColor: C.background.elevated, borderColor: C.border.light }]}>
            <Ico name="calendar-outline" size={22} color={C.text.tertiary} />
            <Text style={[s.emptyText, { color: C.text.secondary }]}>
              Você não é titular nem co-escalista de nenhuma escala fixa.
            </Text>
          </View>
        ) : (
          slots.map((slot) => {
            const isCo = slot.co && String(slot.co.userId) === String(user?.id);
            const cover = slot.tempCover;
            return (
              <View key={`${slot.groupId}_${slot.id}`} style={[s.card, { backgroundColor: C.background.elevated, borderColor: C.border.light }]}>
                <View style={s.cardHead}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.when, { color: C.text.primary }]}>
                      {WD_FULL[slot.weekday]} · {TURNO[slot.turno] || slot.turno}
                    </Text>
                    <Text style={[s.sub, { color: C.text.tertiary }]}>
                      {groupName(slot.groupId)} · vaga {slot.slotIndex + 1}
                    </Text>
                  </View>
                  <View style={[s.roleTag, { backgroundColor: (isCo ? C.info : C.primary) + '1a' }]}>
                    <Text style={[s.roleTagText, { color: isCo ? C.info : C.primary }]}>
                      {isCo ? 'Co-escalista' : 'Titular'}
                    </Text>
                  </View>
                </View>

                {slot.co && (
                  <Text style={[s.co, { color: C.text.tertiary }]}>
                    Divide alternado com {isCo ? personName(slot.titularId) : personName(slot.co.userId)}
                  </Text>
                )}

                {cover && (
                  <View style={[s.coverBox, { backgroundColor: C.warning + '14', borderColor: C.warning + '33' }]}>
                    <Ico name="airplane-outline" size={14} color={C.warning} />
                    <Text style={[s.coverText, { color: C.warning }]}>
                      {personName(cover.userId)} cobre {cover.de} → {cover.ate}
                    </Text>
                    <Pressable onPress={() => run('reverterEscalaTemp', { groupId: slot.groupId, slotId: slot.id })} hitSlop={8}>
                      <Text style={[s.coverUndo, { color: C.warning }]}>desfazer</Text>
                    </Pressable>
                  </View>
                )}

                <View style={s.actions}>
                  <Pressable
                    style={[s.btn, { borderColor: C.border.medium }]}
                    disabled={busy}
                    onPress={() => setTransferFor(slot)}
                  >
                    <Ico name="swap-horizontal-outline" size={15} color={C.text.primary} />
                    <Text style={[s.btnText, { color: C.text.primary }]}>Transferir temp.</Text>
                  </Pressable>
                  <Pressable
                    style={[s.btn, { borderColor: C.error + '55' }]}
                    disabled={busy}
                    onPress={() => confirmEntregar(slot)}
                  >
                    <Ico name="exit-outline" size={15} color={C.error} />
                    <Text style={[s.btnText, { color: C.error }]}>{isCo ? 'Sair' : 'Entregar'}</Text>
                  </Pressable>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <TransferModal
        slot={transferFor}
        C={C}
        members={(transferFor ? (groupsById?.[transferFor.groupId]?.memberIds || []) : [])
          .filter((id) => String(id) !== String(user?.id))
          .map((id) => ({ id: String(id), name: personName(id) }))}
        busy={busy}
        onClose={() => setTransferFor(null)}
        onConfirm={async (toUserId, de, ate) => {
          const ok = await run('transferirEscala', { groupId: transferFor.groupId, slotId: transferFor.id, toUserId, de, ate }, 'Cobertura registrada.');
          if (ok) setTransferFor(null);
        }}
      />
    </View>
  );
}

function TransferModal({ slot, C, members, busy, onClose, onConfirm }) {
  const [toUser, setToUser] = useState('');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  useEffect(() => { setToUser(''); setDe(''); setAte(''); }, [slot?.id]);
  if (!slot) return null;
  const valid = toUser && isISO(de) && isISO(ate) && de <= ate;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} />
      <View style={[s.sheet, { backgroundColor: C.background.secondary }]}>
        <Text style={[s.sheetTitle, { color: C.text.primary }]}>Transferir temporariamente</Text>
        <Text style={[s.sheetHint, { color: C.text.tertiary }]}>
          Um colega do grupo cobre um período. Você continua dono da escala.
        </Text>

        <Text style={[s.fieldLabel, { color: C.text.tertiary }]}>Colega</Text>
        <ScrollView style={{ maxHeight: 160 }}>
          {members.length === 0 ? (
            <Text style={[s.sheetHint, { color: C.text.tertiary }]}>Sem outros membros no grupo.</Text>
          ) : members.map((mm) => (
            <Pressable
              key={mm.id}
              style={[s.memberRow, toUser === mm.id && { backgroundColor: C.accentSoft }]}
              onPress={() => setToUser(mm.id)}
            >
              <Text style={[s.memberName, { color: C.text.primary }]}>{mm.name}</Text>
              {toUser === mm.id && <Ico name="checkmark-circle" size={18} color={C.primary} />}
            </Pressable>
          ))}
        </ScrollView>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={[s.fieldLabel, { color: C.text.tertiary }]}>De (AAAA-MM-DD)</Text>
            <TextInput style={[s.input, { color: C.text.primary, borderColor: C.border.light, backgroundColor: C.background.elevated }]}
              value={de} onChangeText={setDe} placeholder="2026-06-15" placeholderTextColor={C.text.tertiary} autoCapitalize="none" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.fieldLabel, { color: C.text.tertiary }]}>Até (AAAA-MM-DD)</Text>
            <TextInput style={[s.input, { color: C.text.primary, borderColor: C.border.light, backgroundColor: C.background.elevated }]}
              value={ate} onChangeText={setAte} placeholder="2026-06-29" placeholderTextColor={C.text.tertiary} autoCapitalize="none" />
          </View>
        </View>

        <Pressable
          style={[s.confirm, { backgroundColor: valid && !busy ? C.primary : C.border.medium }]}
          disabled={!valid || busy}
          onPress={() => onConfirm(toUser, de, ate)}
        >
          {busy ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.confirmText}>Confirmar cobertura</Text>}
        </Pressable>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  empty: { alignItems: 'center', gap: 10, padding: 28, borderRadius: BorderRadius.md, borderWidth: 0.5, marginTop: 20 },
  emptyText: { fontSize: 13.5, textAlign: 'center', lineHeight: 19 },
  card: { borderRadius: BorderRadius.md, borderWidth: 0.5, padding: 14, marginBottom: Spacing.sm, ...Shadows.small },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  when: { fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
  sub: { fontSize: 12, marginTop: 1 },
  roleTag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  roleTagText: { fontSize: 11, fontWeight: '700' },
  co: { fontSize: 12, marginTop: 8 },
  coverBox: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 9, borderRadius: 9, borderWidth: 0.5, marginTop: 10 },
  coverText: { flex: 1, fontSize: 12, fontWeight: '600' },
  coverUndo: { fontSize: 12, fontWeight: '700', textDecorationLine: 'underline' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  btn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 40, borderRadius: 10, borderWidth: 0.5 },
  btnText: { fontSize: 13, fontWeight: '700' },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { padding: 18, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingBottom: 34 },
  sheetTitle: { fontSize: 17, fontWeight: '800' },
  sheetHint: { fontSize: 12.5, marginTop: 4, lineHeight: 18 },
  fieldLabel: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 14, marginBottom: 6 },
  memberRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 11, paddingHorizontal: 12, borderRadius: 10 },
  memberName: { fontSize: 14, fontWeight: '600' },
  input: { height: 42, borderRadius: 10, borderWidth: 0.5, paddingHorizontal: 12, fontSize: 14 },
  confirm: { height: 50, borderRadius: BorderRadius.pill, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  confirmText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
