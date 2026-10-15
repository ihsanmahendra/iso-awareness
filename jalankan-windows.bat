@echo off
title ISO Awareness
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto nonode
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)"
if errorlevel 1 goto oldnode

node -e "const d=Object.keys(require('./package.json').dependencies);for(const x of d)require.resolve(x)" >nul 2>nul
if not errorlevel 1 goto run
echo Memasang komponen aplikasi, tunggu sebentar...
call npm install
if errorlevel 1 goto installfail

:run
echo.
echo ==========================================================
echo   Aplikasi ISO Awareness BERJALAN
echo   Peserta : http://localhost:3000
echo   Admin   : http://localhost:3000/admin
echo   JANGAN tutup jendela ini selama aplikasi dipakai.
echo ==========================================================
echo.
start "" cmd /c "timeout /t 3 >nul & start http://localhost:3000"
call npm start
pause
exit /b 0

:nonode
echo Node.js belum terpasang di komputer ini.
echo Browser akan membuka https://nodejs.org - unduh versi LTS, pasang, lalu jalankan file ini lagi.
start "" https://nodejs.org
pause
exit /b 1

:oldnode
echo Versi Node.js terlalu lama. Pasang versi LTS terbaru dari https://nodejs.org lalu jalankan file ini lagi.
start "" https://nodejs.org
pause
exit /b 1

:installfail
echo Gagal memasang komponen. Periksa koneksi internet lalu coba lagi.
pause
exit /b 1
