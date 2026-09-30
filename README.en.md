> **Fork notice.** `dsh-chat-manager-wide` is a modified fork of
> [dsh-chat-manager](https://www.npmjs.com/package/dsh-chat-manager) 1.3.4 by WSL043 (MIT):
> the archived-session dialog is full width and archived conversations can be read in place.
> Upstream's MIT license and attribution are kept in [LICENSE](LICENSE) and
> [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md); see [CHANGELOG.md](CHANGELOG.md) for the delta and
> [PUBLISH.md](PUBLISH.md) for the release flow.
> Do **not** install this package and the original `dsh-chat-manager` in the same profile; each one
> inserts its own workspace row.

> Version 1.3.4: When the official archive section and Portable settings navigation are available, the archive button opens the official page; the adjacent search button retains content search and management. Older hosts retain the existing archive dialog.

> [!NOTE]
> This is an actively maintained, independently removable DSH plugin. It adds archive browsing, conversation-content search, restore, and safe permanent deletion. If this session workflow is not for you, uninstalling the plugin leaves existing sessions untouched.

<div align="center">

# DSH Chat Manager

npm package: [`dsh-chat-manager-wide`](https://www.npmjs.com/package/dsh-chat-manager-wide) (a fork of `dsh-chat-manager`).

**Manage DeepSeek Harness chat history from the native sidebar: search archives, restore sessions, and delete safely.**

Archive manager · Conversation search · One-click restore · Safe permanent deletion

[![npm](https://img.shields.io/npm/v/dsh-chat-manager-wide?style=flat-square)](https://www.npmjs.com/package/dsh-chat-manager-wide)
[![total npm downloads](https://img.shields.io/npm/dt/dsh-chat-manager-wide?style=flat-square&label=total%20downloads)](https://www.npmjs.com/package/dsh-chat-manager-wide)
[![DSH](https://img.shields.io/badge/DSH-compatible-2f81f7?style=flat-square)](#compatibility)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)

[中文](README.md) · [Install](#install) · [Use](#use) · [Safety boundary](#safety-boundary)

</div>

| Recover archives | Search conversations | Delete safely |
| --- | --- | --- |
| Open the archive manager from the sidebar and restore hidden sessions | Search archived names, workspaces, and user/assistant conversation content | Keep native second confirmation; running work is stopped safely before local records are removed |

**What the archived-sessions dialog looks like.** The archive icon in the sidebar header opens a dialog
that spans `min(1120px, 100%)` (the shared `Modal` default is only `min(380px, 100%)`) and lays out as a
master/detail browser: the left pane holds the search box and the archived session list, where every row
is selectable and keeps its Restore / Delete actions; selecting a row fills the right pane with that
session's complete user/assistant transcript, including role labels, timestamps, a message count,
internal scrolling, and a "copy conversation" action.

> [!NOTE]
> This fork has no public source repository yet, so this README ships without interface screenshots;
> the paragraph above is the description of record.

## Install

### Standard DSH command

```sh
dsh plugin --profile web add dsh-chat-manager-wide@1.4.1
```

When the command finishes, save your work and restart DSH once through its normal workflow so the new
bundle configuration becomes active.

### Agent installation

Use the fixed-version [AGENTS.md](AGENTS.md) shipped inside this package. It defines installation,
update, acceptance, uninstall, and safety boundaries, and it is byte-identical to the copy published to
npm; do not substitute an online document for it.

## Use

### Manage archives

1. Select the archive icon in the sidebar header to open **Archived sessions**.
2. Browse every archive or search by session name, workspace, and user/assistant conversation content.
3. Select **Restore** to return a session to its original workspace position. To remove it completely,
   start the permanent-delete confirmation from the same list.

Archive and restore only change DSH's hidden state; they do not delete conversation history. Content search
is limited to current user and assistant messages inside archived sessions.

### Delete permanently

1. Open the native actions menu beside the target session in the sidebar.
2. Choose the red **Delete session** action.
3. Check the session name and select **Delete permanently** in the confirmation dialog, or select
   **Cancel** to leave it unchanged.

**The delete confirmation dialog.** It names the target session and offers a red **Delete permanently**
button beside **Cancel**; permanent deletion cannot be undone, and Cancel sends no delete request.

Once active, the plugin reuses DSH lifecycle and session-storage capabilities. If work is still running,
it is stopped and allowed to settle before the target session is deleted. The session list then
updates in place without reloading the whole DSH page.

## Safety boundary

> [!WARNING]
> Permanent deletion cannot be undone. Check the session name before confirming and make a separate backup when needed.

The plugin is responsible for validating and removing only the explicitly confirmed session's dedicated
directory within DSH's default per-session JSONL store and host lifecycle boundary. DSH currently exposes
no public session-deletion API. The second confirmation is mandatory; cancelling sends no deletion request.

The following are outside the plugin's deletion scope and are not guaranteed to be removed:

- Other sessions, other plugin data, external attachments, caches, indexes, logs, backups, or cloud/sync copies;
- Non-JSONL storage or hosts without a safe stop capability; these are refused instead of force-deleted;
- Additional copies created by the operating system, filesystem, host updates, or third-party sync services.

If the operating system refuses cleanup, the plugin reports that deletion could not be confirmed rather
than misreporting partial completion as success. You are responsible for having authority to delete the
target data and for meeting applicable retention, audit, and privacy requirements. This is an unofficial
community plugin, not affiliated with or endorsed by DeepSeek. It is provided under the [MIT License](LICENSE),
without warranty.

## Compatibility

<!-- dsh-compatibility -->
Supports the latest DeepSeek Harness release recorded in the package metadata (`0.1.5-rc.1`).
<!-- /dsh-compatibility -->

Archive browsing, restore, and content search use DSH's workspace registry and session-query capabilities.
Permanent deletion supports DSH's default per-session JSONL storage. Installing replaces the native workspace
list with the session-management version; uninstalling restores DSH's original list.

## Update and uninstall

Install the target npm version with the same standard DSH command. For the current version:

```sh
dsh plugin --profile web add dsh-chat-manager-wide@1.4.1
```

Uninstall removes only this plugin's bundle layer and never deletes sessions:

```sh
dsh plugin --profile web remove dsh-chat-manager-wide
```

DSH-Portable exposes the same standard `dsh plugin` commands. Restart DSH through its normal workflow
after installing, updating, or uninstalling so the configuration is recomposed.

## Support and license

This fork has no public source repository yet, so there is no issue form. Check the version on the
[npm package page](https://www.npmjs.com/package/dsh-chat-manager-wide) first, then report a
reproducible problem through the maintainer contact listed there. Report security issues privately as
described in [SECURITY.md](SECURITY.md).

MIT. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the modified upstream client and its license
notice.
