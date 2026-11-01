// Registro local de eventos: fila em memória enviada em lote ao servidor local.
// Se o servidor cair, os eventos ficam na fila e a falha aparece no diagnóstico.
export class EventLog {
  constructor(sessao) {
    this.sessao = sessao;
    this.queue = [];
    this.seq = 0;
    this.lastOk = null;
    this.lastError = null;
    this.total = 0;
    setInterval(() => this.flush(), 1000);
    addEventListener('pagehide', () => this.flushBeacon());
  }

  push(ev) {
    const e = { id: `${this.sessao}-${++this.seq}`, sessao: this.sessao, ...ev };
    this.queue.push(e);
    this.total++;
    return e;
  }

  async flush() {
    if (!this.queue.length || this.flushing) return;
    this.flushing = true;
    const batch = this.queue.slice(0, 500);
    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.queue.splice(0, batch.length);
      this.lastOk = Date.now();
      this.lastError = null;
    } catch (err) {
      this.lastError = String(err.message || err);
    } finally {
      this.flushing = false;
    }
  }

  flushBeacon() {
    if (!this.queue.length) return;
    navigator.sendBeacon('/api/events', new Blob([JSON.stringify(this.queue)], { type: 'application/json' }));
    this.queue = [];
  }

  status() {
    if (this.lastError) return { ok: false, texto: `FALHA ao gravar (${this.lastError}) · ${this.queue.length} na fila` };
    return { ok: true, texto: `${this.total} eventos · ${this.queue.length} pendentes` };
  }
}
