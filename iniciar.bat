@echo off
REM Pit Stop na Faixa - inicia sozinho para operacao sem operador.
REM - sobe o servidor local e o reinicia se ele cair
REM - abre o Chrome em tela cheia (quiosque) no modo autonomo (?auto=1)
REM Para iniciar junto com o Windows: atalho deste arquivo em shell:startup
cd /d "%~dp0"

start "Pit Stop - servidor" /min cmd /c "for /l %%i in (0,0,1) do (node server.js & echo Servidor parou, reiniciando em 3 s... & timeout /t 3 /nobreak >nul)"

REM espera o servidor responder
:espera
timeout /t 1 /nobreak >nul
curl -s -o nul http://127.0.0.1:8080/api/health || goto espera

REM Perfil proprio do Chrome: guarda a permissao da camera e da porta USB entre reinicios.
REM Na PRIMEIRA vez, permita a camera e conecte o controlador manualmente (Saida -> Sinal fisico).
start "" chrome --kiosk --user-data-dir="%~dp0.chrome-quiosque" --no-first-run --disable-session-crashed-bubble --autoplay-policy=no-user-gesture-required "http://localhost:8080/?auto=1"
