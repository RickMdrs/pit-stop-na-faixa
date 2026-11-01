// Converte landmarks de pose em observações por pessoa: zona e gesto.
// Funções puras — testáveis sem câmera.
//
// Distinção importante (§18): PRESENÇA (há uma pessoa) ≠ POSE (pontos do corpo)
// ≠ INTENÇÃO inferida ≠ SOLICITAÇÃO (decidida no controller, com zona e tempo).

// Índices do modelo MediaPipe Pose (33 pontos)
export const LM = {
  NOSE: 0,
  L_SHOULDER: 11, R_SHOULDER: 12,
  L_ELBOW: 13, R_ELBOW: 14,
  L_WRIST: 15, R_WRIST: 16,
  L_HIP: 23, R_HIP: 24,
  L_ANKLE: 27, R_ANKLE: 28,
};

export function pointInPolygon([x, y], poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function visible(p, min) {
  return p && (p.visibility === undefined || p.visibility >= min);
}

function mid(a, b) {
  return [(a.x + b.x) / 2, (a.y + b.y) / 2];
}

// Ponto usado para decidir em que zona a pessoa está.
export function referencePoint(lms, mode, minVis) {
  const la = lms[LM.L_ANKLE], ra = lms[LM.R_ANKLE];
  const lh = lms[LM.L_HIP], rh = lms[LM.R_HIP];
  const feet = visible(la, minVis) && visible(ra, minVis) ? mid(la, ra)
    : visible(la, minVis) ? [la.x, la.y]
    : visible(ra, minVis) ? [ra.x, ra.y] : null;
  const hips = visible(lh, minVis) && visible(rh, minVis) ? mid(lh, rh) : null;
  const center = centroid(lms);
  if (mode === 'pes') return { point: feet, kind: 'pes' };
  if (mode === 'quadril') return { point: hips, kind: 'quadril' };
  if (mode === 'centro') return { point: center, kind: 'centro' };
  if (feet) return { point: feet, kind: 'pes' };
  if (hips) return { point: hips, kind: 'quadril' };
  return { point: center, kind: 'centro' };
}

function centroid(lms) {
  let sx = 0, sy = 0, n = 0;
  for (const p of lms) {
    if (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) continue;
    sx += p.x; sy += p.y; n++;
  }
  return n ? [sx / n, sy / n] : null;
}

// Regra inicial do gesto (§10.3): punho acima do ombro, com braço visível.
// Aceita qualquer braço. Persistência temporal é aplicada no controller.
// opts.relaxed: critério de MANUTENÇÃO (histerese) — margem menor, visibilidade menor e sem exigir
// antebraço para cima. Assim um quadro duvidoso não derruba um gesto já reconhecido.
export function armRaised(lms, cfg, opts = {}) {
  const relaxed = !!opts.relaxed;
  const minVis = relaxed ? cfg.gesto.visibilidadeManutencao : cfg.percepcao.visibilidadeMinima;
  const ls = lms[LM.L_SHOULDER], rs = lms[LM.R_SHOULDER];
  if (!visible(ls, minVis) || !visible(rs, minVis)) return false;
  const shoulderWidth = Math.hypot(ls.x - rs.x, ls.y - rs.y) || 0.1;
  const margin = (relaxed ? cfg.gesto.margemManutencao : cfg.gesto.margemSobreOmbro) * shoulderWidth;
  const arms = [
    [lms[LM.L_SHOULDER], lms[LM.L_ELBOW], lms[LM.L_WRIST]],
    [lms[LM.R_SHOULDER], lms[LM.R_ELBOW], lms[LM.R_WRIST]],
  ];
  return arms.some(([s, e, w]) =>
    visible(w, minVis) && (relaxed || visible(e, minVis)) &&
    w.y < s.y - margin &&           // punho acima do ombro (y cresce para baixo)
    (relaxed || w.y < e.y)          // antebraço apontando para cima (só para iniciar)
  );
}

function bbox(lms) {
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
  for (const p of lms) {
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
  }
  return [x0, y0, x1, y1];
}

// Zona de maior prioridade que contém o ponto: C > B > A.
export function zoneOf(point, zonas) {
  if (!point) return null;
  for (const z of ['C', 'B', 'A']) {
    if (zonas[z] && zonas[z].length >= 3 && pointInPolygon(point, zonas[z])) return z;
  }
  return null;
}

// poses: array de arrays de landmarks normalizados ({x, y, visibility})
export function interpretPoses(poses, cfg) {
  return poses.map((lms) => {
    const ref = referencePoint(lms, cfg.percepcao.pontoReferencia, cfg.percepcao.visibilidadeMinima);
    const zone = zoneOf(ref.point, cfg.zonas);
    const gesture = cfg.gesto.habilitado && armRaised(lms, cfg);
    return { zone, gesture, ref: ref.point, refKind: ref.kind, bbox: bbox(lms) };
  });
}

// Pessoas rastreadas (tracker.js): landmarks suavizados e gesto com histerese já decidido.
export function interpretTracks(tracks, cfg) {
  return tracks.map((t) => {
    const ref = referencePoint(t.lms, cfg.percepcao.pontoReferencia, cfg.percepcao.visibilidadeMinima);
    return {
      id: t.id,
      zone: zoneOf(ref.point, cfg.zonas),
      gesture: cfg.gesto.habilitado && t.raised,
      ref: ref.point,
      refKind: ref.kind,
      bbox: bbox(t.lms),
      held: t.missingMs > 0, // mantida brevemente sem detecção neste quadro
    };
  });
}

// Resume as pessoas de um quadro na entrada do controller.
export function summarize(persons) {
  return {
    zones: {
      A: persons.some((p) => p.zone === 'A'),
      B: persons.some((p) => p.zone === 'B'),
      C: persons.some((p) => p.zone === 'C'),
    },
    gestureInB: persons.some((p) => p.zone === 'B' && p.gesture),
    gestureOutside: persons.some((p) => p.zone !== 'B' && p.gesture),
    count: persons.length,
  };
}
