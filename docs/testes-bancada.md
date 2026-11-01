# Roteiro de testes de bancada (com pessoas)

Complementa os testes automáticos (`npm test`), que cobrem só a lógica.
**Ambiente controlado, com voluntários, sem nenhum veículo em movimento.**

## Antes de começar

- [ ] Anotar: computador, webcam (modelo e resolução), navegador e versão, iluminação, distância e altura da câmera.
- [ ] Anotar a versão da configuração (canto "Config." do diagnóstico). Ela fica gravada em cada evento.
- [ ] Desenhar e salvar as zonas A/B/C para o enquadramento da bancada.
- [ ] Combinar com os participantes: são gravados só eventos, sem vídeo. Se for gravar vídeo, combinar a finalidade e o prazo.
- [ ] Definir **antes** o que conta como solicitação válida e como falso acionamento (§14).

## Matriz (§15)

Repita cada caso pelo menos 10 vezes. Na tabela de eventos, marque cada ativação como ✓ válida ou ✗ falso acionamento.

| # | Caso | Esperado | Repetições | Ok | Falhas | Observações |
|---|---|---|---|---|---|---|
| 1 | Pessoa em B sem levantar o braço | Solicitação por presença | | | | |
| 2 | Pessoa em B levanta o braço esquerdo, depois o direito | Uma solicitação por gesto, sem duplicar | | | | |
| 3 | Gesto fora de B (em A ou fora das zonas) | Sem solicitação ("gesto fora da zona") | | | | |
| 4 | Pessoa passa em A e desvia | Aproximação, sem solicitação | | | | |
| 5 | Pessoa entra em C sem gesto | Advertência ativa (faixa ocupada) | | | | |
| 6 | Pessoa parada em C por 30 s | Advertência mantida | | | | |
| 7 | Duas pessoas: uma sai, outra fica em C | Não encerra | | | | |
| 8 | Pessoa sentada / parte do corpo oculta | Registrar se detecta; botão como alternativa | | | | |
| 9 | Mão no rosto, coçar a cabeça, aceno | Registrar falsos positivos de gesto | | | | |
| 10 | Pessoa some por menos de 0,7 s (passa atrás de um objeto) | Sinal não pisca | | | | |
| 11 | Desconectar a webcam com o sistema rodando | FALHA explícita | | | | |
| 12 | Desconectar o controlador USB | FALHA de saída identificada | | | | |
| 13 | Wi-Fi desligado | Tudo continua funcionando | | | | |
| 14 | Mover a câmera → clicar em "Câmera foi movida" | FALHA até as zonas serem salvas | | | | |
| 15 | Diferentes alturas, cadeira de rodas, muleta (voluntários representativos) | Registrar detecção por presença | | | | |

## Métricas a registrar (exportar o CSV no final)

- Funcionamento: solicitações válidas que acionaram o sinal / solicitações válidas no ensaio.
- Falsos acionamentos: quantidade por sessão e duração da sessão.
- Latência: mediana, p90, mínimo, máximo e **n** (aparece no painel). Lembrete: ela inclui o tempo de confirmação configurado.
- Continuidade: desligamentos indevidos com alguém ainda em C.
- Sempre apresentar denominadores, nunca só percentuais.

## Resultados

| Data | Configuração | Equipamento | Caso(s) | Resultado | Responsável |
|---|---|---|---|---|---|
| | | | | | |
