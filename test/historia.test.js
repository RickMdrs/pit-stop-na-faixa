// O modo história usa o controller real: estes testes garantem que a animação
// mostra exatamente o que o sistema decidiria na saída do corredor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulacao, cena, zonaDe, capituloEm, CAPITULOS, DURACAO, GEO, PARADA, PARTIDA } from '../public/js/historia-roteiro.js';
import { S, NIVEL, signalLevel } from '../public/js/controller.js';
import { driverView } from '../public/js/sinal-view.js';
import { pedestrianView, isSafeText, viewTexts } from '../public/js/pedestre-view.js';

const at = (t) => new Simulacao().avancarAte(t);
const pv = (sim, e) => pedestrianView({ state: e.snap.state, signal: e.snap.signal, zones: e.snap.zones,
  gestureProgress: e.snap.progress?.gestureB || 0, sinceSignalMs: e.sinceSignalMs }, sim.cfg);

test('roteiro: pessoa passa por A → B → C e sai', () => {
  assert.equal(zonaDe(cena(2.5).pessoa), 'A');
  assert.equal(zonaDe(cena(7).pessoa), 'B');
  assert.equal(zonaDe(cena(12).pessoa), 'C');
  assert.equal(zonaDe(cena(15).pessoa), null);
});

test('capítulos cobrem toda a duração, em ordem', () => {
  assert.equal(CAPITULOS[0].de, 0);
  assert.equal(CAPITULOS.at(-1).ate, DURACAO);
  for (let i = 1; i < CAPITULOS.length; i++) assert.equal(CAPITULOS[i].de, CAPITULOS[i - 1].ate);
  assert.equal(capituloEm(DURACAO), CAPITULOS.length - 1);
});

test('pré-alerta: ainda no corredor, os sinais avisam "SE APROXIMANDO" e o pedestre NÃO vê "pedido recebido"', () => {
  const sim = new Simulacao();
  const e = sim.avancarAte(3);
  assert.equal(e.snap.state, S.APROXIMACAO);
  const dv = driverView(e.snap, sim.cfg);
  assert.equal(dv.nivel, NIVEL.ATENCAO);
  assert.match(dv.complemento, /APROXIMANDO/);
  assert.equal(pv(sim, e).modo, 'chegando');
});

test('na área de espera → pedido (por presença) e "PEDIU PASSAGEM — PARE ANTES DA FAIXA"', () => {
  const sim = new Simulacao();
  const e = sim.avancarAte(6);
  assert.equal(e.snap.state, S.SOLICITACAO);
  assert.equal(e.snap.requestOrigin, 'presenca');
  const dv = driverView(e.snap, sim.cfg);
  assert.equal(dv.titulo, 'PEDESTRE PEDIU PASSAGEM');
  assert.equal(dv.complemento, 'PARE ANTES DA FAIXA');
});

test('logo após o pedido, o pedestre vê "Pedido recebido!" (mesmo com o sinal aceso desde o pré-alerta)', () => {
  const sim = new Simulacao();
  const e = sim.avancarAte(6);
  assert.equal(pv(sim, e).modo, 'confirmado');
});

test('carros parados → pedestre orientado a atravessar quando os veículos pararem', () => {
  const sim = new Simulacao();
  const e = sim.avancarAte(9.5);
  assert.equal(pv(sim, e).modo, 'recebido');
  assert.ok(cena(9.5).carroDir.parado && cena(9.5).carroEsq.parado);
});

test('na faixa → alerta máximo e "atravessando"', () => {
  const sim = new Simulacao();
  const e = sim.avancarAte(12);
  assert.equal(e.snap.state, S.FAIXA_OCUPADA);
  assert.equal(signalLevel(e.snap), NIVEL.FAIXA);
  assert.equal(pv(sim, e).modo, 'atravessando');
});

test('os carros só seguem depois que o sinal apaga', () => {
  const sim = new Simulacao();
  let apagou = null;
  for (let t = 14; t <= DURACAO; t += 0.1) {
    const e = sim.avancarAte(t);
    if (apagou === null && !e.snap.signal) apagou = t;
  }
  assert.ok(apagou !== null && apagou < PARTIDA, `sinal apagou em ${apagou?.toFixed(1)} s; carros partem em ${PARTIDA} s`);
});

test('no fim, sistema volta a observar e o sinal fica apagado', () => {
  const e = at(DURACAO);
  assert.equal(e.snap.state, S.OBSERVANDO);
  assert.equal(e.snap.signal, false);
  assert.ok(e.eventos.some((x) => x.tipo === 'liberacao'));
});

test('os dois carros param antes da faixa (nunca sobre ela)', () => {
  assert.ok(PARADA.dir + GEO.carro.w < GEO.zonaC.x0);
  assert.ok(PARADA.esq > GEO.zonaC.x1);
});

test('voltar no tempo reinicia a simulação e dá o mesmo resultado', () => {
  const sim = new Simulacao();
  const a = sim.avancarAte(12).snap.state;
  sim.avancarAte(3);
  assert.equal(sim.avancarAte(12).snap.state, a);
});

test('GUARDA: nenhuma tela da história autoriza a travessia', () => {
  const sim = new Simulacao();
  for (let t = 0; t <= DURACAO; t += 0.25) {
    const e = sim.avancarAte(t);
    for (const txt of viewTexts(pv(sim, e))) assert.ok(isSafeText(txt), `t=${t}: "${txt}"`);
  }
});
