# 0013. Box store access: two-token credential routing + bootstrap contract

- **Status**: accepted (credential routing VALIDATED live; bootstrap gaps
  identified — see § Correction: the `/etc/profile.d` fix for gap 1 was
  itself wrong and is superseded by moving the clone to the coder
  `coder_agent`'s `startup_script`)
- **Scope**: Phase 4/dispatch — a coder box reaching the external store

## Context

A `--env=coder` dispatched box (Patreon `ec2-rdev`) must reach the loom
project store in the **personal** repo `krambuhl/projects` (decision 0009)
to resolve a slug and push artifacts back — while keeping the box's
existing access to `Patreon/*` repos, which authenticates with a GitHub
**App user token** (`ghu_`) scoped to the Patreon org's App installation.
That App token cannot see `krambuhl/projects` (the App isn't installed on
the personal account → `403` / `Could not resolve to a Repository`). The
box also carries a personal PAT in the `GITHUB_PERSONAL_PAT` env var that
*can* reach the store. Both repos are on `github.com`, so naive
credential config clobbers one to serve the other.

## Decision

**Two tokens, path-scoped, PAT read from the env at fetch time.** The box
bootstrap installs a git credential helper matched to the store's exact
URL path, leaving every other `github.com` URL on the App token:

```bash
URL=https://github.com/krambuhl/projects
git config --global credential.useHttpPath true
git config --global --unset-all "credential.${URL}.helper" 2>/dev/null || true
git config --global --add "credential.${URL}.helper" ""            # reset inherited helpers for THIS path
# shellcheck disable=SC2016 — single quotes are load-bearing (see below)
git config --global --add "credential.${URL}.helper" \
  '!f() { echo username=x-access-token; echo "password=${GITHUB_PERSONAL_PAT}"; }; f'
```

Load-bearing properties:

- **Path scoping, not a global swap.** `useHttpPath true` + a helper keyed
  to `credential.https://github.com/krambuhl/projects` routes the PAT to
  the store *only*; all other github.com URLs fall through to the App
  token. Swapping the global helper or setting a global token is
  **rejected** — it clobbers `Patreon/*`.
- **The empty first helper is a reset.** Credential helpers accumulate;
  the leading `""` entry clears the inherited App-token helper for this
  exact path before the PAT helper is added, so only the PAT helper fires
  for the store.
- **The PAT never lands in a file.** The helper string is stored verbatim;
  `${GITHUB_PERSONAL_PAT}` expands from the environment when git *runs*
  the helper, not when `git config` writes it. Single quotes are mandatory
  (double quotes would bake the token into `~/.gitconfig` — shellcheck
  SC2016 flags this, but it is exactly the behavior we want; suppress it).

**VALIDATED live** (fresh `ec2-rdev` box, `2026-07-01`): in one box a
`git clone` of `krambuhl/projects` succeeded via the PAT path **and** a
`git clone` of `Patreon/patreon_react_features` succeeded via the App
token — path scoping held, neither clobbered the other, and
`git config --get-all` of the helper showed the literal
`${GITHUB_PERSONAL_PAT}` placeholder (no token in the config). The
credential design is correct and safe.

## The box bootstrap contract (gaps this validation surfaced)

Credential routing is necessary but **not sufficient**. The same run found
the box otherwise half-provisioned; a dispatch-ready box must also:

1. **Pull the store to disk.** Routing the credential does not clone the
   repo. Bootstrap must `git clone/pull krambuhl/projects → ~/projects`
   (over the PAT path) and set
   `LOOM_PROJECTS_ROOT=~/projects/<workspace>/projects` (the two-level
   leaf — the real repo nests slugs under a per-workspace grouping folder,
   e.g. `patreon-patreon-react-features/projects/`). Without the clone,
   `loom project list` finds nothing and `/ev-run` has no store to resolve
   against.
2. **Put the plugin CLIs on PATH.** The `/ev-run` skill body invokes
   `ev`/`loom` as **bare commands** (enforced by the V11
   `skill-bodies-call-bare-commands` test, on the assumption that plugin
   install exposes the bin shims on PATH). The box had the plugins
   installed but the shims *not* on PATH, so a dispatched `/ev-run` would
   fail at its first `ev env which` / `loom project read`. Bootstrap must
   symlink `~/agents/plugins/<p>/bin/<p>` into a PATH dir for
   `ev`/`loom`/`guild`/`griot`.
3. **~~Persist env for the login-shell dispatch via `/etc/profile.d`~~ —
   SUPERSEDED, see § Correction below.** `/etc/profile.d/*.sh` is only
   sourced by a **bash** login shell reading `/etc/profile`; it is not
   sourced by an interactive `zsh` login (the box's default shell), and a
   live run found the dispatch's own `bash -lc "…"` also failed to pick it
   up. Do not rely on `profile.d` for this — see the correction.
4. **`cd` to the store.** The dispatch template's working dir is
   `~/projects` (the store), not `~/agents` (the substrate checkout) and
   not a mis-named product path. The store is where a dispatched run's
   project artifacts commit; `LOOM_PROJECTS_ROOT` (not cwd) resolves the
   slug. *(Where product-code phases edit — work repo vs store — is a
   separate unsettled design point, not decided here.)*

## Consequences

- The credential half is done and portable: any box with
  `GITHUB_PERSONAL_PAT` set can reach the personal store without
  disturbing org access, via an idempotent, secret-safe bootstrap block.
- The round-trip (D) remains blocked only on the bootstrap gaps above
  (store clone + CLIs on PATH), not on credentials or the seam. Closing
  those should turn C/D green.
- **Watch for** a box that routes the credential but never clones the
  store (this run's failure) — cred success is not store presence. And a
  dispatch that silently `cd`s to the wrong tree, committing artifacts
  into `~/agents` instead of the store.

## Correction (2026-07-02): `/etc/profile.d` is the wrong hook — supersedes the earlier PAT-timing theory

A follow-up fix moved the store clone from `install.sh`'s main body into
`/etc/profile.d/loom-store.sh`, reasoning that `GITHUB_PERSONAL_PAT`
wasn't visible at `install.sh`'s (build-time) execution and would be
visible by the time any shell logged in. **That diagnosis was itself
wrong.** A live run on a rebuilt image proved:

- The PAT **is** present at first login (`echo ${GITHUB_PERSONAL_PAT:+present}`
  → `present`, confirmed directly in an interactive session).
- The `[loom-store]` diagnostic line **never printed at all** — not "PAT
  visible: NO", just absent — because **the hook never ran**:
  - The box's interactive login shell is **`zsh`**, and `/etc/profile.d/*.sh`
    is a **bash**-only convention (sourced via `/etc/profile`, which zsh's
    login sequence does not read). The store clone silently never fired
    on `coder ssh` alone.
  - The dispatch path's own `bash -lc "…"` — which *should* force a login
    shell regardless of default shell — **also** came back with
    `LOOM_PROJECTS_ROOT` `UNSET` and a stray `bash: -c: option requires an
    argument` error, suggesting the multi-word command string is getting
    mangled somewhere in the `coder ssh <target> -- bash -lc "…"` exec
    path (a distinct, still-open question — not yet root-caused; do not
    assume fixing the interactive case also fixes dispatch without
    re-verifying).

So the PAT-timing/build-vs-runtime theory (§ above, and the original
"move the clone to first login" fix) was solving the wrong problem — the
PAT was never the blocker on this build; the hook simply never executed,
under either shell path.

**Corrected fix:** move the store clone (and the `PATH`/
`LOOM_PROJECTS_ROOT` exports) out of `/etc/profile.d` entirely and into
the Coder **agent's `startup_script`** (the `coder_agent` Terraform
resource) — shell-agnostic (runs once at agent boot, independent of the
user's login shell), and secrets are already resolved by the time it
runs. This is a template-layer change; nothing in `krambuhl/agents`
changes as a result. Re-verify the dispatch-path quoting question above
independently once this lands — it may be a second, unrelated defect
masked by the same symptom.

## Forward pointers

- **Bootstrap helper.** Steps 1–4 plus the credential block are a
  reusable, generic `box-bootstrap` (ADR-0011's "Bootstrapping the
  workspace contract" pointer); today they live in the operator's coder
  `install.sh`. A shipped helper would let `install.sh` source it instead
  of hand-maintaining the lines.
- **Product-repo working dir.** Settle where code phases edit (work repo)
  vs where artifacts commit (store) — likely a per-project manifest field
  declaring the target repo, so the dispatch cwd stops being load-bearing.
