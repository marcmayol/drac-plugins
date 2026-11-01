#!/bin/sh
# Installs the humanizar binary on Linux or macOS. It doesn't touch any agent: run
# `humanizar setup <agent>` afterwards.
#   curl -fsSL https://raw.githubusercontent.com/marcmayol/drac-plugins/main/humanizar-mcp/install.sh | sh
#
# Optional variables:
#   HUMANIZAR_INSTALL_DIR   where the binary goes (default ~/.local/bin)
#   HUMANIZAR_VERSION       a specific release tag (default below)
set -eu

repo="marcmayol/drac-plugins"
tag="${HUMANIZAR_VERSION:-humanizar-v0.3.0}"
dir="${HUMANIZAR_INSTALL_DIR:-$HOME/.local/bin}"
base="https://github.com/$repo/releases/download/$tag"

case "$(uname -s)-$(uname -m)" in
  Linux-x86_64) target=x86_64-unknown-linux-gnu ;;
  Linux-aarch64 | Linux-arm64) target=aarch64-unknown-linux-gnu ;;
  Darwin-arm64) target=aarch64-apple-darwin ;;
  Darwin-x86_64) target=x86_64-apple-darwin ;;
  *)
    echo "humanizar: no prebuilt binary for $(uname -s) $(uname -m); build it with: cargo install --git https://github.com/$repo humanizar" >&2
    exit 1
    ;;
esac

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
paquete="humanizar-$target.tar.gz"
echo "Downloading $paquete..."
curl -fsSL "$base/$paquete" -o "$tmp/$paquete"
curl -fsSL "$base/SHA256SUMS" -o "$tmp/SHA256SUMS"

# The checksum must match before anything is installed.
esperada="$(grep " $paquete\$" "$tmp/SHA256SUMS" | cut -d' ' -f1)"
if command -v sha256sum >/dev/null 2>&1; then
  real="$(sha256sum "$tmp/$paquete" | cut -d' ' -f1)"
else
  real="$(shasum -a 256 "$tmp/$paquete" | cut -d' ' -f1)"
fi
if [ -z "$esperada" ] || [ "$esperada" != "$real" ]; then
  echo "humanizar: the SHA-256 checksum of $paquete doesn't match; nothing was installed." >&2
  exit 1
fi

tar -xzf "$tmp/$paquete" -C "$tmp"
mkdir -p "$dir"
mv "$tmp/humanizar" "$dir/humanizar"
chmod +x "$dir/humanizar"
echo "Installed: $dir/humanizar ($("$dir/humanizar" --version))"
echo "Next: $dir/humanizar setup <agent>   (or --all, for every agent on this computer)"
