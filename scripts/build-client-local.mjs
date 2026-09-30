/**
 * Local rebuild entry for an installed copy of this plugin.
 *
 * `scripts/build-client.mjs` composes the shipped bundle from pinned upstream
 * fixture packages (devDependencies) that are absent from a normal
 * `dsh plugin add` installation. This entry patches the upstream workspace
 * client that the running DSH actually serves instead, and uses the same
 * patched source for both factory branches of the compatibility shim.
 *
 * Usage:
 *   node scripts/build-client-local.mjs
 *   DSH_CHAT_MANAGER_OUTPUT=/tmp/client.js node scripts/build-client-local.mjs
 *   DSH_WORKSPACE_CLIENT_PATH=/path/to/ui-workspace/lib/client.js node scripts/build-client-local.mjs
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  composeCompatibleClients,
  patchWorkspaceClient,
  resolveUpstreamClient,
  resolveUpstreamManifest,
} from './build-client.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const output = process.env.DSH_CHAT_MANAGER_OUTPUT === undefined
  ? resolve(here, '../lib/client.js')
  : resolve(process.env.DSH_CHAT_MANAGER_OUTPUT)

const clientPath = resolveUpstreamClient()
const manifestPath = resolveUpstreamManifest()
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const upstream = await readFile(clientPath, 'utf8')
const patched = patchWorkspaceClient(upstream, manifest.version)

await mkdir(dirname(output), { recursive: true })
await writeFile(output, composeCompatibleClients(patched, patched), 'utf8')
process.stdout.write(`${output}\n`)
