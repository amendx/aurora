# Perguntas Frequentes

<div class="aurora-badge">FAQ</div>

## Geral

### O Aurora é gratuito?

Sim. O Aurora é gratuito para uso pessoal.

### Preciso de conta em alguma plataforma de escalas?

Não é obrigatório. Você pode criar uma conta Aurora com e-mail e senha. Mas se você já usa uma plataforma de gestão de escalas compatível, o login integrado é o caminho mais rápido — seus plantões já estão lá.

### O Aurora funciona offline?

Sim, parcialmente. Meses já carregados ficam em cache local e funcionam sem internet. Para carregar novos meses ou sincronizar plantões recentes, você precisa de conexão.

### Meus dados estão seguros?

Sim. Tokens de autenticação são armazenados no SecureStore (encriptado pelo OS). Dados no Firestore são protegidos por regras que impedem acesso entre usuários. Nenhum dado é vendido ou compartilhado com terceiros.

---

## Plantões e Calendário

### Por que meus plantões não aparecem no calendário?

Verifique:
1. Se a conta está conectada (Configurações → Contas)
2. Faça pull-to-refresh no calendário
3. Verifique se o grupo do plantão está visível (Configurações → Grupos)

### Posso adicionar plantões manualmente?

Não diretamente no Aurora — a fonte de verdade dos plantões é sua plataforma de escalas. Para adicionar ou alterar plantões, use a plataforma e depois sincronize no Aurora.

### Como edito as horas de entrada e saída?

Toque no plantão no calendário para abrir o bottom sheet. No detalhe do plantão, há uma opção para editar horas. As horas editadas são salvas localmente e usadas nos cálculos financeiros.

### O que são horas extras?

Horas extras são o tempo trabalhado além do horário planejado do plantão. Você pode registrá-las manualmente tocando no plantão e usando o botão de edição de horas.

---

## Financeiro

### Como funciona o cálculo do valor do plantão?

Configure um valor por hora em Configurações → Valor do Plantão. O Aurora multiplica as horas trabalhadas (incluindo extras) pelo valor configurado. Adicional noturno é aplicado se ativado.

### Posso ter valores diferentes por hospital?

Sim. Em Configurações → Grupos, cada grupo pode ter seu próprio valor/hora. Útil quando você trabalha em hospitais públicos e privados com tabelas diferentes.

### O relatório pode ser exportado?

Sim. Na tela de Relatórios, há um botão de compartilhamento. O relatório é exportado como texto formatado e pode ser enviado por qualquer app (WhatsApp, e-mail, etc.).

---

## Conta e Autenticação

### Como faço logout?

Configurações → Conta → Sair. Você pode desconectar cada conta vinculada separadamente.

### Esqueci minha senha Aurora

Na tela de login, toque em "Esqueci minha senha". Um e-mail de redefinição será enviado.

### Posso usar o Aurora em mais de um dispositivo?

Sim. Seus dados são sincronizados via Firebase. Faça login com a mesma conta em qualquer dispositivo.

---

## Colegas de Plantão

### Por que não vejo colegas na tela "Quem está hoje"?

A funcionalidade depende da integração com a plataforma. Verifique se:
1. Sua conta está conectada
2. Há colegas escalados no mesmo local/turno de hoje
3. Você não desativou a visibilidade do grupo correspondente

### Meus colegas conseguem me ver?

Apenas se você estiver no mesmo plantão (mesmo local, mesmo turno, mesmo dia). Profissionais de outros plantões não aparecem para você e vice-versa.

---

## Técnico

### Em quais plataformas o Aurora roda?

iOS e Android. O app é construído com React Native / Expo, suportando ambas as plataformas a partir de uma única base de código.

### O código é open source?

Sim. O repositório está em [github.com/amendx/Aurora](https://github.com/amendx/Aurora). Contribuições são bem-vindas.

### Como reportar um bug?

Abra uma [issue no GitHub](https://github.com/amendx/Aurora/issues) com uma descrição clara do problema, versão do app e OS, e passos para reproduzir.
