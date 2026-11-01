// Modo história: reproduz a cena roteirizada e mostra, a cada instante, o que o
// sistema REAL decidiria (controller + sinal-view + pedestre-view).
import { Simulacao, cena, capituloEm, CAPITULOS, DURACAO, GEO } from './historia-roteiro.js';
import { S, NIVEL } from './controller.js';
import { driverView } from './sinal-view.js';
import { pedestrianView } from './pedestre-view.js';
import { plantaSVG } from './planta.js';

const $ = (id) => document.getElementById(id);
const sim = new Simulacao();

// a cena é a MESMA planta dos slides e do jogo (docs/sinalizacao), com as partes animadas
$('sceneHost').innerHTML = plantaSVG({ dinamico: true, zonas: true });
$('sceneHost').querySelector('svg').id = 'scene';

const STATE_LABEL = {
  [S.OBSERVANDO]: 'Observando', [S.APROXIMACAO]: 'Aproximação', [S.SOLICITACAO]: 'Solicitação ativa',
  [S.FAIXA_OCUPADA]: 'Faixa ocupada', [S.VERIFICANDO]: 'Verificando liberação', [S.FALHA]: 'Falha',
};
const EVENTO = {
  aproximacao: 'Pessoa detectada na zona A',
  presenca: 'Presença confirmada na área de espera',
  gesto: 'Mão levantada confirmada',
  solicitacao: 'Pedido de travessia registrado',
  sinal: null, // tratado à parte (ligar/desligar)
  ocupacao: 'Pessoa entrou na faixa',
  saida_zona: null,
  liberacao: 'Liberação confirmada',
};

let t = 0;
let playing = false;
let stopAt = null;   // pausa automática no fim do capítulo
let last = null;

// ---------- capítulos na linha do tempo ----------
$('chapters').replaceChildren(...CAPITULOS.map((c, i) => {
  const li = document.createElement('li');
  const b = document.createElement('button');
  b.innerHTML = `<b>${String(i + 1).padStart(2, '0')}</b>`;
  b.append(document.createTextNode(c.titulo));
  b.onclick = () => goChapter(i);
  li.append(b);
  return li;
}));

// ---------- desenho ----------
function fmt(s) { return s.toFixed(1).replace('.', ','); }

function render() {
  const e = sim.avancarAte(t);
  const { pessoa, carroDir, carroEsq } = cena(t);
  const snap = e.snap;

  // legenda
  const ci = capituloEm(t);
  const cap = CAPITULOS[ci];
  if ($('capTitulo').textContent !== cap.titulo) {
    $('capN').textContent = String(ci + 1).padStart(2, '0');
    $('capTitulo').textContent = cap.titulo;
    $('capTexto').textContent = cap.texto;
  }
  document.querySelectorAll('#chapters button').forEach((b, i) => {
    b.className = i === ci ? 'now' : i < ci ? 'done' : '';
  });
  $('fill').style.width = `${(t / DURACAO) * 100}%`;

  // cena
  const p = $('person');
  p.setAttribute('transform', `translate(${pessoa.x} ${pessoa.y})`);
  p.style.display = pessoa.visivel ? '' : 'none';
  $('hand').style.display = pessoa.mao ? '' : 'none';
  $('carDir').setAttribute('transform', `translate(${carroDir.x} ${GEO.carro.yDir})`);
  $('carEsq').setAttribute('transform', `translate(${carroEsq.x} ${GEO.carro.yEsq})`);
  for (const [id, c] of [['carDir', carroDir], ['carEsq', carroEsq]]) $(id).querySelector('.freio').style.display = c.freando ? '' : 'none';
  for (const z of ['A', 'B', 'C']) $('z' + z).classList.toggle('on', !!snap.zones[z]);

  // decisão do sistema (controller real)
  const dv = driverView(snap, sim.cfg);
  for (const id of ['sinalDir', 'sinalEsq']) {
    $(id).classList.toggle('on', dv.nivel === NIVEL.ATENCAO);
    $(id).classList.toggle('n2', dv.nivel === NIVEL.FAIXA);
  }
  const est = $('estado');
  // para a plateia: pessoa parada na área, ainda sem pedir, não é "Observando" no sentido comum
  est.textContent = snap.state === S.OBSERVANDO && snap.zones.B
    ? 'Na área de espera · aguardando pedido'
    : STATE_LABEL[snap.state] || snap.state;
  est.dataset.state = snap.state;

  // motorista
  const sign = $('sign');
  sign.classList.toggle('on', dv.nivel === NIVEL.ATENCAO);
  sign.classList.toggle('n2', dv.nivel === NIVEL.FAIXA);
  $('signT').textContent = dv.titulo;
  $('signS').textContent = dv.complemento;

  // pedestre
  const pv = pedestrianView({
    state: snap.state, signal: snap.signal, zones: snap.zones,
    gestureProgress: snap.progress ? snap.progress.gestureB : 0, sinceSignalMs: e.sinceSignalMs,
  }, sim.cfg);
  const ped = $('ped');
  ped.className = `ped ${pv.modo}`;
  $('pedT').textContent = pv.titulo;
  $('pedO').textContent = pv.orientacao;
  $('pedBar').hidden = !pv.progresso;
  $('pedBarFill').style.width = `${Math.round((pv.progresso || 0) * 100)}%`;
  const key = (pv.passos || []).map((x) => x.texto).join('|');
  if (ped.dataset.key !== key) {
    ped.dataset.key = key;
    const ol = $('pedPassos');
    ol.replaceChildren(...(pv.passos || []).map((x) => {
      const li = document.createElement('li');
      li.innerHTML = `<svg class="i i-sm"><use href="vendor/icons.svg#${x.icone}"/></svg>`;
      li.append(document.createTextNode(x.texto));
      return li;
    }));
    ol.hidden = !pv.passos;
  }

  // registro (últimos eventos, mais recente em cima)
  const evs = e.eventos.filter((x) => (x.tipo === 'sinal') || EVENTO[x.tipo]).slice(-5).reverse();
  const logKey = evs.map((x) => x.tipo + x.t).join();
  if ($('log').dataset.key !== logKey) {
    $('log').dataset.key = logKey;
    $('log').replaceChildren(...evs.map((x) => {
      const li = document.createElement('li');
      const lt = document.createElement('span');
      lt.className = 'lt';
      lt.textContent = `${fmt(x.t / 1000)} s`;
      const tx = document.createElement('span');
      tx.textContent = x.tipo === 'sinal' ? (x.valor ? 'Sinal ao motorista ACESO' : 'Sinal ao motorista apagado') : EVENTO[x.tipo];
      li.append(lt, tx);
      return li;
    }));
  }
}

// ---------- reprodução ----------
function setPlaying(on) {
  playing = on && t < DURACAO;
  $('bPlay').textContent = playing ? 'Pausa' : t >= DURACAO ? 'De novo' : 'Play';
  $('bPlay').setAttribute('aria-label', playing ? 'Pausar' : 'Reproduzir');
  if (playing) {
    stopAt = $('oPausa').checked ? CAPITULOS[capituloEm(t)].ate : null;
    last = null;
    requestAnimationFrame(tick);
  }
}

function tick(now) {
  if (!playing) return;
  if (last !== null) t = Math.min(DURACAO, t + (now - last) / 1000);
  last = now;
  // pausa 1 ms antes do fim, para continuar "dentro" do capítulo (legenda e botão Próximo corretos)
  if (stopAt !== null && t >= stopAt - 0.001) { t = Math.min(stopAt - 0.001, DURACAO); render(); setPlaying(false); return; }
  render();
  if (t >= DURACAO) { setPlaying(false); return; }
  requestAnimationFrame(tick);
}

function goChapter(i) {
  i = Math.max(0, Math.min(CAPITULOS.length - 1, i));
  t = CAPITULOS[i].de;
  render();
  setPlaying(true); // toca o capítulo escolhido (e pausa no fim, se marcado)
}

$('bPlay').onclick = () => {
  if (t >= DURACAO) { t = 0; render(); }
  setPlaying(!playing);
};
$('bNext').onclick = () => {
  const ci = capituloEm(t);
  if (ci >= CAPITULOS.length - 1) { setPlaying(true); return; } // último: só continua até o fim
  goChapter(ci + 1);
};
$('bPrev').onclick = () => {
  const ci = capituloEm(t);
  goChapter(t - CAPITULOS[ci].de > 0.6 ? ci : ci - 1);
};
$('bRestart').onclick = () => { setPlaying(false); t = 0; render(); };
$('oZonas').onchange = () => $('scene').classList.toggle('no-zones', !$('oZonas').checked);
$('track').onclick = (ev) => {
  const r = ev.currentTarget.getBoundingClientRect();
  t = Math.max(0, Math.min(DURACAO, ((ev.clientX - r.left) / r.width) * DURACAO));
  setPlaying(false);
  render();
};
document.addEventListener('keydown', (ev) => {
  if (ev.target.tagName === 'INPUT') return;
  if (ev.key === 'ArrowRight' || ev.key === 'PageDown') { ev.preventDefault(); $('bNext').click(); }
  else if (ev.key === 'ArrowLeft' || ev.key === 'PageUp') { ev.preventDefault(); $('bPrev').click(); }
  else if (ev.key === ' ') { ev.preventDefault(); $('bPlay').click(); }
});

render();
