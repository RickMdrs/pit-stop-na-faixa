// Modo história: a travessia na SAÍDA DO CORREDOR (local real, ver docs/sinalizacao).
// A PESSOA e os CARROS seguem um roteiro; as DECISÕES (estado, sinais ao motorista,
// tela do pedestre) são calculadas pelo controller REAL a partir do que a câmera
// "veria" (zona da pessoa e mão levantada). Puro e determinístico — testável.
import { Controller } from './controller.js';
import { DEFAULT_CONFIG, cloneConfig } from './config.js';
import { PLANTA } from './planta.js';

export const DURACAO = 22; // segundos
export const DT = 1 / 30;  // passo da simulação (≈ 30 quadros/s, como a câmera)
export const GEO = PLANTA;

// Paradas dos carros: sempre ANTES da faixa (com folga de 10)
export const PARADA = {
  dir: PLANTA.zonaC.x0 - 10 - PLANTA.carro.w, // carro → para à esquerda da faixa
  esq: PLANTA.zonaC.x1 + 10,                  // carro ← para à direita da faixa
};

export const CAPITULOS = [
  { de: 0, ate: 4.2, titulo: 'Ainda dentro do corredor',
    texto: 'Daqui a pessoa não vê a rua — e nenhum motorista a vê. A câmera, no prédio da frente, já a detecta na zona A e os dois sinais acendem: “ATENÇÃO — PEDESTRE SE APROXIMANDO”.' },
  { de: 4.2, ate: 7.5, titulo: 'Para na área e pede passagem',
    texto: 'Ela para na área pintada no fim do corredor (zona B). Só parar ali já registra o pedido — levantar a mão ou apertar o botão também vale. Os sinais mudam para “PEDESTRE PEDIU PASSAGEM — PARE ANTES DA FAIXA”.' },
  { de: 7.5, ate: 10, titulo: 'Os dois sentidos param',
    texto: 'Os motoristas dos dois sentidos param antes da faixa. A tela no fim do corredor orienta: “ATRAVESSE QUANDO OS VEÍCULOS PARAREM” — e o espelho ajuda a conferir.' },
  { de: 10, ate: 14.3, titulo: 'A pessoa atravessa',
    texto: 'Com os carros parados, ela atravessa. Enquanto está na faixa, o aviso vira alerta máximo: “PEDESTRE NA FAIXA — PARE”.' },
  { de: 14.3, ate: DURACAO, titulo: 'Travessia concluída',
    texto: 'Sem ninguém nas zonas, o sistema confirma a liberação, apaga os sinais e os carros seguem. Cada passo fica registrado para medir o uso.' },
];

export function capituloEm(t) {
  const i = CAPITULOS.findIndex((c) => t >= c.de && t < c.ate);
  return i < 0 ? CAPITULOS.length - 1 : i;
}

const lerp = (a, b, k) => a + (b - a) * Math.max(0, Math.min(1, k));
const ease = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));

export const PARTIDA = 17.6; // carros seguem (depois que o sinal apaga)

// Posição da pessoa e dos carros no instante t (roteiro).
export function cena(t) {
  let x = 400, y, visivel = true;
  if (t < 4) y = lerp(8, 138, t / 4);                       // corredor (zona A a partir de y 40)
  else if (t < 5) y = lerp(138, 165, ease(t - 4));          // entra na área de espera (zona B)
  else if (t < 10) y = 165;                                 // espera
  else if (t < 14) y = lerp(165, 345, (t - 10) / 4);        // atravessa (zona C: y 182–328)
  else if (t < 16) { y = 345; x = lerp(400, 620, (t - 14) / 2); } // segue pela calçada da frente
  else { y = 345; x = 620; visivel = false; }
  const mao = t >= 6 && t < 8;                              // gesto opcional (o pedido já valeu pela presença)

  const carro = (de, parada, ate) => {
    if (t < 5) return lerp(de, de + (parada - de) * 0.55, t / 5);
    if (t < 9) return lerp(de + (parada - de) * 0.55, parada, ease((t - 5) / 4));
    if (t < PARTIDA) return parada;
    return lerp(parada, ate, ease((t - PARTIDA) / 3.4));
  };
  const freando = t >= 5 && t < PARTIDA;
  return {
    pessoa: { x, y, visivel, mao },
    carroDir: { x: carro(-150, PARADA.dir, 940), freando, parado: t >= 9 && t < PARTIDA },
    carroEsq: { x: carro(860, PARADA.esq, -200), freando, parado: t >= 9 && t < PARTIDA },
  };
}

const dentro = (r, x, y) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;

// Zona em que a câmera veria a pessoa (mesma prioridade do sistema: C > B > A).
export function zonaDe(p) {
  if (!p.visivel) return null;
  if (dentro(PLANTA.zonaC, p.x, p.y)) return 'C';
  if (dentro(PLANTA.zonaB, p.x, p.y)) return 'B';
  if (dentro(PLANTA.zonaA, p.x, p.y)) return 'A';
  return null;
}

// Configuração recomendada para ESTE local: pré-alerta no corredor (saída cega)
// e presença na área de espera valendo como pedido (gesto e botão também valem).
export function configHistoria(base = DEFAULT_CONFIG) {
  const cfg = cloneConfig(base);
  cfg.regras.solicitacaoPorPresencaEmB = true;
  cfg.regras.preAlertaNaAproximacao = true;
  cfg.gesto.habilitado = true;
  return cfg;
}

// Simulação incremental: avança o controller real quadro a quadro até t.
export class Simulacao {
  constructor(cfg = configHistoria()) {
    this.cfg = cfg;
    this.reset();
  }

  reset() {
    this.ctl = new Controller(this.cfg, 0);
    this.t = 0;
    this.snap = this.ctl.observe(this._obs(0), 0);
    this.eventos = [...this.snap.events];
    this.pedidoDesde = null;
  }

  _obs(t) {
    const { pessoa } = cena(t);
    const z = zonaDe(pessoa);
    return {
      zones: { A: z === 'A', B: z === 'B', C: z === 'C' },
      gestureInB: z === 'B' && pessoa.mao,
      gestureOutside: z !== 'B' && pessoa.visivel && pessoa.mao,
    };
  }

  avancarAte(t) {
    if (t < this.t) this.reset();
    while (this.t + DT <= t + 1e-9) {
      this.t += DT;
      const ms = this.t * 1000;
      this.snap = this.ctl.observe(this._obs(this.t), ms);
      for (const e of this.snap.events) this.eventos.push(e);
      // conta desde o PEDIDO (o pré-alerta acende o sinal antes, mas não é pedido)
      if (this.snap.requestOrigin && this.pedidoDesde === null) this.pedidoDesde = this.t;
      if (!this.snap.requestOrigin) this.pedidoDesde = null;
    }
    return this.estado();
  }

  estado() {
    return {
      t: this.t,
      snap: this.snap,
      sinceSignalMs: this.pedidoDesde === null ? Infinity : (this.t - this.pedidoDesde) * 1000,
      eventos: this.eventos,
    };
  }
}
