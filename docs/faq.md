# Perguntas Frequentes

<div class="aurora-badge">FAQ</div>

## Geral

### O Aurora é gratuito?

Sim. O Aurora é gratuito para uso pessoal.

### Preciso de conta em alguma plataforma de escalas?

Não é obrigatório. Você pode criar uma conta Aurora com e-mail e senha. Mas se você já usa uma plataforma de gestão de escalas compatível, o login integrado é o caminho mais rápido — seus plantões já estão lá.

### O Aurora funciona offline?

Sim, parcialmente. Meses já carregados ficam salvos no dispositivo e funcionam sem internet. Para carregar novos meses ou sincronizar plantões recentes, você precisa de conexão.

### Meus dados estão seguros?

Sim. As credenciais de autenticação ficam num armazenamento seguro, encriptado pelo sistema. Os dados na nuvem são protegidos por regras que impedem acesso entre usuários. Nenhum dado é vendido ou compartilhado com terceiros.

---

## Plantões e Calendário

### Por que meus plantões não aparecem no calendário?

Verifique:
1. Se a conta está conectada (Configurações → Contas)
2. Faça pull-to-refresh no calendário
3. Verifique se o grupo do plantão está visível (Configurações → Grupos)

### Posso adicionar plantões manualmente?

Sim. Toque num dia no calendário e use **Adicionar plantão** — escolha tipo (manhã/tarde/noite), hospital, horário de entrada/saída e veja o valor estimado na hora. O registro manual complementa a sua plataforma de escalas, que segue como fonte principal.

### Como edito as horas de entrada e saída?

Toque no plantão no calendário para abrir o bottom sheet. No detalhe do plantão, há uma opção para editar horas. As horas editadas são salvas localmente e usadas nos cálculos financeiros.

### O que são horas extras?

Horas extras são o tempo trabalhado além do horário planejado do plantão. Você pode registrá-las manualmente tocando no plantão e usando o botão de edição de horas.

---

## Financeiro

### Como funciona o cálculo do valor do plantão?

Configure um valor por hora em Configurações → Valor do Plantão. O Aurora multiplica as horas trabalhadas (incluindo extras) pelo valor configurado. Adicional noturno é aplicado se ativado.

### Posso ter valores diferentes por hospital?

Sim. Em **Configurações → Plantões & valores → Meus hospitais**, cada hospital tem sua própria tabela: valor/hora para semana e fim de semana, adicional noturno e regras de bônus. Útil quando você trabalha em locais públicos e privados com tabelas diferentes.

### O que é fidelização?

É um bônus por volume de horas trabalhadas no hospital. Você configura por hospital em três modos: **automático pelas horas**, **faixas de horas** (ex.: +8% acima de 60h, +12% acima de 100h) ou **percentual fixo**. O Aurora aplica o bônus no cálculo dos seus ganhos.

### O relatório pode ser exportado?

Sim. Na tela de Relatórios, há um botão de compartilhamento. O relatório é exportado como texto formatado e pode ser enviado por qualquer app (WhatsApp, e-mail, etc.). A tela de **Gráficos** mostra a evolução de ganhos e horas ao longo dos meses.

---

## Trocas, Cessões e Vagas

### Como troco um plantão com um colega?

Toque no plantão e escolha **Trocar**. Ofereça um dos seus plantões e indique o que quer receber. O colega recebe a proposta na Central de avisos e pode aceitar ou recusar. Você também pode deixar a troca **aberta** para a equipe fazer lances.

### Como cedo um plantão?

Toque no plantão e escolha **Ceder**. Você pode ceder de forma **aberta** (qualquer colega elegível pega) ou **direcionada** (você escolhe a pessoa). Assim que aceito, o plantão sai da sua escala.

### Onde vejo plantões disponíveis para pegar?

Na tela de **Vagas / Plantões abertos**: reúne plantões cedidos pela equipe e vagas em aberto nos seus grupos. Toque em **Quero esse plantão** para se candidatar. Em **Vagas na rede** você vê onde falta gente, por grupo ou em toda a rede.

### O que é a Central de avisos?

É onde chegam plantões oferecidos a você, propostas de troca e a atividade recente das suas ofertas. Você aceita ou recusa direto do aviso. O **Histórico** guarda o status final de cada cessão e troca.

---

## Conta e Autenticação

### Como faço logout?

Configurações → Conta → Sair. Você pode desconectar cada conta vinculada separadamente.

### Esqueci minha senha Aurora

Na tela de login, toque em "Esqueci minha senha". Um e-mail de redefinição será enviado.

### Posso usar o Aurora em mais de um dispositivo?

Sim. Seus dados são sincronizados na nuvem. Faça login com a mesma conta em qualquer dispositivo.

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

iOS e Android. O app é nativo e suporta ambas as plataformas a partir de uma única base de código.

### O código é open source?

Sim. O repositório está em [github.com/amendx/Aurora](https://github.com/amendx/Aurora). Contribuições são bem-vindas.

### Como reportar um bug?

Abra uma [issue no GitHub](https://github.com/amendx/Aurora/issues) com uma descrição clara do problema, versão do app e OS, e passos para reproduzir.
