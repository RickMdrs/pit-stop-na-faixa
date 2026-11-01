// O que o SINAL AO MOTORISTA mostra. Função pura — testável sem DOM.
// A mensagem diz o que está acontecendo E o que o motorista deve fazer.
// Textos no formato "TÍTULO — COMPLEMENTO" (exibidos em duas linhas).
import { S, NIVEL, signalLevel } from './controller.js';
import { DEFAULT_CONFIG } from './config.js';

// snap: snapshot do controller; override: 'auto' | 'on' | 'off'
// → { nivel, motivo, texto, titulo, complemento }
export function driverView(snap, cfg, override = 'auto') {
  const t = { ...DEFAULT_CONFIG.sinal, ...(cfg.sinal || {}) };
  const auto = signalLevel(snap);
  let nivel = override === 'on' ? Math.max(NIVEL.ATENCAO, auto) : override === 'off' ? NIVEL.APAGADO : auto;

  let motivo, texto;
  if (nivel === NIVEL.APAGADO) {
    motivo = 'apagado'; texto = 'INATIVO';
  } else if (nivel === NIVEL.FAIXA) {
    motivo = 'faixa'; texto = t.textoFaixa;
  } else if (override === 'auto' && snap && snap.state === S.SOLICITACAO) {
    motivo = 'pedido'; texto = t.texto;
  } else if (override === 'auto' && snap && snap.state === S.APROXIMACAO) {
    motivo = 'aproximacao'; texto = t.textoAproximacao;
  } else {
    // verificando liberação, falha com sinal mantido, ou ligado manualmente
    motivo = 'atencao'; texto = t.textoAtencao;
  }
  const [titulo, ...resto] = texto.split(/\s+—\s+/);
  return { nivel, motivo, texto, titulo, complemento: resto.join(' — ') };
}
