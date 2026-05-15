import { useState, useContext } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView,
  StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase/config';
import { AuthContext } from '../context/AuthContext';
import { useColors, Typography, Spacing, BorderRadius, Shadows } from '../constants/DesignSystem';
import Logger from '../utils/Logger';

export default function HospitalsScreen({ navigation }) {
  const C = useColors();
  const s = makeStyles(C);
  const insets = useSafeAreaInsets();
  const { user, updateUser } = useContext(AuthContext);

  const [hospitals, setHospitals] = useState(Array.isArray(user?.hospitals) ? [...user.hospitals] : []);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);

  const addHospital = () => {
    const h = input.trim();
    if (!h || hospitals.includes(h)) { setInput(''); return; }
    setHospitals(prev => [...prev, h]);
    setInput('');
  };

  const removeHospital = (h) => {
    Alert.alert('Remover hospital', `Remover "${h}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: () => setHospitals(prev => prev.filter(x => x !== h)) },
    ]);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (db && user?.id) {
        await updateDoc(doc(db, 'users', user.id), { hospitals });
      }
      await updateUser({ hospitals });
      navigation?.goBack?.();
    } catch (err) {
      Logger.error('HospitalsScreen save error:', err?.message);
      Alert.alert('Erro', 'Não foi possível salvar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[s.root, { backgroundColor: C.background.secondary }]}>
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => navigation?.goBack?.()} hitSlop={12} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={C.primary} />
        </Pressable>
        <Text style={s.title}>Meus hospitais</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: Spacing.screen, paddingBottom: insets.bottom + 100 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={s.hint}>Adicione os hospitais onde você trabalha. Eles aparecem como opção ao registrar plantões manuais.</Text>

        {/* Input row */}
        <View style={[s.inputRow, { backgroundColor: C.background.elevated, borderColor: C.border.light }]}>
          <TextInput
            style={[s.input, { color: C.text.primary }]}
            value={input}
            onChangeText={setInput}
            placeholder="Nome do hospital"
            placeholderTextColor={C.text.placeholder}
            autoCapitalize="words"
            onSubmitEditing={addHospital}
            returnKeyType="done"
          />
          <Pressable onPress={addHospital} style={[s.addBtn, { backgroundColor: C.primary }]}>
            <Ionicons name="add" size={20} color="#fff" />
          </Pressable>
        </View>

        {/* List */}
        {hospitals.length === 0 ? (
          <Text style={[s.empty, { color: C.text.tertiary }]}>Nenhum hospital adicionado ainda.</Text>
        ) : (
          <View style={[s.list, { backgroundColor: C.background.elevated, borderColor: C.border.light, ...Shadows.small }]}>
            {hospitals.map((h, i) => (
              <View key={h} style={[s.row, i < hospitals.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: C.border.light }]}>
                <Ionicons name="business-outline" size={16} color={C.primary} style={{ marginRight: 10 }} />
                <Text style={[s.rowText, { color: C.text.primary }]} numberOfLines={1}>{h}</Text>
                <Pressable onPress={() => removeHospital(h)} hitSlop={10}>
                  <Ionicons name="trash-outline" size={16} color={C.error} />
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Save button */}
      <View style={[s.footer, { paddingBottom: insets.bottom + Spacing.md, backgroundColor: C.background.secondary, borderTopColor: C.border.light }]}>
        <Pressable style={[s.saveBtn, { backgroundColor: C.primary }]} onPress={handleSave} disabled={saving}>
          {saving
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={s.saveBtnText}>Salvar</Text>
          }
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (C) => StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.screen, paddingBottom: 12, gap: 8 },
  backBtn: { padding: 4 },
  title: { fontSize: 20, fontFamily: Typography.fontFamily.display, fontWeight: '700', color: C.text.primary },

  hint: { fontSize: 13, color: C.text.secondary, lineHeight: 19, marginBottom: Spacing.lg },

  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: BorderRadius.md, borderWidth: 1,
    overflow: 'hidden', marginBottom: Spacing.lg,
  },
  input: { flex: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: Typography.fontFamily.regular },
  addBtn: { width: 48, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },

  empty: { fontSize: 14, textAlign: 'center', marginTop: Spacing.xl },

  list: { borderRadius: BorderRadius.md, borderWidth: 0.5, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13 },
  rowText: { flex: 1, fontSize: 15, fontFamily: Typography.fontFamily.regular },

  footer: { paddingHorizontal: Spacing.screen, paddingTop: Spacing.md, borderTopWidth: 0.5 },
  saveBtn: { height: 50, borderRadius: BorderRadius.pill, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { fontSize: 15, fontFamily: Typography.fontFamily.bold, color: '#fff', fontWeight: '700' },
});
