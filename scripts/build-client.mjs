import { readFileSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const SOURCE = resolve(root, 'src/client/factory.js')
const DEFAULT_OUTPUT = resolve(root, 'lib/client.js')

/**
 * Attribution header for route C. The browser half is this package's own code
 * built on the public slot API, so it carries no upstream work; the note keeps
 * the fork lineage of the host half discoverable next to the artifact.
 */
const NOTICE = '// dsh-chat-manager-wide — DSH Chat Manager Wide client half (official slots, MIT; unofficial fork of dsh-chat-manager by WSL043).\n'

/**
 * Read the browser factory body and wrap it in the DSH client-module envelope.
 *
 * The module id must equal `package.json#name`: the host keys its client-module
 * graph by npm package name (identity binding #3 in CONTEXT.md), so it is
 * derived here rather than written by hand.
 *
 * @param manifest - parsed `package.json`.
 * @param body - `src/client/factory.js` text.
 * @param indent - one tab per nesting level inside the factory.
 * @returns the complete `lib/client.js` text.
 */
export function composeClient(manifest, body, indent = '\t\t') {
  if (typeof manifest?.name !== 'string' || manifest.name.length === 0) {
    throw new Error('package.json must declare a non-empty package name')
  }
  if (typeof body !== 'string' || body.trim().length === 0) {
    throw new Error('the client factory source is empty')
  }
  if (body.includes('window.__ModuleLoader__.load')) {
    throw new Error('src/client/factory.js must be the factory body, not a composed module')
  }
  if (/^\s*export\s/m.test(body)) {
    throw new Error('the factory body must use CommonJS exports, not ESM export statements')
  }
  const indented = body
    .replace(/\s+$/u, '')
    .split('\n')
    .map(line => (line.length === 0 ? line : `${indent}${line}`))
    .join('\n')
  return `${NOTICE}window.__ModuleLoader__.load({\n\tid: ${JSON.stringify(manifest.name)},\n\tfactory: (require) => {\n${indented}\n${indent}return module.exports\n\t}\n});\n`
}

/** Compose `lib/client.js` from the checked-in factory source. */
export async function buildClient(output = DEFAULT_OUTPUT) {
  const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
  const body = await readFile(SOURCE, 'utf8')
  const composed = composeClient(manifest, body)
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, composed, 'utf8')
  return output
}

if (process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  process.stdout.write(`${await buildClient()}\n`)
}
