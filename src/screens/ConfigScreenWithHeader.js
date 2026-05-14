import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AppHeader from '../components/AppHeader';
import ConfigScreen from '../screens/ConfigScreen';

export default function ConfigScreenWithHeader() {
  const navigation = useNavigation();

  const handleBackPress = () => {
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      {/* Header nativo com botão voltar */}
      <AppHeader 
        title="Valores do Plantão"
        showBackButton={true}
        onBackPress={handleBackPress}
      />
      
      <View style={styles.content}>
        <ConfigScreen navigation={navigation} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    flex: 1,
  },
});