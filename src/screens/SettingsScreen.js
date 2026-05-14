import React, { useContext } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, Switch } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AuthContext } from "../context/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import { useColors, Typography, Spacing, Shadows, BorderRadius } from "../constants/DesignSystem";

const SettingsScreen = ({ navigation }) => {
  const { logout } = useContext(AuthContext);
  const { isDark, preference, setTheme } = useTheme();
  const insets = useSafeAreaInsets();
  const C = useColors();

  const themeLabel = preference === 'system' ? 'Automático' : preference === 'dark' ? 'Escuro' : 'Claro';
  const themeIcon = preference === 'system' ? 'phone-portrait-outline' : preference === 'dark' ? 'moon-outline' : 'sunny-outline';

  const handleLogout = () => {
    Alert.alert(
      'Sair da Conta',
      'Tem certeza que deseja sair da sua conta?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Sair', style: 'destructive', onPress: logout },
      ]
    );
  };

  const settingsItems = [
    {
      id: "profile",
      title: "Perfil",
      subtitle: "Gerencie suas informações pessoais",
      icon: "person-outline",
      onPress: () => navigation?.navigate("Profile"),
    },
    {
      id: "config",
      title: "Valores do Plantão",
      subtitle: "Configure valores e parâmetros",
      icon: "calculator-outline",
      onPress: () => navigation?.navigate("ConfigScreen"),
    },
    {
      id: "groups",
      title: "Grupos",
      subtitle: "Gerencie seus grupos",
      icon: "people-circle-outline",
      onPress: () => navigation?.navigate("GroupsScreen"),
    },
    {
      id: "groupVisibility",
      title: "Visibilidade de grupos",
      subtitle: "Escolha quem aparece no seu plantão",
      icon: "cloud-circle-outline",
      onPress: () => navigation?.navigate("GroupVisibilityScreen"),
    },
  ];

  const s = makeStyles(C);

  const renderSettingsItem = (item, isLast = false) => (
    <View key={item.id}>
      <Pressable
        style={({ pressed }) => [s.settingsItem, pressed && s.settingsItemPressed]}
        onPress={item.onPress}
      >
        <View style={s.settingsIcon}>
          <Ionicons name={item.icon} size={24} color={C.interactive.active} />
        </View>
        <View style={s.settingsContent}>
          <Text style={s.settingsTitle}>{item.title}</Text>
          <Text style={s.settingsSubtitle}>{item.subtitle}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={C.interactive.inactive} />
      </Pressable>
      {!isLast && <View style={s.separator} />}
    </View>
  );

  const renderSection = (title, items) => (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      <View style={s.card}>
        {items.map((item, index) => renderSettingsItem(item, index === items.length - 1))}
      </View>
    </View>
  );

  const accountItems = settingsItems.slice(0, 2);
  const groupsItems = settingsItems.slice(2, 4);

  return (
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.lg }} showsVerticalScrollIndicator={false}>
      <View style={s.content}>
        {renderSection("Conta", accountItems)}
        {renderSection("Grupos", groupsItems)}

        <View style={s.section}>
          <Text style={s.sectionTitle}>Aplicativo</Text>
          <View style={s.card}>
            {/* Theme toggle */}
            <Pressable style={s.settingsItem} onPress={() => setTheme(isDark ? 'light' : 'dark')}>
              <View style={s.settingsIcon}>
                <Ionicons name={themeIcon} size={24} color={C.interactive.active} />
              </View>
              <View style={s.settingsContent}>
                <Text style={s.settingsTitle}>Aparência</Text>
                <Text style={s.settingsSubtitle}>{themeLabel}</Text>
              </View>
              <Switch
                value={isDark}
                onValueChange={() => setTheme(isDark ? 'light' : 'dark')}
                trackColor={{ false: C.border.medium, true: C.primary + '60' }}
                thumbColor={isDark ? C.primary : C.interactive.inactive}
              />
            </Pressable>
            <View style={s.separator} />
            <Pressable
              style={({ pressed }) => [s.settingsItem, pressed && s.settingsItemPressed]}
              onPress={handleLogout}
            >
              <View style={[s.settingsIcon, { backgroundColor: C.error + '15' }]}>
                <Ionicons name="log-out-outline" size={24} color={C.error} />
              </View>
              <View style={s.settingsContent}>
                <Text style={[s.settingsTitle, { color: C.error }]}>Sair da Conta</Text>
                <Text style={s.settingsSubtitle}>Desconectar do aplicativo</Text>
              </View>
            </Pressable>
          </View>
        </View>

        <View style={s.versionContainer}>
          <Text style={s.versionText}>Aurora v1.0.0</Text>
        </View>
      </View>
    </ScrollView>
  );
};

const makeStyles = (C) => ({
  container: { flex: 1, backgroundColor: C.background.secondary },
  content: { padding: Spacing.screen },
  section: { marginBottom: Spacing.lg },
  sectionTitle: {
    fontSize: Typography.fontSize.subhead,
    fontWeight: Typography.fontWeight.semiBold,
    color: C.text.secondary,
    marginBottom: Spacing.sm,
    marginLeft: Spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: C.background.primary,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    ...Shadows.small,
  },
  settingsItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    minHeight: 64,
  },
  settingsItemPressed: { backgroundColor: C.background.secondary },
  settingsIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.background.secondary,
    borderRadius: 20,
    marginRight: Spacing.md,
  },
  settingsContent: { flex: 1 },
  settingsTitle: {
    fontSize: Typography.fontSize.body,
    fontWeight: Typography.fontWeight.medium,
    color: C.text.primary,
    marginBottom: 2,
  },
  settingsSubtitle: {
    fontSize: Typography.fontSize.footnote,
    color: C.text.secondary,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.border.light,
    marginLeft: 56,
  },
  versionContainer: {
    alignItems: "center",
    marginTop: Spacing.xl,
    paddingTop: Spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border.light,
  },
  versionText: {
    fontSize: Typography.fontSize.caption1,
    color: C.text.tertiary,
  },
});

export default SettingsScreen;
