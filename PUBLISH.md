# Publishing `dsh-chat-manager-wide`

This directory is a complete, publishable source tree. Since 1.5.0 the browser half is a small
official-slot plugin: `src/client/factory.js` is the source of truth and `lib/client.js` is its generated
artifact (`npm run build`), so the two are always in sync.

## 0. Before publishing

1. **Package metadata.** `author` is set (`windandwood <liangjinzhou22@qq.com>`), and
   `repository` / `bugs` / `homepage` point at
   [WindAndWood/dsh-chat-manager-wide](https://github.com/WindAndWood/dsh-chat-manager-wide). These three
   fields are frozen into the registry by the release that publishes them, so change them **before**
   `npm publish`, never after; a later correction needs a new version.
2. **Badges and screenshots (1.5.0).** `README.md` and `README.en.md` carry the npm version and download
   badges, the DSH compatibility badge, the static MIT license badge and this repository's stars badge.
   Upstream's GitHub release / checks / license / stars badges, the Awesome DSH listing, the image-viewer
   link and both upstream issue-form links are gone. The three interface screenshots live in `docs/assets/`
   (`menu-entries.png`, `archive-transcript.png`, `archive-search.png`) and are referenced by absolute
   `raw.githubusercontent.com` URLs, so they render on GitHub **and** on npmjs; `docs/assets` is also in
   `files` so the tarball stays self-contained for other viewers. Note that `raw.githubusercontent.com`
   can be unreachable from mainland China, where the mirror's README page will show broken images.
3. **Publish to npmjs.org, not to your mirror.** `~/.npmrc` on this machine sets
   `registry=https://registry.npmmirror.com`, which is a read-only mirror — publishing there fails.
   `package.json` therefore pins `publishConfig.registry` to `https://registry.npmjs.org/`, which npm
   applies at publish time only; installs keep using the mirror. Log in to the canonical registry
   explicitly:
   ```sh
   npm login --registry https://registry.npmjs.org
   npm whoami --registry https://registry.npmjs.org
   ```
4. **Check what is already published** against that registry:
   ```sh
   npm view dsh-chat-manager-wide versions --registry https://registry.npmjs.org
   ```
   `1.4.0` is the only published version so far; `1.4.1` was prepared and then abandoned in favour of
   this route C release, so do not publish `1.4.1`.
5. **Put it in git.** The repository already exists and is initialized; publish from a clean tree:
   ```sh
   git status                    # must be clean
   git remote -v                 # origin -> WindAndWood/dsh-chat-manager-wide
   git tag -a v1.5.1 -m "dsh-chat-manager-wide 1.5.1"
   git push origin main --follow-tags
   ```
   `.gitattributes` pins `* text=auto eol=lf`, so a checkout/rollback keeps `lib/client.js` byte-exact
   (verified with a real worktree rollback in the 1.4.x line).

**2FA is mandatory for the write.** An account with two-factor authentication that logs in through the
browser flow (`Logged in on https://registry.npmjs.org/`) can still be refused at publish time:

```text
npm error code E403
npm error 403 403 Forbidden - PUT https://registry.npmjs.org/<name> - Two-factor authentication or
granular access token with bypass 2fa enabled is required to publish packages.
```

That is the registry asking for a second factor on the write, not a problem with the package. If npm
does not prompt for a one-time password (as in the run above), the login session token cannot be used to
publish; pick one of:

* **One-off — pass a fresh code.** `npm publish --otp=<6 digits>` with the code from the authenticator
  app registered on npmjs.com. Codes expire in about 30 seconds.
* **Durable — a Granular Access Token with *Bypass 2FA*.** On npmjs.com:
  *Access Tokens → Generate New Token → Granular Access Token*; enable **Bypass 2FA**, set
  *Permissions* to **Read and write**, and *Packages* to **All packages** — a package-scoped token
  cannot be created before the package exists. Then store it against the canonical registry only:

  ```sh
  npm config set //registry.npmjs.org/:_authToken=npm_xxxxxxxxxxxx
  npm publish
  ```

  The token lands in `~/.npmrc` under a registry-scoped key, so the npmmirror `registry` setting keeps
  serving your installs. Never commit it; if you prefer a per-project file, use a git-ignored `.npmrc`.

## 1. Build the client bundle

One build exists, it needs no dependencies and no network:

```sh
npm run build          # node scripts/build-client.mjs
```

`src/client/factory.js` is the single source of truth. The composer wraps it in the DSH client-module
envelope, derives the module id from `package.json#name`, and writes `lib/client.js`. Never hand-edit
`lib/client.js`: `verify-package.mjs` rebuilds it and fails if the checked-in artifact differs by one byte.

Verify the module id after building:

```sh
node -e "const s=require('fs').readFileSync('lib/client.js','utf8');console.log(s.match(/id: \"[^\"]+\"/)[0])"
# must print: id: "dsh-chat-manager-wide"
```

## 2. Dry run, then publish

```sh
npm pack                    # -> dsh-chat-manager-wide-1.5.1.tgz
tar -tzf dsh-chat-manager-wide-1.5.1.tgz    # inspect the published file list (21 files)
npm publish                 # unscoped name; 1.5.1 is a normal release, so no --tag is needed
```

`1.5.1` carries no prerelease segment, so npm publishes it to `latest` and a bare
`dsh plugin --profile web add dsh-chat-manager-wide` resolves to it.

When you later iterate with a prerelease version (for example `1.5.1-next.1`), a bare `npm publish`
fails with "You must specify a tag using --tag when publishing a prerelease version". Use
`npm publish --tag next` for a channel, or `--tag latest` when a bare install should resolve to it.
Note that `--tag next` leaves the package without a `latest` tag, so version-less installs fail until
you publish a normal release.

Check what actually landed:

```sh
npm view dsh-chat-manager-wide version dist-tags
```

## 3. Install it

**Always remove the original first.** Both packages register the same `/plugins/dsh-session-delete/*`
routes, so installing them side by side gives you duplicate route registrations.

```sh
dsh plugin --profile web remove dsh-chat-manager

# from the registry:
dsh plugin --profile web add dsh-chat-manager-wide@1.5.1

# or from the tarball, to test before publishing (absolute path or ./relative works)
dsh plugin --profile web add .\dsh-chat-manager-wide-1.5.1.tgz
```

Then **restart DSH** — the host half (`src/`) is loaded at boot, so the archive-detail route does not
exist until then — and refresh the Web UI for the new client module.

Verify the profile without dumping its contents:

```sh
dsh plugin --profile web list dsh-chat-manager-wide --depth 0
```

Acceptance in the UI: **Settings → Archived sessions** shows the list on the left and fills the right pane
with a session's conversation when you select it; an archived session's "…" menu offers **View archived
transcript** and the red **Delete session**; the official archive action, archived-row filter, and
archived-content search still work.

## 4. Update flow

```sh
# bump the version in package.json, then
npm run build
npm publish
dsh plugin --profile web add dsh-chat-manager-wide@<new version>
```

`add` with the same name updates in place, exactly like upstream's documented repair flow.

## 5. Rollback

```sh
dsh plugin --profile web remove dsh-chat-manager-wide
dsh plugin --profile web add dsh-chat-manager@1.3.4
```

## Licensing

* `LICENSE` is upstream's MIT license (Copyright (c) 2026 WSL043) and is kept unchanged — MIT
  requires retaining it, because the host half is a modified fork of `dsh-chat-manager` 1.3.4.
* `THIRD_PARTY_NOTICES.md` carries the `dsh-chat-manager` notice and keeps the
  `@deepseek-ai/dsh-client-ui-workspace` notice for the **already published** 1.4.0/1.4.1 line. From
  1.5.0 the distributed `lib/client.js` contains no upstream code, so no new attribution obligation
  arises from it; the file states that explicitly.
* The generated `lib/client.js` starts with a one-line attribution header. It is emitted by
  `scripts/build-client.mjs`, so do not edit it by hand.
