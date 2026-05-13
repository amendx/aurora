import React, { useContext, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { AuthContext } from '../context/AuthContext';
import { useColors, Typography, Spacing, Shadows, BorderRadius } from '../constants/DesignSystem';

const ProfileScreen = () => {
  const { user, updatePhoto } = useContext(AuthContext);
  const isAurora = user?.source === 'aurora';
  const [uploading, setUploading] = useState(false);
  const C = useColors();
  const s = makeStyles(C);

  const handlePickPhoto = async () => {
    if (!isAurora) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permissão necessária', 'Precisamos acessar sua galeria para escolher uma foto.');
      return;
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });
      if (result.canceled || !result.assets?.length) return;
      setUploading(true);
      const res = await updatePhoto(result.assets[0].uri);
      if (!res.success) Alert.alert('Erro', res.error || 'Não foi possível salvar a foto.');
    } catch (err) {
      Alert.alert('Erro', 'Não foi possível abrir a galeria.');
    } finally {
      setUploading(false);
    }
  };

  const _str = (v) => {
    if (!v) return '—';
    if (typeof v === 'object') return String(v?.name || v?.id || '—');
    return String(v);
  };

  const infoRows = [
    { label: 'Nome', value: _str(user?.name) },
    { label: 'E-mail', value: _str(user?.email) },
    { label: 'Usuário', value: _str(user?.username) },
    { label: 'Conselho', value: _str(user?.council) },
  ].filter(r => r.value && r.value !== '—');

  return (
    <ScrollView style={s.container} showsVerticalScrollIndicator={false}>
      <View style={s.content}>
        {/* Avatar */}
        <View style={s.avatarWrapper}>
          <Pressable
            style={s.avatarPressable}
            onPress={handlePickPhoto}
            disabled={!isAurora || uploading}
          >
            {user?.photo ? (
              <Image source={{ uri: user.photo }} style={s.avatarImage} />
            ) : (
              <View style={s.avatar}>
                <Ionicons name="person" size={36} color={C.primary} />
              </View>
            )}
            {uploading && (
              <View style={s.avatarOverlay}>
                <ActivityIndicator size="small" color="#fff" />
              </View>
            )}
            {isAurora && !uploading && (
              <View style={s.editBadge}>
                <Ionicons name="camera" size={12} color="#fff" />
              </View>
            )}
          </Pressable>
          <Text style={s.userName}>{user?.name || 'Usuário'}</Text>
          {user?.email ? <Text style={s.userEmail}>{user.email}</Text> : null}
          {isAurora && (
            <Text style={s.editHint}>
              {uploading ? 'Enviando...' : 'Toque na foto para alterar'}
            </Text>
          )}
        </View>

        {/* Info fields */}
        {infoRows.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Informações</Text>
            <View style={s.card}>
              {infoRows.map((row, i) => (
                <View key={row.label}>
                  <View style={s.infoRow}>
                    <Text style={s.infoLabel}>{row.label}</Text>
                    <Text style={s.infoValue} numberOfLines={1}>{row.value}</Text>
                  </View>
                  {i < infoRows.length - 1 && <View style={s.separator} />}
                </View>
              ))}
            </View>
          </View>
        )}
      </View>
    </ScrollView>
  );
};

const makeStyles = (C) => ({
  container: {
    flex: 1,
    backgroundColor: C.background.secondary,
  },
  content: {
    paddingHorizontal: Spacing.screen,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xxxl + 60,
  },
  avatarWrapper: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  avatarPressable: {
    marginBottom: Spacing.md,
  },
  avatar: {
    width: 80,
    height: 80,
    backgroundColor: C.background.primary,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.small,
  },
  avatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    ...Shadows.small,
  },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: C.background.secondary,
  },
  userName: {
    fontSize: Typography.fontSize.title3,
    fontWeight: Typography.fontWeight.semiBold,
    color: C.text.primary,
    marginBottom: 4,
  },
  userEmail: {
    fontSize: Typography.fontSize.subhead,
    color: C.text.secondary,
  },
  editHint: {
    fontSize: Typography.fontSize.caption1,
    color: C.text.tertiary,
    marginTop: 6,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: Typography.fontSize.subhead,
    fontWeight: Typography.fontWeight.semiBold,
    color: C.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
    marginLeft: Spacing.sm,
  },
  card: {
    backgroundColor: C.background.primary,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    ...Shadows.small,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    minHeight: 52,
  },
  infoLabel: {
    fontSize: Typography.fontSize.subhead,
    fontWeight: Typography.fontWeight.medium,
    color: C.text.secondary,
  },
  infoValue: {
    fontSize: Typography.fontSize.subhead,
    color: C.text.primary,
    flex: 1,
    textAlign: 'right',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.border.light,
    marginHorizontal: Spacing.lg,
  },
});

export default ProfileScreen;
