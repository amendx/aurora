# Roadmap

<div class="aurora-badge">O que vem por aí</div>

O Aurora é um produto em evolução ativa. Este roadmap reflete as prioridades atuais — sujeito a mudanças com base no feedback dos usuários.

---

## Em desenvolvimento agora

### Notificações de plantão
Notificação nativa (push) antes do início de cada plantão. Configurável: 1h antes, 30min antes, no momento.

### Widget iOS / Android
Widget de tela inicial mostrando o próximo plantão e o total do mês. Dados direto na home screen sem abrir o app.

---

## Próximas versões

### v1.1 — Financeiro avançado

- [ ] Gráfico de ganhos por mês (últimos 6 meses)
- [ ] Exportação em PDF do relatório mensal
- [ ] Meta mensal — defina um objetivo de ganhos e acompanhe o progresso
- [ ] Breakdown por grupo/hospital no relatório

### v1.2 — Calendário avançado

- [ ] Visão semanal além da mensal
- [ ] Filtro de calendário por grupo
- [ ] Indicador de saldo de horas (planejado vs trabalhado)
- [ ] Sincronização bidirecional de horas extras com WebClient

### v1.3 — Social e colaboração

- [ ] Perfis de colegas — ver histórico de plantões em comum
- [ ] Chat rápido com colegas do mesmo plantão
- [ ] Grupos de escala — criar grupos fora da estrutura do PlantaoAPI

### v2.0 — Aurora para Instituições

Uma versão para gestores de escala hospitalares:
- [ ] Dashboard de cobertura de escala
- [ ] Notificações de falta de cobertura
- [ ] Gestão de trocas de plantão
- [ ] Integração com RH e folha de pagamento

---

## Aurora Web — em desenvolvimento

<div class="aurora-web-banner" style="text-align:left; margin: 2rem 0; padding: 2.5rem 2rem;">
<div class="aurora-web-banner-eyebrow">Plataforma web</div>
<h2 style="font-size:1.8rem; color:#E8F4FD">Aurora chega ao <span class="gradient-text">navegador</span></h2>
<p style="color:#97cafc; margin-bottom:1.5rem; opacity:0.9">A web app espelha o app mobile e vai além com ferramentas exclusivas para gestores de escala hospitalar.</p>
<div style="display:flex; flex-wrap:wrap; gap:1rem; margin-bottom:1.5rem">
  <div class="aurora-role-pill"><div class="aurora-role-pill-dot" style="background:#3FA9A7"></div><strong>Profissional</strong> — plantões, financeiro, calendário pessoal</div>
  <div class="aurora-role-pill"><div class="aurora-role-pill-dot" style="background:#41b883"></div><strong>Gestor</strong> — dashboard de equipe, aprovações, relatórios</div>
</div>
<div class="aurora-wip-badge"><div class="aurora-wip-pulse"></div>Em desenvolvimento ativo</div>
</div>

**Funcionalidades planejadas (Gestor):**
- Dashboard de cobertura de escala em tempo real
- Fluxo de aprovação de trocas de plantão
- Gestão de grupos, hospitais e perfis de profissionais
- Exportação de relatórios institucionais (PDF / CSV)
- KPIs financeiros e de utilização de equipe

---

## Fora do escopo

**Entrada manual como fonte primária:** Aurora não vira plataforma de escalas. Registro manual existe para complementar o PlantaoAPI, não substituí-lo.

**Integração com outras plataformas além de WebClient/PlantaoAPI:** Foco total no ecossistema enquanto a base cresce.

---

## Sugerir funcionalidade

Tem uma ideia? Abra uma [issue no GitHub](https://github.com/amendx/Aurora/issues) com o label `feature request`.

As melhores sugestões vêm de quem usa o app no dia a dia. Sem burocracia — uma descrição clara do problema que você quer resolver já é suficiente.
