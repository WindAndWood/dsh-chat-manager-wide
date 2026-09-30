# Publishing `dsh-chat-manager-wide`

This directory is a complete, publishable source tree. The working copy you were given was extracted
from the installed plugin, so `lib/client.js` already contains the fork's UI.

## 0. Before publishing

1. **Package metadata.** `author` is set (`windandwood <liangjinzhou22@qq.com>`). `repository`, `bugs`
   and `homepage` stay unset on purpose: this fork has no public source repository yet, and a fork must
   not advertise upstream's coordinates. Add those three fields in the same change that creates the
   repository, then rebuild and republish.
2. **Upstream links are already rebranded (1.4.1).** `README.md` and `README.en.md` now carry only the
   npm version and download badges plus the DSH compatibility and static MIT license badges. Upstream's
   GitHub release / checks / license / stars badges, the Awesome DSH listing, the image-viewer link, both
   issue-form links and all three `raw.githubusercontent.com/WSL043/...` screenshots are gone, and the
   screenshots are replaced by written interface descriptions. When you have your own captures, put them
   under `docs/assets/`, add that path to `files` in `package.json`, and restore the `<img>` blocks.
3. **Publish to npmjs.org, not to your mirror.** `~/.npmrc` on this machine sets
   `registry=https://registry.npmmirror.com`, which is a read-only mirror — publishing there fails.
   `package.json` therefore pins `publishConfig.registry` to `https://registry.npmjs.org/`, which npm
   applies at publish time only; installs keep using the mirror. Log in to the canonical registry
   explicitly:
   ```sh
   npm login --registry https://registry.npmjs.org
   npm whoami --registry https://registry.npmjs.org
   ```
4. **Check the name is free** against that registry:
   ```sh
   npm view dsh-chat-manager-wide version --registry https://registry.npmjs.org
   ```
   `E404` means the name is available — it was free when this tree was prepared.
5. **Put it in git:**
   ```sh
   git init
   git add .
   git commit -m "dsh-chat-manager-wide 1.4.1"
   git remote add origin <your repository>
   git push -u origin main
   ```

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

Two builds exist; both apply the same `patchWorkspaceClient` patches, so both contain the fork.

```sh
# A) release build — the same dual-fixture composition upstream ships
#    (needs the devDependencies: the pinned @deepseek-ai/dsh-client-ui-workspace fixtures)
pnpm install
pnpm run build

# B) no install — patch the workspace client of the DSH you already have installed
node scripts/build-client-local.mjs
```

The `lib/client.js` in this tree is **build A** — the dual-fixture release form (303,999 bytes, sha256
`116C07122100B3C8BB024FE2CC83469F07FA1ABB6FA1B6599A536D3C6AB4DEF2`), byte-for-byte the artifact that
shipped as 1.4.0. Ship that one. Build B is the no-install fallback: it needs no devDependencies and no
network, but it produces the local form (~320 KB) which does **not** carry the older-host compatibility
`compatibility.json` documents, and it overwrites `lib/client.js`. If you ran B, rebuild with A before
publishing.

Whatever you run, the browser module id comes from `package.json#name`. Verify it:

```sh
node -e "const s=require('fs').readFileSync('lib/client.js','utf8');console.log(s.match(/id: \"[^\"]+\"/)[0])"
# must print: id: "dsh-chat-manager-wide"
```

## 2. Dry run, then publish

```sh
npm pack                    # -> dsh-chat-manager-wide-1.4.1.tgz
tar -tzf dsh-chat-manager-wide-1.4.1.tgz    # inspect the published file list
npm publish                 # unscoped name; 1.4.1 is a normal release, so no --tag is needed
```

`1.4.1` carries no prerelease segment, so npm publishes it to `latest` and a bare
`dsh plugin --profile web add dsh-chat-manager-wide` resolves to it.

When you later iterate with a prerelease version (for example `1.4.1-next.1`), a bare `npm publish`
fails with "You must specify a tag using --tag when publishing a prerelease version". Use
`npm publish --tag next` for a channel, or `--tag latest` when a bare install should resolve to it.
Note that `--tag next` leaves the package without a `latest` tag, so version-less installs fail until
you publish a normal release.

Check what actually landed:

```sh
npm view dsh-chat-manager-wide version dist-tags
```

## 3. Install it

**Always remove the original first.** Both packages disable the official `ui-workspace` row and each
inserts its own workspace row, and both register the same `/plugins/dsh-session-delete/*` routes.
Installing them side by side gives you two workspace sidebars.

```sh
dsh plugin --profile web remove dsh-chat-manager

# from the registry:
dsh plugin --profile web add dsh-chat-manager-wide@1.4.1

# or from the tarball, to test before publishing (absolute path or ./relative works;
# this tree currently lives at the local checkout):
dsh plugin --profile web add .\dsh-chat-manager-wide-1.4.1.tgz
```

Then **restart DSH** — the host half (`src/`) is loaded at boot, so the archive-detail route does not
exist until then — and refresh the Web UI for the rebuilt client bundle.

Verify the profile without dumping its contents:

```sh
dsh plugin --profile web list dsh-chat-manager-wide --depth 0
```

Acceptance in the UI: the sidebar archive action opens a wide dialog with the archived list on the
left; clicking a row fills the right pane with that session's conversation.

## 4. Update flow

```sh
# bump the version in package.json, then
pnpm run build        # or: node scripts/build-client-local.mjs
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
  requires retaining it.
* `THIRD_PARTY_NOTICES.md` carries both upstream notices: `dsh-chat-manager` and the
  `@deepseek-ai/dsh-client-ui-workspace` build that every `lib/client.js` is derived from.
* The composed bundle starts with an attribution header. Upstream's own artifact notice sat ahead of
  `factory: (require) => {` and was silently dropped by the bundle extractor, so the fork emits its
  own.
