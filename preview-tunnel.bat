@echo off
REM Como dev-tunnel.bat, pero sirve el build de produccion (sin hot-reload
REM de Vite) en vez del servidor de desarrollo. Sirve para descartar si un
REM problema que aparece en el celular es cosa del modo dev (HMR por
REM websocket, mas fragil sobre un tunel) o pasa igual en produccion.

cd /d "%~dp0"

echo.
echo Compilando build de produccion...
call npm run build
if errorlevel 1 (
  echo El build fallo, revisa el error de arriba.
  pause
  exit /b 1
)

echo.
echo Arrancando preview + tunel publico...
echo.

start "Visagio Preview Server" cmd /k npm run preview -- --port 4173

echo Esperando a que el servidor local levante...
timeout /t 4 /nobreak >nul

echo.
echo Abriendo el tunel. Mas abajo va a aparecer una URL terminada en
echo ".trycloudflare.com" - esa es la que abris en el navegador del celular.
echo.

cloudflared tunnel --url http://localhost:4173

echo.
echo Tunel cerrado. Acorda cerrar tambien la ventana "Visagio Preview Server".
pause
