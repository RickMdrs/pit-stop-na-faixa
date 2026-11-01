// Recuperação automática de falhas, para operação sem operador.
// Função pura: decide O QUE fazer; o app executa. Regras de segurança:
//  - recuperar NUNCA declara a faixa livre: o controle é reiniciado mantendo o sinal,
//    que só apaga após verificar liberação com imagens novas;
//  - toda falha e toda recuperação ficam registradas para revisão posterior;
//  - "câmera movida" exige pessoa (as zonas deixam de corresponder ao local).

export const CAMERA_FAILURES = new Set(['aguardando_camera', 'camera_sem_quadros_novos', 'camera_desconectada']);
export const HUMAN_FAILURES = new Set(['zonas_precisam_revisao']);

function isOutputFailure(f) {
  return f.startsWith('sinal_') || f.startsWith('controlador_');
}

// ctx: { failure, failingForMs, sinceLastAttemptMs, frameAgeMs, outputKind, outputConnected }
// a:   cfg.autonomia
// → { acao, motivo }  acao ∈ nada | aguardar_humano | esperar | reiniciar_controle |
//                            reconectar_camera | reconectar_controlador | recarregar_pagina
export function recoveryAction(ctx, a) {
  const f = ctx.failure;
  if (!f || !a.recuperacaoAutomatica) return { acao: 'nada' };
  if (HUMAN_FAILURES.has(f)) return { acao: 'aguardar_humano', motivo: f };
  // imagens novas chegando de novo = a câmera voltou: retoma já, sem esperar o intervalo
  const fresh = ctx.frameAgeMs !== null && ctx.frameAgeMs < 1000;
  if (CAMERA_FAILURES.has(f) && fresh) return { acao: 'reiniciar_controle', motivo: f };
  if (ctx.failingForMs >= a.recarregarAposMs) return { acao: 'recarregar_pagina', motivo: f };
  if (ctx.sinceLastAttemptMs < a.tentativaMs) return { acao: 'esperar', motivo: f };

  if (CAMERA_FAILURES.has(f)) return { acao: 'reconectar_camera', motivo: f };
  if (isOutputFailure(f)) {
    return { acao: ctx.outputKind === 'serial' && !ctx.outputConnected ? 'reconectar_controlador' : 'reiniciar_controle', motivo: f };
  }
  // advertencia_maxima_excedida, percepcao_erro e outras: reinicia e deixa registrado para revisão
  return { acao: 'reiniciar_controle', motivo: f };
}
