/**
 * notificationRoute — mapeia uma notificação (push ou item do inbox) para o
 * destino de navegação correspondente. Compartilhado pelo deep-link do push
 * (MainScreen) e pelos cards clicáveis da tela de Avisos, pra que tocar numa
 * notificação SEMPRE caia no aviso em questão, não importa de onde veio.
 *
 * `data` aceita tanto o `content.data` do push Expo quanto `{ type, ...payload }`
 * de um doc do inbox — ambos carregam `type` + os ids do payload.
 *
 * Os nomes de tela retornados são os de SCREEN_MAP (MainScreen.handleNavigation).
 */
export function routeForNotification(data) {
  if (!data || !data.type) return null;
  const { type, kind } = data;
  switch (type) {
    case 'ceder_in_my_group':
      // Vaga publicada pelo escalista (admin_*) → tela de Vagas.
      // Cessão aberta ao grupo (kind 'cede') → Movimentações.
      return kind === 'cede'
        ? { screen: 'TrocasAbertas' }
        : { screen: 'OpeningsScreen' };
    case 'ceder_offered_to_me': // cessão direcionada a mim → aceitar/recusar em Avisos
    case 'swap_proposed_to_me': // troca proposta a mim → aceitar/recusar em Avisos
      return { screen: 'AvisosScreen' };
    case 'offer_outcome': // desfecho de uma cessão/troca minha → Movimentações
      return { screen: 'TrocasAbertas' };
    default:
      return { screen: 'AvisosScreen' };
  }
}
