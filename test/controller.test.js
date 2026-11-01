// Matriz de testes prioritários (§15) com eventos sintéticos — isola lógica de percepção.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Controller, S, NIVEL, signalLevel } from '../public/js/controller.js';
import { DEFAULT_CONFIG, cloneConfig } from '../public/js/config.js';

const FRAME = 33; // ~30 fps

function obs({ A = false, B = false, C = false, gB = false, gOut = false } = {}) {
  return { zones: { A, B, C }, gestureInB: gB, gestureOutside: gOut };
}

// Alimenta quadros iguais durante `ms`. Retorna o último snapshot e todos os eventos.
function run(ctl, clock, o, ms) {
  let snap;
  const events = [];
  const end = clock.t + ms;
  while (clock.t < end) {
    clock.t += FRAME;
    snap = ctl.observe(o, clock.t);
    events.push(...snap.events);
  }
  return { snap, events };
}

function setup(mut) {
  const cfg = cloneConfig(DEFAULT_CONFIG);
  if (mut) mut(cfg);
  const clock = { t: 0 };
  const ctl = new Controller(cfg, 0);
  run(ctl, clock, obs(), 200); // primeira imagem → sai de "aguardando_camera"
  return { cfg, clock, ctl };
}

test('inicia em falha aguardando câmera e normaliza no primeiro quadro', () => {
  const ctl = new Controller(cloneConfig(DEFAULT_CONFIG), 0);
  assert.equal(ctl.state, S.FALHA);
  const snap = ctl.observe(obs(), 33);
  assert.equal(snap.state, S.OBSERVANDO);
  assert.equal(snap.signal, false);
});

test('pessoa em B sem levantar o braço → solicitação por presença', () => {
  const { ctl, clock } = setup();
  const { snap, events } = run(ctl, clock, obs({ B: true }), 600);
  assert.equal(snap.state, S.SOLICITACAO);
  assert.equal(snap.signal, true);
  assert.ok(events.some((e) => e.tipo === 'solicitacao' && e.via === 'presenca'));
});

test('presença em B desabilitada: só gesto ou botão abrem solicitação', () => {
  const { ctl, clock } = setup((c) => { c.regras.solicitacaoPorPresencaEmB = false; });
  let r = run(ctl, clock, obs({ B: true }), 1000);
  assert.equal(r.snap.signal, false);
  r = run(ctl, clock, obs({ B: true, gB: true }), 800);
  assert.equal(r.snap.signal, true);
  assert.ok(r.events.some((e) => e.tipo === 'solicitacao' && e.via === 'gesto'));
});

test('gesto contínuo em B gera UMA solicitação por gesto (sem duplicação)', () => {
  const { ctl, clock } = setup((c) => { c.regras.solicitacaoPorPresencaEmB = false; });
  const { events } = run(ctl, clock, obs({ B: true, gB: true }), 5000);
  assert.equal(events.filter((e) => e.tipo === 'solicitacao' && e.via === 'gesto').length, 1);
});

test('gesto fora de B não abre solicitação', () => {
  const { ctl, clock } = setup();
  const { snap, events } = run(ctl, clock, obs({ A: true, gOut: true }), 3000);
  assert.equal(snap.signal, false);
  assert.ok(!events.some((e) => e.tipo === 'solicitacao'));
  assert.ok(events.some((e) => e.tipo === 'gesto_fora_da_zona'));
});

test('gesto breve (menor que a confirmação) é ignorado', () => {
  const { ctl, clock } = setup((c) => { c.regras.solicitacaoPorPresencaEmB = false; });
  run(ctl, clock, obs({ B: true }), 500);
  const r1 = run(ctl, clock, obs({ B: true, gB: true }), 200);
  const r2 = run(ctl, clock, obs({ B: true }), 1500);
  assert.ok(![...r1.events, ...r2.events].some((e) => e.tipo === 'solicitacao'));
});

test('pessoa passando em A e desviando: sem solicitação e sem sinal (pré-alerta desligado)', () => {
  const { ctl, clock } = setup();
  let r = run(ctl, clock, obs({ A: true }), 1000);
  assert.equal(r.snap.state, S.APROXIMACAO);
  assert.equal(r.snap.signal, false);
  r = run(ctl, clock, obs(), 1500);
  assert.equal(r.snap.state, S.OBSERVANDO);
  assert.ok(!r.events.some((e) => e.tipo === 'solicitacao'));
});

test('pré-alerta habilitado: aproximação em A acende o sinal', () => {
  const { ctl, clock } = setup((c) => { c.regras.preAlertaNaAproximacao = true; });
  const r = run(ctl, clock, obs({ A: true }), 600);
  assert.equal(r.snap.signal, true);
});

test('pessoa em C sem gesto → advertência ativa', () => {
  const { ctl, clock } = setup();
  const r = run(ctl, clock, obs({ C: true }), 500);
  assert.equal(r.snap.state, S.FAIXA_OCUPADA);
  assert.equal(r.snap.signal, true);
});

test('pessoa parada em C → advertência mantida além da duração mínima', () => {
  const { ctl, clock, cfg } = setup();
  const r = run(ctl, clock, obs({ C: true }), cfg.tempos.advertenciaMinimaMs * 3);
  assert.equal(r.snap.state, S.FAIXA_OCUPADA);
  assert.equal(r.snap.signal, true);
  assert.ok(!r.events.some((e) => e.tipo === 'sinal' && e.valor === false));
});

test('duas pessoas: uma sai, outra permanece em C → não encerra', () => {
  // As zonas são agregadas ("alguém em C"); a saída de uma pessoa não zera a zona.
  const { ctl, clock } = setup();
  run(ctl, clock, obs({ B: true, C: true }), 1000);
  const r = run(ctl, clock, obs({ C: true }), 10000);
  assert.equal(r.snap.signal, true);
  assert.equal(r.snap.state, S.FAIXA_OCUPADA);
});

test('queda breve de detecção não alterna a advertência', () => {
  const { ctl, clock } = setup();
  run(ctl, clock, obs({ C: true }), 1000);
  const drop = run(ctl, clock, obs(), 400); // < toleranciaPerdaMs
  const back = run(ctl, clock, obs({ C: true }), 1000);
  const toggles = [...drop.events, ...back.events].filter((e) => e.tipo === 'sinal');
  assert.equal(toggles.length, 0);
  assert.equal(back.snap.state, S.FAIXA_OCUPADA);
});

test('liberação: sinal só apaga após verificar ausência', () => {
  const { ctl, clock, cfg } = setup();
  run(ctl, clock, obs({ C: true }), 1000);
  let r = run(ctl, clock, obs(), cfg.tempos.toleranciaPerdaMs + 300);
  assert.equal(r.snap.state, S.VERIFICANDO);
  assert.equal(r.snap.signal, true);
  r = run(ctl, clock, obs(), cfg.tempos.verificacaoLiberacaoMs + 200);
  assert.equal(r.snap.state, S.OBSERVANDO);
  assert.equal(r.snap.signal, false);
  assert.ok(r.events.some((e) => e.tipo === 'liberacao'));
});

test('botão abre solicitação e mantém a advertência mínima', () => {
  const { ctl, clock, cfg } = setup();
  const snap = ctl.button(clock.t);
  assert.equal(snap.state, S.SOLICITACAO);
  assert.equal(snap.signal, true);
  let r = run(ctl, clock, obs(), cfg.tempos.advertenciaMinimaMs - 500);
  assert.equal(r.snap.signal, true);
  r = run(ctl, clock, obs(), 500 + cfg.tempos.verificacaoLiberacaoMs + 200);
  assert.equal(r.snap.signal, false);
});

test('câmera congelada → FALHA, sem indicar normalidade, e exige reinício', () => {
  const { ctl, clock, cfg } = setup();
  run(ctl, clock, obs({ C: true }), 1000);
  clock.t += cfg.tempos.quadroAntigoMs + 100;
  let snap = ctl.tick(clock.t);
  assert.equal(snap.state, S.FALHA);
  assert.equal(snap.failure, 'camera_sem_quadros_novos');
  assert.equal(snap.signal, true, 'em falha a saída não é desligada automaticamente');
  // quadros voltam, mas a falha continua até o operador reiniciar
  snap = run(ctl, clock, obs(), 500).snap;
  assert.equal(snap.state, S.FALHA);
  snap = ctl.reset(clock.t);
  assert.notEqual(snap.state, S.FALHA);
});

test('falha de saída do sinal → FALHA explícita', () => {
  const { ctl, clock } = setup();
  const snap = ctl.fail('sinal_sem_confirmacao', clock.t);
  assert.equal(snap.state, S.FALHA);
  assert.ok(snap.events.some((e) => e.tipo === 'falha' && e.motivo === 'sinal_sem_confirmacao'));
});

test('advertência acima do máximo vira FALHA (revisão), nunca "faixa livre"', () => {
  const { ctl, clock } = setup((c) => { c.tempos.advertenciaMaximaMs = 5000; });
  const r = run(ctl, clock, obs({ C: true }), 6000);
  assert.equal(r.snap.state, S.FALHA);
  assert.equal(r.snap.failure, 'advertencia_maxima_excedida');
  assert.equal(r.snap.signal, true);
  assert.ok(!r.events.some((e) => e.tipo === 'liberacao'));
});

test('progresso do gesto sobe até 1 e informa a origem do pedido', () => {
  const { ctl, clock } = setup((c) => { c.regras.solicitacaoPorPresencaEmB = false; });
  run(ctl, clock, obs({ B: true }), 500);
  const half = run(ctl, clock, obs({ B: true, gB: true }), 250).snap;
  assert.ok(half.progress.gestureB > 0.3 && half.progress.gestureB < 0.8, `meio: ${half.progress.gestureB}`);
  assert.equal(half.requestOrigin, null);
  const full = run(ctl, clock, obs({ B: true, gB: true }), 400).snap;
  assert.equal(full.progress.gestureB, 1);
  assert.equal(full.requestOrigin, 'gesto');
  const after = run(ctl, clock, obs(), 15000).snap;
  assert.equal(after.signal, false);
  assert.equal(after.requestOrigin, null, 'origem limpa após liberação');
});

test('nível do aviso: atenção com alguém em B, alerta máximo com alguém na faixa, volta ao sair', () => {
  const { ctl, clock } = setup();
  assert.equal(signalLevel(run(ctl, clock, obs(), 300).snap), NIVEL.APAGADO);
  assert.equal(signalLevel(run(ctl, clock, obs({ B: true }), 600).snap), NIVEL.ATENCAO);
  assert.equal(signalLevel(run(ctl, clock, obs({ C: true }), 600).snap), NIVEL.FAIXA);
  // saiu da faixa: sinal continua (verificação/advertência mínima), mas volta ao nível de atenção
  const after = run(ctl, clock, obs(), 1200).snap;
  assert.equal(after.signal, true);
  assert.equal(signalLevel(after), NIVEL.ATENCAO);
});

test('pessoa direto na faixa, sem pedido, já recebe alerta máximo', () => {
  const { ctl, clock } = setup();
  assert.equal(signalLevel(run(ctl, clock, obs({ C: true }), 500).snap), NIVEL.FAIXA);
});

test('evento de ativação carrega o horário da condição para medir latência', () => {
  const { ctl, clock } = setup();
  const t0 = clock.t;
  const r = run(ctl, clock, obs({ C: true }), 600);
  const on = r.events.find((e) => e.tipo === 'sinal' && e.valor === true);
  assert.ok(on);
  assert.ok(on.tCondicao > t0 && on.tCondicao <= t0 + 2 * FRAME, 'tCondicao = primeira detecção bruta');
  assert.ok(on.t - on.tCondicao >= 300, 'inclui o tempo de confirmação');
});
