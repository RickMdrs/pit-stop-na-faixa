// Configuração padrão da BANCADA. Valores demonstrativos — não transportar para via real (§8.1).
// Zonas em coordenadas normalizadas da imagem (0..1), como polígonos.
export const DEFAULT_CONFIG = {
  versao: 1,
  zonas: {
    // A — aproximação pelo corredor; B — espera antes da faixa; C — ocupação da faixa
    A: [[0.0, 0.0], [0.33, 0.0], [0.33, 1.0], [0.0, 1.0]],
    B: [[0.33, 0.0], [0.66, 0.0], [0.66, 1.0], [0.33, 1.0]],
    C: [[0.66, 0.0], [1.0, 0.0], [1.0, 1.0], [0.66, 1.0]],
  },
  percepcao: {
    // Ponto do corpo usado para decidir a zona: 'auto' (pés → quadril → centro), 'pes', 'quadril', 'centro'
    pontoReferencia: 'auto',
    visibilidadeMinima: 0.5,
    maxPessoas: 4,
    modelo: 'full',            // 'lite' (rápido) | 'full' (equilíbrio) | 'heavy' (preciso, lento)
    confiancaDeteccao: 0.5,    // menor = acha mais pessoas, mas inventa pessoas (0,4 já gerou falso positivo em teste)
    suavizacao: 0.5,           // 0..0.9: média entre quadros dos pontos do corpo (mais = mais estável e mais atraso)
    retencaoMs: 400,           // mantém a pessoa por esse tempo quando o modelo a perde num quadro
    distanciaAssociacao: 0.2,  // distância máx. (fração da imagem) para reconhecer a mesma pessoa no quadro seguinte
  },
  gesto: {
    habilitado: true,
    // INICIAR: punho acima do ombro por pelo menos esta fração da largura dos ombros
    margemSobreOmbro: 0.15,
    // MANTER (histerese): basta o punho não descer abaixo desta margem (negativo = um pouco abaixo do ombro)
    margemManutencao: -0.1,
    visibilidadeManutencao: 0.3,
  },
  tempos: {
    confirmacaoPresencaMs: 300,  // presença contínua necessária para confirmar uma zona
    toleranciaPerdaMs: 700,      // perda momentânea de detecção que NÃO desconfirma a zona
    confirmacaoGestoMs: 500,     // gesto contínuo necessário para virar solicitação
    advertenciaMinimaMs: 8000,   // duração mínima da advertência após uma solicitação
    verificacaoLiberacaoMs: 2500,// tempo sem ninguém antes de encerrar a advertência
    advertenciaMaximaMs: 120000, // advertência contínua acima disso → FALHA (revisão), nunca "faixa livre"
    quadroAntigoMs: 2000,        // sem quadros novos por esse tempo → FALHA de câmera
    ackSinalMs: 1000,            // sem confirmação do sinal nesse tempo → FALHA de saída
  },
  regras: {
    solicitacaoPorPresencaEmB: true,
    preAlertaNaAproximacao: false, // política configurável (§8.2): A também acende o sinal
  },
  sinal: {
    // "TÍTULO — COMPLEMENTO" (duas linhas no sinal). Diz o que acontece e o que o motorista deve fazer.
    texto: 'PEDESTRE PEDIU PASSAGEM — PARE ANTES DA FAIXA', // nível 1: pedido (mão, presença em B ou botão)
    textoFaixa: 'PEDESTRE NA FAIXA — PARE',                  // nível 2: alguém na faixa (alerta máximo)
    textoAproximacao: 'ATENÇÃO — PEDESTRE SE APROXIMANDO',   // nível 1: pré-alerta (zona A), se habilitado
    textoAtencao: 'ATENÇÃO — PEDESTRE PRÓXIMO À FAIXA',      // nível 1: verificando liberação, falha ou manual
  },
  // Operação sem operador: recuperação automática de falhas (ver autonomia.js)
  autonomia: {
    recuperacaoAutomatica: true,
    tentativaMs: 5000,       // intervalo entre tentativas de recuperação
    recarregarAposMs: 120000,// falha persistente por esse tempo → recarrega a página inteira
  },
  // Tela OPCIONAL voltada ao pedestre: confirma o recebimento do pedido. Nunca autoriza a travessia.
  retornoPedestre: {
    habilitado: true,
    texto: 'ATRAVESSE QUANDO OS VEÍCULOS PARAREM',
    orientacao: 'Motoristas avisados. Olhe para os dois lados antes de entrar na faixa.',
  },
};

export function cloneConfig(cfg) {
  return JSON.parse(JSON.stringify(cfg));
}

// Mescla rasa por seção: garante que configs salvas antigas ganhem campos novos.
export function mergeConfig(base, saved) {
  const out = cloneConfig(base);
  if (!saved || typeof saved !== 'object') return out;
  for (const k of Object.keys(out)) {
    if (saved[k] === undefined) continue;
    if (typeof out[k] === 'object' && !Array.isArray(out[k])) out[k] = { ...out[k], ...saved[k] };
    else out[k] = saved[k];
  }
  return out;
}

// Identificador curto e estável da configuração, gravado em cada evento.
export function configHash(cfg) {
  const s = JSON.stringify(cfg);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
