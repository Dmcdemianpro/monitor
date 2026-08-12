@echo off
setlocal enabledelayedexpansion

rem ===================================================================
rem  Supervisor provisional de Moni-D para Windows.
rem
rem  Relanza el backend cuando termina. Es lo que completa el watchdog:
rem  la app se termina sola cuando el monitoreo deja de avanzar, pero sin
rem  algo que la levante eso solo la dejaria muerta.
rem
rem  TEMPORAL: al migrar al servidor Linux esto lo reemplaza systemd con
rem  Restart=always (ver DEPLOY.md) y este archivo se borra.
rem
rem  Uso:  cerrar el 'npm run dev' que este corriendo y ejecutar este .bat
rem ===================================================================

cd /d "%~dp0"

rem Corre dist\ y no tsx watch: en algo que vigila 21 nodos, un watcher que
rem reinicia ante cualquier cambio de archivo es un modo de falla, no una
rem comodidad.
if not exist "dist\index.js" (
  echo.
  echo [ERROR] No existe dist\index.js
  echo Compila primero:  npm run build
  echo.
  pause
  exit /b 1
)

if not exist "logs" mkdir "logs"
set "LOGFILE=logs\moni-d.log"
set /a ARRANQUES_FALLIDOS=0

echo Supervisando Moni-D. Log: %LOGFILE%
echo Cierra esta ventana para detenerlo.
echo.

:bucle

for /f "delims=" %%T in ('powershell -NoProfile -Command "Get-Date -Format \"yyyy-MM-dd HH:mm:ss\""') do set "TS=%%T"
for /f "delims=" %%S in ('powershell -NoProfile -Command "[DateTimeOffset]::UtcNow.ToUnixTimeSeconds()"') do set "T0=%%S"

echo [!TS!] --- iniciando moni-d ---
echo [!TS!] --- iniciando moni-d --->> "%LOGFILE%"

node dist\index.js >> "%LOGFILE%" 2>&1
set "CODIGO=!errorlevel!"

for /f "delims=" %%T in ('powershell -NoProfile -Command "Get-Date -Format \"yyyy-MM-dd HH:mm:ss\""') do set "TS=%%T"
for /f "delims=" %%S in ('powershell -NoProfile -Command "[DateTimeOffset]::UtcNow.ToUnixTimeSeconds()"') do set "T1=%%S"
set /a DURACION=T1-T0

echo [!TS!] termino con codigo !CODIGO! tras !DURACION!s
echo [!TS!] termino con codigo !CODIGO! tras !DURACION!s>> "%LOGFILE%"

rem Un arranque cuenta como estable recien tras 60s en pie. Si muere antes,
rem la causa es persistente (base caida, .env mal configurado) y reintentar
rem rapido solo llena el log sin arreglar nada: se espacia la espera.
if !DURACION! lss 60 (
  set /a ARRANQUES_FALLIDOS+=1
) else (
  set /a ARRANQUES_FALLIDOS=0
)

if !ARRANQUES_FALLIDOS! geq 5 (
  set /a ESPERA=300
) else if !ARRANQUES_FALLIDOS! geq 3 (
  set /a ESPERA=60
) else (
  set /a ESPERA=5
)

if !ARRANQUES_FALLIDOS! geq 3 (
  echo [!TS!] !ARRANQUES_FALLIDOS! arranques fallidos seguidos. Revisa el log.
  echo [!TS!] !ARRANQUES_FALLIDOS! arranques fallidos seguidos.>> "%LOGFILE%"
)

echo [!TS!] reiniciando en !ESPERA!s...
echo.

rem Start-Sleep y no 'timeout /t': timeout aborta con "no es compatible la
rem redireccion de entradas" si stdin no es una consola, y entonces la espera
rem se saltea y el bucle gira sin pausa, que es justo lo contrario del backoff.
powershell -NoProfile -Command "Start-Sleep -Seconds !ESPERA!"

goto bucle
