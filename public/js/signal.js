// Adaptadores de saída do sinal. Mesmo protocolo de texto para tela e hardware:
//   host → dispositivo:  L1 (atenção)  L2 (alerta máximo: pessoa na faixa)  L0 (apagar)  P (ping)
//   dispositivo → host:  OK L1 | OK L2 | OK L0 | OK P | BTN (botão físico) | HELLO ...
// set(nivel): 0 apagado · 1 atenção · 2 alerta máximo
// Comando enviado ≠ sinal aceso: só a confirmação "OK" conta (§10.5).

export const CHANNEL = 'pitstop-sinal';

class Base {
  constructor() {
    this.handlers = { button: [], fault: [], status: [] };
    this.lastAck = null;
    this.lastLatencyMs = null;
  }
  on(evt, fn) { this.handlers[evt].push(fn); }
  _fire(evt, ...args) { for (const fn of this.handlers[evt]) fn(...args); }
}

// Sinal em tela: janelas sinal.html respondem pelo BroadcastChannel.
// Contingência de desenvolvimento — NÃO apresentar como hardware.
export class ScreenSignal extends Base {
  constructor(ackTimeoutMs, mensagem = 'INATIVO') {
    super();
    this.kind = 'tela';
    this.ackTimeoutMs = ackTimeoutMs;
    this.mensagem = mensagem; // "TÍTULO — COMPLEMENTO" da situação atual (sinal-view.js)
    this.bc = new BroadcastChannel(CHANNEL);
    this.pending = new Map();
    this.displays = new Map(); // id da janela → último contato
    this.seq = 0;
    this.state = 0;
    this.bc.onmessage = (ev) => this._onMessage(ev.data);
    this.heartbeat = setInterval(() => this._post(this._msg('estado')), 500);
  }

  _msg(tipo, extra = {}) {
    return { tipo, valor: this.state > 0, nivel: this.state, texto: this.mensagem, ...extra };
  }

  // Troca só o texto (mesmo nível): não exige confirmação nem gera comando novo.
  setMessage(mensagem) {
    if (mensagem === this.mensagem) return;
    this.mensagem = mensagem;
    this._post(this._msg('estado'));
  }

  _post(msg) { this.bc.postMessage(msg); }

  _onMessage(m) {
    if (!m || typeof m !== 'object') return;
    if (m.tipo === 'ack') {
      this.displays.set(m.janela, performance.now());
      const p = this.pending.get(m.id);
      if (p) { this.pending.delete(m.id); p.resolve(performance.now()); }
    } else if (m.tipo === 'ola') {
      this.displays.set(m.janela, performance.now());
      this._post(this._msg('estado'));
    }
    this._fire('status', this.status());
  }

  activeDisplays() {
    const now = performance.now();
    for (const [id, t] of this.displays) if (now - t > 3000) this.displays.delete(id);
    return this.displays.size;
  }

  // Sem janela de sinal aberta, o próprio painel mostra a prévia — não é falha.
  async set(nivel) {
    this.state = nivel;
    const id = ++this.seq;
    const sentAt = performance.now();
    if (this.activeDisplays() === 0) {
      return { ok: true, confirmedBy: 'painel', sentAt, ackAt: sentAt };
    }
    const ackAt = await new Promise((resolve) => {
      const timer = setTimeout(() => { this.pending.delete(id); resolve(null); }, this.ackTimeoutMs);
      this.pending.set(id, { resolve: (t) => { clearTimeout(timer); resolve(t); } });
      this._post(this._msg('cmd', { id }));
    });
    if (ackAt === null) {
      this._fire('fault', 'sinal_tela_sem_confirmacao');
      return { ok: false, sentAt };
    }
    this.lastAck = ackAt;
    this.lastLatencyMs = ackAt - sentAt;
    return { ok: true, confirmedBy: 'janela_sinal', sentAt, ackAt };
  }

  status() {
    return { tipo: 'tela', conectado: true, janelas: this.activeDisplays(), ultimaLatenciaMs: this.lastLatencyMs };
  }

  close() { clearInterval(this.heartbeat); this.bc.close(); }
}

// Sinal físico via USB serial (Web Serial API — Chrome/Edge).
export class SerialSignal extends Base {
  constructor(ackTimeoutMs) {
    super();
    this.kind = 'serial';
    this.ackTimeoutMs = ackTimeoutMs;
    this.port = null;
    this.writer = null;
    this.waiters = []; // { expect, resolve }
    this.connected = false;
    this.hello = null;
    this.state = 0;
  }

  static supported() { return 'serial' in navigator; }

  // Porta já autorizada antes (reconexão automática, sem clique do usuário).
  static async grantedPort() {
    if (!SerialSignal.supported()) return null;
    const ports = await navigator.serial.getPorts();
    return ports[0] || null;
  }

  // port: opcional; sem ela, pede ao usuário (exige clique).
  async connect(port) {
    this.port = port || await navigator.serial.requestPort();
    await this.port.open({ baudRate: 115200 });
    this.writer = this.port.writable.getWriter();
    this.connected = true;
    navigator.serial.addEventListener('disconnect', (e) => {
      if (e.target === this.port) this._lost('controlador_desconectado');
    });
    this._readLoop();
    // Arduino Uno reinicia ao abrir a porta: dar tempo antes do primeiro ping.
    await new Promise((r) => setTimeout(r, 1800));
    const ok = await this._command('P', 'OK P', 2500);
    if (!ok) throw new Error('Controlador não respondeu ao ping. Confira firmware e velocidade (115200).');
    this.ping = setInterval(async () => {
      if (!this.connected) return;
      const pong = await this._command('P', 'OK P', this.ackTimeoutMs);
      if (!pong) this._fire('fault', 'sinal_sem_resposta_ao_ping');
    }, 2000);
    this._fire('status', this.status());
  }

  async _readLoop() {
    const decoder = new TextDecoderStream();
    this.port.readable.pipeTo(decoder.writable).catch(() => {});
    const reader = decoder.readable.getReader();
    let buf = '';
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (line) this._onLine(line);
        }
      }
    } catch {
      this._lost('controlador_erro_leitura');
    }
  }

  _onLine(line) {
    if (line === 'BTN') return this._fire('button');
    if (line.startsWith('HELLO')) { this.hello = line; return this._fire('status', this.status()); }
    const idx = this.waiters.findIndex((w) => w.expect === line);
    if (idx >= 0) {
      const [w] = this.waiters.splice(idx, 1);
      w.resolve(performance.now());
    }
  }

  async _command(cmd, expect, timeoutMs) {
    if (!this.connected) return null;
    const sentAt = performance.now();
    const p = new Promise((resolve) => {
      const w = { expect, resolve: (t) => { clearTimeout(timer); resolve(t); } };
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((x) => x !== w);
        resolve(null);
      }, timeoutMs);
      this.waiters.push(w);
    });
    try {
      await this.writer.write(new TextEncoder().encode(cmd + '\n'));
    } catch {
      this._lost('controlador_erro_escrita');
      return null;
    }
    const ackAt = await p;
    if (ackAt !== null) { this.lastAck = ackAt; this.lastLatencyMs = ackAt - sentAt; }
    return ackAt;
  }

  async set(nivel) {
    this.state = nivel;
    const cmd = 'L' + nivel;
    const sentAt = performance.now();
    const ackAt = await this._command(cmd, 'OK ' + cmd, this.ackTimeoutMs);
    if (ackAt === null) {
      this._fire('fault', this.connected ? 'sinal_sem_confirmacao' : 'controlador_desconectado');
      return { ok: false, sentAt };
    }
    return { ok: true, confirmedBy: 'controlador', sentAt, ackAt };
  }

  _lost(reason) {
    if (!this.connected) return;
    this.connected = false;
    clearInterval(this.ping);
    this._fire('fault', reason);
    this._fire('status', this.status());
  }

  status() {
    return { tipo: 'serial', conectado: this.connected, firmware: this.hello, ultimaLatenciaMs: this.lastLatencyMs };
  }

  async close() {
    this.connected = false;
    clearInterval(this.ping);
    try { this.writer?.releaseLock(); await this.port?.close(); } catch { /* porta já fechada */ }
  }
}
