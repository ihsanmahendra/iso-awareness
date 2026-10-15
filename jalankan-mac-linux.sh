#!/usr/bin/env bash
# Jalankan aplikasi ISO Awareness di macOS / Linux.
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js belum terpasang. Unduh versi LTS dari https://nodejs.org lalu jalankan skrip ini lagi."
  exit 1
fi
if ! node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)"; then
  echo "Versi Node.js terlalu lama ($(node -v)). Pasang versi LTS terbaru dari https://nodejs.org."
  exit 1
fi
if [ ! -d node_modules ]; then
  echo "Memasang komponen aplikasi, tunggu sebentar..."
  npm install || { echo "Gagal memasang komponen. Periksa koneksi internet."; exit 1; }
fi

PORT="${PORT:-3000}"
echo
echo "=========================================================="
echo "  Aplikasi ISO Awareness BERJALAN"
echo "  Peserta : http://localhost:$PORT"
echo "  Admin   : http://localhost:$PORT/admin"
echo "  Tekan Ctrl+C untuk menghentikan."
echo "=========================================================="
echo
( sleep 3; (command -v open >/dev/null && open "http://localhost:$PORT") || (command -v xdg-open >/dev/null && xdg-open "http://localhost:$PORT") ) >/dev/null 2>&1 &
exec npm start
