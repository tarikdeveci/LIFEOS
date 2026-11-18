#!/usr/bin/env bash
# Mobil E2E takımı (tests/maestro). Her yayın öncesi koşulur: docs/rules/WORKFLOW.md kapı 6.
#
#   pnpm e2e:mobile                 # dev client, Metro 8081'de açık olmalı
#   pnpm e2e:mobile -- --release    # cihazdaki release/preview build ile
#   pnpm e2e:mobile -- gorevler     # tek akış (tests/maestro/gorevler.yaml)
#
# Akışlar canlı Supabase'de misafir hesap açar; misafirler 30 gün sonra silinir.
set -euo pipefail

cd "$(dirname "$0")/.."

dev_client=true
flows=()
for arg in "$@"; do
  case "$arg" in
    --) ;;
    --release) dev_client=false ;;
    -*) echo "Bilinmeyen seçenek: $arg" >&2; exit 2 ;;
    *) flows+=("tests/maestro/${arg%.yaml}.yaml") ;;
  esac
done
[ ${#flows[@]} -eq 0 ] && flows=(tests/maestro)

adb_bin="adb"
if ! command -v adb >/dev/null 2>&1; then
  for sdk in "${ANDROID_HOME:-}" "${LOCALAPPDATA:-}/Android/Sdk" "$HOME/Library/Android/sdk" "$HOME/Android/Sdk"; do
    if [ -n "$sdk" ] && [ -x "$sdk/platform-tools/adb" -o -x "$sdk/platform-tools/adb.exe" ]; then
      adb_bin="$sdk/platform-tools/adb"
      break
    fi
  done
fi
maestro_bin="maestro"
command -v maestro >/dev/null 2>&1 || maestro_bin="$HOME/.maestro/maestro/bin/maestro"

if ! "$adb_bin" get-state >/dev/null 2>&1; then
  echo "Bağlı Android cihaz ya da emülatör yok." >&2
  exit 1
fi

# Her akış uygulama verisini siler: gerçek telefondaki oturum kaybolmasın diye sadece emülatör.
if [ "$("$adb_bin" shell getprop ro.kernel.qemu | tr -d '\r')" != "1" ] && [ "${E2E_ALLOW_DEVICE:-}" != "1" ]; then
  echo "Bağlı cihaz emülatör değil. Akışlar uygulama verisini siler; yine de koşmak için E2E_ALLOW_DEVICE=1." >&2
  exit 1
fi

# Akışlar İngilizce metinlerle yazıldı; cihaz dili Türkçeyse eşleşmez.
locale="$("$adb_bin" shell getprop persist.sys.locale | tr -d '\r')"
case "$locale" in
  en*|"") ;;
  *) echo "Cihaz dili $locale. Akışlar için cihaz dili İngilizce olmalı." >&2; exit 1 ;;
esac

if ! "$adb_bin" shell pm path tr.lifeos.app >/dev/null 2>&1; then
  echo "Cihazda tr.lifeos.app kurulu değil." >&2
  exit 1
fi

if [ "$dev_client" = true ]; then
  if ! curl -sf http://localhost:8081/status >/dev/null; then
    echo "Metro 8081'de çalışmıyor. Önce: cd apps/mobile && npx expo start --dev-client" >&2
    exit 1
  fi
  "$adb_bin" reverse tcp:8081 tcp:8081 >/dev/null
fi

MSYS_NO_PATHCONV=1 "$maestro_bin" test -e DEV_CLIENT="$dev_client" "${flows[@]}"
