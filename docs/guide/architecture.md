# Arquitetura do Aurora

<div class="aurora-dev-notice">
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
  Esta seção é destinada a desenvolvedores e contribuidores do projeto.
</div>

Visão geral do stack, camadas de dados e decisões de design da aplicação.

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Runtime | React Native + Expo ~54 |
| Linguagem | JavaScript (JSX) |
| Navegação | React Navigation v7 (stack + tabs) |
| Auth | Firebase Auth + OAuth externo |
| Backend | Firebase Firestore |
| Cache local | Expo SecureStore + AsyncStorage |
| UI | Design system próprio (`DesignSystem.js`) |
| Ícones | @expo/vector-icons (Ionicons) + @tabler/icons-react-native |
| Calendário | react-native-calendars |

---

## Estrutura de diretórios

```
src/
├── components/          # Componentes reutilizáveis
│   ├── HoursEditModal.js      # Modal de edição de horas
│   └── ShiftBottomSheet.js    # Bottom sheet de detalhes do plantão
├── context/             # Contextos principais
│   └── AuthContext.js         # Estado de autenticação (Firebase + OAuth externo)
├── contexts/            # Contextos de dados
│   ├── ShiftsContext.js       # Estado global dos plantões
│   └── GroupsContext.js       # Gestão de grupos/instituições
├── models/              # Modelos de dados
│   └── index.js               # Tipos e constantes de domínio
├── navigation/          # Configuração de navegação
│   ├── AppNavigator.js        # Stack root (auth/app)
│   └── TabNavigator.js        # Tab bar inferior
├── screens/             # Telas
│   ├── HomeScreenPremium.js
│   ├── CalendarScreenPremium.js
│   ├── ReportsScreen.js
│   ├── SettingsScreenPremium.js
│   ├── LoginScreenPremium.js
│   ├── GroupsScreen.js
│   ├── GroupVisibilityScreen.js
│   ├── MainScreenPremium.js
│   └── ProfileScreen.js
├── services/            # Serviços externos e utilitários
│   ├── ExternalApiService.js  # Client da API de escalas
│   ├── LocalCache.js          # Cache local de plantões
│   ├── StorageMigration.js    # Migração entre versões
│   ├── TodayCoworkersService.js  # Colegas de plantão hoje
│   └── firebase/
│       ├── config.js              # Configuração do Firebase
│       ├── FirebaseAdapter.js     # Abstração CRUD do Firestore
│       └── LoginSyncService.js    # Sincronização auth Firebase ↔ API externa
└── utils/
    ├── ShiftValueCalculator.js    # Cálculo financeiro dos plantões
    ├── MonthSummaryComputer.js    # Sumarização mensal
    ├── TimeUtils.js               # Formatação de horas/minutos
    ├── GroupColorConfig.js        # Paleta de cores de grupos
    ├── GroupVisibilityConfig.js   # Configuração de visibilidade
    ├── StorageService.js          # Abstração de storage local
    └── Logger.js                  # Logger com níveis
```

---

## Autenticação

Aurora suporta dois provedores de auth simultâneos:

```
┌──────────────────────────────────────────┐
│              AuthContext                  │
│                                          │
│  ┌─────────────────┐  ┌───────────────┐  │
│  │  Firebase Auth  │  │  API Externa  │  │
│  │  (email/senha)  │  │  (OAuth token)│  │
│  └────────┬────────┘  └───────┬───────┘  │
│           └────────┬──────────┘          │
│                    ▼                     │
│             user state                   │
│          { uid, api token }           │
└──────────────────────────────────────────┘
```

O `AuthContext` mantém o estado consolidado e expõe `user`, `loading`, `signIn`, `signOut`, `api.token` e funções de auth WebClient.

`LoginSyncService` garante que ao autenticar via API externa, um usuário Firebase correspondente seja criado/atualizado no Firestore.

---

## Fluxo de dados dos plantões

```
API de Escalas
    │
    ▼
ApiService.getShifts(month)
    │
    ▼
ShiftsContext.loadMonthlyShifts()
    ├── armazena em LocalCache (SecureStore)
    └── atualiza daysWithShifts state
         │
         ▼
    Screens consomem via useShifts()
         ├── CalendarScreenPremium → markedDates
         ├── HomeScreenPremium → próximos plantões
         └── ReportsScreen → cálculo financeiro
```

O cache local (`LocalCache.js`) evita chamadas desnecessárias à API. Cada mês é cacheado separadamente com chave `shifts_{userId}_{YYYY-MM}`.

---

## Cálculo financeiro

`ShiftValueCalculator.js` é o core do módulo financeiro:

```js
calculateShiftValueWithBreakdown(shift, config)
// Retorna: { value, hours, extra, breakdown: [...] }
```

Fatores considerados:
- Horas planejadas do plantão (M=6h, T=6h, N=12h por padrão)
- Horas extras registradas manualmente (em minutos)
- Adicional noturno (configurável)
- Valor/hora configurado por grupo

`MonthSummaryComputer.js` agrega os valores de todos os plantões do mês e retorna totais.

---

## Persistência

| Dado | Storage | TTL |
|------|---------|-----|
| Token API | SecureStore | sessão |
| Plantões (por mês) | SecureStore | permanente |
| Config de valor/hora | AsyncStorage | permanente |
| Config de grupos | AsyncStorage / Firestore | permanente |
| Visibilidade de grupos | AsyncStorage | permanente |

`StorageMigration.js` lida com mudanças de schema entre versões do app, garantindo que dados antigos sejam migrados automaticamente.

---

## Design System

Todas as telas usam o `DesignSystem.js` para consistência:

```js
import { useColors, Typography, Spacing, Shadows, BorderRadius } from '../constants/DesignSystem'

const C = useColors() // retorna paleta baseada no tema atual
```

Cores mudam automaticamente com dark/light mode. Sem hardcoded hex nas telas.

---

## Firebase / Firestore

Estrutura de dados no Firestore:

```
users/{uid}/
  ├── profile         { name, email, photoURL }
  └── groups/{gid}/   { name, color, visible, valuePerHour }

shifts/{uid}/{YYYY-MM}/{shiftId}/
  └── { ...shiftData, extraMinutes }
```

`FirebaseAdapter.js` abstrai todas as operações CRUD, expondo métodos como `getGroups()`, `saveGroup()`, `saveExtraMinutes()`.

---

## Notas de segurança

- Tokens armazenados exclusivamente no SecureStore (não AsyncStorage)
- Regras do Firestore (`firestore.rules`) garantem que usuários só leem/escrevem seus próprios dados
- Nenhuma credencial exposta em logs (Logger.js filtra dados sensíveis)
