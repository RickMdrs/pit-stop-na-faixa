// Servidor local mínimo (sem dependências): arquivos estáticos + persistência em arquivos.
// Escuta apenas em 127.0.0.1 — nada sai da máquina.
import { createServer } from 'node:http';
import { appendFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(root, 'public');
// PITSTOP_DATA_DIR permite separar os dados de ensaios/testes automáticos dos dados reais.
const DATA = process.env.PITSTOP_DATA_DIR ? resolve(process.env.PITSTOP_DATA_DIR) : join(root, 'data');
const EVENTS = join(DATA, 'eventos.jsonl');
const EDU = join(DATA, 'educacao.jsonl');
const CONFIG = join(DATA, 'config.json');
const PORT = Number(process.env.PORT) || 8080;
const HOST = '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
  '.task': 'application/octet-stream',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

const CSV_COLS = [
  'recebidoEm', 'sessao', 'origem', 'versaoConfig', 'horario', 'tipo', 'zona', 'motivo',
  'de', 'para', 'valor', 'latenciaMs', 'confirmado', 'anotacao',
];

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

async function readBody(req, limit = 1_000_000) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new Error('corpo muito grande');
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null');
}

async function readJsonl(file) {
  try {
    const txt = await readFile(file, 'utf8');
    return txt.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch {
    return [];
  }
}

function csvCell(v) {
  if (v === undefined || v === null) return '';
  const s = String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function api(req, res, url) {
  const p = url.pathname;

  if (p === '/api/health') return send(res, 200, { ok: true, horario: new Date().toISOString() });

  // Qual arquivo de logo oficial existe em public/assets/brand (evita tentativas 404 no navegador).
  if (p === '/api/brand') {
    for (const [nome, placa] of [
      ['equatorial-logo-branco.svg', false], ['equatorial-logo-branco.png', false],
      ['equatorial-logo.svg', true], ['equatorial-logo.png', true],
    ]) {
      try { await stat(join(PUBLIC, 'assets', 'brand', nome)); return send(res, 200, { arquivo: `assets/brand/${nome}`, placa }); } catch { /* próximo */ }
    }
    return send(res, 200, { arquivo: null });
  }

  if (p === '/api/config' && req.method === 'GET') {
    try { return send(res, 200, await readFile(CONFIG, 'utf8')); } catch { return send(res, 200, 'null'); }
  }
  if (p === '/api/config' && req.method === 'PUT') {
    const cfg = await readBody(req);
    await mkdir(DATA, { recursive: true });
    await writeFile(CONFIG, JSON.stringify(cfg, null, 2));
    return send(res, 200, { ok: true });
  }

  if (p === '/api/events' && req.method === 'POST') {
    const body = await readBody(req);
    const list = Array.isArray(body) ? body : [body];
    const recebidoEm = new Date().toISOString();
    await mkdir(DATA, { recursive: true });
    await appendFile(EVENTS, list.map((e) => JSON.stringify({ recebidoEm, ...e })).join('\n') + '\n');
    return send(res, 200, { ok: true, gravados: list.length });
  }
  if (p === '/api/events' && req.method === 'GET') {
    const limit = Math.min(Number(url.searchParams.get('limit')) || 200, 5000);
    const all = await readJsonl(EVENTS);
    return send(res, 200, all.slice(-limit));
  }
  if (p === '/api/events.csv') {
    const all = await readJsonl(EVENTS);
    const lines = [CSV_COLS.join(';'), ...all.map((e) => CSV_COLS.map((c) => csvCell(e[c])).join(';'))];
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="eventos-pitstop-${new Date().toISOString().slice(0, 10)}.csv"`,
    });
    return res.end('﻿' + lines.join('\n'));
  }

  if (p === '/api/educacao' && req.method === 'POST') {
    const body = await readBody(req);
    await mkdir(DATA, { recursive: true });
    await appendFile(EDU, JSON.stringify({ recebidoEm: new Date().toISOString(), ...body }) + '\n');
    return send(res, 200, { ok: true });
  }
  if (p === '/api/educacao' && req.method === 'GET') {
    return send(res, 200, await readJsonl(EDU));
  }

  return send(res, 404, { erro: 'rota não encontrada' });
}

async function serveStatic(res, pathname) {
  const rel = normalize(decodeURIComponent(pathname === '/' ? '/index.html' : pathname)).replace(/^([/\\])+/, '');
  const file = join(PUBLIC, rel);
  if (!file.startsWith(PUBLIC + sep)) return send(res, 403, 'proibido', 'text/plain');
  try {
    const s = await stat(file);
    if (!s.isFile()) throw new Error('não é arquivo');
    res.writeHead(200, { 'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch {
    send(res, 404, 'não encontrado', 'text/plain; charset=utf-8');
  }
}

await mkdir(DATA, { recursive: true });

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}`);
  try {
    if (url.pathname.startsWith('/api/')) await api(req, res, url);
    else await serveStatic(res, url.pathname);
  } catch (err) {
    console.error(err);
    send(res, 500, { erro: String(err.message || err) });
  }
}).listen(PORT, HOST, () => {
  console.log(`Pit Stop na Faixa rodando em http://localhost:${PORT}`);
  console.log(`  Painel do operador:   http://localhost:${PORT}/`);
  console.log(`  Sinal em tela:        http://localhost:${PORT}/sinal.html`);
  console.log(`  Atividade educativa:  http://localhost:${PORT}/educacao.html`);
});
