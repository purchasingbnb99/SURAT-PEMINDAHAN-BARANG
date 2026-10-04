@echo off
cd /d "%~dp0"
echo Starting SURAT PEMINDAHAN BARANG on http://127.0.0.1:5510
npx http-server . -p 5510 -c-1
pause
