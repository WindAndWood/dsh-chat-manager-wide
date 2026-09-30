> **Fork note.** This is the `dsh-chat-manager-wide` fork. Every command and package spec in this
> document already points at `dsh-chat-manager-wide@1.5.0`. Do not install it next to the
> original `dsh-chat-manager` in one profile.

# Agent installation guide

Use this guide when a user explicitly asks an Agent to install, update, verify,
or remove `dsh-chat-manager-wide` in a selected DeepSeek Harness profile.

## Safety and responsibility boundary

- Confirm the target DSH installation and profile. Use `web` only when it is the user's target.
- Use the fixed `dsh-chat-manager-wide@1.5.0` package below; never substitute a moving branch or an
  unreviewed source.
- Do not print session contents, full profile files, transcript paths, credentials, or other private data.
- Do not start, stop, or restart DSH without explicit permission.
- Preserve all sessions, unrelated plugins, and user-owned profile changes.
- Never delete a session as an installation test unless the user explicitly selects a disposable session
  and confirms the destructive test.
- Prefer one durable user installation over disposable copies under `LocalAppData\Temp`. If more than one
  durable DSH installation remains, ask which installation is the target before changing it.

Permanent deletion is irreversible. The Agent must not claim that this plugin provides secure erasure:
external attachments, caches, logs, backups, cloud copies, and non-JSONL stores are outside its scope.
The user is responsible for authority to delete the selected data and for applicable retention or privacy
requirements. A cancelled confirmation is the safe default and must not send a delete request.

## Fixed package and standard bundle

The `dsh-chat-manager-wide` package is a standard DSH bundle (a fork of `dsh-chat-manager` 1.3.4) with a `dsh.bundle` profile patch. Its exact package spec is:

```text
dsh-chat-manager-wide@1.5.0
```

Since 1.5.0 the bundle no longer disables or replaces the official workspace row. Its client half is a small
slot plugin (`lib/client.js`) that adds three additive entries — the `settings.section` with id
`archived-sessions`, two `sidebar.workspaces.session.menu.item` rows, and two `shell.overlay` dialogs — while
the official archiving UI keeps working. Removing `dsh-chat-manager-wide` removes only those entries. Do not
install the tarball under `@deepseek-ai/dsh-client-ui-workspace`; that old aliasing approach is not the
contract. The product is shown to users as **DSH Chat Manager**.

## Detect the target DSH

Use read-only filesystem checks to locate the requested target. On Windows:

```powershell
Get-Command dsh -ErrorAction SilentlyContinue
Get-Command npx -ErrorAction SilentlyContinue
```

DSH-Portable exposes the same standard `dsh plugin` contract. Missing system pnpm is normal; do not
install it globally just for this plugin.

`dsh plugin ... list` is not strictly read-only. Its first invocation may initialize or migrate a Portable
profile, rebuild dependency links, or update profile package-manager metadata. It is non-destructive to
session contents, but an Agent must not describe it as a filesystem read-only check. If attribution matters,
record the selected profile's relevant metadata before invoking it, without printing secrets.

## Install or update

With an existing `dsh` command, run exactly:

```sh
dsh plugin --profile web add dsh-chat-manager-wide@1.5.0
```

Use the same `add` command to update or repair. The DSH CLI owns target selection, dependency resolution,
profile locking, and bundle composition; this plugin does not ship a second Windows installer.

After a successful configuration change, ask for permission before restarting DSH. A successful CLI exit
alone is not runtime acceptance.

## Acceptance

First verify the selected profile without exposing its contents:

```sh
dsh plugin --profile web list dsh-chat-manager-wide --depth 0
```

1. The `dsh-chat-manager-wide` bundle appears exactly once in the requested profile.
2. Its direct package spec is the fixed `dsh-chat-manager-wide@1.5.0` npm version above.
3. The profile contains the bundle patch, and the official `@deepseek-ai/dsh-web-app` bundle is still
   composed (this plugin must not skip or shadow it).
4. No unrelated dependency, profile patch, or session data was changed by the operation.

With permission to restart DSH, verify the live UI in dark mode:

1. Settings contains an **Archived sessions** section; the sidebar's own archive filter and archive
   action still work (this plugin must not have taken them over).
2. The section lists archived sessions, filters by name or workspace, and can search archived
   user/assistant conversation content without exposing another session.
3. Selecting a row shows that session's full transcript on the right, including role labels and timestamps.
4. Restoring a disposable archived session returns it to its original workspace position without reloading the page.
5. An archived session's native actions menu contains **View archived transcript** and the red
   **Delete session** action, in addition to the official **Archive session** entry.
6. Opening Delete shows the target session name and a second confirmation.
7. Selecting **Cancel** closes the dialog, sends no delete request, and leaves the session visible.
8. A destructive check is allowed only with a disposable test session explicitly selected by the user.
9. After confirming that disposable session, verify it disappears in place without reloading the whole DSH page.

For a source checkout — where the untracked `_work/verify/` directory sits beside this package and is **not**
part of the published tarball — four non-destructive regression suites cover this plugin without a browser:

```sh
node _work/verify/verify-host.mjs      # host routes and archive-detail semantics
node _work/verify/verify-client.mjs    # slot registrations, hook order, cancel-sends-nothing
node _work/verify/verify-package.mjs   # peer gate, published file list, artifact reproducibility
node _work/verify/verify-profile.mjs   # the profile loader `dsh web` uses; no bundle skipped
```

They must all pass before a release. The live-UI items above still need a human or a browser runner; the
repository ships no Playwright runner any more, so do not claim UI acceptance from these commands alone.

## Uninstall

For a standard profile:

```sh
dsh plugin --profile web remove dsh-chat-manager-wide
```

Uninstall removes only this plugin's bundle layer. It must not delete sessions and must not restart DSH
without permission. After the command, verify that `dsh-chat-manager-wide` is absent and that the official
workspace row, its archive filter, and its archived-content search all still work after the next permitted
DSH restart.

## Failure handling

Distinguish command discovery, network, HTTP/TLS, package-manager, profile-conflict, version, and
peer-dependency failures. Do not disable TLS validation, delete a profile, replace unrelated packages,
or claim success from an exit code alone.

On failure, report the sanitized command error, DSH version, selected profile, requested plugin version,
what changed, rollback state, and what remains unverified. Do not attempt an irreversible session deletion
as a recovery step. If the bundle was added but verification failed, stop and obtain permission before any
further profile change.
