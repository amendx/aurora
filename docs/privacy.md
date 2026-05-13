# Política de Privacidade

**Última atualização:** Maio de 2025

Esta política descreve como o Aurora coleta, usa e protege as informações dos usuários.

---

## 1. Informações coletadas

### 1.1 Dados de conta

Ao criar uma conta Aurora, coletamos:
- Endereço de e-mail
- Senha (armazenada com hash, nunca em texto plano)
- Nome de exibição (opcional)
- Foto de perfil (opcional)

### 1.2 Dados de uso

Ao conectar sua conta de escalas:
- Token de autenticação (armazenado localmente no SecureStore)
- Dados de plantões da API (datas, turnos, grupos/instituições)

### 1.3 Configurações

Armazenamos localmente e/ou no Firebase:
- Configuração de valor por hora por grupo
- Preferências de visibilidade de grupos
- Horas extras registradas manualmente
- Preferências de tema

### 1.4 Dados que NÃO coletamos

- Localização geográfica
- Contatos do dispositivo
- Histórico de navegação
- Informações de saúde clínica dos pacientes
- Dados financeiros bancários

---

## 2. Uso das informações

Usamos as informações coletadas exclusivamente para:

- Autenticar e identificar o usuário no app
- Carregar e exibir os plantões da conta vinculada
- Calcular relatórios financeiros localmente
- Mostrar colegas de plantão (usando dados da API)
- Sincronizar configurações entre dispositivos do mesmo usuário

**Não vendemos, alugamos ou compartilhamos seus dados com terceiros.**

---

## 3. Armazenamento e segurança

### Local (no dispositivo)
- Tokens de autenticação: **Expo SecureStore** (encriptação nativa do OS)
- Cache de plantões: SecureStore
- Configurações: AsyncStorage

### Nuvem (Firebase / Google)
- Perfil de usuário e configurações de grupos: **Firebase Firestore**
- Acesso protegido por regras de segurança — cada usuário acessa apenas seus próprios dados

### Transmissão
- Toda comunicação com servidores usa HTTPS/TLS
- Nenhum dado é transmitido sem criptografia

---

## 4. Retenção de dados

- Dados no Firebase são retidos enquanto a conta existir
- Ao excluir a conta, todos os dados são removidos do Firestore
- Cache local no dispositivo pode ser limpo manualmente em Configurações → Conta → Limpar cache

---

## 5. Dados da plataforma de escalas

O Aurora acessa dados da plataforma de escalas via API REST usando o token fornecido pelo usuário. Esses dados pertencem à plataforma e ao usuário. O Aurora não armazena dados de plantões na nuvem — apenas em cache local no dispositivo.

Para saber como a plataforma de escalas trata seus dados, consulte a política de privacidade da plataforma diretamente.

---

## 6. Menores de idade

O Aurora não é destinado a menores de 18 anos. Não coletamos conscientemente informações de menores.

---

## 7. Alterações nesta política

Podemos atualizar esta política periodicamente. Alterações significativas serão comunicadas via notificação no app. O uso continuado do Aurora após a notificação constitui aceite das novas condições.

---

## 8. Contato

Para dúvidas sobre privacidade ou solicitações de exclusão de dados:
- GitHub Issues: [github.com/amendx/Aurora/issues](https://github.com/amendx/Aurora/issues)

---

*Aurora é um projeto de código aberto. O código-fonte, incluindo as regras de segurança do Firebase, está disponível em [github.com/amendx/Aurora](https://github.com/amendx/Aurora) para auditoria pública.*
