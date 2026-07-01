#!/usr/bin/env bash
#
# coder-workspace-bootstrap.sh — make a fresh coder (ec2-rdev) workspace satisfy
# the ADR-0011 dispatch-mode "workspace contract": the substrate plugin CLIs on
# PATH, the loom project store on disk, and git wired so that
# `/ev-run <slug> --env=coder` can resolve slugs against the store and push
# artifacts back to it.
#
# Implements ADR-0011's "Bootstrapping the workspace contract" forward pointer,
# and Phase 4 (external repo + git-as-sync) of
# projects/2026-06-30-distributed-project-store. Run once inside a fresh
# dev-container workspace (user `dev`).
#
# Prerequisite: $GITHUB_PERSONAL_PAT is present in the environment — a
# fine-grained PAT with read/write to krambuhl/projects. The workspace's default
# GitHub App token (ghu_, scoped to the Patreon org installation) cannot see
# personal repos, so the personal store needs its own credential. The routing
# below is path-scoped and was verified NOT to disturb Patreon/* App-token
# access in the same box.

set -euo pipefail

# 1. Credential routing — PAT for the personal store only; Patreon/* keeps the
#    App token. `useHttpPath` makes the helper match this repo path specifically,
#    so the global github.com helper is left untouched. The helper stores the
#    LITERAL ${GITHUB_PERSONAL_PAT} placeholder (single-quoted): the secret is
#    read from the environment at git-invocation time, never written into
#    ~/.gitconfig. The empty `--add ""` first resets any prior helper for this key.
URL=https://github.com/krambuhl/projects
git config --global credential.useHttpPath true
git config --global --unset-all "credential.${URL}.helper" 2>/dev/null || true
git config --global --add "credential.${URL}.helper" ""
# shellcheck disable=SC2016
git config --global --add "credential.${URL}.helper" \
  '!f() { echo username=x-access-token; echo "password=${GITHUB_PERSONAL_PAT}"; }; f'

# 2. Store on disk. Full clone (not --depth 1) so origin/HEAD tracking exists —
#    loom's push-back needs it. Must run AFTER step 1, or the clone 403s.
if [ -d "$HOME/projects/.git" ]; then
  git -C "$HOME/projects" pull --ff-only
else
  git clone "$URL" "$HOME/projects"
fi

# 3. Plugin CLIs on PATH. Skills invoke BARE `loom`/`ev`/`guild`/`griot`, so the
#    plugin-shipped bins must resolve from any cwd a `bash -lc` dispatch lands in.
#    Symlink source is the marketplace checkout: stable and hash-free. NOT the
#    plugins/cache/<plugin>/<hash>/ copy (the hash rotates on every plugin
#    upgrade → dangling link), and NOT ~/agents (does not exist in the box).
CLAUDE_PLUGINS="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/plugins/marketplaces/krambuhl/plugins"
mkdir -p "$HOME/.local/bin"
for p in ev loom guild griot; do
  ln -sf "$CLAUDE_PLUGINS/$p/bin/$p" "$HOME/.local/bin/$p"
done

# 4. Git identity so store commits are attributable.
git config --global user.name  "eevee kreevee"
git config --global user.email "ekrambuhl@patreon.com"

# 5. Persist PATH + store root for every `bash -lc` (login-shell) dispatch — the
#    dispatch template runs `bash -lc`, which sources /etc/profile.d/*.sh.
#    TODO: LOOM_PROJECTS_ROOT hardcodes the patreon-patreon-react-features
#    namespace. A box reused for a different working repo needs this derived per
#    dispatch rather than baked into a global profile.d entry.
sudo tee /etc/profile.d/loom-store.sh >/dev/null <<'EOF'
export PATH="$HOME/.local/bin:$PATH"
export LOOM_PROJECTS_ROOT="$HOME/projects/patreon-patreon-react-features/projects"
EOF
