# Changelog

## 1.5.0

Route C: the plugin is rebuilt as an **official-slot plugin** for DSH `0.2.0-rc.2`. It no longer replaces
the official workspace client, so it no longer drifts with upstream UI changes.

### Changed — architecture

* `lib/client.js` is now this package's own small browser module (37,185 bytes) that registers into three
  official slots instead of a 303,999-byte modified build of `@deepseek-ai/dsh-client-ui-workspace`:
  * `settings.section` with id `archived-sessions` — the seat the official settings navigation already
    reserved (including its archive icon); the left-list/right-transcript browser lives here.
  * `sidebar.workspaces.session.menu.item` — **View archived transcript** (order 500, shown only for an
    archived row, which the official UI refuses to open) and the red **Delete session** (order 510).
  * `shell.overlay` — the wide transcript dialog and the two-step permanent-deletion confirmation.
* `cordis.patch.yml` no longer disables the official `ui-workspace` row; it only inserts this bundle. The
  official archive/unarchive actions, the archived-row filter, and archived-content search keep working.
* `peerDependencies` are re-pinned to the runtime the plugin is built for. The peer gate compares every
  `@deepseek-ai/dsh-*` peer against the **dsh runtime version**, so `0.2.0-rc.2` is the exact claim and a
  future runtime fails loudly instead of loading an unverified client.

### Changed — archived transcript

* The detail route now reads `sessionQuery.readSurface()` instead of `filterEvents()`, so the Host returns
  the original content blocks (`text` / `reasoning` / `tool-call` / `image` / `file`) instead of one
  flattened string. `filterEvents` joined assistant prose, tool names and raw tool arguments with newlines
  and dropped reasoning entirely — that is where the crowded transcript came from. A backend without
  `readSurface` degrades to the old flattened text and says so in the UI.
* Tool calls render as collapsed cards: the tool name, a one-line summary taken from the arguments'
  `description` / `command` / `path`, the raw arguments (pretty-printed when they are JSON), and the paired
  `tool/result` output. Failed calls are marked as errors.
* Reasoning blocks get their own collapsed card. Loop-owned runtime-context snapshots
  (`source.kind === 'runtime-context'`, with a preamble fallback for older logs) are folded into a
  "system-injected runtime context" card instead of being presented as a user turn.
* Assistant prose renders through the official `ui-primitives` `MarkdownText`; authored user text stays
  literal, so a user's own asterisks and underscores are never reinterpreted as Markdown.
* Role recognition: user turns align right in a filled bubble, assistant turns align left, each with a role
  chip, timestamp, `interrupted` marker and token usage.
* Search counts its matches, scrolls to and outlines the first matching turn, and highlights plain-text
  matches in the transcript and in the list snippets. Same-day messages are separated by a date line.
* Read limits are unchanged in spirit and now per block: 4000 messages, 40 000 characters per prose block,
  20 000 per reasoning block, 8 000 per tool-argument blob, 20 000 per tool result, 4 MiB total.

### Removed

* `compatibility.json` — no upstream client version matrix any more.
* `scripts/build-client-local.mjs` and the 20+ `replaceOnce` anchors of the old `scripts/build-client.mjs`.
  The new composer only wraps `src/client/factory.js` and derives the module id from `package.json#name`.
* All fixture `devDependencies` (11 workspace fixtures, `playwright`), the `clsx` runtime dependency, and
  `pnpm-lock.yaml`.
* `scripts/smoke-ui.mjs` — it drove the removed sidebar archive button. Its non-destructive intent is now
  covered by `_work/verify/verify-client.mjs`; live-UI acceptance is a manual checklist in `AGENTS.md`.
* The test scripts that pointed at a `tests/` directory this repository never had.

### Kept

* `src/host/archive-manager.mjs` (including the archived-transcript reader and its 4000/40,000/4 MiB
  limits), `src/host/delete-session.mjs`, and the four `/plugins/dsh-session-delete/*` routes.
* The wide `min(1120px, 100%)` master/detail layout and its copy-conversation, truncation, restore and
  delete affordances; the task name is still shown before the second confirmation.
* Upstream `dsh-chat-manager` MIT attribution in `LICENSE` and `THIRD_PARTY_NOTICES.md`.

### Verification

* `_work/verify/verify-host.mjs` — 45/45 host assertions pass (block mapping, the injected-snapshot split
  both by marker and by preamble, tool-call/result pairing, per-block clamping, the 4000-message and 4 MiB
  limits, the degraded backend, and the HTTP boundary).
* `_work/verify/verify-client.mjs` — 122/122 browser-half assertions pass (slot ids and orders, locale
  dictionary balance and coverage, hook-order stability across re-renders, the structured transcript
  rendering, search highlighting, clipboard assembly, and the contract that a cancelled confirmation sends
  **no** delete request).
* `_work/verify/verify-package.mjs` — 28/28: the real `evaluatePluginCompatibility` from the installed dsh
  accepts the package, the published file list is complete, and `lib/client.js` rebuilds byte-for-byte.
* `_work/verify/verify-profile.mjs` — 13/13: the profile loader `dsh web` uses composes the installed
  bundle with no skipped bundle while `@deepseek-ai/dsh-web-app` still loads.

## 1.4.1

Documentation and package-metadata release. `lib/client.js` and the host half (`src/`) are unchanged
from 1.4.0, so this version carries an identical bundle.

### Changed

* `package.json` gains an `author` (`windandwood <liangjinzhou22@qq.com>`). `repository`, `bugs` and
  `homepage` deliberately stay unset until this fork has a public source repository of its own.
* `README.md` and `README.en.md` no longer point at upstream's repository. Removed: the GitHub
  release / checks / license / stars badges, the Awesome DSH badge and its listing link, the
  image-viewer link, all three `raw.githubusercontent.com/WSL043/...` screenshots, and both
  issue-form links. Kept: the npm version and download badges, the DSH compatibility badge, and a
  static MIT license badge linked to `LICENSE`.
* The removed screenshots are replaced with written descriptions of the wide master/detail archive
  dialog and of the permanent-delete confirmation.
* The README agent-install sections link to this package's own `AGENTS.md` instead of upstream's
  `v1.3.4` raw URL.
* `README.en.md`'s compatibility line is corrected to `0.1.5-rc.1`, matching `compatibility.json` and
  `README.md`.
* `SECURITY.md` no longer points at a repository security form that does not exist yet.
* `PUBLISH.md` no longer claims the local build produced the shipped bundle. It now records that
  `lib/client.js` in this tree is the dual-fixture release build (303,999 bytes, sha256
  `116C07122100B3C8BB024FE2CC83469F07FA1ABB6FA1B6599A536D3C6AB4DEF2`) and that
  `scripts/build-client-local.mjs` overwrites it with the local form.

### Kept

* `LICENSE` and `THIRD_PARTY_NOTICES.md` are unchanged. Upstream's MIT copyright notice stays, as the
  license requires, and the README fork notice still credits WSL043.

## 1.4.0

Fork of [`dsh-chat-manager@1.3.4`](https://www.npmjs.com/package/dsh-chat-manager) by WSL043.

### Changed — archived sessions dialog

* The archive manager dialog is now full width (`min(1120px, 100%)`) instead of the shared `Modal`
  default of 380 px, and it lays out as a master/detail browser:
  * left pane: search box plus the archived session list; a row is selectable, and every row keeps
    its Restore / Delete actions;
  * right pane: the complete current user/assistant transcript of the selected archived session,
    with role labels, timestamps, internal scrolling, a message count and a "copy conversation"
    action.
* The dialog injects its own stylesheet (`#dcm-archive-style`) instead of relying on the workspace
  client's CSS modules, so the layout survives upstream style drift.

### Added — archived conversation reads

* Host route `POST /plugins/dsh-session-delete/archive-detail`
  (`readArchivedSessionDetail` in `src/host/archive-manager.mjs`) returns one archived session's
  transcript. It re-checks archive membership, reads only `user/message` and `assistant/message`
  events on the `current` surface through `sessionQuery.filterEvents`, and clamps the payload
  (4000 messages, 40000 characters per message, 4 MiB of text in total).
* `scripts/build-client-local.mjs` rebuilds `lib/client.js` from the
  `@deepseek-ai/dsh-client-ui-workspace` client that the local DSH installation serves, for
  installations without the pinned upstream fixture devDependencies.

### Changed — packaging

* Renamed to `dsh-chat-manager-wide`. The browser module id is now derived from `package.json#name`
  instead of being hard-coded, so a future rename only touches `package.json` and
  `cordis.patch.yml` before a rebuild.
* The composed bundle carries an upstream-attribution header. Upstream's own artifact notice sits
  ahead of `factory: (require) => {` and was dropped by the bundle extractor, so a published fork
  shipped without it.
* Upstream `author` / `repository` / `bugs` / `homepage` metadata was removed so a fork does not
  advertise upstream's coordinates.
* `npm run build` keeps the upstream fixture-based build; `npm run build:local` builds from the
  installed DSH client.

### Limitations

* The transcript contains user and assistant messages only — no tool calls, reasoning blocks or
  subagent traffic.
* The custom dialog is only used when the host exposes no official `archived-sessions` settings
  section; where one exists (DSH-Portable) the plugin still delegates to it.
