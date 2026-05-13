# Começando com o Aurora

<div class="aurora-badge">Guia de início</div>

Do download ao primeiro relatório em menos de dois minutos. Este guia cobre os dois caminhos de autenticação disponíveis.

## Requisitos

- Dispositivo iOS (iPhone/iPad) ou Android
- Conta existente **ou** e-mail para criar conta Aurora
- Conexão com a internet para a sincronização inicial

---

## Caminho 1: Login com conta existente (recomendado)

Se você já possui uma conta numa plataforma de gestão de escalas compatível, este é o caminho mais rápido.

### 1. Abrir o app

Na tela inicial, toque em **"Entrar com sua conta"**.

### 2. Autenticar

Uma janela abrirá de autenticação. Insira suas credenciais normalmente.

### 3. Aguardar a sincronização

O Aurora buscará automaticamente seus plantões do mês atual. O calendário será preenchido em alguns segundos.

### 4. Configurar valor por hora (opcional)

Vá em **Configurações → Valor do Plantão** e defina seu valor/hora. Com isso, os relatórios financeiros passarão a mostrar os valores calculados.

---

## Caminho 2: Conta Aurora (Firebase)

Prefere uma conta independente? Sem problema.

### 1. Criar conta

Na tela inicial, toque em **"Criar conta"** e informe seu e-mail e senha.

### 2. Verificar e-mail

Você receberá um e-mail de verificação. Confirme antes de prosseguir.

### 3. Vincular WebClient (opcional)

Mesmo com conta Aurora, você pode vincular sua conta WebClient depois. Vá em **Configurações → Contas** e conecte sua conta para sincronizar plantões.

---

## Configuração inicial recomendada

Após o primeiro login, faça isso:

### Configurar grupos

1. Vá em **Configurações → Grupos**
2. Revise os grupos que foram importados
3. Ative ou desative a visibilidade de cada grupo conforme necessário
4. Personalize cores se quiser

### Configurar valor por hora

1. Vá em **Configurações → Valor do Plantão**
2. Insira seu valor por hora (em R$)
3. Configure adicional noturno se aplicável
4. Salve — os relatórios atualizam automaticamente

### Explorar o calendário

- Navegue para o mês atual
- Toque num dia com plantão para ver detalhes
- Use o bottom sheet para editar horas de entrada/saída

---

## Primeira semana

**Dia 1:** Acesse o calendário, veja seus plantões do mês.

**Dia 2–3:** Configure os valores por hora e veja o relatório financeiro.

**Dia 4–7:** Explore a tela de colegas de plantão. Veja quem está escalado com você hoje.

---

## Problemas comuns

### Meus plantões não aparecem

Verifique se a conta está conectada em Configurações. Faça pull-to-refresh no calendário. Se o problema persistir, desconecte e reconecte a conta.

### O valor dos plantões está errado

Acesse **Configurações → Valor do Plantão** e revise a configuração. Verifique se o grupo correto está selecionado.

### App está lento ao carregar

O Aurora usa cache local — a primeira carga de cada mês pode ser mais lenta. Meses já carregados abrem instantaneamente.

---

<div class="aurora-cta" style="margin-top: 3rem;">
  <h2>Tudo pronto?<br><span class="gradient-text">Veja a arquitetura.</span></h2>
  <p>Para desenvolvedores e curiosos — como o Aurora funciona por dentro.</p>
  <div class="aurora-cta-buttons">
    <a href="/aurora/guide/architecture" class="aurora-btn-primary">Arquitetura técnica →</a>
    <a href="/aurora/faq" class="aurora-btn-secondary">Tenho dúvidas</a>
  </div>
</div>
