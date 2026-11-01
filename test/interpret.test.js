import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LM, armRaised, interpretPoses, pointInPolygon, summarize, zoneOf } from '../public/js/interpret.js';
import { DEFAULT_CONFIG, cloneConfig } from '../public/js/config.js';

// Pose sintética de pessoa em pé, centrada em x=cx. y cresce para baixo.
function pose(cx, { leftWrist, rightWrist, hideAnkles = false } = {}) {
  const lms = Array.from({ length: 33 }, () => ({ x: cx, y: 0.5, visibility: 0.9 }));
  const set = (i, x, y, v = 0.9) => { lms[i] = { x, y, visibility: v }; };
  set(LM.NOSE, cx, 0.2);
  set(LM.L_SHOULDER, cx + 0.05, 0.3);
  set(LM.R_SHOULDER, cx - 0.05, 0.3);
  set(LM.L_ELBOW, cx + 0.07, 0.42);
  set(LM.R_ELBOW, cx - 0.07, 0.42);
  set(LM.L_WRIST, cx + 0.07, leftWrist ?? 0.52);
  set(LM.R_WRIST, cx - 0.07, rightWrist ?? 0.52);
  set(LM.L_HIP, cx + 0.04, 0.6);
  set(LM.R_HIP, cx - 0.04, 0.6);
  set(LM.L_ANKLE, cx + 0.04, 0.95, hideAnkles ? 0.1 : 0.9);
  set(LM.R_ANKLE, cx - 0.04, 0.95, hideAnkles ? 0.1 : 0.9);
  return lms;
}

const cfg = cloneConfig(DEFAULT_CONFIG);

test('pointInPolygon', () => {
  const sq = [[0, 0], [1, 0], [1, 1], [0, 1]];
  assert.equal(pointInPolygon([0.5, 0.5], sq), true);
  assert.equal(pointInPolygon([1.5, 0.5], sq), false);
});

test('zona por posição horizontal nas faixas padrão', () => {
  assert.equal(zoneOf([0.1, 0.5], cfg.zonas), 'A');
  assert.equal(zoneOf([0.5, 0.5], cfg.zonas), 'B');
  assert.equal(zoneOf([0.9, 0.5], cfg.zonas), 'C');
  assert.equal(zoneOf(null, cfg.zonas), null);
});

test('braços abaixados não contam como gesto', () => {
  assert.equal(armRaised(pose(0.5), cfg), false);
});

test('qualquer braço levantado conta (esquerdo ou direito)', () => {
  // cotovelo em 0.42, punho em 0.15: acima do ombro (0.3) e acima do cotovelo
  const p1 = pose(0.5, { leftWrist: 0.15 });
  p1[LM.L_ELBOW].y = 0.25;
  assert.equal(armRaised(p1, cfg), true);
  const p2 = pose(0.5, { rightWrist: 0.15 });
  p2[LM.R_ELBOW].y = 0.25;
  assert.equal(armRaised(p2, cfg), true);
});

test('punho só um pouco acima do ombro (dentro da margem) não conta', () => {
  const p = pose(0.5, { leftWrist: 0.295 });
  p[LM.L_ELBOW].y = 0.35;
  assert.equal(armRaised(p, cfg), false);
});

test('braço com baixa visibilidade não conta', () => {
  const p = pose(0.5, { leftWrist: 0.15 });
  p[LM.L_ELBOW].y = 0.25;
  p[LM.L_WRIST].visibility = 0.2;
  assert.equal(armRaised(p, cfg), false);
});

test('ponto de referência cai para o quadril quando os pés estão ocultos', () => {
  const [person] = interpretPoses([pose(0.5, { hideAnkles: true })], cfg);
  assert.equal(person.refKind, 'quadril');
  assert.equal(person.zone, 'B');
});

test('summarize: gesto em B vs gesto fora de B', () => {
  const inB = pose(0.5, { leftWrist: 0.15 }); inB[LM.L_ELBOW].y = 0.25;
  const inA = pose(0.15, { leftWrist: 0.15 }); inA[LM.L_ELBOW].y = 0.25;
  const s1 = summarize(interpretPoses([inB], cfg));
  assert.equal(s1.gestureInB, true);
  assert.equal(s1.gestureOutside, false);
  const s2 = summarize(interpretPoses([inA], cfg));
  assert.equal(s2.gestureInB, false);
  assert.equal(s2.gestureOutside, true);
  assert.equal(s2.zones.A, true);
});
