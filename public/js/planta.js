// Planta de sinalização da saída do corredor (vista de cima), baseada nas fotos do local.
// Fonte ÚNICA do desenho: usada pelo modo história (com partes animadas), pelos arquivos
// de slide (com legenda) e pela versão limpa para o jogo. Esquema ilustrativo, sem escala.
//
// Coordenadas-base: 800 × 450 (use `escala` para 1600 × 900 etc.).

export const PLANTA = {
  W: 800, H: 450,
  corredor: { x0: 355, x1: 445, y0: 0, y1: 150 },
  calcadaNorte: { y0: 150, y1: 180 },
  via: { y0: 180, y1: 330, centro: 255 },
  calcadaSul: { y0: 330, y1: 360 },
  zonaA: { x0: 355, y0: 40, x1: 445, y1: 150 },  // dentro do corredor
  zonaB: { x0: 358, y0: 152, x1: 442, y1: 178 }, // área de espera pintada (boca do corredor)
  zonaC: { x0: 355, y0: 182, x1: 445, y1: 328 }, // faixa
  carro: { w: 90, h: 34, yDir: 276, yEsq: 200 }, // pistas: → embaixo, ← em cima (mão dupla)
  sinalDir: { x: 290, y: 338 },                  // sinal para quem vem da esquerda (→)
  sinalEsq: { x: 512, y: 156 },                  // sinal para quem vem da direita (←)
  camera: { x: 400, y: 364 },
};

const FONT = "Inter, 'Segoe UI', Arial, sans-serif";
const C = {
  fundo: '#07080a', predio: '#13161b', piso: '#101318', corredor: '#171a20', via: '#1b1f26',
  faixa: '#d9dde3', linha: '#d4a62a', texto: '#7d8694', azul: '#3d7bea', ambar: '#f5a524',
  vermelho: '#ef4444', estacionado: '#2a2f38',
};

const PED = '<circle cx="34" cy="10" r="6" fill="currentColor"/><path d="M30 19h8l6 14-5 2-4-8-2 10 8 10v15h-6V49l-7-8-3 9-8 12-5-3 8-12 4-14 1-9-5 4v8h-5V24z" fill="currentColor"/>';

function cabecaSinal(id, x, y, aceso, dir) {
  // cabeça do sinal (2 lâmpadas) num poste; "dir" indica para que lado ele está voltado
  const lamp = (lx, cls) => `<rect class="lamp ${cls}" x="${lx}" y="${y - 13}" width="14" height="10" rx="2" fill="${aceso ? C.ambar : '#2a2207'}"/>`;
  const seta = dir === 'esq'
    ? `<path d="M${x - 26} ${y - 8} l-6 0" stroke="${C.texto}" stroke-width="1.5"/>`
    : `<path d="M${x + 26} ${y - 8} l6 0" stroke="${C.texto}" stroke-width="1.5"/>`;
  return `<g id="${id}" class="sinal">
    <rect x="${x - 1.5}" y="${y - 3}" width="3" height="16" fill="#2f3540"/>
    <rect x="${x - 19}" y="${y - 17}" width="38" height="18" rx="4" fill="#000" stroke="#2f3540"/>
    ${lamp(x - 16, 'lamp-a')}${lamp(x + 2, 'lamp-b')}
  </g>`;
}

function carroSVG(id, dir) {
  // dir: 'dir' (anda para a direita) | 'esq'
  const { w, h } = PLANTA.carro;
  const para = dir === 'dir' ? `<rect x="${w - 26}" y="5" width="18" height="${h - 10}" rx="3" fill="#0c0e11"/>` : `<rect x="8" y="5" width="18" height="${h - 10}" rx="3" fill="#0c0e11"/>`;
  const freio = dir === 'dir'
    ? `<rect x="-3" y="4" width="5" height="8" rx="2"/><rect x="-3" y="${h - 12}" width="5" height="8" rx="2"/>`
    : `<rect x="${w - 2}" y="4" width="5" height="8" rx="2"/><rect x="${w - 2}" y="${h - 12}" width="5" height="8" rx="2"/>`;
  return `<g id="${id}"><rect width="${w}" height="${h}" rx="8" fill="#e6e9ee"/>${para}<g class="freio" fill="${C.vermelho}">${freio}</g></g>`;
}

function chamada(n, x, y) {
  return `<g class="chamada"><circle cx="${x}" cy="${y}" r="9" fill="${C.azul}"/><text x="${x}" y="${y + 3.5}" text-anchor="middle" font-family="${FONT}" font-size="10" font-weight="700" fill="#fff">${n}</text></g>`;
}

export const LEGENDA = [
  'Câmera no prédio da frente: vê corredor, área de espera e faixa',
  'Zona A · corredor: pré-alerta "ATENÇÃO — PEDESTRE SE APROXIMANDO"',
  'Zona B · área de espera pintada + "PARE · OLHE" no piso',
  'Tela do pedestre e botão no fim do corredor',
  'Sinal ao motorista · sentido → (antes da faixa, acima dos carros)',
  'Sinal ao motorista · sentido ←',
  'Espelho convexo na saída do corredor',
  'Iluminação da saída e da faixa',
  'Vagas junto à saída reduzem a visão: avaliar',
  'Zona C · faixa: alerta máximo "PEDESTRE NA FAIXA — PARE"',
];

/**
 * @param {object} o
 * @param {number} [o.escala=1]
 * @param {boolean} [o.rotulos=false]  números + legenda (versão de slide)
 * @param {boolean} [o.zonas=false]    contorno das zonas A/B/C
 * @param {boolean} [o.dinamico=false] pessoa, carros e ids para animação (modo história)
 * @param {boolean} [o.exemplo=false]  pessoa/carros estáticos e sinais acesos (ilustração)
 * @param {boolean} [o.titulo=false]
 * @param {boolean} [o.semSistema=false] o local como é HOJE (sem câmera, sinais, área pintada, tela, botão, espelho, luz)
 */
export function plantaSVG(o = {}) {
  const s = o.escala || 1;
  const P = PLANTA;
  const aceso = !!o.exemplo;
  const sis = !o.semSistema; // elementos da proposta
  const listras = Array.from({ length: 8 }, (_, k) => `<rect x="360" y="${186 + k * 18}" width="80" height="9"/>`).join('');
  const vagas = [70, 160, 250].map((x) => `<rect x="${x}" y="154" width="74" height="22" rx="5" fill="${C.estacionado}"/>`).join('');

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${P.W * s} ${P.H * s}" width="${P.W * s}" height="${P.H * s}" font-family="${FONT}">
<defs>
  <symbol id="pp" viewBox="0 0 64 64">${PED}</symbol>
  <pattern id="hachura" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="rgba(255,255,255,0.05)" stroke-width="4"/></pattern>
  <pattern id="zebra" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="10" height="10" fill="#1a1a14"/><rect width="5" height="10" fill="#c9a227"/></pattern>
  <radialGradient id="luz"><stop offset="0" stop-color="#fff4c2" stop-opacity="0.55"/><stop offset="1" stop-color="#fff4c2" stop-opacity="0"/></radialGradient>
</defs>
<g transform="scale(${s})">
  <rect width="${P.W}" height="${P.H}" fill="${C.fundo}"/>
  <!-- prédios -->
  <rect x="0" y="0" width="355" height="150" fill="${C.predio}"/><rect x="0" y="0" width="355" height="150" fill="url(#hachura)"/>
  <rect x="445" y="0" width="355" height="150" fill="${C.predio}"/><rect x="445" y="0" width="355" height="150" fill="url(#hachura)"/>
  <rect x="0" y="360" width="800" height="90" fill="${C.predio}"/><rect x="0" y="360" width="800" height="90" fill="url(#hachura)"/>
  <!-- corredor coberto -->
  <rect x="355" y="0" width="90" height="150" fill="${C.corredor}"/>
  <text x="400" y="22" text-anchor="middle" font-size="9" letter-spacing="1.6" fill="${C.texto}">CORREDOR</text>
  <text x="400" y="34" text-anchor="middle" font-size="7" fill="#5b6270">coberto · paredes até a via</text>
  <!-- calçadas e via -->
  <rect x="0" y="150" width="355" height="30" fill="${C.piso}"/><rect x="445" y="150" width="355" height="30" fill="${C.piso}"/>
  <rect x="355" y="150" width="90" height="30" fill="${C.corredor}"/>
  <rect x="0" y="180" width="800" height="150" fill="${C.via}"/>
  <line x1="0" y1="181" x2="800" y2="181" stroke="#3a404b"/><line x1="0" y1="329" x2="800" y2="329" stroke="#3a404b"/>
  <line x1="0" y1="255" x2="355" y2="255" stroke="${C.linha}" stroke-width="2" stroke-dasharray="18 12"/>
  <line x1="445" y1="255" x2="800" y2="255" stroke="${C.linha}" stroke-width="2" stroke-dasharray="18 12"/>
  <rect x="0" y="330" width="800" height="30" fill="${C.piso}"/>
  <!-- vagas junto à saída (limitam a visão) -->
  ${vagas}
  <!-- faixa de pedestres -->
  <g fill="${C.faixa}">${listras}</g>
  <!-- área de espera pintada no fim do corredor + "PARE · OLHE" no piso -->
  ${sis ? `<rect x="358" y="152" width="84" height="26" fill="url(#zebra)" opacity="0.9"/>
  <text x="400" y="143" text-anchor="middle" font-size="9" font-weight="700" letter-spacing="1" fill="#e6e9ee">PARE · OLHE</text>` : ''}
  <!-- área zebrada já existente do outro lado -->
  <rect x="358" y="333" width="84" height="22" fill="url(#zebra)" opacity="0.5"/>
  ${sis ? `  <!-- iluminação -->
  <circle cx="400" cy="160" r="38" fill="url(#luz)"/><circle cx="400" cy="255" r="56" fill="url(#luz)" opacity="0.6"/>
  <circle cx="447" cy="146" r="2.5" fill="#fff4c2"/><circle cx="353" cy="186" r="2.5" fill="#fff4c2"/>
  <!-- tela do pedestre (parede esquerda) e botão (parede direita) no fim do corredor -->
  <rect id="telaPed" x="356" y="112" width="7" height="24" rx="1.5" fill="${C.azul}"/>
  <circle cx="442" cy="132" r="4" fill="#0c0e11" stroke="${C.ambar}" stroke-width="2"/>
  <!-- espelho convexo -->
  <circle cx="452" cy="152" r="6.5" fill="#9aa3b2" opacity="0.85" stroke="#e6e9ee" stroke-width="1.2"/>
  <!-- câmera no prédio da frente, olhando para dentro do corredor -->
  <path d="M400 364 L352 60 L448 60 Z" fill="rgba(61,123,234,0.05)"/>
  <rect x="392" y="362" width="16" height="11" rx="2.5" fill="${C.azul}"/>
  <text x="414" y="372" font-size="8" letter-spacing="1.2" fill="#6d97ee">CÂMERA</text>
  <!-- sinais ao motorista, um por sentido -->
  ${cabecaSinal('sinalDir', P.sinalDir.x, P.sinalDir.y, aceso, 'esq')}
  ${cabecaSinal('sinalEsq', P.sinalEsq.x, P.sinalEsq.y, aceso, 'dir')}
` : ''}
  <!-- sentidos -->
  <text x="40" y="300" font-size="14" fill="#5b6270">→</text><text x="752" y="232" font-size="14" fill="#5b6270">←</text>
  <text x="18" y="440" font-size="8" letter-spacing="1.4" fill="#5b6270">PRÉDIO DA FRENTE</text>`;

  if (o.zonas) {
    svg += `
  <g id="zonas" fill="none" stroke-width="1.5" stroke-dasharray="5 4">
    <rect id="zA" class="zona za" x="355" y="40" width="90" height="110" stroke="#5b8def"/>
    <rect id="zB" class="zona zb" x="358" y="152" width="84" height="26" stroke="#f5a524"/>
    <rect id="zC" class="zona zc" x="355" y="182" width="90" height="146" stroke="#ef4444"/>
    <text x="349" y="56" text-anchor="end" font-size="12" font-weight="600" fill="#5b8def">A</text>
    <text x="352" y="170" text-anchor="end" font-size="12" font-weight="600" fill="#f5a524">B</text>
    <text x="349" y="200" text-anchor="end" font-size="12" font-weight="600" fill="#ef4444">C</text>
  </g>`;
  }

  if (o.exemplo) {
    svg += `
  <g transform="translate(400 96)"><circle r="11" fill="#f3f5f8"/><use href="#pp" x="-7.5" y="-7.5" width="15" height="15" color="#050607"/></g>
  <g transform="translate(160 ${P.carro.yDir})">${carroSVG('exDir', 'dir')}</g>
  <g transform="translate(560 ${P.carro.yEsq})">${carroSVG('exEsq', 'esq')}</g>`;
  }

  if (o.dinamico) {
    svg += `
  <g id="carDir">${carroSVG('carDirCorpo', 'dir')}</g>
  <g id="carEsq">${carroSVG('carEsqCorpo', 'esq')}</g>
  <g id="person">
    <circle r="15" fill="none" stroke="rgba(243,245,248,0.25)" stroke-width="1.5"/>
    <circle r="11" fill="#f3f5f8"/>
    <use href="#pp" x="-7.5" y="-7.5" width="15" height="15" color="#050607"/>
    <g id="hand" transform="translate(14 -26)"><circle r="11" fill="#22c55e"/>
      <path transform="translate(-7 -7) scale(0.58)" d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" fill="none" stroke="#04130a" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
    </g>
  </g>`;
  }

  if (o.rotulos) {
    // chamadas numeradas junto a cada elemento
    const pts = [[378, 392], [432, 52], [458, 170], [338, 122], [262, 338], [543, 148], [472, 148], [322, 196], [210, 168], [470, 255]];
    svg += pts.map(([x, y], i) => chamada(i + 1, x, y)).join('');
    // legenda nos telhados
    const item = (n, txt, x, y) => `${chamada(n, x, y)}<text x="${x + 14}" y="${y + 3.5}" font-size="8.6" fill="#c3c9d3">${txt}</text>`;
    const esq = LEGENDA.slice(0, 5).map((t, i) => item(i + 1, t, 18, 52 + i * 18)).join('');
    const dir = LEGENDA.slice(5).map((t, i) => item(i + 6, t, 462, 52 + i * 18)).join('');
    svg += `<text x="18" y="24" font-size="13" font-weight="600" fill="#f3f5f8">Sinalização da saída do corredor</text>
  <text x="18" y="36" font-size="7.5" fill="${C.texto}">Vista de cima · sem escala · posições finais a validar com a segurança</text>
  ${esq}${dir}`;
  }

  return svg + '\n</g>\n</svg>\n';
}

// Sinal ao motorista em cada estado — para slides e para o jogo (mesmos textos do sistema).
export const ESTADOS_SINAL = {
  apagado: { titulo: 'INATIVO', complemento: '', cor: null },
  aproximacao: { titulo: 'ATENÇÃO', complemento: 'PEDESTRE SE APROXIMANDO', cor: C.ambar },
  pedido: { titulo: 'PEDESTRE PEDIU PASSAGEM', complemento: 'PARE ANTES DA FAIXA', cor: C.ambar },
  faixa: { titulo: 'PEDESTRE NA FAIXA', complemento: 'PARE', cor: C.vermelho },
};

export function sinalSVG(estado) {
  const e = ESTADOS_SINAL[estado];
  const on = !!e.cor;
  const lampA = on ? e.cor : '#2a2207';
  const lampB = estado === 'faixa' ? C.ambar : on ? '#2a2207' : '#2a2207';
  const plateBg = estado === 'faixa' ? '#7f1d1d' : '#000';
  const fg = estado === 'faixa' ? '#ffffff' : on ? e.cor : '#3a3f47';
  const borda = on ? e.cor : '#2a2e35';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 300" width="640" height="300" font-family="${FONT}">
<defs><symbol id="pp" viewBox="0 0 64 64">${PED}</symbol></defs>
<rect width="640" height="300" rx="24" fill="#000"/>
<rect x="210" y="26" width="96" height="48" rx="8" fill="${lampA}" ${on ? `stroke="#fde68a" stroke-width="3"` : 'stroke="#3b3210" stroke-width="3"'}/>
<rect x="334" y="26" width="96" height="48" rx="8" fill="${lampB}" stroke="${estado === 'faixa' ? '#fde68a' : '#3b3210'}" stroke-width="3"/>
<rect x="28" y="102" width="584" height="172" rx="18" fill="${plateBg}" stroke="${borda}" stroke-width="5"/>
<use href="#pp" x="56" y="132" width="112" height="112" color="${fg}"/>
<text x="190" y="${e.complemento ? 182 : 205}" font-size="${Math.min(44, Math.floor(400 / (e.titulo.length * 0.64)))}" font-weight="700" fill="${fg}">${e.titulo}</text>
${e.complemento ? `<text x="190" y="228" font-size="26" font-weight="600" fill="${fg}">${e.complemento}</text>` : ''}
</svg>
`;
}
