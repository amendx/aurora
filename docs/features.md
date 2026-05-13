# Funcionalidades

<div class="aurora-badge">Tudo que você precisa</div>

Aurora reúne as ferramentas mais importantes para profissionais de saúde que trabalham em regime de plantões. Cada funcionalidade foi pensada para reduzir fricção e entregar clareza.

---

## <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:-3px;margin-right:6px"><rect x="4" y="5" width="16" height="16" rx="2"/><line x1="16" y1="3" x2="16" y2="7"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="4" y1="11" x2="20" y2="11"/><rect x="8" y="15" width="2" height="2"/><rect x="14" y="15" width="2" height="2"/></svg> Calendário de Plantões

O coração do Aurora. Um calendário mensal interativo que exibe todos os seus plantões com informações visuais claras.

**O que você vê:**
- Marcações coloridas por grupo (hospital/clínica/instituição)
- Turno do plantão: Manhã (M), Tarde (T) ou Noite (N)
- Duração em horas de cada turno
- Indicador de hoje com destaque visual

**Interações:**
- Toque em qualquer dia para ver detalhes do plantão
- Navegue entre meses com swipe ou setas
- Edite horas de entrada/saída diretamente no calendário
- Registre horas extras com um toque

**Integração:**
Os plantões são carregados diretamente da sua conta. Qualquer mudança na plataforma se reflete automaticamente no Aurora.

---

## <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:-3px;margin-right:6px"><rect x="3" y="12" width="4" height="8" rx="1"/><rect x="9" y="8" width="4" height="12" rx="1"/><rect x="15" y="4" width="4" height="16" rx="1"/></svg> Relatórios Financeiros

Visibilidade total sobre seus ganhos. Aurora calcula o valor de cada plantão com base na sua configuração de valor por hora.

**O que é calculado:**
- Valor base por hora de plantão
- Adicional noturno (plantões noturnos têm peso diferente)
- Horas extras registradas manualmente
- Total mensal e histórico de meses anteriores

**Formatos de exportação:**
- Compartilhe o relatório mensal por qualquer app (WhatsApp, e-mail, etc.)
- Resumo compacto com total de horas e valor

**Configuração:**
Acesse Configurações → Valor do Plantão e defina:
- Valor por hora (R$/h)
- Configuração de adicional noturno
- Grupos com valores diferentes

---

## <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:-3px;margin-right:6px"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><path d="M21 21v-2a4 4 0 0 0-3-3.85"/></svg> Rede de Colegas

Veja quem está de plantão com você hoje, sem precisar ligar ou mandar mensagem.

**Como funciona:**
- O Aurora consulta a API de escalas para o dia atual
- Lista os colegas que estão escalados no mesmo local e turno
- Atualiza em tempo real durante o plantão

**Privacidade:**
- Você só aparece para colegas do mesmo plantão
- Controle de visibilidade por grupo (veja Gestão de Grupos)
- Nenhuma informação pessoal é compartilhada sem consentimento

---

## <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:-3px;margin-right:6px"><polyline points="12 2 22 8.5 12 15 2 8.5 12 2"/><line x1="2" y1="15.5" x2="12" y2="22"/><line x1="22" y1="15.5" x2="12" y2="22"/></svg> Gestão de Grupos

Organize seus plantões por instituição e tenha controle total sobre visibilidade e filtros.

**O que são grupos:**
Grupos representam seus locais de trabalho — Hospital X, UPA Y, Clínica Z. Cada plantão pertence a um grupo.

**Funcionalidades:**
- Crie e nomeie grupos com cores personalizadas
- Ative ou desative a visibilidade de cada grupo
- Filtre o calendário por grupo específico
- Defina valores por hora diferentes por grupo

**Tela de Visibilidade de Grupos:**
Uma tela dedicada para controlar quais grupos aparecem no seu calendário e nos relatórios. Útil quando você trabalha em muitos locais e quer foco.

---

## <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:-3px;margin-right:6px"><path d="M9 15l6-6"/><path d="M11 6l.463-.536a5 5 0 0 1 7.071 7.072l-.534.464"/><path d="M13 18l-.464.536a5 5 0 0 1-7.07-7.07l.534-.466"/></svg> Integração com sua plataforma

Aurora foi construído para funcionar com a plataforma de gestão de escalas que você já usa.

**Dois modos de autenticação:**

1. **Conta Aurora (Firebase):** Crie uma conta própria no Aurora. Ideal para quem quer usar o app independentemente.

2. **Conta WebClient:** Faça login com suas credenciais. Seus plantões são sincronizados diretamente sem precisar adicionar nada manualmente.

**Sincronização:**
- Plantões carregam automaticamente ao abrir o app
- Pull-to-refresh para atualizar manualmente
- Cache local para uso offline
- Migração automática entre versões

---

## <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:-3px;margin-right:6px"><path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1-8.313-12.454z"/></svg> Design & Dark Mode

Interface construída com os princípios de design do iOS — limpa, rápida e bonita.

**Temas:**
- **Light Mode:** Interface clara, ideal para uso diurno
- **Dark Mode:** Fundo escuro profundo, menos cansativo para olhos após horas de trabalho

**Componentes:**
- Bottom sheet interativo para ver/editar plantões
- Skeleton loading para percepção de velocidade
- Animações suaves em todas as transições
- Tipografia otimizada para leitura rápida

---

## <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:-3px;margin-right:6px"><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37a1.724 1.724 0 0 0 2.572-1.065z"/><circle cx="12" cy="12" r="3"/></svg> Configurações Avançadas

**O que você pode configurar:**
- Nome de exibição e foto de perfil
- Valor por hora para cálculo financeiro
- Configuração de adicional noturno
- Visibilidade dos grupos
- Preferência de tema (claro/escuro)
- Logout de contas separadamente

---

<div class="aurora-cta" style="margin-top: 3rem;">
  <h2>Todas essas funcionalidades,<br><span class="gradient-text">no seu bolso.</span></h2>
  <p>Disponível para iOS e Android.</p>
  <div class="aurora-cta-buttons">
    <a href="/aurora/getting-started" class="aurora-btn-primary">Começar →</a>
    <a href="/aurora/faq" class="aurora-btn-secondary">Perguntas frequentes</a>
  </div>
</div>
