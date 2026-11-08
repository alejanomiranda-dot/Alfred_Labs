@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Instala Node.js 22.12 o posterior desde https://nodejs.org y volve a abrir este archivo.
 pause
 exit /b 1
)
echo Instalando las dependencias del taller...
call npm ci
if errorlevel 1 (
 echo No se pudo completar la instalacion. Revisa la conexion y la version de Node.js.
 pause
 exit /b 1
)
call npm run forge:check
echo.
echo Preparacion terminada. Abri "Iniciar taller.cmd" para usar el taller.
pause
