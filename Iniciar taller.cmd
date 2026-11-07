@echo off
cd /d "%~dp0"
echo Abriendo Taller de Vero en http://127.0.0.1:5173
echo Mantene esta ventana abierta mientras usas el taller.
call npm run dev -- --open
pause
