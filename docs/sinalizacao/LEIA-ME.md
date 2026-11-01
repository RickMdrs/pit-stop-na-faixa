# Sinalização da saída do corredor — desenho, slides e jogo

Desenho único da proposta de sinalização, baseado nas fotos do local. O **modo história**
(`/historia.html`), os **slides** e o **jogo** usam o mesmo desenho, gerado por
[public/js/planta.js](../../public/js/planta.js). Para regenerar depois de mudar algo: `npm run sinalizacao`.

> Esquema ilustrativo, **sem escala**. As posições finais (sinais, câmera, área de espera)
> precisam ser validadas no local com a equipe de segurança da unidade.

## Arquivos

| Arquivo | Para quê |
|---|---|
| `planta-sinalizacao.svg` / `.png` | **Slide:** planta com os 10 itens numerados e a legenda |
| `planta-sem-legenda.svg` / `.png` | Slide sem textos (para explicar falando) |
| `jogo/cenario.svg` / `.png` | **Jogo:** cenário limpo (sem pessoa nem carros; o jogo desenha os seus) |
| `jogo/cenario-com-zonas.svg` / `.png` | Cenário com as zonas A/B/C marcadas (útil para depurar o jogo) |
| `jogo/cenario-sem-sistema.svg` / `.png` | O local **como é hoje** (sem câmera, sinais, área pintada etc.): Parte 1 do jogo e slide de "antes" |
| `jogo/sinal-apagado`, `-aproximacao`, `-pedido`, `-faixa` (`.svg`/`.png`) | **Jogo e slides:** o sinal ao motorista em cada estado |

Os SVGs são vetoriais: abrem no navegador, no PowerPoint/Google Slides, no Figma e nos motores de jogo
(em Godot/Unity, use o PNG se o motor não importar SVG).

## O que o desenho propõe (legenda)

1. **Câmera no prédio da frente**, olhando para dentro do corredor: numa imagem só, vê o corredor (A), a área de espera (B) e a faixa (C).
2. **Zona A · corredor:** pré-alerta. Os sinais acendem "ATENÇÃO — PEDESTRE SE APROXIMANDO" antes de a pessoa aparecer.
3. **Zona B · área de espera pintada** no fim do corredor, com "PARE · OLHE" no piso. Parar ali já registra o pedido.
4. **Tela do pedestre e botão** nas paredes do fim do corredor.
5. **Sinal ao motorista · sentido →**, antes da faixa e acima dos carros estacionados.
6. **Sinal ao motorista · sentido ←** (a via tem mão dupla).
7. **Espelho convexo** na saída do corredor (funciona mesmo se o sistema falhar).
8. **Iluminação** da saída e da faixa.
9. **Vagas junto à saída** tiram a visão: avaliar a remoção.
10. **Zona C · faixa:** alerta máximo "PEDESTRE NA FAIXA — PARE".

## Para o jogo: coordenadas (imagem 1600 × 900)

| Elemento | Posição (x, y, largura × altura) |
|---|---|
| Corredor | x 710–890, y 0–300 |
| Zona A (corredor) | x 710–890, y 80–300 |
| Zona B (área de espera) | x 716–884, y 304–356 |
| Zona C (faixa) | x 710–890, y 364–656 |
| Via | y 360–660 · linha central y 510 |
| Pista → (de quem vem da esquerda) | carro com topo em y 552 (180 × 68); **para em x 510** (antes da faixa) |
| Pista ← (de quem vem da direita) | carro com topo em y 400 (180 × 68); **para em x 910** (antes da faixa) |
| Sinal para a pista → | poste em (580, 676) |
| Sinal para a pista ← | poste em (1024, 312) |
| Caminho do pedestre | x 800, de cima (corredor) para baixo (calçada da frente, y ≈ 690) |

As coordenadas-base do código estão na metade disso (800 × 450). Ver `PLANTA` em `planta.js`.

## Estados do sinal e regras (iguais ao sistema real)

| Situação no jogo | Sinal ao motorista | Tela do pedestre |
|---|---|---|
| Pessoa no corredor (A) | 🟠 ATENÇÃO — PEDESTRE SE APROXIMANDO | "Pare na área marcada antes da faixa" |
| Pessoa parada na área (B), ou mão levantada, ou botão | 🟠 PEDESTRE PEDIU PASSAGEM — PARE ANTES DA FAIXA | "Pedido recebido! Motoristas avisados" → "ATRAVESSE QUANDO OS VEÍCULOS PARAREM" |
| Pessoa na faixa (C) | 🔴 PEDESTRE NA FAIXA — PARE (pisca rápido) | "Atravessando: continue atento" |
| Ninguém | apagado | instrução: parar, pedir, atravessar quando os veículos pararem |

**Regras que o jogo não pode quebrar** (vêm do documento de planejamento):
- **Nada de verde e nada de "atravesse" sozinho** para o pedestre. O sinal avisa o motorista; quem decide a hora de atravessar é o pedestre, olhando os carros.
- **O pedido não garante a parada:** o jogo deve ter casos em que um carro não para, para ensinar a conferir antes de atravessar.
- **Não premiar rapidez:** a pontuação é por decisão correta, não por tempo.
- **Usar exatamente estes textos e cores** (âmbar = atenção/pedido, vermelho = pessoa na faixa, azul = orientação ao pedestre).

Cores: âmbar `#f5a524`, vermelho `#ef4444`, azul da marca `#1b4f9c` / `#3d7bea`, fundo `#07080a`
(tokens em [public/css/base.css](../../public/css/base.css)).
