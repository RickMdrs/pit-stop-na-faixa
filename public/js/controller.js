// Máquina de estados determinística da sinalização (§8.4).
// Independente de interface, câmera e hardware: recebe observações com horário
// e devolve estado, saída desejada do sinal e eventos. Nenhum LLM decide nada aqui.

export const S = {
  OBSERVANDO: 'OBSERVANDO',
  APROXIMACAO: 'APROXIMACAO',
  SOLICITACAO: 'SOLICITACAO',
  FAIXA_OCUPADA: 'FAIXA_OCUPADA',
  VERIFICANDO: 'VERIFICANDO_LIBERACAO',
  FALHA: 'FALHA',
};

const AUTO_CLEAR_FAILURES = new Set(['aguardando_camera']);

// Nível do aviso ao motorista: 0 apagado · 1 atenção (alguém esperando/pedindo) ·
// 2 alerta máximo (alguém NA FAIXA — maior risco, aviso mais forte).
export const NIVEL = { APAGADO: 0, ATENCAO: 1, FAIXA: 2 };
export function signalLevel(snap) {
  if (!snap || !snap.signal) return NIVEL.APAGADO;
  return snap.zones && snap.zones.C ? NIVEL.FAIXA : NIVEL.ATENCAO;
}

// Confirmação de detecção + tolerância a perdas momentâneas (§8.1, "confirmação de detecção").
export class Debounce {
  constructor(confirmMs, toleranceMs) {
    this.confirmMs = confirmMs;
    this.toleranceMs = toleranceMs;
    this.confirmed = false;
    this.rawStart = null; // início do episódio bruto atual
    this.lastSeen = null;
    this.episodeStart = null; // rawStart do episódio que foi confirmado
  }

  // 0..1: quanto do tempo de confirmação já foi cumprido (para exibição)
  progress(now) {
    if (this.confirmed) return 1;
    if (this.rawStart === null || this.lastSeen === null || now - this.lastSeen > this.toleranceMs) return 0;
    return this.confirmMs > 0 ? Math.min(1, (now - this.rawStart) / this.confirmMs) : 1;
  }

  // Retorna 'rise' | 'fall' | null
  update(raw, now) {
    if (raw) {
      if (this.rawStart === null || (this.lastSeen !== null && now - this.lastSeen > this.toleranceMs)) {
        this.rawStart = now;
      }
      this.lastSeen = now;
      if (!this.confirmed && now - this.rawStart >= this.confirmMs) {
        this.confirmed = true;
        this.episodeStart = this.rawStart;
        return 'rise';
      }
      return null;
    }
    if (this.lastSeen !== null && now - this.lastSeen > this.toleranceMs) {
      this.rawStart = null;
      if (this.confirmed) {
        this.confirmed = false;
        return 'fall';
      }
    }
    return null;
  }
}

export class Controller {
  constructor(cfg, now = 0) {
    this.cfg = cfg;
    const t = cfg.tempos;
    this.zone = {
      A: new Debounce(t.confirmacaoPresencaMs, t.toleranciaPerdaMs),
      B: new Debounce(t.confirmacaoPresencaMs, t.toleranciaPerdaMs),
      C: new Debounce(t.confirmacaoPresencaMs, t.toleranciaPerdaMs),
    };
    this.gestureB = new Debounce(t.confirmacaoGestoMs, t.toleranciaPerdaMs);
    this.gestureOut = new Debounce(t.confirmacaoGestoMs, t.toleranciaPerdaMs);
    this.state = S.FALHA;
    this.failure = 'aguardando_camera';
    this.signal = false;
    this.requestUntil = -Infinity;
    this.activeSince = null;
    this.clearingSince = null;
    this.lastFrameTs = null;
    this.pendingCondition = null; // { t, motivo } — o que disparou a próxima ativação
    this.lastReason = 'inicio';
    this.events = [];
    this.startedAt = now;
  }

  _emit(tipo, now, extra = {}) {
    this.events.push({ tipo, t: now, ...extra });
  }

  _drain() {
    const ev = this.events;
    this.events = [];
    return ev;
  }

  _snapshot() {
    return {
      state: this.state,
      signal: this.signal,
      failure: this.failure,
      zones: { A: this.zone.A.confirmed, B: this.zone.B.confirmed, C: this.zone.C.confirmed },
      gestureB: this.gestureB.confirmed,
      requestRemainingMs: 0,
      events: this._drain(),
    };
  }

  _request(origem, now, conditionTs) {
    this.requestUntil = Math.max(this.requestUntil, now + this.cfg.tempos.advertenciaMinimaMs);
    this.lastReason = `solicitacao_${origem}`;
    this.requestOrigin = origem;
    // 'via' (como foi pedido) — NÃO usar 'origem', que é a origem dos dados (webcam/vídeo/simulação)
    this._emit('solicitacao', now, { via: origem, zona: origem === 'botao' ? null : 'B' });
    if (!this.pendingCondition) this.pendingCondition = { t: conditionTs, motivo: this.lastReason };
  }

  fail(motivo, now) {
    if (this.failure === motivo) return this._snapshot();
    this.failure = motivo;
    this._emit('falha', now, { motivo });
    return this._evaluate(now);
  }

  // Reinício pelo operador: limpa a falha; o sinal só apaga após verificar liberação.
  reset(now) {
    const prev = this.failure;
    this.failure = null;
    this.requestUntil = -Infinity;
    this.pendingCondition = null;
    if (this.signal) this.activeSince = now;
    this.lastFrameTs = this.lastFrameTs === null ? null : now;
    this._emit('reinicio', now, { motivo: prev || 'operador' });
    if (this.lastFrameTs === null) this.failure = 'aguardando_camera';
    return this._evaluate(now);
  }

  button(now) {
    this._emit('botao', now);
    this._request('botao', now, now);
    return this._evaluate(now);
  }

  // obs: { zones: {A,B,C}, gestureInB, gestureOutside } de um quadro
  observe(obs, now) {
    if (this.failure && AUTO_CLEAR_FAILURES.has(this.failure)) {
      this._emit('camera_ok', now);
      this.failure = null;
    }
    this.lastFrameTs = now;

    const r = this.cfg.regras;
    for (const z of ['A', 'B', 'C']) {
      const edge = this.zone[z].update(!!obs.zones[z], now);
      if (edge === 'rise') {
        const tipo = z === 'A' ? 'aproximacao' : z === 'B' ? 'presenca' : 'ocupacao';
        this._emit(tipo, now, { zona: z });
        if (z === 'B' && r.solicitacaoPorPresencaEmB) this._request('presenca', now, this.zone.B.episodeStart);
        if (z === 'C') {
          this.lastReason = 'faixa_ocupada';
          if (!this.pendingCondition) this.pendingCondition = { t: this.zone.C.episodeStart, motivo: 'faixa_ocupada' };
        }
        if (z === 'A' && r.preAlertaNaAproximacao && !this.pendingCondition) {
          this.pendingCondition = { t: this.zone.A.episodeStart, motivo: 'pre_alerta_aproximacao' };
        }
      } else if (edge === 'fall') {
        this._emit('saida_zona', now, { zona: z });
      }
    }

    // Gesto só abre solicitação na zona B; uma solicitação por episódio de gesto.
    const g = this.gestureB.update(!!obs.gestureInB, now);
    if (g === 'rise') {
      this._emit('gesto', now, { zona: 'B' });
      this._request('gesto', now, this.gestureB.episodeStart);
    }
    if (this.gestureOut.update(!!obs.gestureOutside, now) === 'rise') {
      this._emit('gesto_fora_da_zona', now, { motivo: 'ignorado_sem_solicitacao' });
    }
    return this._evaluate(now);
  }

  // Chamado periodicamente, mesmo sem quadros novos (detecta câmera congelada).
  tick(now) {
    const t = this.cfg.tempos;
    if (!this.failure && this.lastFrameTs !== null && now - this.lastFrameTs > t.quadroAntigoMs) {
      return this.fail('camera_sem_quadros_novos', now);
    }
    return this._evaluate(now);
  }

  _evaluate(now) {
    const t = this.cfg.tempos;
    const r = this.cfg.regras;
    const prevState = this.state;
    const prevSignal = this.signal;
    const zA = this.zone.A.confirmed, zB = this.zone.B.confirmed, zC = this.zone.C.confirmed;

    let next;
    if (this.failure) {
      // Em falha a automação fica suspensa: a saída permanece como estava e o operador decide.
      next = S.FALHA;
    } else {
      const holding = now < this.requestUntil;
      const preAlert = r.preAlertaNaAproximacao && zA;
      const demand = zC || (zB && r.solicitacaoPorPresencaEmB) || holding || preAlert;

      if (demand) {
        this.clearingSince = null;
        next = zC ? S.FAIXA_OCUPADA : (holding || zB) ? S.SOLICITACAO : S.APROXIMACAO;
        if (!this.signal) {
          this.signal = true;
          this.activeSince = now;
          const cond = this.pendingCondition || { t: now, motivo: this.lastReason };
          this._emit('sinal', now, { valor: true, motivo: cond.motivo, tCondicao: cond.t });
          this.pendingCondition = null;
        }
      } else if (this.signal) {
        if (this.clearingSince === null) this.clearingSince = now;
        next = S.VERIFICANDO;
        if (now - this.clearingSince >= t.verificacaoLiberacaoMs) {
          this.signal = false;
          this.activeSince = null;
          this.clearingSince = null;
          this.requestOrigin = null;
          this._emit('liberacao', now, { motivo: 'sem_deteccao_apos_verificacao' });
          this._emit('sinal', now, { valor: false, motivo: 'liberacao', tCondicao: now });
          next = zA ? S.APROXIMACAO : S.OBSERVANDO;
        }
      } else {
        this.pendingCondition = null;
        next = zA ? S.APROXIMACAO : S.OBSERVANDO;
      }

      if (this.signal && this.activeSince !== null && now - this.activeSince > t.advertenciaMaximaMs) {
        this.failure = 'advertencia_maxima_excedida';
        this._emit('falha', now, { motivo: this.failure });
        next = S.FALHA;
      }
    }

    if (next !== prevState) {
      this._emit('estado', now, {
        de: prevState, para: next,
        motivo: next === S.FALHA ? this.failure : next === S.FAIXA_OCUPADA ? 'faixa_ocupada' : this.lastReason,
      });
      this.state = next;
    }
    const snap = this._snapshot();
    snap.signalChanged = prevSignal !== this.signal;
    snap.requestRemainingMs = Math.max(0, this.requestUntil - now);
    snap.requestOrigin = this.requestOrigin || null;
    snap.progress = { B: this.zone.B.progress(now), gestureB: this.gestureB.progress(now) };
    snap.clearingRemainingMs = this.clearingSince === null ? 0 : Math.max(0, t.verificacaoLiberacaoMs - (now - this.clearingSince));
    return snap;
  }
}
