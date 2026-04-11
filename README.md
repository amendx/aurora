# Cem Horas

Um aplicativo mobile React Native desenvolvido para integração com a API Soffia. Este projeto é uma Prova de Conceito (POC) focada em funcionalidades de login e logout.

## 📱 Sobre o Aplicativo

O "Cem Horas" (também conhecido como "Senhoras" pela sonoridade) é um app híbrido que funciona em iOS e Android, desenvolvido para integrar com o sistema Soffia através de sua API.

### Funcionalidades Implementadas

- ✅ **Login**: Autenticação com a API Soffia
- ✅ **Logout**: Saída segura da aplicação  
- ✅ **Armazenamento Seguro**: Tokens e dados do usuário protegidos
- ✅ **Context de Autenticação**: Gerenciamento global do estado de login
- ✅ **Interface Responsiva**: Design adaptável para diferentes tamanhos de tela

## 🚀 Tecnologias Utilizadas

- **React Native** com **Expo**
- **React Navigation** para navegação entre telas
- **Expo SecureStore** para armazenamento seguro
- **Context API** para gerenciamento de estado
- **API REST** - Integração com Soffia API

## 📋 Pré-requisitos

- Node.js (versão 18 ou superior)
- npm ou yarn
- Expo CLI
- Expo Go app no dispositivo móvel (para testes)

## 🛠️ Instalação e Configuração

1. **Clone o repositório**:
   ```bash
   git clone [URL_DO_REPOSITÓRIO]
   cd Cemhoras
   ```

2. **Instale as dependências**:
   ```bash
   npm install
   ```

3. **Execute o projeto**:
   ```bash
   npm start
   ```

4. **Teste no dispositivo**:
   - Instale o app **Expo Go** no seu dispositivo
   - Escaneie o QR Code mostrado no terminal/browser
   - O app será carregado no seu dispositivo

## 📱 Como Usar

### Login
1. Abra o aplicativo
2. Insira suas credenciais da Soffia:
   - **Email**: Seu email cadastrado na Soffia
   - **Senha**: Sua senha da Soffia
3. Toque em "Entrar"

### Logout
1. Na tela principal, toque em "Sair"
2. Confirme a ação na popup
3. Você será redirecionado para a tela de login

## 🔧 Estrutura do Projeto

```
src/
├── context/
│   └── AuthContext.js          # Context de autenticação
├── screens/
│   ├── LoginScreen.js          # Tela de login
│   └── HomeScreen.js           # Tela principal
├── services/
│   └── SoffiaApiService.js     # Serviços da API Soffia
└── utils/
    └── StorageService.js       # Utilitários de armazenamento
```

## 🌐 Integração com API Soffia

O app se conecta com a API Soffia através dos seguintes endpoints:

### Login
- **URL**: `https://api.plantaoativo.com/auth/login`
- **Método**: POST
- **Headers**: 
  - `Accept: application/json`
  - `Accept-Version: 2.0`
  - `Content-Type: application/json`
  - `Origin: https://web.soffia.co`

### Logout
- **URL**: `https://api.plantaoativo.com/auth/logout`
- **Método**: POST
- **Headers**: Incluindo Authorization Bearer Token

## 🔒 Segurança

- **Armazenamento Seguro**: Utiliza Expo SecureStore para tokens
- **Headers de Segurança**: Implementa headers apropriados para a API
- **Validação**: Verificação de campos obrigatórios
- **Tratamento de Erros**: Feedback adequado para o usuário

## 📝 Scripts Disponíveis

- `npm start` - Inicia o servidor de desenvolvimento
- `npm run android` - Executa no Android
- `npm run ios` - Executa no iOS
- `npm run web` - Executa no navegador web

## 🐛 Troubleshooting

### Problema com TypeScript
Se aparecer warning sobre versão do TypeScript:
```bash
npm install typescript@~5.3.3
```

### Problema com Expo
Se o QR Code não carregar:
1. Certifique-se que o dispositivo está na mesma rede
2. Tente executar `expo start --tunnel`
3. Verifique se o Expo Go está atualizado

### Erro de Login
- Verifique se as credenciais estão corretas
- Confirme se tem conexão com internet
- Veja os logs do console para mais detalhes

## 📄 Licença

Este projeto é uma POC desenvolvida para demonstração da integração com a API Soffia.

## 👥 Contribuição

Este é um projeto de demonstração. Para sugestões ou melhorias, entre em contato com o time de desenvolvimento.

---

**Status**: ✅ POC Funcional - Login/Logout implementado e testado