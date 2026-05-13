# Guia do Desenvolvedor

<div class="aurora-dev-notice">
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
  Esta seção é destinada a desenvolvedores e contribuidores do projeto. 
</div>

Como configurar o ambiente, rodar o projeto e contribuir.

## Pré-requisitos

- Node.js 20+
- npm 10+ ou yarn
- Expo CLI: `npm install -g @expo/cli`
- iOS: Xcode 15+ e simulador iOS (macOS only)
- Android: Android Studio com emulador configurado
- Conta Firebase (para configurar o projeto)
- Acesso à API externa (opcional para desenvolvimento local)

---

## Setup inicial

### 1. Clonar o repositório

```bash
git clone https://github.com/amendx/Aurora.git
cd Aurora
```

### 2. Instalar dependências

```bash
npm install
```

### 3. Configurar Firebase

Crie um projeto no [Firebase Console](https://console.firebase.google.com) e adicione um app web.

Copie as credenciais e crie `src/services/firebase/config.js`:

```js
import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)
```

### 4. Configurar regras do Firestore

Deploy das regras de segurança:

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules
```

### 5. Rodar o projeto

```bash
# Expo Go (mais rápido para desenvolvimento)
npm start

# iOS Simulator
npm run ios

# Android Emulator
npm run android
```

---

## Variáveis de ambiente

O Aurora não usa um arquivo `.env` padrão. As configurações sensíveis ficam em:

| Arquivo | Conteúdo |
|---------|----------|
| `src/services/firebase/config.js` | Credenciais Firebase (não commitado) |
| `SecureStore` (runtime) | Token de sessão API |

**Nunca commit** o `firebase/config.js` com credenciais reais.

---

## Populando dados de teste

O script `scripts/seed-firestore.mjs` popula o Firestore com dados de exemplo:

```bash
node scripts/seed-firestore.mjs
```

Isso cria um usuário de teste com plantões dos últimos 3 meses.

---

## Arquitetura de telas

Cada tela segue este padrão:

```js
export default function ExampleScreenPremium({ navigation }) {
  const C = useColors()           // design system
  const s = makeStyles(C)         // estilos baseados no tema
  const { user } = useContext(AuthContext)
  const { daysWithShifts } = useShifts()

  // ... lógica

  return (
    <View style={s.container}>
      {/* ... */}
    </View>
  )
}

const makeStyles = (C) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  // ...
})
```

O padrão `makeStyles(C)` permite que os estilos respondam ao tema (dark/light) sem re-renderizações desnecessárias.

---

## Adicionando uma nova tela

1. Crie `src/screens/NovaTelaScreenPremium.js` seguindo o padrão acima
2. Registre em `src/navigation/AppNavigator.js` ou `TabNavigator.js`
3. Use `navigation.navigate('NovaTela')` para navegar

---

## Adicionando um novo campo ao modelo de plantão

1. Atualize `src/models/index.js` com o novo campo e tipo
2. Atualize o serviço de API se o campo vem da API
3. Atualize `FirebaseAdapter.js` se o campo é persistido localmente
4. Atualize `StorageMigration.js` se dados antigos precisam ser migrados

---

## Logger

Use o `Logger` em vez de `console.log`:

```js
import Logger from '../utils/Logger'

Logger.debug('Carregando plantões', { month, userId })
Logger.info('Plantões carregados', { count })
Logger.warn('Sem plantões no mês', { month })
Logger.error('Erro ao carregar', error)
```

Em produção, logs abaixo de `warn` são suprimidos.

---

## Testes

O projeto ainda não tem testes automatizados configurados. Área de contribuição bem-vinda.

Para adicionar:
1. Configure Jest com `@testing-library/react-native`
2. Adicione testes para `ShiftValueCalculator.js` (lógica pura, fácil de testar)
3. Adicione testes para `MonthSummaryComputer.js`

---

## Deploy

O app é distribuído via Expo. Para build de produção:

```bash
# EAS Build (recomendado)
npm install -g eas-cli
eas build --platform ios
eas build --platform android
```

Configure `eas.json` com os profiles de build adequados.

---

## Contribuindo

1. Fork o repositório
2. Crie uma branch: `git checkout -b feature/minha-feature`
3. Commit com mensagem descritiva: `git commit -m "feat: adiciona X"`
4. Abra um Pull Request com descrição do que foi feito e por quê
