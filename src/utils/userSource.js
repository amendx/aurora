// Helpers centralizados pra distinguir o "modo" do usuário e gatear chamadas
// que tocam o webClient (PlantaoAPI). Eliminar duplicação de
//   user?.source === 'aurora' || user?.auroraOnlyMode
// espalhada por contexts/screens/services.
//
// Definições:
//   - aurora native  → criado via Firebase Auth (email/Google). `source === 'aurora'`.
//   - aurora-only    → webClient user que migrou pra ler só do Firestore. Tem
//                      `auroraOnlyMode === true`. Token webClient pode existir
//                      mas NÃO deve ser usado.
//   - webClient ativo → tudo que NÃO é nem aurora native nem aurora-only.
//
// Regra: chamadas a `WebClientApiService.*` só são válidas pra **webClient ativo**.
// Aurora native e aurora-only NÃO devem disparar webClient — usar `canCallWebClient`.

export const isAuroraNative = (user) =>
  user?.source === 'aurora';

export const isAuroraOnly = (user) =>
  isAuroraNative(user) || user?.auroraOnlyMode === true;

// Gate de webClient: true só pra webClient ativo (não-aurora e não migrado).
export const canCallWebClient = (user) =>
  !!user && !isAuroraOnly(user);

// Modo só-visualização: conta vinda do PlantaoAPI (webClient/aurora-only) NÃO
// pode escrever — só vê plantões, coworkers e financeiro. Escrita (ceder,
// trocar, pegar vaga, publicar) é exclusiva de conta aurora native.
export const isViewOnly = (user) =>
  !!user && !isAuroraNative(user);
