# Sobre o Aurora

<div class="aurora-badge">Nossa história</div>

## O problema

Médicos, enfermeiros e técnicos de saúde no Brasil trabalham em regimes de plantão — muitas vezes em múltiplas instituições simultaneamente. A gestão dessa rotina é caótica: escalas em grupos de WhatsApp, financeiro em planilhas Excel, e zero visibilidade de quem está de plantão junto.

Plataformas de gestão de escalas resolveram parte do problema, centralizando as escalas. Mas faltava um app nativo, rápido e bonito que aproveitasse todos esses dados.

## A solução

Aurora é esse app.

Construído em React Native com Expo, Aurora oferece:

- **Calendário visual** de plantões com cores por instituição
- **Relatórios financeiros** automáticos baseados no valor/hora configurado
- **Rede de colegas** — veja quem está escalado com você hoje
- **Integração nativa** com sua plataforma de gestão de escalas
- **Design premium** com dark mode e animações suaves

## Filosofia de produto

Aurora segue princípios simples:

**Velocidade acima de tudo.** O app deve abrir e mostrar seus plantões em menos de um segundo. Cache agressivo, skeleton loading, zero espera desnecessária.

**Mínimo de fricção.** Se você já tem conta numa plataforma compatível, não precisa criar outra conta. Login em dois toques.

**Clareza financeira.** Profissionais de saúde merecem saber exatamente quanto estão ganhando. Sem surpresas, sem planilhas manuais.

**Feito para o Brasil.** Interface em português, lógica de negócio adaptada para a realidade dos plantões brasileiros, integração com plataformas locais.

## Uma plataforma, três superfícies

Aurora está crescendo além do app mobile. O roadmap é claro:

<div class="aurora-web-banner" style="text-align:left; margin: 2rem 0; padding: 2.5rem 2rem;">
<div class="aurora-web-banner-eyebrow">Plataforma Aurora</div>
<div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1.25rem; position:relative">
  <div style="background:rgba(63,169,167,0.1); border:1px solid rgba(63,169,167,0.25); border-radius:14px; padding:1.25rem">
    <div style="font-family:'IBM Plex Mono',monospace; font-size:0.68rem; letter-spacing:0.08em; text-transform:uppercase; color:#3FA9A7; margin-bottom:0.5rem">Mobile · Ativo</div>
    <div style="font-weight:800; font-size:1.05rem; color:#E8F4FD; margin-bottom:0.5rem">App iOS & Android</div>
    <div style="font-size:0.85rem; color:#97cafc; line-height:1.5">React Native / Expo. Para profissionais de saúde. Plantões, financeiro, calendário, colegas.</div>
  </div>
  <div style="background:rgba(255,159,10,0.08); border:1px solid rgba(255,159,10,0.25); border-radius:14px; padding:1.25rem">
    <div style="font-family:'IBM Plex Mono',monospace; font-size:0.68rem; letter-spacing:0.08em; text-transform:uppercase; color:#FF9F0A; margin-bottom:0.5rem">Web · Em construção</div>
    <div style="font-weight:800; font-size:1.05rem; color:#E8F4FD; margin-bottom:0.5rem">Dashboard Web</div>
    <div style="font-size:0.85rem; color:#97cafc; line-height:1.5">React. Para profissionais e gestores. Mesmo design language, funcionalidades de gestão de equipe.</div>
  </div>
  <div style="background:rgba(65,184,131,0.08); border:1px solid rgba(65,184,131,0.2); border-radius:14px; padding:1.25rem">
    <div style="font-family:'IBM Plex Mono',monospace; font-size:0.68rem; letter-spacing:0.08em; text-transform:uppercase; color:#41b883; margin-bottom:0.5rem">Docs · Ativo</div>
    <div style="font-weight:800; font-size:1.05rem; color:#E8F4FD; margin-bottom:0.5rem">Documentação</div>
    <div style="font-size:0.85rem; color:#97cafc; line-height:1.5">VitePress. Guia do usuário, funcionalidades, FAQ, referência técnica — você está aqui.</div>
  </div>
</div>
</div>

## Stack técnico

| Camada | Tecnologia |
|--------|-----------|
| Mobile | React Native + Expo SDK 54 |
| Web (em breve) | React + mesmo design system |
| Auth | Firebase Authentication + SecureStore |
| Dados | PlantaoAPI (REST) + AsyncStorage cache + Firestore shadow |
| Docs | VitePress |

→ [Ver arquitetura completa](/guide/architecture)

## Contato

Reportar bugs ou sugerir funcionalidades: abra uma [issue no GitHub](https://github.com/amendx/Aurora/issues).
