@echo off
REM Levanta el servidor de desarrollo + un tunel publico de Cloudflare,
REM para probar la app desde el celular sin depender de la red WiFi local
REM (util si el router aisla los dispositivos entre si).
REM Requiere tener instalado cloudflared (winget install Cloudflare.cloudflared).

cd /d "%~dp0"

echo.
echo Arrancando Visagio + tunel publico...
echo.

start "Visagio Dev Server" cmd /k npm run dev

echo Esperando a que el servidor local levante...
timeout /t 4 /nobreak >nul

echo.
echo Abriendo el tunel. Mas abajo va a aparecer una URL terminada en
echo ".trycloudflare.com" - esa es la que abris en el navegador del celular.
echo Cambia cada vez que corres este script.
echo.

cloudflared tunnel --url http://localhost:5173

echo.
echo Tunel cerrado. Acorda cerrar tambien la ventana "Visagio Dev Server".
pause
