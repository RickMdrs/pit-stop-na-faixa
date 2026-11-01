// Rastreamento simples entre quadros (sem identidade pessoal — só um número temporário).
// Objetivos: (1) suavizar os pontos do corpo, (2) manter a pessoa por alguns instantes
// quando o modelo a perde num quadro, (3) gesto com histerese por pessoa.
// Puro e determinístico: recebe poses + horário, devolve trilhas.
import { LM, armRaised } from './interpret.js';

function center(lms) {
  const pts = [LM.L_SHOULDER, LM.R_SHOULDER, LM.L_HIP, LM.R_HIP].map((i) => lms[i]).filter(Boolean);
  const src = pts.length ? pts : lms;
  let x = 0, y = 0;
  for (const p of src) { x += p.x; y += p.y; }
  return [x / src.length, y / src.length];
}

export class PoseTracker {
  constructor() {
    this.tracks = [];
    this.nextId = 1;
  }

  reset() { this.tracks = []; }

  // poses: arrays de landmarks normalizados; cfg.percepcao.{suavizacao, retencaoMs, distanciaAssociacao}
  update(poses, now, cfg) {
    const p = cfg.percepcao;
    const alpha = p.suavizacao;           // 0 = sem suavização; perto de 1 = muito suave (mais atraso)
    const centers = poses.map(center);
    const used = new Set();

    // associa cada trilha à pose mais próxima (guloso por distância)
    const pairs = [];
    this.tracks.forEach((t, ti) => centers.forEach((c, pi) => {
      const d = Math.hypot(c[0] - t.center[0], c[1] - t.center[1]);
      if (d <= p.distanciaAssociacao) pairs.push([d, ti, pi]);
    }));
    pairs.sort((a, b) => a[0] - b[0]);
    const matchedTrack = new Map();
    for (const [, ti, pi] of pairs) {
      if (matchedTrack.has(ti) || used.has(pi)) continue;
      matchedTrack.set(ti, pi);
      used.add(pi);
    }

    const next = [];
    this.tracks.forEach((t, ti) => {
      if (matchedTrack.has(ti)) {
        const lms = poses[matchedTrack.get(ti)];
        t.lms = t.lms.map((old, i) => {
          const n = lms[i];
          return {
            x: alpha * old.x + (1 - alpha) * n.x,
            y: alpha * old.y + (1 - alpha) * n.y,
            visibility: alpha * (old.visibility ?? 1) + (1 - alpha) * (n.visibility ?? 1),
          };
        });
        t.center = center(t.lms);
        t.lastSeen = now;
        t.missingMs = 0;
        // histerese: critério estrito para iniciar, relaxado para manter
        t.raised = t.raised ? armRaised(t.lms, cfg, { relaxed: true }) : armRaised(t.lms, cfg);
        next.push(t);
      } else if (now - t.lastSeen <= p.retencaoMs) {
        t.missingMs = now - t.lastSeen; // mantém a última posição e o estado do gesto
        next.push(t);
      }
    });
    poses.forEach((lms, pi) => {
      if (used.has(pi)) return;
      const t = {
        id: this.nextId++,
        lms: lms.map((q) => ({ x: q.x, y: q.y, visibility: q.visibility ?? 1 })),
        lastSeen: now,
        missingMs: 0,
      };
      t.center = center(t.lms);
      t.raised = armRaised(t.lms, cfg);
      next.push(t);
    });
    this.tracks = next;
    return next;
  }
}
