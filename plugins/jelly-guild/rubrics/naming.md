# Rubric: naming

## Scope

Score the artifact's identifier, file, and directory names for
semantic meaning, sibling consistency, and public-surface clarity.
Architecture-shaped; applies regardless of language.

The mode file at `plugins/jelly-guild/modes/domains/naming.md` is
the prose form of this same content. The two are manually synced
in v1; if you find drift, the mode is canonical.

Naming is architecture; treat naming findings with the same
weight as composition or abstraction findings, not as "nits."

## Criteria

1. **Names describe meaning, not appearance.** PASS: identifiers
   express what the thing IS or DOES. FAIL: identifiers describe
   visual or positional appearance (`BlueButton`, `BigCard`,
   `LeftPanel`) such that a theme or layout change would
   invalidate the name.

2. **Vocabulary is consistent across siblings.** PASS: the
   codebase uses ONE term per concept; new identifiers respect
   the existing vocabulary. FAIL: the diff introduces a new term
   (`Popup`) for a concept that already has a term in use
   (`Modal`); or `delete` / `remove` used interchangeably for the
   same operation.

3. **Booleans use predicate form.** PASS: boolean props,
   variables, and return types use `is`/`has`/`can`/`should`/`does`
   prefixes. FAIL: boolean named as a noun or ambiguous adjective
   (`loading`, `error`, `disabled` where it could be a state
   object).

4. **No type-in-identifier (Hungarian notation).** PASS:
   identifiers express the concept, not the type. FAIL: prefixes
   like `s`, `i`, `arr`, `obj` encode the type in the name
   (`sUserName`, `iCount`, `arrItems`, `objConfig`).

5. **Public-API surfaces avoid abbreviations.** PASS: exported
   identifiers and prop names spell out concepts; local-scope
   abbreviations are allowed where private. FAIL: a public prop
   name, exported function, or directory name uses an
   abbreviation that the consumer has to expand (`ctx`, `btn`,
   `cfg`, `val` at the public surface).

6. **No implementation leak in identifier.** PASS: the name
   describes the concept, not the library implementing it. FAIL:
   the identifier names a swappable implementation
   (`CodeMirrorEditor` for a code editor primitive,
   `mixpanel.track` for an analytics call,
   `useSWRUser` for a generic data fetch).

7. **File and directory names match sibling conventions.** PASS:
   new files in an existing directory family follow that
   family's naming convention (`kebab-case.ts`, `PascalCase.tsx`,
   `snake_case.py` — whatever is local). FAIL: a new file
   diverges from the sibling convention without a documented
   reason.

8. **No name collision across concepts.** PASS: each identifier
   in the codebase refers to one concept; readers do not need
   context to disambiguate. FAIL: the same name (`User`,
   `Service`, `Client`) refers to multiple unrelated concepts
   such that grep + read is required to know which one is meant.

9. **Names are clear, not clever.** PASS: a reader unfamiliar
   with the codebase can guess the name's meaning from the
   identifier alone. FAIL: the name uses metaphor, in-joke, or
   wordplay that requires context to decode (`phoenixRise`,
   `valhalla`).

## Severity

- **Blocking** (gate the unit): criteria 1, 2, 5, 6, 7, 8 when
  the diff itself introduces the antipattern OR renames an
  identifier away from the convention (FROM semantic TO literal,
  FROM consistent TO divergent). Criterion 3 for NEW boolean
  props or variables. Criterion 4 always blocking when
  introduced.
- **Advisory** (flag but do not gate): criteria 1, 2, 3, 5, 6
  when the antipattern already exists in the codebase and the
  diff merely sits adjacent without worsening it. Criterion 6
  when the implementation choice is load-bearing. Criterion 9
  default-advisory; clever names sometimes survive review.

Diff-only worsening is the standard for advisory-vs-blocking.

## Evidence shape

For each finding, cite:

- **Path** to the file and the specific identifier (and line
  number).
- **Pattern name** from the catalog (e.g. "visual-literal
  naming", "vocabulary inconsistency", "Hungarian notation",
  "implementation leak").
- **Why it fires** in one sentence — the concrete symptom
  (e.g. "this name encodes the color the design system might
  change next quarter").
- **Proposed name** when one is obvious, otherwise the property
  the name should have (e.g. "rename to a semantic equivalent
  that survives a theme change").
- For criterion 2 (vocabulary inconsistency): cite the existing
  term being competed with (e.g. "the codebase uses `Modal`
  elsewhere — `app/components/Modal.tsx`, ten other usages").

Good evidence is "this name says X, the codebase says Y; pick
one." Not "naming matters." Cite the existing convention, name
the deviation, propose the alignment.
