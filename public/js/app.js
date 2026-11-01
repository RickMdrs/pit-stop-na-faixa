// Painel do operador: liga captura → percepção → zonas/eventos → controle → sinal → registro.
import { DEFAULT_CONFIG, cloneConfig, configHash, mergeConfig } from './config.js';
import { interpretTracks, summarize } from './interpret.js';
import { PoseTracker } from './tracker.js';
import { Controller, S, NIVEL, signalLevel } from './controller.js';
import { ScreenSignal, SerialSignal } from './signal.js';
import { EventLog } from './log.js';
import { isSafeText, pedestrianView } from './pedestre-view.js';
import { recoveryAction } from './autonomia.js';
import { driverView } from './sinal-view.js';

const $ = (id) => document.getElementById(id);

const ORIGEM_LABEL = { webcam_bancada: 'real de bancada', video_teste: 'vídeo de teste', foto_teste: 'foto de teste', simulacao: 'simulado' };
const STATE_LABEL = {
  [S.OBSERVANDO]: 'Observando',
  [S.APROXIMACAO]: 'Aproximação',
  [S.SOLICITACAO]: 'Solicitação ativa',
  [S.FAIXA_OCUPADA]: 'Faixa ocupada',
  [S.VERIFICANDO]: 'Verificando liberação',
  [S.FALHA]: 'Falha',
};
const FAILURE_LABEL = {
  aguardando_camera: 'aguardando primeira imagem',
  camera_sem_quadros_novos: 'câmera sem quadros novos (congelada ou desconectada)',
  camera_desconectada: 'câmera desconectada',
  advertencia_maxima_excedida: 'advertência acima do tempo máximo — revisar',
  zonas_precisam_revisao: 'câmera movida — revisar e salvar zonas',
  sinal_sem_confirmacao: 'sinal não confirmou o comando',
  sinal_tela_sem_confirmacao: 'janela de sinal não confirmou o comando',
  sinal_sem_resposta_ao_ping: 'controlador não responde',
  controlador_desconectado: 'controlador desconectado',
  controlador_erro_leitura: 'erro de comunicação com o controlador',
  controlador_erro_escrita: 'erro de comunicação com o controlador',
  painel_oculto: 'painel ficou oculto (navegador pausa o processamento)',
  percepcao_erro: 'erro no modelo de pose (tente ?cpu=1 na URL)',
};
const ZONE_COLORS = { A: '#5b8def', B: '#f5a524', C: '#ef4444' }; // mesmos tokens de base.css
const UI_FONT = "'Inter', system-ui, sans-serif";

// rótulo em "pílula" desenhado no canvas
function pill(text, x, y, dpr, bg, fg = '#fff', size = 12, W = Infinity) {
  g.font = `500 ${size * dpr}px ${UI_FONT}`;
  const padX = 8 * dpr, h = (size + 10) * dpr, tw = g.measureText(text).width;
  const bx = Math.max(0, Math.min(x, W - tw - 2 * padX));
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect(bx, y, tw + 2 * padX, h, h / 2);
  g.fill();
  g.fillStyle = fg;
  g.fillText(text, bx + padX, y + h / 2 + (size * dpr) * 0.36);
}

const sessao = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '') + '-' + Math.random().toString(36).slice(2, 6);
const log = new EventLog(sessao);
const iso = (t) => new Date(performance.timeOrigin + t).toISOString();

let cfg = cloneConfig(DEFAULT_CONFIG);
let cfgVer = configHash(cfg);
let cfgDirty = false;
let ctl = new Controller(cfg, performance.now());
let snapshot = null;
let origem = 'webcam_bancada';
let running = false;
let perception = null;
let perceptionKey = null;
const tracker = new PoseTracker();
let stream = null;
let lastVideoTime = -1;
let lastPersons = [];
let lastInferenceMs = null;
let frameTimes = [];
let override = 'auto';
let output = null;
let outputSent = null;    // último estado enviado à saída
let outputConfirmed = null;
let lastSignalEvent = null;
let zonesNeedReview = false;
let editingZone = null;
let draft = [];
let pendingFonte = null;
// autonomia
const AUTO_MODE = new URLSearchParams(location.search).has('auto'); // ?auto=1: liga sozinho ao abrir
let manualStop = false;
let failingSince = null;
let lastAttempt = -Infinity;
let recoveries = 0;
let lastRecovery = null;
let wakeLock = null;
const stats = { activations: 0, byWhy: {}, latencies: [], valid: 0, falsePos: 0, outside: 0, fails: 0 };

const video = $('video');
const canvas = $('overlay');
const g = canvas.getContext('2d');

// ---------- tela opcional do pedestre (confirma recebimento; nunca autoriza) ----------
const pedBc = new BroadcastChannel('pitstop-pedestre');
const pedDisplays = new Map();
let pedModo = null;
pedBc.onmessage = (ev) => {
  const m = ev.data;
  if (!m || (m.tipo !== 'ack' && m.tipo !== 'ola')) return;
  pedDisplays.set(m.janela, performance.now());
  if (m.tipo === 'ola') publishPedestrian(true);
};

function pedestrianDisplays() {
  const now = performance.now();
  for (const [id, t] of pedDisplays) if (now - t > 3000) pedDisplays.delete(id);
  return pedDisplays.size;
}

let signalOnSince = null; // quando o sinal ao motorista acendeu
let requestSince = null;  // quando o PEDIDO foi registrado (fase "pedido recebido!"; o pré-alerta não conta)
let pedProgress = 0;

// Entrada da tela do pedestre a partir do estado atual do controle.
function pedInput() {
  const s = snapshot;
  return {
    state: s ? s.state : ctl.state,
    signal: desiredOutput(),
    zones: s ? s.zones : {},
    gestureProgress: s?.progress ? s.progress.gestureB : 0,
    sinceSignalMs: requestSince === null ? Infinity : performance.now() - requestSince,
  };
}

// Envia quando o modo (ou a barra de progresso) muda; `force` também serve de heartbeat periódico.
function publishPedestrian(force = false) {
  const view = pedestrianView(pedInput(), cfg);
  const changed = view.modo !== pedModo;
  const progressed = Math.abs((view.progresso || 0) - pedProgress) >= 0.05;
  if (changed && pedModo !== null) record({ tipo: 'retorno_pedestre', motivo: view.modo });
  pedModo = view.modo;
  pedProgress = view.progresso || 0;
  if (changed || progressed || force) pedBc.postMessage({ tipo: 'estado', view });
}
setInterval(() => publishPedestrian(true), 500);

// ---------- registro ----------
function record(ev) {
  const e = log.push({
    origem,
    versaoConfig: cfgVer,
    horario: iso(ev.t ?? performance.now()),
    ...ev,
  });
  delete e.t;
  addRow(e);
  return e;
}

function handleSnap(snap) {
  snapshot = snap;
  for (const ev of snap.events) {
    if (ev.tipo === 'botao' && pendingFonte) ev.fonte = pendingFonte;
    if (ev.tipo === 'sinal') {
      lastSignalEvent = ev;
      if (ev.valor) {
        stats.activations++;
        stats.byWhy[ev.motivo] = (stats.byWhy[ev.motivo] || 0) + 1;
      }
    }
    if (ev.tipo === 'falha') stats.fails++;
    if (ev.tipo === 'gesto_fora_da_zona') stats.outside++;
    const { tCondicao, ...rest } = ev;
    const e = record(tCondicao !== undefined ? { ...rest, horarioCondicao: iso(tCondicao) } : rest);
    if (ev.tipo === 'sinal') lastSignalEvent.logId = e.id;
  }
  pendingFonte = null;
  applyOutput();
  publishPedestrian();
  renderState();
}

// ---------- saída do sinal ----------
// Nível desejado do aviso ao motorista: 0 apagado · 1 atenção · 2 alerta máximo (pessoa na faixa).
function desiredLevel() { return driverView(snapshot, cfg, override).nivel; }
function desiredOutput() { return desiredLevel() > 0; }

function applyOutput() {
  const level = desiredLevel();
  const want = level > 0;
  if (want && signalOnSince === null) signalOnSince = performance.now();
  if (!want) signalOnSince = null;
  if (snapshot && snapshot.requestOrigin !== undefined) {
    if (snapshot.requestOrigin && requestSince === null) requestSince = performance.now();
    if (!snapshot.requestOrigin) requestSince = null;
  }
  const dv = driverView(snapshot, cfg, override);
  renderSignalPreview(dv);
  if (output && output.setMessage && level > 0) output.setMessage(dv.texto);
  if (!output || level === outputSent) return;
  const prev = outputSent;
  outputSent = level;
  if (level === NIVEL.FAIXA && prev === NIVEL.ATENCAO) record({ tipo: 'alerta_faixa', motivo: 'pedestre_na_faixa' });
  // latência só nas transições apagado ↔ aceso (mudança de nível não tem condição de origem própria)
  const onOff = !prev !== !level;
  const ctx = onOff && override === 'auto' && lastSignalEvent && lastSignalEvent.valor === want ? lastSignalEvent : null;
  sendSignal(level, ctx);
}

async function sendSignal(level, ctx) {
  const want = level > 0;
  outputConfirmed = null; // até chegar o OK, o estado físico é desconhecido
  const res = await output.set(level);
  if (!res.ok) {
    outputConfirmed = null;
    record({ tipo: 'sinal_sem_confirmacao', valor: want, nivel: level, motivo: output.kind });
    return;
  }
  outputConfirmed = level;
  const ev = { tipo: 'sinal_confirmado', valor: want, nivel: level, confirmado: res.confirmedBy, latenciaComandoMs: Math.round(res.ackAt - res.sentAt) };
  if (ctx) {
    ev.latenciaMs = Math.round(res.ackAt - ctx.tCondicao);
    ev.motivo = ctx.motivo;
    ev.ref = ctx.logId;
    if (want) stats.latencies.push(ev.latenciaMs);
  } else {
    ev.motivo = override === 'auto' ? 'sincronizacao' : `manual_${override}`;
  }
  record(ev);
  renderMetrics();
}

function setupOutput(kind) {
  if (output) output.close();
  outputSent = null;
  outputConfirmed = null;
  if (kind === 'tela') {
    output = new ScreenSignal(cfg.tempos.ackSinalMs);
  } else {
    output = null; // aguarda "Conectar controlador" (exige gesto do usuário)
  }
  if (output) wireOutput(output);
  $('btnSerial').hidden = kind !== 'serial';
  applyOutput();
}

function wireOutput(o) {
  o.on('fault', (reason) => handleSnap(ctl.fail(reason, performance.now())));
  o.on('button', () => pressButton('fisico'));
  o.on('status', () => renderDiag());
}

// port: porta já autorizada (reconexão automática). silent: não mostra alertas.
async function connectSerial(port, silent = false) {
  if (!SerialSignal.supported()) {
    if (!silent) alert('Este navegador não suporta Web Serial. Use Chrome ou Edge no computador.');
    return false;
  }
  const s = new SerialSignal(cfg.tempos.ackSinalMs);
  try {
    await s.connect(port);
    wireOutput(s);
    if (output) await output.close();
    output = s;
    outputSent = null; // força reenviar o estado atual ao controlador
    record({ tipo: 'controlador_conectado', motivo: s.hello || 'sem HELLO' });
    try { localStorage.setItem('pitstop.saida', 'serial'); } catch { /* armazenamento indisponível */ }
    applyOutput();
    return true;
  } catch (err) {
    await s.close();
    if (!silent) alert('Não foi possível conectar: ' + (err.message || err));
    return false;
  }
}

// ---------- autonomia: vigia que recupera falhas sozinho ----------
async function watchdog() {
  const now = performance.now();

  // modo autônomo: liga sozinho (e religa se parar por erro, nunca se o operador parou)
  if (AUTO_MODE && !running && !manualStop && now - lastAttempt >= cfg.autonomia.tentativaMs) {
    lastAttempt = now;
    $('origem').value = 'webcam_bancada';
    $('origem').dispatchEvent(new Event('change'));
    await start();
    return;
  }

  // saída física escolhida mas sem controlador: é falha (o motorista não está sendo avisado)
  if (running && $('saida').value === 'serial' && !(output && output.status().conectado) && !ctl.failure) {
    handleSnap(ctl.fail('controlador_desconectado', now));
  }

  const failure = running ? ctl.failure : null;
  if (!failure) { failingSince = null; return; }
  if (failingSince === null) failingSince = now;
  // simulação/vídeo: não há câmera para reconectar; o teste de falha fica visível para o operador
  if (origem !== 'webcam_bancada' && failure.startsWith('camera')) return;

  const decision = recoveryAction({
    failure,
    // recarregar a página só no modo autônomo (fora dele, perderia a sessão do operador)
    failingForMs: AUTO_MODE ? now - failingSince : 0,
    sinceLastAttemptMs: now - lastAttempt,
    frameAgeMs: ctl.lastFrameTs === null ? null : now - ctl.lastFrameTs,
    outputKind: output ? output.kind : $('saida').value,
    outputConnected: output ? output.status().conectado : false,
  }, cfg.autonomia);
  if (['nada', 'esperar', 'aguardar_humano'].includes(decision.acao)) return;

  lastAttempt = now;
  record({ tipo: 'auto_recuperacao', motivo: `${decision.acao} (${decision.motivo})` });
  try {
    if (decision.acao === 'recarregar_pagina') {
      log.flushBeacon();
      setTimeout(() => location.reload(), 300);
      return;
    }
    if (decision.acao === 'reconectar_camera') {
      if (origem === 'webcam_bancada') await openWebcam();
      return; // na próxima volta, com imagens novas, o controle é reiniciado
    }
    if (decision.acao === 'reconectar_controlador') {
      const port = await SerialSignal.grantedPort();
      if (!port || !(await connectSerial(port, true))) return;
    }
    // reiniciar_controle (e após reconectar o controlador)
    handleSnap(ctl.reset(performance.now()));
    recoveries++;
    lastRecovery = { quando: new Date(), motivo: decision.motivo };
  } catch (err) {
    record({ tipo: 'auto_recuperacao_falhou', motivo: String(err.message || err) });
  }
}
setInterval(watchdog, 1000);

// Mantém a tela ligada no modo autônomo (o navegador pausa abas/telas apagadas).
async function keepAwake() {
  if (!AUTO_MODE || !('wakeLock' in navigator) || document.hidden) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
  } catch { /* sem permissão: segue sem */ }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) keepAwake(); });

// ---------- entradas ----------
function pressButton(fonte) {
  pendingFonte = fonte;
  handleSnap(ctl.button(performance.now()));
}

function newController(motivo) {
  ctl = new Controller(cfg, performance.now());
  snapshot = null;
  record({ tipo: 'controle_reiniciado', motivo });
  renderState();
}

// ---------- fontes de imagem ----------
async function listCameras() {
  try {
    const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
    const sel = $('camera');
    const cur = sel.value;
    sel.innerHTML = '<option value="">padrão</option>' +
      devs.map((d, i) => `<option value="${d.deviceId}">${d.label || 'Câmera ' + (i + 1)}</option>`).join('');
    sel.value = cur;
  } catch { /* sem permissão ainda */ }
}

async function ensurePerception() {
  if (perception) return perception;
  $('stageMsg').textContent = 'Carregando modelo de pose local...';
  $('stageMsg').hidden = false;
  const { createPerception } = await import('./perception.js');
  const forceCpu = new URLSearchParams(location.search).has('cpu');
  const p = cfg.percepcao;
  perception = await createPerception({ maxPessoas: p.maxPessoas, modelo: p.modelo, confianca: p.confiancaDeteccao, forceCpu });
  perceptionKey = perceptionSignature();
  tracker.reset();
  record({ tipo: 'modelo_carregado', motivo: `pose_landmarker_${perception.variant} · ${perception.delegate} · aquecimento ${Math.round(perception.warmupMs)} ms` });
  if (perception.aviso) record({ tipo: 'aviso', motivo: perception.aviso });
  return perception;
}

// Parâmetros que exigem recarregar o modelo quando mudam.
function perceptionSignature() {
  const p = cfg.percepcao;
  return `${p.modelo}|${p.maxPessoas}|${p.confiancaDeteccao}`;
}

async function reloadPerceptionIfNeeded() {
  if (!perception || perceptionKey === perceptionSignature()) return;
  const wasRunning = running && origem !== 'simulacao';
  perception.close();
  perception = null;
  if (wasRunning) { running = false; await ensurePerception(); running = true; $('stageMsg').hidden = true; requestAnimationFrame(loop); }
}

// Abre (ou reabre) a webcam sem mexer no controle — usado no início e na recuperação automática.
async function openWebcam() {
  if (stream) { const old = stream; stream = null; old.getTracks().forEach((t) => t.stop()); }
  const id = $('camera').value;
  let s;
  try {
    s = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: id ? { exact: id } : undefined, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
  } catch (err) {
    if (!id) throw err;
    // câmera escolhida sumiu (USB trocado de porta): tenta a padrão
    s = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
  }
  stream = s;
  s.getVideoTracks()[0].addEventListener('ended', () => {
    if (stream !== s) return; // stream antigo, encerrado por nós
    record({ tipo: 'camera_desconectada' });
    handleSnap(ctl.fail('camera_desconectada', performance.now()));
  });
  video.srcObject = s;
  await video.play();
  lastVideoTime = -1;
  listCameras();
}

async function start() {
  manualStop = false;
  await stop(true);
  origem = $('origem').value;
  newController('inicio_' + origem);
  try {
    if (origem === 'webcam_bancada') {
      await ensurePerception();
      await openWebcam();
    } else if (origem === 'video_teste') {
      const f = $('videoFile').files[0];
      if (!f) { alert('Escolha um arquivo de vídeo de teste.'); return; }
      await ensurePerception();
      video.srcObject = null;
      video.src = URL.createObjectURL(f);
      video.loop = true;
      await video.play();
      record({ tipo: 'video_teste_carregado', motivo: f.name });
    } else if (origem === 'foto_teste') {
      if (!photos.length) { alert('Carregue uma ou mais fotos primeiro.'); return; }
      await ensurePerception();
      video.srcObject = null;
      video.removeAttribute('src');
      showPhoto(photoIndex);
      record({ tipo: 'fotos_carregadas', motivo: photos.length + ' foto(s)' });
    } else {
      video.srcObject = null;
      video.removeAttribute('src');
      setStageRatio(16, 9);
    }
    $('photo').hidden = origem !== 'foto_teste';
    video.hidden = origem === 'foto_teste';
    $('stageMsg').hidden = true;
    running = true;
    lastVideoTime = -1;
    record({ tipo: 'demonstracao_iniciada', motivo: ORIGEM_LABEL[origem] });
    requestAnimationFrame(loop);
  } catch (err) {
    $('stageMsg').hidden = false;
    $('stageMsg').textContent = 'Erro ao iniciar: ' + (err.message || err);
    record({ tipo: 'falha_inicio', motivo: String(err.message || err) });
  }
  renderOrigem();
}

async function stop(silent) {
  if (running && !silent) record({ tipo: 'demonstracao_parada' });
  running = false;
  if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
  video.pause();
  lastPersons = [];
  if (!silent) {
    newController('parada');
    if (output && outputSent !== 0) { outputSent = 0; sendSignal(0, null); }
    renderSignalPreview(0);
    $('stageMsg').hidden = false;
    $('stageMsg').textContent = 'Parado. Clique em Iniciar.';
  }
}

// ---------- laço principal ----------
// Marca quando a câmera entrega um quadro realmente novo (a cadeia de callbacks persiste entre streams).
const HAS_RVFC = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
let frameReady = false;
if (HAS_RVFC) {
  const onFrame = () => { frameReady = true; video.requestVideoFrameCallback(onFrame); };
  video.requestVideoFrameCallback(onFrame);
}

function markFrame(now) {
  frameTimes.push(now);
  while (frameTimes.length && now - frameTimes[0] > 1000) frameTimes.shift();
}

function simulatedPersons() {
  const p = [];
  const mk = (zone, gesture) => {
    const poly = cfg.zonas[zone];
    const cx = poly.reduce((s, q) => s + q[0], 0) / poly.length;
    const cy = poly.reduce((s, q) => s + q[1], 0) / poly.length;
    return { zone, gesture, ref: [cx, cy], refKind: 'simulado', bbox: [cx - 0.05, cy - 0.25, cx + 0.05, cy + 0.15] };
  };
  if ($('simA').checked) p.push(mk('A', $('simGO').checked));
  if ($('simB').checked || $('simGB').checked) p.push(mk('B', $('simGB').checked));
  if ($('simC').checked) p.push(mk('C', false));
  if ($('simGO').checked && !$('simA').checked) p.push({ ...mk('A', true), zone: null, ref: [0.5, 0.05], bbox: [0.45, 0, 0.55, 0.1] });
  return p;
}

// Detecta pose numa fonte de imagem (vídeo ou canvas da foto) e alimenta o controle.
function processFrame(source) {
  let result;
  try {
    result = perception.detect(source);
  } catch (err) {
    console.error(err);
    handleSnap(ctl.fail('percepcao_erro', performance.now()));
    return;
  }
  const { poses, inferenceMs } = result;
  lastInferenceMs = inferenceMs;
  lastPersons = interpretTracks(tracker.update(poses, performance.now(), cfg), cfg);
  // horário após a inferência: uma inferência lenta não deve parecer imagem congelada
  const t = performance.now();
  handleSnap(ctl.observe(summarize(lastPersons), t));
  markFrame(t);
}

// Proporção do palco = proporção da imagem (a largura encolhe se a altura passar da tela).
function setStageRatio(w, h) {
  const st = $('stage');
  st.style.aspectRatio = w + ' / ' + h;
  st.style.setProperty('--ar', (w / h).toFixed(4));
}

// ---------- fotos (modo de prints para apresentação) ----------
let photos = [];       // { name, canvas }
let photoIndex = 0;
let lastPhotoFrame = 0;
const PHOTO_MAX = 1280; // fotos do celular são enormes: reduz (mantendo proporção e rotação)

async function loadPhotos(files) {
  const list = [...files].filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(f.name));
  const out = [];
  for (const file of list) {
    let bmp;
    try {
      bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      continue; // formato não suportado (ex.: HEIC) — avisado abaixo
    }
    const k = Math.min(1, PHOTO_MAX / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    out.push({ name: file.name, canvas: c });
  }
  if (out.length < list.length || !list.length) {
    alert((list.length - out.length || files.length) + ' arquivo(s) não puderam ser abertos. Use JPG ou PNG (fotos HEIC do iPhone: exporte como JPG).');
  }
  out.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true }));
  photos = out;
  photoIndex = 0;
  renderPhotoBar();
  if (photos.length && running && origem === 'foto_teste') showPhoto(0);
  else if (photos.length) previewPhoto(0);
}

// Desenha a foto no palco (sem processar) — útil para desenhar as zonas antes de iniciar.
function previewPhoto(i) {
  const p = photos[i];
  if (!p) return;
  const dst = $('photo');
  dst.width = p.canvas.width;
  dst.height = p.canvas.height;
  dst.getContext('2d').drawImage(p.canvas, 0, 0);
  dst.hidden = false;
  video.hidden = true;
  setStageRatio(p.canvas.width, p.canvas.height);
  $('stageMsg').hidden = true;
  draw();
}

function showPhoto(i) {
  if (!photos.length) return;
  photoIndex = (i + photos.length) % photos.length;
  previewPhoto(photoIndex);
  tracker.reset(); // a pessoa "teletransporta" entre fotos: não suavizar o salto
  lastPersons = [];
  if (running) record({ tipo: 'foto_exibida', motivo: (photoIndex + 1) + '/' + photos.length + ' · ' + photos[photoIndex].name });
  renderPhotoBar();
}

function renderPhotoBar() {
  const bar = $('photoBar');
  bar.hidden = !photos.length || $('origem').value !== 'foto_teste';
  $('photoCount').textContent = photos.length ? (photoIndex + 1) + ' / ' + photos.length : '';
  $('photoName').textContent = photos[photoIndex] ? photos[photoIndex].name : '';
  const strip = $('photoThumbs');
  if (strip.childElementCount !== photos.length || strip.dataset.key !== photos.map((p) => p.name).join('|')) {
    strip.dataset.key = photos.map((p) => p.name).join('|');
    strip.replaceChildren(...photos.map((p, i) => {
      const b = document.createElement('button');
      b.className = 'thumb';
      b.title = p.name;
      const c = document.createElement('canvas');
      c.width = 96;
      c.height = Math.round(96 * p.canvas.height / p.canvas.width);
      c.getContext('2d').drawImage(p.canvas, 0, 0, c.width, c.height);
      b.append(c);
      b.onclick = () => showPhoto(i);
      return b;
    }));
  }
  [...strip.children].forEach((b, i) => b.classList.toggle('active', i === photoIndex));
}

function loop() {
  if (!running) return;
  const now = performance.now();
  if (origem === 'simulacao') {
    if (!$('simFreeze').checked) {
      lastPersons = simulatedPersons();
      handleSnap(ctl.observe(summarize(lastPersons), now));
      markFrame(now);
    }
  } else if (origem === 'foto_teste') {
    // Foto: a mesma imagem vira um "quadro contínuo" (~30 q/s), como uma câmera olhando uma cena parada.
    // Assim os tempos de confirmação (presença, gesto) funcionam normalmente.
    if (perception && photos.length && now - lastPhotoFrame >= 33) {
      lastPhotoFrame = now;
      processFrame($('photo'));
    }
  } else if (perception && video.readyState >= 2 && !video.paused) {
    // Só processa quadros novos: imagem congelada não alimenta o controle.
    // currentTime continua andando mesmo com a câmera parada; requestVideoFrameCallback não.
    const isNew = HAS_RVFC ? frameReady : video.currentTime !== lastVideoTime;
    if (isNew) {
      frameReady = false;
      lastVideoTime = video.currentTime;
      processFrame(video);
    }
  }
  draw();
  renderDemo();
  requestAnimationFrame(loop);
}

setInterval(() => {
  if (running) handleSnap(ctl.tick(performance.now()));
  renderDiag();
  if (!running) renderDemo();
}, 100);

document.addEventListener('visibilitychange', () => {
  if (running && document.hidden) record({ tipo: 'aviso', motivo: 'painel_oculto' });
});

// ---------- desenho ----------
function fitCanvas() {
  const r = canvas.getBoundingClientRect();
  const dpr = devicePixelRatio || 1;
  if (canvas.width !== Math.round(r.width * dpr) || canvas.height !== Math.round(r.height * dpr)) {
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
  }
  return [canvas.width, canvas.height, dpr];
}

function draw() {
  const [W, H, dpr] = fitCanvas();
  g.clearRect(0, 0, W, H);
  if (origem === 'simulacao' && running) {
    g.fillStyle = '#07080a';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#7d8694';
    g.font = `500 ${11 * dpr}px ${UI_FONT}`;
    g.fillText('SIMULAÇÃO · SEM CÂMERA', 40 * dpr, H - 36 * dpr);
  }
  const confirmed = snapshot ? snapshot.zones : {};
  for (const z of ['A', 'B', 'C']) {
    const poly = cfg.zonas[z];
    if (!poly || poly.length < 3) continue;
    g.beginPath();
    poly.forEach(([x, y], i) => (i ? g.lineTo(x * W, y * H) : g.moveTo(x * W, y * H)));
    g.closePath();
    g.fillStyle = ZONE_COLORS[z] + (confirmed[z] ? '38' : '12');
    g.fill();
    g.lineWidth = (confirmed[z] ? 2.5 : 1.25) * dpr;
    g.strokeStyle = ZONE_COLORS[z] + (confirmed[z] ? 'ff' : 'b0');
    g.stroke();
    const [lx, ly] = poly[0];
    const names = { A: 'A · aproximação', B: 'B · espera', C: 'C · faixa' };
    pill(names[z], lx * W + 10 * dpr, ly * H + 10 * dpr, dpr, confirmed[z] ? ZONE_COLORS[z] : 'rgba(5,6,7,0.7)',
      confirmed[z] ? '#050607' : ZONE_COLORS[z], 11, W);
  }
  for (const p of lastPersons) {
    const [x0, y0, x1, y1] = p.bbox;
    // caixa com cantos (estilo mira) — tracejada quando mantida por instantes sem detecção
    const bx0 = x0 * W, by0 = y0 * H, bw = (x1 - x0) * W, bh = (y1 - y0) * H;
    const col = p.gesture ? '#22c55e' : 'rgba(243,245,248,0.9)';
    g.strokeStyle = col;
    g.lineWidth = (p.gesture ? 3 : 1.5) * dpr;
    if (p.held) g.setLineDash([6 * dpr, 5 * dpr]);
    const k = Math.min(18 * dpr, bw / 3, bh / 3);
    g.beginPath();
    for (const [cx, cy, dx, dy] of [[bx0, by0, 1, 1], [bx0 + bw, by0, -1, 1], [bx0, by0 + bh, 1, -1], [bx0 + bw, by0 + bh, -1, -1]]) {
      g.moveTo(cx + dx * k, cy); g.lineTo(cx, cy); g.lineTo(cx, cy + dy * k);
    }
    g.stroke();
    g.lineWidth = 1 * dpr;
    g.strokeStyle = p.gesture ? 'rgba(34,197,94,0.5)' : 'rgba(243,245,248,0.18)';
    g.strokeRect(bx0, by0, bw, bh);
    g.setLineDash([]);
    if (p.gesture) {
      // destaque do braço levantado (percepção — ainda não é solicitação)
      const msg = p.zone === 'B' ? 'BRAÇO LEVANTADO · em B' : 'BRAÇO LEVANTADO · fora de B, ignorado';
      pill(msg, bx0, Math.min(H - 34 * dpr, by0 + bh + 8 * dpr), dpr, p.zone === 'B' ? '#22c55e' : '#4b5260',
        p.zone === 'B' ? '#04130a' : '#fff', 14, W);
    }
    if (p.ref) {
      g.beginPath();
      g.arc(p.ref[0] * W, p.ref[1] * H, 5 * dpr, 0, Math.PI * 2);
      g.fillStyle = p.zone ? ZONE_COLORS[p.zone] : '#7d8694';
      g.fill();
      g.lineWidth = 2 * dpr;
      g.strokeStyle = '#050607';
      g.stroke();
    }
    const label = `${p.zone ? 'zona ' + p.zone : 'fora das zonas'} · ref. ${p.refKind}`;
    pill(label, bx0, Math.max(4 * dpr, by0 - 28 * dpr), dpr, 'rgba(5,6,7,0.75)', '#f3f5f8', 11, W);
  }
  if (editingZone) {
    g.strokeStyle = ZONE_COLORS[editingZone];
    g.setLineDash([6 * dpr, 4 * dpr]);
    g.lineWidth = 2 * dpr;
    g.beginPath();
    draft.forEach(([x, y], i) => (i ? g.lineTo(x * W, y * H) : g.moveTo(x * W, y * H)));
    g.stroke();
    g.setLineDash([]);
    for (const [x, y] of draft) {
      g.beginPath();
      g.arc(x * W, y * H, 5 * dpr, 0, Math.PI * 2);
      g.fillStyle = ZONE_COLORS[editingZone];
      g.fill();
    }
  }
}

video.addEventListener('loadedmetadata', () => {
  if (video.videoWidth) setStageRatio(video.videoWidth, video.videoHeight);
});

// ---------- interface ----------
function renderState() {
  const st = snapshot ? snapshot.state : ctl.state;
  const chip = $('estadoChip');
  let txt = STATE_LABEL[st] || st;
  if (st === S.FALHA) txt += ': ' + (FAILURE_LABEL[ctl.failure] || ctl.failure);
  if (chip.textContent !== txt) chip.textContent = txt;
  chip.dataset.state = st;
  // título grande do cartão lateral + linha de apoio
  const title = $('stateTitle');
  const label = STATE_LABEL[st] || st;
  if (title.textContent !== label) title.textContent = label;
  title.dataset.state = st;
  const SUB = {
    [S.OBSERVANDO]: 'Ninguém nas zonas. Sinal apagado.',
    [S.APROXIMACAO]: 'Pessoa chegando pelo corredor.',
    [S.SOLICITACAO]: 'Pedido de travessia ativo. Motoristas sendo avisados.',
    [S.FAIXA_OCUPADA]: 'Pessoa na faixa. Alerta máximo ao motorista.',
    [S.VERIFICANDO]: 'Ninguém detectado. Confirmando liberação antes de apagar.',
  };
  const sub = st === S.FALHA ? (FAILURE_LABEL[ctl.failure] || ctl.failure) : (SUB[st] || '');
  const subEl = $('stateSub');
  if (subEl.textContent !== sub) subEl.textContent = sub;
}

// dv: resultado de driverView (aceita nível/booleano por compatibilidade)
function renderSignalPreview(dv) {
  if (typeof dv !== 'object') dv = driverView({ state: S.OBSERVANDO, signal: !!dv, zones: {} }, cfg, dv ? 'on' : 'off');
  for (const [box, text] of [['signalPreview', 'signalText'], ['demoSignal', 'demoSignalText']]) {
    const el = $(box);
    el.classList.toggle('on', dv.nivel > 0);
    el.classList.toggle('off', dv.nivel === 0);
    el.classList.toggle('n2', dv.nivel === NIVEL.FAIXA);
    const t = $(text);
    if (t.dataset.msg === dv.texto) continue;
    t.dataset.msg = dv.texto;
    const strong = document.createElement('b');
    strong.textContent = dv.titulo;
    t.replaceChildren(strong);
    if (dv.complemento) { const sm = document.createElement('small'); sm.textContent = dv.complemento; t.append(sm); }
  }
}

// ---------- modo apresentação: passos legíveis para a plateia ----------
const ORIGEM_PEDIDO = { gesto: 'braço levantado', presenca: 'presença na área de espera', botao: 'botão' };

function setStep(id, status, detail, progress) {
  const li = $(id);
  li.className = status; // '', 'now', 'done', 'skip'
  const small = li.querySelector('small');
  if (small.textContent !== detail) small.textContent = detail;
  const bar = li.querySelector('.bar i');
  if (bar) bar.style.width = `${Math.round((progress ?? 0) * 100)}%`;
}

function renderDemo() {
  if (!document.body.classList.contains('demo')) return;
  const s = snapshot;
  const zones = s ? s.zones : { A: false, B: false, C: false };
  const presMode = cfg.regras.solicitacaoPorPresencaEmB;
  const signalOn = desiredOutput();
  const failed = (s ? s.state : ctl.state) === S.FALHA;
  const people = running ? lastPersons.length : 0;
  const handOutside = lastPersons.some((p) => p.gesture && p.zone !== 'B');
  const gestureProg = s?.progress ? s.progress.gestureB : 0;
  const confirmS = (cfg.tempos.confirmacaoGestoMs / 1000).toFixed(1).replace('.', ',');

  // 1. pessoa
  setStep('st1', people ? 'done' : 'now', people ? `${people} pessoa(s) na imagem` : 'Entre na frente da câmera');

  // 2. zona
  const atWait = zones.B || zones.C;
  const zoneTxt = zones.C ? 'Na faixa (zona C): alerta mantido enquanto houver alguém'
    : zones.B ? 'Zona B confirmada'
    : zones.A ? 'Chegando pelo corredor (zona A): vá para a área de espera'
    : 'Vá para a área de espera (zona B)';
  setStep('st2', atWait ? 'done' : people ? 'now' : '', zoneTxt);

  // 3. gesto
  if (presMode) {
    setStep('st3', 'skip', 'Opcional neste modo: só estar na área de espera já pede a passagem', 0);
  } else if (s?.gestureB || s?.requestOrigin === 'gesto') {
    setStep('st3', 'done', `Segurou por ${confirmS} s: gesto confirmado`, 1);
  } else if (gestureProg > 0) {
    // progresso real do controle (tolera quadros perdidos), não o dado bruto de cada quadro
    setStep('st3', 'now', `Segure… ${(gestureProg * cfg.tempos.confirmacaoGestoMs / 1000).toFixed(1).replace('.', ',')} de ${confirmS} s`, gestureProg);
  } else if (handOutside) {
    setStep('st3', 'now', 'Mão levantada FORA da área de espera: não vale', 0);
  } else {
    setStep('st3', zones.B ? 'now' : '', `Levante a mão e segure por ${confirmS} s (ou use o botão)`, 0);
  }

  // 4. pedido
  const reqOrigin = s?.requestOrigin;
  const reqTxt = reqOrigin ? `Por ${ORIGEM_PEDIDO[reqOrigin] || reqOrigin}`
    : zones.C ? 'Pessoa na faixa'
    : signalOn ? 'Sinal acionado' : 'Aguardando pedido';
  setStep('st4', signalOn && !failed ? 'done' : '', reqTxt);

  // 5. motorista
  const kind = output ? (output.kind === 'serial' ? 'sinal físico' : 'sinal em tela') : 'sem saída';
  const drvTxt = signalOn
    ? (outputConfirmed === desiredLevel()
      ? (outputConfirmed === NIVEL.FAIXA ? `ALERTA MÁXIMO: pedestre na faixa (confirmado, ${kind})` : `Sinal aceso, confirmado (${kind})`)
      : 'Enviando aviso…')
    : 'Sinal apagado';
  setStep('st5', signalOn && outputConfirmed === desiredLevel() ? 'done' : signalOn ? 'now' : '', drvTxt);

  // linha de status
  const st = $('demoStatus');
  let msg = '';
  if (failed) msg = 'Falha: ' + (FAILURE_LABEL[ctl.failure] || ctl.failure);
  else if (s?.state === S.VERIFICANDO) msg = `Ninguém detectado: verificando liberação (${(s.clearingRemainingMs / 1000).toFixed(1).replace('.', ',')} s)`;
  else if (signalOn && s?.requestRemainingMs) msg = `Aviso mantido por pelo menos mais ${Math.ceil(s.requestRemainingMs / 1000)} s`;
  else if (!running) msg = 'Clique em Iniciar (fora do modo apresentação) para começar.';
  st.textContent = msg;
  st.classList.toggle('bad', failed);

  // prévia da tela do pedestre
  const pv = pedestrianView(pedInput(), cfg);
  $('demoPed').className = `ped-preview ${pv.modo}`;
  $('demoPedTitulo').textContent = pv.titulo;
  $('demoPedOrient').textContent = pv.passos
    ? pv.passos.map((p) => p.texto).join(' · ')
    : pv.progresso ? `${pv.orientacao} ${Math.round(pv.progresso * 100)}%` : pv.orientacao;
  $('demoPedFig').hidden = !cfg.retornoPedestre.habilitado;

  $('demoModeGesto').classList.toggle('active', !presMode);
  $('demoModePres').classList.toggle('active', presMode);
  const ob = $('demoOrigem');
  ob.textContent = { webcam_bancada: 'AO VIVO · webcam', video_teste: 'GRAVAÇÃO · vídeo de teste', foto_teste: 'FOTO · imagem estática', simulacao: 'SIMULAÇÃO' }[origem] || origem;
  ob.dataset.origem = origem;
}

function setDemo(on) {
  document.body.classList.toggle('demo', on);
  if (on) document.documentElement.requestFullscreen?.().catch(() => {});
  else if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  record({ tipo: 'modo_apresentacao', motivo: on ? 'ligado' : 'desligado' });
  renderDemo();
}

// Troca rápida do modo de pedido durante a apresentação (fica registrada como configuração).
function setRequestMode(presenca) {
  if (cfg.regras.solicitacaoPorPresencaEmB === presenca) return;
  cfg.regras.solicitacaoPorPresencaEmB = presenca;
  fillCfgForm();
  saveCfg();
}

function renderOrigem() {
  const b = $('origemBadge');
  b.textContent = { webcam_bancada: 'Ao vivo · webcam', video_teste: 'Gravação · vídeo', foto_teste: 'Foto · imagem estática', simulacao: 'Simulação' }[origem] || origem;
  b.title = `Origem registrada em cada evento: ${origem} (${ORIGEM_LABEL[origem]})`;
  b.dataset.origem = origem;
}

function pct(arr, q) {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1) + 0.5))];
}

function renderMetrics() {
  $('mAct').textContent = stats.activations;
  $('mWhy').textContent = Object.entries(stats.byWhy).map(([k, v]) => `${k}: ${v}`).join(' · ') || '—';
  const L = stats.latencies;
  $('mLat').textContent = L.length
    ? `mediana ${pct(L, 0.5)} ms · p90 ${pct(L, 0.9)} ms · mín ${Math.min(...L)} · máx ${Math.max(...L)} · n=${L.length}`
    : '—';
  $('mAnn').textContent = `${stats.valid} / ${stats.falsePos}`;
  $('mOut').textContent = stats.outside;
  $('mFail').textContent = stats.fails;
}

function renderDiag() {
  const now = performance.now();
  const fps = frameTimes.length;
  const age = ctl.lastFrameTs === null ? null : Math.round(now - ctl.lastFrameTs);
  setDiag('dCam', !running ? 'parado' : age === null ? 'aguardando imagem' : `${fps} q/s · último quadro há ${age} ms`,
    running && (age === null || age > cfg.tempos.quadroAntigoMs));
  setDiag('dModel', origem === 'simulacao' ? 'não usado (simulação)'
    : perception ? `pose ${perception.variant} · ${perception.delegate}${lastInferenceMs !== null ? ` · ${lastInferenceMs.toFixed(0)} ms/quadro` : ''}` : 'não carregado');
  setDiag('dPeople', running ? `${lastPersons.length}` + (lastPersons.length ? ' — ' + lastPersons.map((p) => `${p.zone || 'fora'}${p.gesture ? ' (mão levantada)' : ''}`).join(', ') : '') : '—');
  const z = snapshot ? snapshot.zones : { A: false, B: false, C: false };
  setDiag('dZones', ['A', 'B', 'C'].map((k) => `${k} ${z[k] ? '●' : '○'}`).join('  ') +
    (snapshot && snapshot.gestureB ? ' · gesto em B confirmado' : '') +
    (snapshot && snapshot.requestRemainingMs ? ` · solicitação por mais ${(snapshot.requestRemainingMs / 1000).toFixed(1)} s` : ''));
  if (!output) {
    setDiag('dSignal', $('saida').value === 'serial' ? 'controlador não conectado' : '—', $('saida').value === 'serial');
  } else {
    const s = output.status();
    const conf = outputConfirmed === null ? (outputSent === null ? 'sem comando' : 'aguardando confirmação') : outputConfirmed === NIVEL.FAIXA ? 'ALERTA MÁXIMO (confirmado)' : outputConfirmed ? 'LIGADO (confirmado)' : 'desligado (confirmado)';
    const extra = s.tipo === 'tela' ? `${s.janelas} janela(s) de sinal` : s.conectado ? (s.firmware || 'conectado') : 'DESCONECTADO';
    setDiag('dSignal', `${s.tipo} · ${extra} · ${conf}${s.ultimaLatenciaMs != null ? ` · ${s.ultimaLatenciaMs.toFixed(0)} ms` : ''}`,
      (s.tipo === 'serial' && !s.conectado) || outputConfirmed === null && outputSent !== null);
  }
  const fmtT = (d) => d.toLocaleTimeString('pt-BR', { hour12: false });
  setDiag('dAuto', !cfg.autonomia.recuperacaoAutomatica ? 'desligada (falhas aguardam o operador)'
    : `${AUTO_MODE ? 'modo autônomo · ' : ''}${recoveries} recuperação(ões)` +
      (lastRecovery ? ` · última ${fmtT(lastRecovery.quando)} (${FAILURE_LABEL[lastRecovery.motivo] || lastRecovery.motivo})` : '') +
      (ctl.failure === 'zonas_precisam_revisao' ? ' · AGUARDANDO PESSOA (zonas)' : ''),
    ctl.failure === 'zonas_precisam_revisao');
  setDiag('dPed', cfg.retornoPedestre.habilitado
    ? `${pedestrianDisplays()} janela(s) · mostrando: ${pedModo || '—'}`
    : 'desativada na configuração');
  const ls = log.status();
  setDiag('dLog', ls.texto, !ls.ok);
  setDiag('dNet', navigator.onLine ? 'online (não é necessária)' : 'offline — núcleo local funcionando');
  setDiag('dCfg', `v${cfgVer}${cfgDirty ? ' · alterações NÃO salvas' : ''}${zonesNeedReview ? ' · ZONAS PRECISAM DE REVISÃO' : ''}`, cfgDirty || zonesNeedReview);
  renderState();
}

function setDiag(id, text, bad = false) {
  const el = $(id);
  if (el.textContent !== text) el.textContent = text;
  el.classList.toggle('bad', !!bad);
}

const TIPO_LABEL = {
  sinal: 'Sinal (decisão)', sinal_confirmado: 'Sinal confirmado', sinal_sem_confirmacao: 'Sinal SEM confirmação',
  solicitacao: 'Solicitação', presenca: 'Presença', gesto: 'Gesto', gesto_fora_da_zona: 'Gesto fora da zona',
  botao: 'Botão', aproximacao: 'Aproximação', ocupacao: 'Ocupação da faixa', liberacao: 'Liberação',
  saida_zona: 'Saída de zona', falha: 'FALHA', estado: 'Estado', reinicio: 'Reinício', anotacao: 'Anotação',
  retorno_pedestre: 'Tela do pedestre',
};

function detail(e) {
  const parts = [];
  if (e.zona) parts.push(`zona ${e.zona}`);
  if (e.via && e.tipo === 'solicitacao') parts.push(`por ${e.via}`);
  if (e.fonte) parts.push(`botão ${e.fonte}`);
  if (e.de) parts.push(`${STATE_LABEL[e.de] || e.de} → ${STATE_LABEL[e.para] || e.para}`);
  if (e.valor !== undefined) parts.push(e.valor ? 'LIGAR' : 'DESLIGAR');
  if (e.motivo) parts.push(FAILURE_LABEL[e.motivo] || e.motivo);
  if (e.latenciaMs !== undefined) parts.push(`latência ${e.latenciaMs} ms`);
  if (e.latenciaComandoMs !== undefined) parts.push(`comando ${e.latenciaComandoMs} ms`);
  if (e.confirmado) parts.push(`confirmado por ${e.confirmado}`);
  if (e.anotacao) parts.push(e.anotacao);
  return parts.join(' · ');
}

function addRow(e) {
  const tb = $('events').tBodies[0];
  const tr = document.createElement('tr');
  tr.className = `ev-${e.tipo}`;
  const time = new Date(e.horario).toLocaleTimeString('pt-BR', { hour12: false }) + '.' + e.horario.slice(20, 23);
  tr.innerHTML = `<td>${time}</td><td>${e.origem}</td><td>${TIPO_LABEL[e.tipo] || e.tipo}</td><td></td><td></td>`;
  tr.cells[3].textContent = detail(e);
  if (e.tipo === 'sinal' && e.valor) {
    const ok = Object.assign(document.createElement('button'), { textContent: 'Válida', className: 'tiny' });
    const bad = Object.assign(document.createElement('button'), { textContent: 'Falso acionamento', className: 'tiny' });
    const annotate = (kind) => {
      record({ tipo: 'anotacao', ref: e.id, anotacao: kind });
      if (kind === 'valida') stats.valid++; else stats.falsePos++;
      tr.cells[4].textContent = kind === 'valida' ? 'Válida' : 'Falso acionamento';
      renderMetrics();
    };
    ok.onclick = () => annotate('valida');
    bad.onclick = () => annotate('falso_acionamento');
    tr.cells[4].append(ok, bad);
  }
  tb.prepend(tr);
  while (tb.rows.length > 300) tb.deleteRow(-1);
  if (e.tipo !== 'estado') renderMetrics();
}

// ---------- configuração ----------
function fillCfgForm() {
  $('cfgPresenca').checked = cfg.regras.solicitacaoPorPresencaEmB;
  $('cfgGesto').checked = cfg.gesto.habilitado;
  $('cfgPre').checked = cfg.regras.preAlertaNaAproximacao;
  $('cfgRef').value = cfg.percepcao.pontoReferencia;
  $('cfgConfPres').value = cfg.tempos.confirmacaoPresencaMs;
  $('cfgConfGesto').value = cfg.tempos.confirmacaoGestoMs;
  $('cfgTol').value = cfg.tempos.toleranciaPerdaMs;
  $('cfgMin').value = cfg.tempos.advertenciaMinimaMs;
  $('cfgVerif').value = cfg.tempos.verificacaoLiberacaoMs;
  $('cfgMax').value = cfg.tempos.advertenciaMaximaMs;
  $('cfgTexto').value = cfg.sinal.texto;
  $('cfgTextoFaixa').value = cfg.sinal.textoFaixa;
  $('cfgPed').checked = cfg.retornoPedestre.habilitado;
  $('cfgAuto').checked = cfg.autonomia.recuperacaoAutomatica;
  $('cfgModelo').value = cfg.percepcao.modelo;
  $('cfgConf').value = cfg.percepcao.confiancaDeteccao;
  $('cfgMaxP').value = cfg.percepcao.maxPessoas;
  $('cfgSuav').value = cfg.percepcao.suavizacao;
  $('cfgRet').value = cfg.percepcao.retencaoMs;
  $('cfgPedTexto').value = cfg.retornoPedestre.texto;
}

function readCfgForm() {
  const num = (id, min) => Math.max(min, Number($(id).value) || 0);
  cfg.regras.solicitacaoPorPresencaEmB = $('cfgPresenca').checked;
  cfg.gesto.habilitado = $('cfgGesto').checked;
  cfg.regras.preAlertaNaAproximacao = $('cfgPre').checked;
  cfg.percepcao.pontoReferencia = $('cfgRef').value;
  cfg.tempos.confirmacaoPresencaMs = num('cfgConfPres', 0);
  cfg.tempos.confirmacaoGestoMs = num('cfgConfGesto', 0);
  cfg.tempos.toleranciaPerdaMs = num('cfgTol', 0);
  cfg.tempos.advertenciaMinimaMs = num('cfgMin', 0);
  cfg.tempos.verificacaoLiberacaoMs = num('cfgVerif', 0);
  cfg.tempos.advertenciaMaximaMs = num('cfgMax', 1000);
  cfg.sinal.texto = $('cfgTexto').value.trim() || DEFAULT_CONFIG.sinal.texto;
  cfg.sinal.textoFaixa = $('cfgTextoFaixa').value.trim() || DEFAULT_CONFIG.sinal.textoFaixa;
  cfg.retornoPedestre.habilitado = $('cfgPed').checked;
  cfg.autonomia.recuperacaoAutomatica = $('cfgAuto').checked;
  const clamp = (v, lo, hi, d) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  const P = DEFAULT_CONFIG.percepcao;
  cfg.percepcao.modelo = $('cfgModelo').value;
  cfg.percepcao.confiancaDeteccao = clamp(parseFloat($('cfgConf').value), 0.1, 0.9, P.confiancaDeteccao);
  cfg.percepcao.maxPessoas = Math.round(clamp(parseFloat($('cfgMaxP').value), 1, 6, P.maxPessoas));
  cfg.percepcao.suavizacao = clamp(parseFloat($('cfgSuav').value), 0, 0.9, P.suavizacao);
  cfg.percepcao.retencaoMs = clamp(parseFloat($('cfgRet').value), 0, 3000, P.retencaoMs);
  cfg.retornoPedestre.texto = $('cfgPedTexto').value.trim() || DEFAULT_CONFIG.retornoPedestre.texto;
}

async function saveCfg() {
  readCfgForm();
  cfgVer = configHash(cfg);
  try {
    const res = await fetch('/api/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    $('cfgMsg').textContent = `Salvo · v${cfgVer}`;
  } catch (err) {
    $('cfgMsg').textContent = 'Aplicado, mas NÃO salvo em disco: ' + err.message;
  }
  cfgDirty = false;
  zonesNeedReview = false;
  if (!isSafeText(cfg.retornoPedestre.texto)) {
    $('cfgMsg').textContent += ' · Texto do pedestre recusado (não pode sugerir "atravesse"/"livre"/"seguro"); usando o padrão.';
  }
  record({ tipo: 'config_aplicada', motivo: `v${cfgVer}` });
  newController('config_aplicada');
  publishPedestrian(true);
  await reloadPerceptionIfNeeded();
}

function markDirty() {
  cfgDirty = true;
  cfgVer = configHash(cfg);
}

async function loadCfg() {
  try {
    const saved = await (await fetch('/api/config')).json();
    if (saved) cfg = mergeConfig(DEFAULT_CONFIG, saved);
    // migra textos padrão antigos (não mexe em textos personalizados)
    if (cfg.sinal.texto === 'ATENÇÃO — PEDESTRE') cfg.sinal.texto = DEFAULT_CONFIG.sinal.texto;
    if (cfg.sinal.textoFaixa === 'PARE — PEDESTRE NA FAIXA') cfg.sinal.textoFaixa = DEFAULT_CONFIG.sinal.textoFaixa;
    const rp = cfg.retornoPedestre;
    if (rp.texto === 'Pedido recebido — motoristas avisados') rp.texto = DEFAULT_CONFIG.retornoPedestre.texto;
    if (rp.orientacao === 'Olhe para os dois lados e só atravesse com os veículos parados.') rp.orientacao = DEFAULT_CONFIG.retornoPedestre.orientacao;
  } catch { /* servidor indisponível: usa padrão */ }
  cfgVer = configHash(cfg);
  ctl = new Controller(cfg, performance.now());
  fillCfgForm();
}

// ---------- eventos da interface ----------
$('origem').addEventListener('change', () => {
  const v = $('origem').value;
  $('camWrap').hidden = v !== 'webcam_bancada';
  $('fileWrap').hidden = v !== 'video_teste';
  $('photoWrap').hidden = v !== 'foto_teste';
  renderPhotoBar();
  $('simPanel').hidden = v !== 'simulacao';
});
$('btnStart').onclick = start;
$('photoFiles').addEventListener('change', (e) => loadPhotos(e.target.files));
$('photoPrev').onclick = () => showPhoto(photoIndex - 1);
$('photoNext').onclick = () => showPhoto(photoIndex + 1);
document.addEventListener('keydown', (e) => {
  if ($('origem').value !== 'foto_teste' || !photos.length) return;
  if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) && document.activeElement.type !== 'checkbox') return;
  if (e.key === 'ArrowRight') { e.preventDefault(); showPhoto(photoIndex + 1); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); showPhoto(photoIndex - 1); }
});
$('btnStop').onclick = () => { manualStop = true; stop(false); };
$('btnButton').onclick = () => pressButton('painel');
document.addEventListener('keydown', (e) => {
  const el = document.activeElement;
  const typing = el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['checkbox', 'radio', 'button'].includes(el.type));
  if (e.key.toLowerCase() === 'b' && !typing && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
    pressButton('teclado');
  }
});

document.querySelectorAll('[data-override]').forEach((b) => {
  b.onclick = () => {
    override = b.dataset.override;
    document.querySelectorAll('[data-override]').forEach((x) => x.classList.toggle('active', x === b));
    record({ tipo: 'controle_manual', motivo: override });
    applyOutput();
    publishPedestrian();
  };
});

$('btnReset').onclick = () => {
  if (zonesNeedReview) {
    alert('A câmera foi movida: revise as zonas e clique em "Salvar e aplicar configuração" antes de reiniciar.');
    $('zonesPanel').open = true;
    return;
  }
  handleSnap(ctl.reset(performance.now()));
};

$('btnMoved').onclick = () => {
  zonesNeedReview = true;
  $('zonesPanel').open = true;
  handleSnap(ctl.fail('zonas_precisam_revisao', performance.now()));
};

document.querySelectorAll('[data-zone]').forEach((b) => {
  b.onclick = () => {
    editingZone = b.dataset.zone;
    draft = [];
    document.querySelectorAll('[data-zone]').forEach((x) => x.classList.toggle('active', x === b));
    $('cfgMsg').textContent = `Clique na imagem para marcar os vértices da zona ${editingZone}.`;
  };
});
canvas.addEventListener('click', (e) => {
  if (!editingZone) return;
  const r = canvas.getBoundingClientRect();
  draft.push([+((e.clientX - r.left) / r.width).toFixed(4), +((e.clientY - r.top) / r.height).toFixed(4)]);
  if (!running) draw();
});
$('btnZoneUndo').onclick = () => { draft.pop(); if (!running) draw(); };
$('btnZoneDone').onclick = () => {
  if (!editingZone) return;
  if (draft.length < 3) { $('cfgMsg').textContent = 'Uma zona precisa de pelo menos 3 pontos.'; return; }
  cfg.zonas[editingZone] = draft;
  $('cfgMsg').textContent = `Zona ${editingZone} atualizada — clique em Salvar para registrar.`;
  editingZone = null;
  draft = [];
  document.querySelectorAll('[data-zone]').forEach((x) => x.classList.remove('active'));
  markDirty();
  if (!running) draw();
};
$('btnZoneDefault').onclick = () => {
  cfg.zonas = cloneConfig(DEFAULT_CONFIG).zonas;
  markDirty();
  if (!running) draw();
};
$('btnSaveCfg').onclick = saveCfg;
$('btnDemo').onclick = () => setDemo(true);
$('btnDemoExit').onclick = () => setDemo(false);
$('demoModeGesto').onclick = () => setRequestMode(false);
$('demoModePres').onclick = () => setRequestMode(true);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.body.classList.contains('demo')) setDemo(false);
});
document.addEventListener('fullscreenchange', () => {
  // saiu da tela cheia pelo navegador (Esc) → sai do modo apresentação também
  if (!document.fullscreenElement && document.body.classList.contains('demo')) setDemo(false);
});
$('zonesPanel').querySelectorAll('input, select').forEach((el) => el.addEventListener('change', () => { readCfgForm(); markDirty(); }));

$('saida').addEventListener('change', () => {
  setupOutput($('saida').value);
  try { localStorage.setItem('pitstop.saida', $('saida').value); } catch { /* armazenamento indisponível */ }
});
$('btnSerial').onclick = connectSerial;

// Abre o sinal em JANELA própria (aba oculta faria o navegador pausar o painel).
document.querySelector('a[href="sinal.html"]').addEventListener('click', (e) => {
  e.preventDefault();
  window.open('sinal.html', 'pitstop-sinal', 'popup,width=900,height=600');
});
document.querySelector('a[href="pedestre.html"]').addEventListener('click', (e) => {
  e.preventDefault();
  window.open('pedestre.html', 'pitstop-pedestre', 'popup,width=900,height=600');
});

// ---------- início ----------
$('sessId').textContent = sessao;
await loadCfg();
setupOutput('tela');
renderOrigem();
renderMetrics();
renderState();
draw();
listCameras();

// Modo autônomo: retoma a última saída usada (reconecta o controlador já autorizado) e mantém a tela ligada.
if (AUTO_MODE) {
  record({ tipo: 'modo_autonomo', motivo: 'iniciado por ?auto=1' });
  keepAwake();
  let saved = null;
  try { saved = localStorage.getItem('pitstop.saida'); } catch { /* armazenamento indisponível */ }
  if (saved === 'serial') {
    $('saida').value = 'serial';
    setupOutput('serial');
    const port = await SerialSignal.grantedPort();
    if (port) await connectSerial(port, true);
  }
}
