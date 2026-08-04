@echo off
REM Levanta el servidor de desarrollo expuesto en la red local,
REM para poder abrir la app desde el celular mientras se prueba.
REM PC y celular tienen que estar en la MISMA red WiFi.

cd /d "%~dp0"

echo.
echo Arrancando Visagio en modo dev, accesible desde la red local...
echo Buscá la linea "Network:" mas abajo y abrila en el navegador del celular.
echo Si Windows pregunta por el Firewall, permiti el acceso en redes PRIVADAS.
echo.

call npm run dev -- --host

pause
