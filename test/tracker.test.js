import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PoseTracker } from '../public/js/tracker.js';
import { LM, interpretTracks } from '../public/js/interpret.js';
import { DEFAULT_CONFIG, cloneConfig } from '../public/js/config.js';

const cfg = cloneConfig(DEFAULT_CONFIG);

// Pose sintética em pé centrada em cx; wristY controla o punho esquerdo.
function pose(cx, { wristY = 0.52, elbowY = 0.42, wristVis = 0.9 } = {}) {
  const lms = Array.from({ length: 33 }, () => ({ x: cx, y: 0.5, visibility: 0.9 }));
  const set = (i, x, y, v = 0.9) => { lms[i] = { x, y, visibility: v }; };
  set(LM.L_SHOULDER, cx + 0.05, 0.3);
  set(LM.R_SHOULDER, cx - 0.05, 0.3);
  set(LM.L_ELBOW, cx + 0.07, elbowY);
  set(LM.R_ELBOW, cx - 0.07, 0.42);
  set(LM.L_WRIST, cx + 0.07, wristY, wristVis);
  set(LM.R_WRIST, cx - 0.07, 0.52);
  set(LM.L_HIP, cx + 0.04, 0.6);
  set(LM.R_HIP, cx - 0.04, 0.6);
  set(LM.L_ANKLE, cx + 0.04, 0.95);
  set(LM.R_ANKLE, cx - 0.04, 0.95);
  return lms;
}
const raised = (cx) => pose(cx, { wristY: 0.12, elbowY: 0.22 });

test('mesma pessoa mantém o mesmo id entre quadros', () => {
  const tr = new PoseTracker();
  const [a] = tr.update([pose(0.5)], 0, cfg);
  const [b] = tr.update([pose(0.52)], 33, cfg);
  assert.equal(a.id, b.id);
});

test('duas pessoas recebem ids diferentes e estáveis, mesmo trocando a ordem no resultado do modelo', () => {
  const tr = new PoseTracker();
  const t1 = tr.update([pose(0.3), pose(0.7)], 0, cfg);
  const ids = Object.fromEntries(t1.map((t) => [t.center[0] < 0.5 ? 'esq' : 'dir', t.id]));
  const t2 = tr.update([pose(0.71), pose(0.31)], 33, cfg);
  for (const t of t2) assert.equal(t.id, ids[t.center[0] < 0.5 ? 'esq' : 'dir']);
});

test('pessoa perdida por um instante é mantida; depois da retenção, removida', () => {
  const tr = new PoseTracker();
  tr.update([pose(0.5)], 0, cfg);
  let t = tr.update([], 200, cfg);
  assert.equal(t.length, 1);
  assert.ok(t[0].missingMs > 0);
  t = tr.update([], cfg.percepcao.retencaoMs + 100, cfg);
  assert.equal(t.length, 0);
});

test('HISTERESE: gesto não cai por um quadro duvidoso (punho um pouco abaixo / baixa visibilidade)', () => {
  const tr = new PoseTracker();
  const c = cloneConfig(cfg);
  c.percepcao.suavizacao = 0; // isola a histerese
  let [t] = tr.update([raised(0.5)], 0, c);
  assert.equal(t.raised, true);
  // punho caiu até a linha do ombro e cotovelo "subiu": critério estrito falharia, relaxado mantém
  [t] = tr.update([pose(0.5, { wristY: 0.305, elbowY: 0.2 })], 33, c);
  assert.equal(t.raised, true, 'mantido pela histerese');
  // visibilidade do punho caiu para 0.4 (abaixo do mínimo para iniciar)
  [t] = tr.update([pose(0.5, { wristY: 0.12, elbowY: 0.22, wristVis: 0.4 })], 66, c);
  assert.equal(t.raised, true, 'mantido com visibilidade menor');
  // braço realmente abaixado
  [t] = tr.update([pose(0.5)], 99, c);
  assert.equal(t.raised, false);
});

test('HISTERESE: para iniciar continua exigindo o critério estrito', () => {
  const tr = new PoseTracker();
  const [t] = tr.update([pose(0.5, { wristY: 0.305, elbowY: 0.2 })], 0, cfg);
  assert.equal(t.raised, false);
});

test('gesto mantido enquanto a pessoa está retida sem detecção', () => {
  const tr = new PoseTracker();
  const c = cloneConfig(cfg);
  c.percepcao.suavizacao = 0;
  tr.update([raised(0.5)], 0, c);
  const [t] = tr.update([], 150, c);
  assert.equal(t.raised, true);
});

test('suavização reduz o tremor do ponto de referência', () => {
  const tr = new PoseTracker();
  tr.update([pose(0.5)], 0, cfg);
  const [t] = tr.update([pose(0.6)], 33, cfg); // salto brusco de 0.1
  const jump = Math.abs(t.center[0] - 0.5);
  assert.ok(jump > 0 && jump < 0.1, `salto suavizado: ${jump}`);
});

test('interpretTracks: zona, gesto e marcação de pessoa retida', () => {
  const tr = new PoseTracker();
  const c = cloneConfig(cfg);
  c.percepcao.suavizacao = 0;
  tr.update([raised(0.5)], 0, c);
  const [p] = interpretTracks(tr.update([], 100, c), c);
  assert.equal(p.zone, 'B');
  assert.equal(p.gesture, true);
  assert.equal(p.held, true);
});
