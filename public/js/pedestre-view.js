// O que a tela OPCIONAL do pedestre deve mostrar. Função pura — testável sem DOM.
// Guia a pessoa passo a passo: parar na área → pedir → olhar → atravessar quando os veículos pararem.
// Regra (§7): nunca anunciar travessia segura; "atravesse" sempre condicionado à parada dos veículos.
import { S } from './controller.js';
import { DEFAULT_CONFIG } from './config.js';

// Textos que transformariam a tela num "siga". Também barram textos personalizados.
export const FORBIDDEN = [
  /pode\s+atravessar/iu,
  /\blivre\b/iu,
  /\bsegur[oa]\b/iu,
  /\bsiga\b/iu,
  /\bpasse\b/iu,
];
// "atravesse" só é aceito com a condição de que os veículos parem — quem decide é quem olha.
const ATRAVESSE = /atravesse/giu;
const CONDICIONAL = /^atravesse\s+(?:somente\s+|só\s+|apenas\s+)?(?:quando\s+os\s+(?:veículos|carros)\s+pararem|com\s+os\s+(?:veículos|carros)\s+parados)/iu;

export function isSafeText(s) {
  if (typeof s !== 'string' || s.trim() === '') return false;
  if (FORBIDDEN.some((re) => re.test(s))) return false;
  for (const m of s.matchAll(ATRAVESSE)) {
    if (!CONDICIONAL.test(s.slice(m.index))) return false;
  }
  return true;
}

function safe(custom, fallback) {
  return isSafeText(custom) ? custom : fallback;
}

export const CONFIRMACAO_MS = 2500; // tempo mostrando "Pedido recebido!" antes de orientar a olhar

const PASSOS_INSTRUCAO = [
  { icone: 'map-pin', texto: 'Pare na área marcada antes da faixa' },
  { icone: 'hand', texto: 'Levante a mão ou aperte o botão' },
  { icone: 'footprints', texto: 'Atravesse quando os veículos pararem' },
];
const PASSOS_OLHAR = [
  { icone: 'eye', texto: 'Olhe para os dois lados' },
  { icone: 'car-front', texto: 'Espere os veículos pararem' },
  { icone: 'footprints', texto: 'Atravesse com os veículos parados' },
];

// snap: { state, signal, zones?, gestureProgress?, sinceSignalMs?, presenca? }
// → { modo, titulo, orientacao, passos?, progresso? }
export function pedestrianView(snap, cfg) {
  const def = DEFAULT_CONFIG.retornoPedestre;
  const rp = cfg.retornoPedestre || def;
  const zones = snap.zones || {};
  if (!rp.habilitado) {
    return { modo: 'desativado', titulo: 'Tela do pedestre desativada nesta instalação', orientacao: 'Olhe antes de atravessar.' };
  }
  if (snap.state === S.FALHA) {
    return {
      modo: 'falha',
      titulo: 'Sistema com falha — o aviso aos motoristas pode não estar funcionando',
      orientacao: 'Olhe com atenção antes de atravessar.',
    };
  }
  // Pré-alerta: o sinal acendeu porque a pessoa vem pelo corredor, mas ela AINDA NÃO PEDIU.
  if (snap.signal && snap.state === S.APROXIMACAO) {
    return { modo: 'chegando', titulo: 'Pare na área marcada antes da faixa', orientacao: 'Depois, levante a mão ou aperte o botão.' };
  }
  if (snap.signal) {
    if (zones.C) {
      return { modo: 'atravessando', titulo: 'Atravessando: continue atento', orientacao: 'Continue olhando os veículos até chegar ao outro lado.' };
    }
    if ((snap.sinceSignalMs ?? Infinity) < CONFIRMACAO_MS) {
      return { modo: 'confirmado', titulo: 'Pedido recebido! Motoristas avisados', orientacao: 'Agora olhe para os dois lados.' };
    }
    return { modo: 'recebido', titulo: safe(rp.texto, def.texto), orientacao: safe(rp.orientacao, def.orientacao), passos: PASSOS_OLHAR };
  }
  if (zones.B) {
    const p = snap.gestureProgress || 0;
    if (p > 0) return { modo: 'segurando', titulo: 'Segure a mão levantada…', orientacao: 'Só mais um instante.', progresso: p };
    return { modo: 'na_area', titulo: 'Você está na área de espera', orientacao: 'Levante a mão ou aperte o botão para pedir passagem.' };
  }
  if (zones.A) {
    return { modo: 'chegando', titulo: 'Pare na área marcada antes da faixa', orientacao: 'Depois, levante a mão ou aperte o botão.' };
  }
  return { modo: 'instrucao', titulo: 'Para atravessar', orientacao: 'Olhe antes de atravessar.', passos: PASSOS_INSTRUCAO };
}

// Todos os textos de uma visão (para a guarda e os testes).
export function viewTexts(v) {
  return [v.titulo, v.orientacao, ...(v.passos || []).map((p) => p.texto)];
}
