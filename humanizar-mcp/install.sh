#!/bin/sh
# Installs humanizar on Linux or macOS and gets ready every agent it finds. Nothing else is needed:
# the binary depends on no runtime or library.
#   curl -fsSL https://raw.githubusercontent.com/marcmayol/drac-plugins/main/humanizar-mcp/install.sh | sh
#
# Optional variables:
#   HUMANIZAR_INSTALL_DIR   where the binary goes (default ~/.local/bin)
#   HUMANIZAR_VERSION       a specific release tag (default below)
#   HUMANIZAR_NO_SETUP=1    only install the binary, don't touch any agent
set -eu

repo="marcmayol/drac-plugins"
tag="${HUMANIZAR_VERSION:-humanizar-v0.3.1}"
dir="${HUMANIZAR_INSTALL_DIR:-$HOME/.local/bin}"
base="https://github.com/$repo/releases/download/$tag"

case "$(uname -s)-$(uname -m)" in
  Linux-x86_64) target=x86_64-unknown-linux-musl ;;
  Linux-aarch64 | Linux-arm64) target=aarch64-unknown-linux-musl ;;
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

if [ -n "${HUMANIZAR_NO_SETUP:-}" ]; then
  echo "Next: $dir/humanizar setup <agent>   (or --all, for every agent on this computer)"
  exit 0
fi
# The agents get the binary's full path, so they find it even if this folder isn't in PATH.
if ! "$dir/humanizar" setup --all; then
  echo "humanizar: some agents couldn't be set up (see above); the others are ready." >&2
fi
echo "An agent you install later: $dir/humanizar setup <agent>"
