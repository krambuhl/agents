# Domain: naming

## Scope

The names of identifiers, files, directories, and concepts.
Specifically: whether names describe what something MEANS rather
than what it LOOKS LIKE, whether siblings use a consistent
vocabulary, and whether the public-API surface reads as a coherent
language. Architecture-shaped: applies regardless of language.

Naming is architecture. The cost of a bad name compounds across
every caller that has to read it and every refactor that has to
preserve it. Find cohesion always.

## Concerns

- **Semantic over literal.** Names describe meaning, not
  appearance. `PrimaryButton` over `BlueButton`. `FeatureCard` over
  `BigCard`. The visual presentation can change; the meaning is
  what callers depend on.
- **Vocabulary cohesion across siblings.** The same concept gets
  ONE name in the codebase, not three. `modal` / `dialog` / `popup`
  used interchangeably is a smell; pick one.
- **Predicate form for booleans.** `isLoading` over `loading`.
  `hasErrors` over `errors` (when it's a boolean). `canEdit` over
  `editable` (when contextual). Predicate form makes the boolean
  branch visible at the call site.
- **No implementation in identifier.** The name describes what the
  thing IS, not what it's built with. `CodeEditor`, not
  `CodeMirrorEditor`; `analytics.track(...)`, not
  `mixpanel.track(...)`. If the implementation swaps, the name
  shouldn't have to.
- **Public-surface abbreviations earn their keep.** At an API
  surface that external consumers see, abbreviations cost more than
  they save. `ctx`, `val`, `btn` in public function signatures or
  prop names are friction. (Local-variable abbreviations are
  different — those are private to the scope.)
- **File and directory names match sibling conventions.** When a
  directory has 12 files all named `kebab-case.ts`, the 13th
  file's name is `kebab-case.ts` — not `PascalCase.ts` or
  `snake_case.ts`. Conventions for file naming are LOCAL to the
  directory family.

## Antipattern catalog

1. **Visual-literal naming.** A name describes appearance instead
   of meaning. Symptom: `BlueButton`, `BigCard`, `SmallSidebar`,
   `LeftPanel`. A theme change or layout shift breaks the name's
   relationship to reality. Severity: blocking when introduced;
   blocking when an existing name is renamed FROM semantic TO
   literal in the diff.

2. **Vocabulary inconsistency across siblings.** The same concept
   uses multiple terms. Symptom: `Modal`, `Dialog`, and `Popup` all
   in the codebase for what the team treats as the same idea;
   `delete` and `remove` used interchangeably; `user` and
   `account` mixed. Severity: blocking when the diff introduces a
   new term for an existing concept; advisory when the diff sits
   adjacent to existing inconsistency but doesn't worsen it.

3. **Hungarian notation / type in identifier.** The name encodes
   the type. Symptom: `sUserName` (string), `iCount` (integer),
   `arrItems` (array), `objConfig` (object). The type system or
   reading the source two lines up already tells you the type;
   the prefix is noise. Severity: blocking when introduced.

4. **Non-predicate booleans.** A boolean named as a noun or
   ambiguous adjective. Symptom: `props.loading` (is it the
   boolean "currently loading" or a "loading state object"?);
   `props.error` (the error object, or whether there is one?).
   Severity: blocking for new boolean props; advisory for
   inherited convention that the diff merely sits adjacent to.

5. **Abbreviations at public-API surfaces.** A public function,
   prop, or exported identifier uses an abbreviation that the
   consumer has to mentally expand. Symptom: `useCtx`,
   `<Btn onClk>`, `cfg.val`. Severity: blocking when introduced;
   acceptable inside a single file's local scope.

6. **Implementation-leaking identifier.** The name encodes the
   underlying library or detail. Symptom: `CodeMirrorEditor`,
   `mixpanel.track`, `useSWRUser`. When the library swaps, every
   caller's name has to change. Severity: blocking when the
   implementation is itself replaceable (we might swap CodeMirror
   for Monaco); advisory when the implementation choice is
   load-bearing and unlikely to change (e.g. `useReactQueryClient`
   where the substrate IS React Query).

7. **File or directory name diverges from sibling convention.**
   A new file in a `kebab-case` directory uses `PascalCase`, or a
   new directory in a `<noun>/<noun>/` family uses
   `<adjective>-<noun>`. Severity: blocking — naming consistency
   across siblings IS the architecture; one-off divergence costs
   compounding friction.

8. **Same name for different concepts.** Two unrelated things in
   the codebase share a name and the reader has to disambiguate
   from context. Symptom: `User` is both the database row type
   and the rendered-card component; `Service` is both a backend
   service class and a frontend HTTP wrapper. Severity: blocking
   when introduced.

9. **Clever over clear.** A name shows off the author's wit at
   the reader's expense. Symptom: `phoenixRise` (it's a function
   that retries after failure), `valhalla` (it's a long-term
   archive). Severity: advisory — clever names occasionally
   survive when the metaphor is genuinely useful, but the bar is
   high.

## Good patterns

- **Semantic over literal.** `PrimaryButton`, `FeatureCard`,
  `NavigationSidebar`. Survives theme + layout shifts.
- **Consistent sibling vocabulary.** One term per concept across
  the codebase. Glossary in `docs/` if the team is large.
- **Predicate booleans.** `isX`, `hasY`, `canZ`, `shouldQ`,
  `doesN`. Reads at the call site as a branch condition.
- **Concept-not-implementation naming.** `analytics.track(...)`,
  `CodeEditor`, `useUserData`. The implementation can swap; the
  name doesn't have to.
- **Names that survive refactor.** The unit's name still fits
  after a non-behavioral rewrite. If a behavioral change would
  force a rename, the rename is part of the change; if a pure
  rewrite forces a rename, the original name encoded the
  implementation.
- **Local file conventions matched.** New files in an existing
  directory family use that directory's naming convention. The
  convention is local; what matters is sibling cohesion, not
  global uniformity.

## Vocabulary

Use this vocabulary when describing naming findings:

- **semantic name** — describes meaning (`PrimaryButton`)
- **literal name** — describes appearance (`BlueButton`)
- **vocabulary cohesion** — the property of using one term per
  concept across siblings
- **predicate form** — boolean named as an `is`/`has`/`can`
  question
- **implementation leak** — a name that encodes the underlying
  library or detail
- **public surface** — the API consumers see (component props,
  exported function signatures, file paths)
- **sibling convention** — the naming pattern shared by adjacent
  files in the same directory family

## Cross-domain notes

- Overlaps with **composition**: composable primitives need clear
  individual names. A primitive that's hard to name probably
  covers too many concerns.
- Overlaps with **abstraction**: a good abstraction has a name
  that survives the use case shifting. If naming the abstraction
  is hard, the abstraction may be premature.
- Less overlap with **test-unit** / **test-integration**: test names
  are their own sub-domain (they should describe the risk being
  defended), but the same semantic-over-literal rule applies.
- Less overlap with **a11y**: a11y is mostly about markup +
  behavior, not identifier naming. (Exception: ARIA attribute
  values are names; they should describe purpose, not
  appearance.)
