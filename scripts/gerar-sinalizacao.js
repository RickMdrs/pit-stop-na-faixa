// Gera os arquivos da planta de sinalização e do sinal ao motorista em docs/sinalizacao/.
// Mesmo desenho do modo história (public/js/planta.js). Uso: `npm run sinalizacao`.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { plantaSVG, sinalSVG, ESTADOS_SINAL } from '../public/js/planta.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'docs', 'sinalizacao');
await mkdir(join(out, 'jogo'), { recursive: true });

const arquivos = {
  // slide: legenda numerada, zonas e exemplo (pessoa no corredor, sinais acesos)
  'planta-sinalizacao.svg': plantaSVG({ escala: 2, rotulos: true, zonas: true, exemplo: true }),
  // slide sem legenda (para quem preferir explicar falando)
  'planta-sem-legenda.svg': plantaSVG({ escala: 2, zonas: true, exemplo: true }),
  // jogo: cenário limpo, sem textos de legenda, sem pessoa/carros (o jogo desenha os seus)
  'jogo/cenario.svg': plantaSVG({ escala: 2 }),
  'jogo/cenario-com-zonas.svg': plantaSVG({ escala: 2, zonas: true }),
  // jogo, Parte 1 (e slide de 'antes'): o local como é hoje, sem nenhum elemento da proposta
  'jogo/cenario-sem-sistema.svg': plantaSVG({ escala: 2, semSistema: true }),
};
for (const estado of Object.keys(ESTADOS_SINAL)) arquivos[`jogo/sinal-${estado}.svg`] = sinalSVG(estado);

for (const [nome, svg] of Object.entries(arquivos)) {
  await writeFile(join(out, nome), svg);
  console.log('✓', join('docs', 'sinalizacao', nome));
}
