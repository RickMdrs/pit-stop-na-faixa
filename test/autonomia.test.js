import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recoveryAction } from '../public/js/autonomia.js';
import { DEFAULT_CONFIG, cloneConfig } from '../public/js/config.js';
import { Controller, S } from '../public/js/controller.js';

const a = cloneConfig(DEFAULT_CONFIG).autonomia;
const base = { failingForMs: 6000, sinceLastAttemptMs: 6000, frameAgeMs: null, outputKind: 'tela', outputConnected: true };

test('sem falha → nada', () => {
  assert.equal(recoveryAction({ ...base, failure: null }, a).acao, 'nada');
});

test('recuperação desligada → nada', () => {
  assert.equal(recoveryAction({ ...base, failure: 'camera_desconectada' }, { ...a, recuperacaoAutomatica: false }).acao, 'nada');
});

test('câmera movida exige pessoa, mesmo depois de muito tempo', () => {
  assert.equal(recoveryAction({ ...base, failure: 'zonas_precisam_revisao', failingForMs: 1e9 }, a).acao, 'aguardar_humano');
});

test('câmera sem imagem → reconecta; com imagem voltando → reinicia o controle', () => {
  assert.equal(recoveryAction({ ...base, failure: 'camera_sem_quadros_novos', frameAgeMs: 5000 }, a).acao, 'reconectar_camera');
  assert.equal(recoveryAction({ ...base, failure: 'camera_desconectada', frameAgeMs: null }, a).acao, 'reconectar_camera');
  assert.equal(recoveryAction({ ...base, failure: 'camera_sem_quadros_novos', frameAgeMs: 50 }, a).acao, 'reiniciar_controle');
});

test('respeita o intervalo entre tentativas', () => {
  assert.equal(recoveryAction({ ...base, failure: 'camera_desconectada', sinceLastAttemptMs: 100 }, a).acao, 'esperar');
});

test('controlador USB desconectado → reconecta; sinal sem confirmação na tela → reinicia', () => {
  assert.equal(recoveryAction({ ...base, failure: 'controlador_desconectado', outputKind: 'serial', outputConnected: false }, a).acao, 'reconectar_controlador');
  assert.equal(recoveryAction({ ...base, failure: 'sinal_tela_sem_confirmacao', outputKind: 'tela' }, a).acao, 'reiniciar_controle');
});

test('alerta longo e erro do modelo → reinicia (fica registrado)', () => {
  assert.equal(recoveryAction({ ...base, failure: 'advertencia_maxima_excedida' }, a).acao, 'reiniciar_controle');
  assert.equal(recoveryAction({ ...base, failure: 'percepcao_erro' }, a).acao, 'reiniciar_controle');
});

test('falha persistente além do limite → recarrega a página', () => {
  assert.equal(recoveryAction({ ...base, failure: 'camera_desconectada', failingForMs: a.recarregarAposMs }, a).acao, 'recarregar_pagina');
});

test('SEGURANÇA: reiniciar o controle após falha não apaga o sinal sem verificar liberação', () => {
  const cfg = cloneConfig(DEFAULT_CONFIG);
  const ctl = new Controller(cfg, 0);
  let t = 0;
  const frame = (C) => { t += 33; return ctl.observe({ zones: { A: false, B: false, C }, gestureInB: false, gestureOutside: false }, t); };
  for (let i = 0; i < 30; i++) frame(true);           // alguém na faixa → sinal aceso
  t += cfg.tempos.quadroAntigoMs + 100;
  assert.equal(ctl.tick(t).state, S.FALHA);            // câmera congelou
  let snap = ctl.reset(t);                             // recuperação automática
  assert.equal(snap.signal, true, 'sinal continua aceso logo após recuperar');
  for (let i = 0; i < 10; i++) snap = frame(true);     // pessoa ainda lá
  assert.equal(snap.signal, true);
  assert.equal(snap.state, S.FAIXA_OCUPADA);
});
