import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pedestrianView, isSafeText, viewTexts, FORBIDDEN, CONFIRMACAO_MS } from '../public/js/pedestre-view.js';
import { S } from '../public/js/controller.js';
import { DEFAULT_CONFIG, cloneConfig } from '../public/js/config.js';

const cfg = cloneConfig(DEFAULT_CONFIG);
const z = (A = false, B = false, C = false) => ({ A, B, C });
const view = (snap, c = cfg) => pedestrianView(snap, c);

test('ninguém → instrução com os 3 passos (parar, pedir, atravessar quando pararem)', () => {
  const v = view({ state: S.OBSERVANDO, signal: false, zones: z() });
  assert.equal(v.modo, 'instrucao');
  assert.equal(v.passos.length, 3);
  assert.match(v.passos[0].texto, /Pare na área/);
});

test('chegando pelo corredor (A) → pedir para parar na área', () => {
  assert.equal(view({ state: S.APROXIMACAO, signal: false, zones: z(true) }).modo, 'chegando');
});

test('pré-alerta (sinal aceso com a pessoa ainda no corredor) NÃO diz "pedido recebido"', () => {
  const v = view({ state: S.APROXIMACAO, signal: true, zones: z(true), sinceSignalMs: 100 });
  assert.equal(v.modo, 'chegando');
  assert.doesNotMatch(v.titulo, /recebido/i);
});

test('parado em B sem pedido → orientar a levantar a mão ou apertar o botão', () => {
  const v = view({ state: S.OBSERVANDO, signal: false, zones: z(false, true) });
  assert.equal(v.modo, 'na_area');
  assert.match(v.orientacao, /levante a mão/i);
});

test('segurando o gesto → barra de progresso', () => {
  const v = view({ state: S.OBSERVANDO, signal: false, zones: z(false, true), gestureProgress: 0.4 });
  assert.equal(v.modo, 'segurando');
  assert.equal(v.progresso, 0.4);
});

test('pedido aceito → primeiro confirma, depois orienta a olhar e atravessar quando pararem', () => {
  const a = view({ state: S.SOLICITACAO, signal: true, zones: z(false, true), sinceSignalMs: 500 });
  assert.equal(a.modo, 'confirmado');
  assert.match(a.titulo, /Pedido recebido/);
  const b = view({ state: S.SOLICITACAO, signal: true, zones: z(false, true), sinceSignalMs: CONFIRMACAO_MS + 1 });
  assert.equal(b.modo, 'recebido');
  assert.equal(b.titulo, DEFAULT_CONFIG.retornoPedestre.texto);
  assert.deepEqual(b.passos.map((p) => p.icone), ['eye', 'car-front', 'footprints']);
});

test('na faixa (C) → atravessando, continue atento', () => {
  assert.equal(view({ state: S.FAIXA_OCUPADA, signal: true, zones: z(false, false, true), sinceSignalMs: 9e9 }).modo, 'atravessando');
});

test('sem campos extras (compatibilidade): sinal aceso → recebido', () => {
  assert.equal(view({ state: S.SOLICITACAO, signal: true }).modo, 'recebido');
});

test('falha tem prioridade, mesmo com sinal aceso', () => {
  const v = view({ state: S.FALHA, signal: true, zones: z(false, false, true) });
  assert.equal(v.modo, 'falha');
  assert.match(v.titulo, /pode não estar funcionando/);
});

test('desativado pela configuração', () => {
  const c = cloneConfig(DEFAULT_CONFIG);
  c.retornoPedestre.habilitado = false;
  assert.equal(view({ state: S.SOLICITACAO, signal: true }, c).modo, 'desativado');
});

test('GUARDA: nenhum texto, em nenhuma combinação de estado, autoriza a travessia', () => {
  const variants = [cfg, { ...cfg, retornoPedestre: { ...cfg.retornoPedestre, habilitado: false } }];
  const zonesList = [z(), z(true), z(false, true), z(false, false, true)];
  for (const c of variants) for (const state of Object.values(S)) for (const signal of [true, false])
    for (const zones of zonesList) for (const sinceSignalMs of [0, 9e9]) for (const gestureProgress of [0, 0.5]) {
      const v = view({ state, signal, zones, sinceSignalMs, gestureProgress }, c);
      for (const txt of viewTexts(v)) assert.ok(isSafeText(txt), `texto proibido em ${state}/${signal}/${v.modo}: "${txt}"`);
    }
});

test('GUARDA: texto personalizado perigoso é trocado pelo padrão', () => {
  for (const bad of ['ATRAVESSE', 'Pode atravessar', 'Via livre', 'Travessia segura', 'Siga', 'Pedido ok, atravesse!',
    'ATRAVESSE AGORA', 'Atravesse quando o sinal acender', 'Atravesse quando os veículos pararem. Atravesse!']) {
    const c = cloneConfig(DEFAULT_CONFIG);
    c.retornoPedestre.texto = bad;
    c.retornoPedestre.orientacao = bad;
    const v = view({ state: S.SOLICITACAO, signal: true, sinceSignalMs: 9e9 }, c);
    assert.equal(v.titulo, DEFAULT_CONFIG.retornoPedestre.texto, bad);
    assert.equal(v.orientacao, DEFAULT_CONFIG.retornoPedestre.orientacao, bad);
  }
});

test('frases educativas legítimas continuam permitidas', () => {
  assert.ok(isSafeText('Olhe para os dois lados e só atravesse com os veículos parados.'));
  assert.ok(isSafeText('Olhe antes de atravessar.'));
  assert.ok(isSafeText('ATRAVESSE QUANDO OS VEÍCULOS PARAREM'));
  assert.ok(isSafeText('Atravesse somente quando os carros pararem'));
  assert.ok(FORBIDDEN.length > 0);
});
