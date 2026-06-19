/**
 * PrivacyContext — esconder valores monetários no app inteiro (modo "banco").
 *
 * Um único toggle global (olho aberto/fechado). Quando ligado, todo valor de
 * dinheiro renderizado via <MoneyText> vira máscara (R$ ••••), pra usar o app
 * em público sem expor ganhos. Persiste em AsyncStorage.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'aurora_values_hidden';
const PrivacyContext = createContext({ valuesHidden: false, toggleValues: () => {} });

export const usePrivacy = () => useContext(PrivacyContext);

export const PrivacyProvider = ({ children }) => {
  const [valuesHidden, setValuesHidden] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then(v => { if (v != null) setValuesHidden(v === '1'); }).catch(() => {});
  }, []);

  const toggleValues = useCallback(() => {
    setValuesHidden(prev => {
      const next = !prev;
      AsyncStorage.setItem(KEY, next ? '1' : '0').catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo(() => ({ valuesHidden, toggleValues }), [valuesHidden, toggleValues]);
  return <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>;
};
