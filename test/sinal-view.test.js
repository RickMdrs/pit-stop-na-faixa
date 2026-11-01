import { test } from 'node:test';
import assert from 'node:assert/strict';
import { driverView } from '../public/js/sinal-view.js';
import { S, NIVEL } from '../public/js/controller.js';
import { DEFAULT_CONFIG, cloneConfig } from '../public/js/config.js';

const cfg = cloneConfig(DEFAULT_CONFIG);
const snap = (state, signal, zones = {}) => ({ state, signal, zones: { A: false, B: false, C: false, ...zones } });

test('apagado → INATIVO', () => {
  const v = driverView(snap(S.OBSERVANDO, false), cfg);
  assert.equal(v.nivel, NIVEL.APAGADO);
  assert.equal(v.texto, 'INATIVO');
});

test('pedido de passagem → diz que pediram passagem e manda parar antes da faixa', () => {
  const v = driverView(snap(S.SOLICITACAO, true, { B: true }), cfg);
  assert.equal(v.nivel, NIVEL.ATENCAO);
  assert.equal(v.motivo, 'pedido');
  assert.equal(v.titulo, 'PEDESTRE PEDIU PASSAGEM');
  assert.equal(v.complemento, 'PARE ANTES DA FAIXA');
});

test('pessoa na faixa → alerta máximo: PEDESTRE NA FAIXA / PARE', () => {
  const v = driverView(snap(S.FAIXA_OCUPADA, true, { C: true }), cfg);
  assert.equal(v.nivel, NIVEL.FAIXA);
  assert.equal(v.titulo, 'PEDESTRE NA FAIXA');
  assert.equal(v.complemento, 'PARE');
});

test('pré-alerta na aproximação → PEDESTRE SE APROXIMANDO (não "pediu passagem")', () => {
  const v = driverView(snap(S.APROXIMACAO, true, { A: true }), cfg);
  assert.equal(v.motivo, 'aproximacao');
  assert.match(v.complemento, /APROXIMANDO/);
});

test('verificando liberação, falha com sinal mantido e manual → atenção genérica', () => {
  assert.equal(driverView(snap(S.VERIFICANDO, true), cfg).motivo, 'atencao');
  assert.equal(driverView(snap(S.FALHA, true), cfg).motivo, 'atencao');
  assert.equal(driverView(snap(S.OBSERVANDO, false), cfg, 'on').motivo, 'atencao');
  assert.equal(driverView(snap(S.SOLICITACAO, true), cfg, 'off').nivel, NIVEL.APAGADO);
});

test('manual ligado com pessoa na faixa mantém o alerta máximo', () => {
  assert.equal(driverView(snap(S.FAIXA_OCUPADA, true, { C: true }), cfg, 'on').nivel, NIVEL.FAIXA);
});

test('texto sem travessão vira só título', () => {
  const c = cloneConfig(DEFAULT_CONFIG);
  c.sinal.texto = 'PARE';
  const v = driverView(snap(S.SOLICITACAO, true), c);
  assert.equal(v.titulo, 'PARE');
  assert.equal(v.complemento, '');
});
