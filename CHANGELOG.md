# Changelog

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
