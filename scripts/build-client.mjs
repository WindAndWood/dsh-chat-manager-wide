import { readFileSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const here = dirname(fileURLToPath(import.meta.url))
const output = process.env.DSH_CHAT_MANAGER_OUTPUT === undefined
  ? resolve(here, '../lib/client.js')
  : resolve(process.env.DSH_CHAT_MANAGER_OUTPUT)
const compatibility = JSON.parse(readFileSync(resolve(here, '../compatibility.json'), 'utf8'))
const packageManifest = JSON.parse(readFileSync(resolve(here, '../package.json'), 'utf8'))
if (typeof packageManifest.name !== 'string' || packageManifest.name.length === 0) {
  throw new Error('package.json must declare a non-empty package name')
}
/**
 * Browser module id of the composed bundle. The host keys its client-module
 * graph by npm package name, so the bundle has to register exactly that id.
 */
const MODULE_ID = packageManifest.name
/**
 * Attribution header for the bundled upstream work. The upstream artifact
 * notice sits ahead of `factory: (require) => {` and is dropped by
 * `extractClientFactoryBody`, so the composed bundle carries its own.
 */
const BUNDLE_NOTICE = `// ${MODULE_ID} — a modified build of @deepseek-ai/dsh-client-ui-workspace (MIT, Copyright (c) 2026 DeepSeek).\n`
const LATEST_UPSTREAM_VERSION = compatibility.latestTested
const SUPPORTED_UPSTREAM_VERSIONS = new Set([
  ...compatibility.supported,
  ...(compatibility.previews ?? []),
])


// A canceled event acknowledges the Portable bridge. Older hosts safely fall back.
export function openOfficialArchives(ctx, probe = false) {
  try {
    const entries = ctx.slots.entries('settings.section')
    if (!entries.some(entry => (entry.options?.id ?? entry.id) === 'archived-sessions')) return false
    return !window.dispatchEvent(new CustomEvent('dsh-portable/open-settings', {
      cancelable: true, detail: { section: 'archived-sessions', probe },
    }))
  } catch { return false }
}

export async function unarchiveSession(sessionId) {
  await this.workspaces.unarchiveSession(sessionId)
}

/**
 * Locate the upstream workspace client through an installed DSH profile.
 *
 * The published build patches pinned fixture devDependencies instead. A bare
 * checkout outside a DSH installation has neither, but every DSH profile links
 * the very client the running DSH serves — the artefact this fork patches.
 */
const profileWorkspaceBase = () => {
  const dshHome = process.env.DSH_HOME
  const home = process.env.USERPROFILE ?? process.env.HOME ?? ''
  const base = typeof dshHome === 'string' && dshHome.length > 0
    ? dshHome
    : (home.length > 0 ? resolve(home, '.dsh') : undefined)
  return base === undefined
    ? undefined
    : resolve(base, 'profiles', 'node_modules', '@deepseek-ai', 'dsh-client-ui-workspace')
}
const readProfileWorkspaceArtifact = (relative) => {
  const base = profileWorkspaceBase()
  if (base === undefined) return undefined
  const candidate = resolve(base, relative)
  try {
    readFileSync(candidate)
    return candidate
  } catch {
    return undefined
  }
}
const resolveUpstreamArtifact = (envName, specifier, relative) => {
  const fromEnv = process.env[envName]
  if (fromEnv !== undefined) return resolve(fromEnv)
  try {
    return require.resolve(specifier)
  } catch (error) {
    const fallback = readProfileWorkspaceArtifact(relative)
    if (fallback === undefined) throw error
    return fallback
  }
}
export const resolveUpstreamClient = () => resolveUpstreamArtifact(
  'DSH_WORKSPACE_CLIENT_PATH',
  '@deepseek-ai/dsh-client-ui-workspace/client',
  'lib/client.js',
)
export const resolveUpstreamManifest = () => resolveUpstreamArtifact(
  'DSH_WORKSPACE_MANIFEST_PATH',
  '@deepseek-ai/dsh-client-ui-workspace/package.json',
  'package.json',
)
const resolvePreviewClient = () => process.env.DSH_WORKSPACE_CLIENT_PATH === undefined
  ? require.resolve(`${compatibility.previewWorkspaceFixture}/client`)
  : resolve(process.env.DSH_WORKSPACE_CLIENT_PATH)
const resolvePreviewManifest = () => process.env.DSH_WORKSPACE_MANIFEST_PATH === undefined
  ? require.resolve(`${compatibility.previewWorkspaceFixture}/package.json`)
  : resolve(process.env.DSH_WORKSPACE_MANIFEST_PATH)
const resolveLegacyClient = () => compatibility.legacyWorkspaceFixture === undefined
  ? resolveUpstreamClient()
  : require.resolve(`${compatibility.legacyWorkspaceFixture}/client`)
const resolveLegacyManifest = () => compatibility.legacyWorkspaceFixture === undefined
  ? resolveUpstreamManifest()
  : require.resolve(`${compatibility.legacyWorkspaceFixture}/package.json`)

const replaceOnce = (source, before, after, label) => {
  const first = source.indexOf(before)
  if (first === -1 || source.indexOf(before, first + before.length) !== -1) {
    throw new Error(`upstream marker mismatch: ${label}`)
  }
  return `${source.slice(0, first)}${after}${source.slice(first + before.length)}`
}

const findFunctionSignature = (source, functionName) => {
  const pattern = new RegExp(`function ${functionName}\\(\\{[^}]+\\}\\) \\{`, 'g')
  const matches = [...source.matchAll(pattern)]
  if (matches.length !== 1) throw new Error(`upstream marker mismatch: ${functionName} signature`)
  return matches[0][0]
}

const findMarker = (source, candidates, label) => {
  const matches = candidates.filter(candidate => source.includes(candidate))
  if (matches.length !== 1) throw new Error(`upstream marker mismatch: ${label}`)
  return matches[0]
}

const normalizeCssModulePrefix = (source, variableName, canonicalPrefix) => {
  const marker = `var ${variableName}_module_css_default = {`
  const start = source.indexOf(marker)
  if (start < 0) throw new Error(`upstream marker mismatch: ${variableName} CSS module`)
  const end = source.indexOf('\n\t\t};', start)
  if (end < 0) throw new Error(`upstream marker mismatch: ${variableName} CSS module end`)
  const prefixes = new Set(
    [...source.slice(start, end).matchAll(/": "([^"]+?)_[^"]+"/g)]
      .map(match => match[1]),
  )
  if (prefixes.size !== 1) throw new Error(`upstream marker mismatch: ${variableName} CSS prefix`)
  const [generatedPrefix] = prefixes
  return source.replaceAll(`${generatedPrefix}_`, `${canonicalPrefix}_`)
}

const extractClientFactoryBody = (source, label) => {
  const marker = 'factory: (require) => {'
  const start = source.indexOf(marker)
  const end = source.lastIndexOf('\n\t}\n});')
  if (start < 0 || end < start || source.indexOf(marker, start + marker.length) >= 0) {
    throw new Error(`client artifact marker mismatch: ${label}`)
  }
  return source.slice(start + marker.length, end)
}

export function composeCompatibleClients(stableClient, previewClient, moduleId = MODULE_ID) {
  const stableBody = extractClientFactoryBody(stableClient, 'stable factory')
  const previewBody = extractClientFactoryBody(previewClient, 'preview factory')
  return `${BUNDLE_NOTICE}// DSH Chat Manager runtime-compatible client: stable and preview implementations are selected by capability.\nwindow.__ModuleLoader__.load({\n\tid: ${JSON.stringify(moduleId)},\n\tfactory: (require) => {\n\t\tconst stableFactory = (require) => {${stableBody}\n\t\t};\n\t\tconst previewFactory = (require) => {${previewBody}\n\t\t};\n\t\tlet stableRuntimeAvailable = true;\n\t\ttry {\n\t\t\trequire("@deepseek-ai/dsh-client-runtime/client");\n\t\t} catch (error) {\n\t\t\tconst message = error instanceof Error ? error.message : String(error);\n\t\t\tif (!/missed the module table|Cannot find module/u.test(message)) throw error;\n\t\t\tstableRuntimeAvailable = false;\n\t\t}\n\t\treturn stableRuntimeAvailable ? stableFactory(require) : previewFactory(require);\n\t}\n});\n`
}

/**
 * Add one narrow feature to the shipped workspace client while preserving the
 * rest of the official bundle byte-for-byte after a modification notice.
 * Exact markers turn upstream UI drift into a build failure instead of a
 * silently malformed client.
 */
export function patchWorkspaceClient(upstream, upstreamVersion = LATEST_UPSTREAM_VERSION) {
  if (!SUPPORTED_UPSTREAM_VERSIONS.has(upstreamVersion)) {
    throw new Error(`unsupported @deepseek-ai/dsh-client-ui-workspace version: ${upstreamVersion}`)
  }
  const sessionTreeSignature = findFunctionSignature(upstream, 'SessionTree')
  const sessionRowSignature = findFunctionSignature(upstream, 'SessionNodeItem')
  if (!sessionRowSignature.includes('onFork, onArchive, ')) throw new Error('upstream marker mismatch: session row props')
  const flatListSignature = findFunctionSignature(upstream, 'FlatList')
  const workspaceBrowserSignature = findFunctionSignature(upstream, 'WorkspaceBrowser')
  if (!sessionTreeSignature.includes('onDeleteRequest, onSessionRename, onSessionArchive, insertWorkspaceBefore,')) {
    throw new Error('upstream marker mismatch: SessionTree delete insertion point')
  }
  if (!workspaceBrowserSignature.includes('deleteWorkspace, insertWorkspaceBefore, archiveSession, insertSessionBefore,')) {
    throw new Error('upstream marker mismatch: WorkspaceBrowser delete insertion point')
  }
  if (!flatListSignature.includes('onSessionRename, onSessionArchive, archivedSessionIds,')) {
    throw new Error('upstream marker mismatch: FlatList delete insertion point')
  }
  let source = upstream
  const stableArchiveAction = `\t\t\t\tarchiveSession: async (sessionId) => {\n\t\t\t\t\tawait ctx.workspaces.archiveSession(sessionId);\n\t\t\t\t},\n`
  const controllerArchiveAction = `\t\t\t\tarchiveSession: async (sessionId) => {\n\t\t\t\t\tawait uiWorkspace.archiveSession(sessionId);\n\t\t\t\t},\n`
  if (source.includes(controllerArchiveAction)) {
    source = replaceOnce(source, controllerArchiveAction, stableArchiveAction, 'controller archive action')
  }
  const patch = (before, after, label) => {
    source = replaceOnce(source, before, after, label)
  }

  // Modern workspace bundles own this service; legacy hosts import theirs.
  if (source.includes('super(ctx, "uiWorkspace")') && !source.includes('async unarchiveSession(sessionId)')) {
    const archiveMethod = '\t\t\tasync archiveSession(sessionId) {\n\t\t\t\tawait this.workspaces.archiveSession(sessionId);\n\t\t\t}'
    patch(archiveMethod, `${archiveMethod}\n\t\t\t${unarchiveSession.toString().replace('async function ', 'async ')}`, 'official unarchive service')
  }

  patch(
    'id: "@deepseek-ai/dsh-client-ui-workspace",',
    `id: ${JSON.stringify(MODULE_ID)},`,
    'client module id',
  )
  patch(
    sessionRowSignature,
    sessionRowSignature.replace('onFork, onArchive, ', 'onFork, onArchive, onDelete, '),
    'session row props',
  )
  patch(
    `\t\t\t\t{\n\t\t\t\t\tid: "archive",\n\t\t\t\t\tlabel: t("menu.archiveSession"),\n\t\t\t\t\ticon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconArchiveOutline20, { size: 16 })\n\t\t\t\t}\n`,
    `\t\t\t\t{\n\t\t\t\t\tid: "archive",\n\t\t\t\t\tlabel: t("menu.archiveSession"),\n\t\t\t\t\ticon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconArchiveOutline20, { size: 16 })\n\t\t\t\t},\n\t\t\t\t{\n\t\t\t\t\tid: "delete-session",\n\t\t\t\t\tlabel: t("menu.deleteSession"),\n\t\t\t\t\ticon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconTrashOutline16, {}),\n\t\t\t\t\tdanger: true\n\t\t\t\t}\n`,
    'session delete menu item',
  )
  patch(
    '\t\t\t\t\t\t\t\t\tif (id === "archive") onArchive(node.id);\n',
    '\t\t\t\t\t\t\t\t\tif (id === "archive") onArchive(node.id);\n\t\t\t\t\t\t\t\t\tif (id === "delete-session") onDelete(node.id, title);\n',
    'session delete menu selection',
  )
  patch(
    sessionTreeSignature,
    sessionTreeSignature.replace(
      'onDeleteRequest, onSessionRename, onSessionArchive, insertWorkspaceBefore,',
      'onDeleteRequest, onSessionRename, onSessionArchive, onSessionDelete, insertWorkspaceBefore,',
    ),
    'session tree props',
  )
  patch(
    '\t\t\t\t\t\t\t\t\t\t\tonArchive: onSessionArchive,\n',
    '\t\t\t\t\t\t\t\t\t\t\tonArchive: onSessionArchive,\n\t\t\t\t\t\t\t\t\t\t\tonDelete: onSessionDelete,\n',
    'tree row delete prop',
  )
  patch(
    flatListSignature,
    flatListSignature.replace(
      'onSessionRename, onSessionArchive, archivedSessionIds,',
      'onSessionRename, onSessionArchive, onSessionDelete, archivedSessionIds,',
    ),
    'flat list props',
  )
  patch(
    '\t\t\t\t\t\t\tonFork: forkSession,\n\t\t\t\t\t\t\tonArchive: onSessionArchive,\n',
    '\t\t\t\t\t\t\tonFork: forkSession,\n\t\t\t\t\t\t\tonArchive: onSessionArchive,\n\t\t\t\t\t\t\tonDelete: onSessionDelete,\n',
    'flat row delete prop',
  )
  patch(
    workspaceBrowserSignature,
    workspaceBrowserSignature.replace(
      'deleteWorkspace, insertWorkspaceBefore, archiveSession, insertSessionBefore,',
      'deleteWorkspace, insertWorkspaceBefore, archiveSession, deleteSession, restoreSession, searchArchivedSessions, readArchivedSession, openArchivedSettings, insertSessionBefore,',
    ),
    'workspace browser delete action prop',
  )
  patch(
    `\t\t\tconst onSessionArchive = (sessionId) => {\n\t\t\t\tarchiveSession(sessionId).catch((reason) => {\n\t\t\t\t\tconsole.warn("session archive rejected:", reason);\n\t\t\t\t});\n\t\t\t};\n`,
    `\t\t\tconst onSessionArchive = (sessionId) => {\n\t\t\t\tarchiveSession(sessionId).catch((reason) => {\n\t\t\t\t\tconsole.warn("session archive rejected:", reason);\n\t\t\t\t});\n\t\t\t};\n\t\t\tconst [sessionDeleteTarget, setSessionDeleteTarget] = (0, react.useState)(null);\n\t\t\tconst [sessionDeleting, setSessionDeleting] = (0, react.useState)(false);\n\t\t\tconst [sessionDeleteError, setSessionDeleteError] = (0, react.useState)(null);\n\t\t\tconst onSessionDelete = (sessionId, title) => {\n\t\t\t\tsetSessionDeleteTarget({ sessionId, title });\n\t\t\t\tsetSessionDeleteError(null);\n\t\t\t};\n\t\t\tconst closeSessionDelete = () => {\n\t\t\t\tif (sessionDeleting) return;\n\t\t\t\tsetSessionDeleteTarget(null);\n\t\t\t\tsetSessionDeleteError(null);\n\t\t\t};\n\t\t\tconst confirmSessionDelete = () => {\n\t\t\t\tif (sessionDeleting || sessionDeleteTarget === null) return;\n\t\t\t\tsetSessionDeleting(true);\n\t\t\t\tsetSessionDeleteError(null);\n\t\t\t\tdeleteSession(sessionDeleteTarget.sessionId).then(() => {\n\t\t\t\t\tclearArchiveDetailIf(sessionDeleteTarget.sessionId);\n\t\t\t\t\tsetSessionDeleting(false);\n\t\t\t\t\tsetSessionDeleteTarget(null);\n\t\t\t\t\tsetSessionDeleteError(null);\n\t\t\t\t}).catch((reason) => {\n\t\t\t\t\tsetSessionDeleting(false);\n\t\t\t\t\tsetSessionDeleteError(reason instanceof Error ? reason.message : String(reason));\n\t\t\t\t});\n\t\t\t};\n`,
    'session delete dialog state',
  )
  patch(
    'const [sessionDeleteTarget, setSessionDeleteTarget] = (0, react.useState)(null);',
    `const archiveSessionList = useSessions((state) => state);
\t\t\tconst [archiveManagerOpen, setArchiveManagerOpen] = (0, react.useState)(false);
\t\t\tconst [archiveQuery, setArchiveQuery] = (0, react.useState)("");
\t\t\tconst [archiveSearch, setArchiveSearch] = (0, react.useState)({ query: "", status: "idle", items: [], hasMore: false });
\t\t\tconst [archiveBusyId, setArchiveBusyId] = (0, react.useState)(null);
\t\t\tconst [archiveError, setArchiveError] = (0, react.useState)(null);
\t\t\tconst normalizedArchiveQuery = archiveQuery.trim();
\t\t\t(0, react.useEffect)(() => {
\t\t\t\tif (!archiveManagerOpen || normalizedArchiveQuery === "") {
\t\t\t\t\tsetArchiveSearch({ query: "", status: "idle", items: [], hasMore: false });
\t\t\t\t\treturn;
\t\t\t\t}
\t\t\t\tconst controller = new AbortController();
\t\t\t\tsetArchiveSearch({ query: normalizedArchiveQuery, status: "loading", items: [], hasMore: false });
\t\t\t\tconst timer = window.setTimeout(() => {
\t\t\t\t\tsearchArchivedSessions(normalizedArchiveQuery, controller.signal).then((result) => {
\t\t\t\t\t\tif (!controller.signal.aborted) setArchiveSearch({ query: normalizedArchiveQuery, status: "ready", items: result.items, hasMore: result.hasMore });
\t\t\t\t\t}).catch(() => {
\t\t\t\t\t\tif (!controller.signal.aborted) setArchiveSearch({ query: normalizedArchiveQuery, status: "error", items: [], hasMore: false });
\t\t\t\t\t});
\t\t\t\t}, 250);
\t\t\t\treturn () => { window.clearTimeout(timer); controller.abort(); };
\t\t\t}, [archiveManagerOpen, normalizedArchiveQuery, searchArchivedSessions]);
\t\t\tconst archiveWorkspaceBySession = (0, react.useMemo)(() => {
\t\t\t\tconst result = /* @__PURE__ */ new Map();
\t\t\t\tfor (const workspace of workspaces) for (const sessionId of workspace.sessionIds) if (!result.has(sessionId)) result.set(sessionId, workspace.title);
\t\t\t\treturn result;
\t\t\t}, [workspaces]);
\t\t\tconst archiveSnippets = (0, react.useMemo)(() => new Map(archiveSearch.items.map((item) => [item.sessionId, item.snippet])), [archiveSearch.items]);
\t\t\tconst archiveRows = (0, react.useMemo)(() => {
\t\t\t\tconst query = normalizedArchiveQuery.toLowerCase();
\t\t\t\tconst remoteIds = new Set(archiveSearch.items.map((item) => item.sessionId));
\t\t\t\tconst rows = archivedSessionIds.map((sessionId) => {
\t\t\t\t\tconst summary = archiveSessionList.byId[sessionId];
\t\t\t\t\treturn {
\t\t\t\t\t\tid: sessionId,
\t\t\t\t\t\ttitle: summary === void 0 ? sessionId : sessionTitle(summary),
\t\t\t\t\t\tworkspace: archiveWorkspaceBySession.get(sessionId) ?? t("group.ungrouped"),
\t\t\t\t\t\tupdatedAt: summary?.updatedAt ?? 0
\t\t\t\t\t};
\t\t\t\t});
\t\t\t\trows.sort((a, b) => b.updatedAt - a.updatedAt);
\t\t\t\tif (query === "") return rows;
\t\t\t\treturn rows.filter((row) => row.title.toLowerCase().includes(query) || row.workspace.toLowerCase().includes(query) || remoteIds.has(row.id));
\t\t\t}, [archiveSessionList, archivedSessionIds, archiveSearch.items, archiveWorkspaceBySession, normalizedArchiveQuery, t]);
\t\t\tconst onArchiveRestore = (sessionId) => {
\t\t\t\tif (archiveBusyId !== null) return;
\t\t\t\tsetArchiveBusyId(sessionId);
\t\t\t\tsetArchiveError(null);
\t\t\t\trestoreSession(sessionId).then(() => { setArchiveBusyId(null); clearArchiveDetailIf(sessionId); }).catch((reason) => {
\t\t\t\t\tsetArchiveBusyId(null);
\t\t\t\t\tsetArchiveError(reason instanceof Error ? reason.message : String(reason));
\t\t\t\t});
\t\t\t};
\t\t\t\t\t\tconst [archiveDetail, setArchiveDetail] = (0, react.useState)({ sessionId: null, title: \"\", status: \"idle\", items: [], error: null, truncated: false, shown: 0, total: 0 });\n\t\t\tconst [archiveCopyState, setArchiveCopyState] = (0, react.useState)(\"idle\");\n\t\t\tconst archiveDetailAbort = (0, react.useRef)(null);\n\t\t\tconst archiveClipboardAvailable = typeof navigator !== \"undefined\" && navigator.clipboard !== void 0 && typeof navigator.clipboard.writeText === \"function\";\n\t\t\t(0, react.useEffect)(() => {\n\t\t\t\tif (typeof document === \"undefined\" || document.getElementById(\"dcm-archive-style\") !== null) return;\n\t\t\t\tconst style = document.createElement(\"style\");\n\t\t\t\tstyle.id = \"dcm-archive-style\";\n\t\t\t\tstyle.textContent = \".dcmArchiveDialog.dcmArchiveDialog{width:min(1120px,100%);max-width:min(1120px,100%)}.dcmArchiveLayout{display:flex;align-items:stretch;gap:12px;height:min(56vh,620px);min-height:240px;margin-top:12px}.dcmArchiveListPane{display:flex;flex-direction:column;gap:8px;width:340px;min-width:240px;flex:none;min-height:0}.dcmArchiveList{display:flex;flex-direction:column;gap:8px;flex:1;min-height:0;overflow-y:auto;padding-right:4px}.dcmArchiveRow{cursor:pointer;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:6px;background:transparent}.dcmArchiveRow:hover{background:var(--dsw-alias-bg-layer-1)}.dcmArchiveRowActive{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-1)}.dcmArchiveRowTitle{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;line-height:18px;overflow-wrap:anywhere}.dcmArchiveRowMeta{color:var(--dsw-alias-label-secondary);font-size:12px;overflow-wrap:anywhere}.dcmArchiveRowSnippet{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;overflow-wrap:anywhere}.dcmArchiveRowActions{display:flex;justify-content:flex-end;gap:8px}.dcmArchiveRowAction{min-height:26px;height:26px;padding-inline:10px;font-size:12px}.dcmArchiveDetailPane{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;overflow:hidden}.dcmArchiveDetailHead{display:flex;flex-direction:column;gap:2px;padding:10px 12px;border-bottom:1px solid var(--dsw-alias-border-l2)}.dcmArchiveDetailTitle{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;overflow-wrap:anywhere}.dcmArchiveDetailMeta{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:20px;color:var(--dsw-alias-label-secondary);font-size:12px}.dcmArchiveTranscript{flex:1;min-height:0;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:10px}.dcmArchiveMessage{display:flex;flex-direction:column;gap:4px;border:1px solid transparent;border-radius:10px;padding:8px 10px;background:var(--dsw-alias-bg-layer-1)}.dcmArchiveMessageAssistant{background:transparent;border-color:var(--dsw-alias-border-l2)}.dcmArchiveMessageHead{display:flex;align-items:center;justify-content:space-between;gap:8px;color:var(--dsw-alias-label-secondary);font-size:11px}.dcmArchiveMessageBody{color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;white-space:pre-wrap;overflow-wrap:anywhere}.dcmArchivePlaceholder{display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:8px;flex:1;min-height:0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px}.dcmArchiveNotice{color:var(--dsw-alias-label-secondary);font-size:12px}.dcmArchiveError{color:var(--dsw-alias-state-error-primary);font-size:12px;overflow-wrap:anywhere}\";\n\t\t\t\tdocument.head.appendChild(style);\n\t\t\t}, []);\n\t\t\t(0, react.useEffect)(() => {\n\t\t\t\tif (archiveManagerOpen) return;\n\t\t\t\tif (archiveDetailAbort.current !== null) {\n\t\t\t\t\tarchiveDetailAbort.current.abort();\n\t\t\t\t\tarchiveDetailAbort.current = null;\n\t\t\t\t}\n\t\t\t}, [archiveManagerOpen]);\n\t\t\tconst formatArchiveTime = (time) => {\n\t\t\t\tif (typeof time !== \"number\" || !Number.isFinite(time)) return \"\";\n\t\t\t\tconst date = new Date(time);\n\t\t\t\tconst pad = (value) => String(value).padStart(2, \"0\");\n\t\t\t\treturn pad(date.getMonth() + 1) + \"-\" + pad(date.getDate()) + \" \" + pad(date.getHours()) + \":\" + pad(date.getMinutes());\n\t\t\t};\n\t\t\tconst clearArchiveDetailIf = (sessionId) => {\n\t\t\t\tsetArchiveDetail((current) => current.sessionId === sessionId ? { sessionId: null, title: \"\", status: \"idle\", items: [], error: null, truncated: false, shown: 0, total: 0 } : current);\n\t\t\t};\n\t\t\tconst onArchiveSelect = (sessionId, title) => {\n\t\t\t\tif (archiveDetailAbort.current !== null) archiveDetailAbort.current.abort();\n\t\t\t\tconst controller = new AbortController();\n\t\t\t\tarchiveDetailAbort.current = controller;\n\t\t\t\tsetArchiveCopyState(\"idle\");\n\t\t\t\tsetArchiveDetail({ sessionId, title: title ?? \"\", status: \"loading\", items: [], error: null, truncated: false, shown: 0, total: 0 });\n\t\t\t\treadArchivedSession(sessionId, controller.signal).then((result) => {\n\t\t\t\t\tif (controller.signal.aborted) return;\n\t\t\t\t\tsetArchiveDetail({\n\t\t\t\t\t\tsessionId,\n\t\t\t\t\t\ttitle: title ?? \"\",\n\t\t\t\t\t\tstatus: \"ready\",\n\t\t\t\t\t\titems: Array.isArray(result?.items) ? result.items : [],\n\t\t\t\t\t\terror: null,\n\t\t\t\t\t\ttruncated: result?.truncated === true,\n\t\t\t\t\t\tshown: typeof result?.shown === \"number\" ? result.shown : 0,\n\t\t\t\t\t\ttotal: typeof result?.total === \"number\" ? result.total : 0\n\t\t\t\t\t});\n\t\t\t\t}).catch((reason) => {\n\t\t\t\t\tif (controller.signal.aborted) return;\n\t\t\t\t\tsetArchiveDetail({ sessionId, title: title ?? \"\", status: \"error\", items: [], error: reason instanceof Error ? reason.message : String(reason), truncated: false, shown: 0, total: 0 });\n\t\t\t\t});\n\t\t\t};\n\t\t\tconst onArchiveCopy = () => {\n\t\t\t\tif (!archiveClipboardAvailable || archiveDetail.items.length === 0) return;\n\t\t\t\tconst text = archiveDetail.items.map((item) => (item.role === \"user\" ? t(\"archive.manager.roleUser\") : t(\"archive.manager.roleAssistant\")) + \" \" + formatArchiveTime(item.time) + \"\\n\" + item.text).join(\"\\n\\n\");\n\t\t\t\tnavigator.clipboard.writeText(text).then(() => {\n\t\t\t\t\tsetArchiveCopyState(\"copied\");\n\t\t\t\t\twindow.setTimeout(() => setArchiveCopyState(\"idle\"), 1600);\n\t\t\t\t}).catch(() => setArchiveCopyState(\"idle\"));\n\t\t\t};\n\t\t\tconst renderArchiveTranscript = () => {\n\t\t\t\tif (archiveDetail.sessionId === null) return (0, react_jsx_runtime.jsx)(\"div\", { className: \"dcmArchivePlaceholder\", children: t(\"archive.manager.detail.empty\") });\n\t\t\t\tif (archiveDetail.status === \"loading\") return (0, react_jsx_runtime.jsx)(\"div\", { className: \"dcmArchivePlaceholder\", role: \"status\", children: t(\"archive.manager.detail.loading\") });\n\t\t\t\tif (archiveDetail.status === \"error\") return (0, react_jsx_runtime.jsxs)(\"div\", { className: \"dcmArchivePlaceholder\", role: \"alert\", children: [\n\t\t\t\t\t(0, react_jsx_runtime.jsx)(\"div\", { children: t(\"archive.manager.detail.error\", { message: archiveDetail.error }) }),\n\t\t\t\t\t(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, { variant: \"outline\", className: \"dcmArchiveRowAction\", onClick: () => onArchiveSelect(archiveDetail.sessionId, archiveDetail.title), children: t(\"archive.manager.retry\") })\n\t\t\t\t] });\n\t\t\t\tif (archiveDetail.items.length === 0) return (0, react_jsx_runtime.jsx)(\"div\", { className: \"dcmArchivePlaceholder\", children: t(\"archive.manager.detail.noMessages\") });\n\t\t\t\tconst messages = archiveDetail.items.map((item) => (0, react_jsx_runtime.jsxs)(\"div\", {\n\t\t\t\t\tkey: item.seq,\n\t\t\t\t\tclassName: item.role === \"user\" ? \"dcmArchiveMessage dcmArchiveMessageUser\" : \"dcmArchiveMessage dcmArchiveMessageAssistant\",\n\t\t\t\t\tchildren: [\n\t\t\t\t\t\t(0, react_jsx_runtime.jsxs)(\"div\", { className: \"dcmArchiveMessageHead\", children: [\n\t\t\t\t\t\t\t(0, react_jsx_runtime.jsx)(\"span\", { children: item.role === \"user\" ? t(\"archive.manager.roleUser\") : t(\"archive.manager.roleAssistant\") }),\n\t\t\t\t\t\t\t(0, react_jsx_runtime.jsx)(\"span\", { children: formatArchiveTime(item.time) })\n\t\t\t\t\t\t] }),\n\t\t\t\t\t\t(0, react_jsx_runtime.jsx)(\"div\", { className: \"dcmArchiveMessageBody\", children: item.text })\n\t\t\t\t\t]\n\t\t\t\t}, item.seq));\n\t\t\t\treturn (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [\n\t\t\t\t\tmessages,\n\t\t\t\t\tarchiveDetail.truncated && (0, react_jsx_runtime.jsx)(\"div\", { className: \"dcmArchiveNotice\", children: t(\"archive.manager.detail.truncated\", { n: archiveDetail.shown }) })\n\t\t\t\t] });\n\t\t\t};\n\t\t\tconst [sessionDeleteTarget, setSessionDeleteTarget] = (0, react.useState)(null);`,
    'archive manager state',
  )
  patch(
    '\t\t\t\t\t\t\tonSessionArchive,\n\t\t\t\t\t\t\tarchivedSessionIds,\n',
    '\t\t\t\t\t\t\tonSessionArchive,\n\t\t\t\t\t\t\tonSessionDelete,\n\t\t\t\t\t\t\tarchivedSessionIds,\n',
    'flat list delete handler',
  )
  patch(
    '\t\t\t\t\t\t\tonSessionArchive,\n\t\t\t\t\t\t\tforkSession,\n',
    '\t\t\t\t\t\t\tonSessionArchive,\n\t\t\t\t\t\t\tonSessionDelete,\n\t\t\t\t\t\t\tforkSession,\n',
    'session tree delete handler',
  )
  patch(
    'children: [wide && (0, react_jsx_runtime.jsx)(ViewOptionsMenu, {',
    `children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
\t\t\t\t\t\t\t\t\tlabel: t("archive.manager.title"),
\t\t\t\t\t\t\t\t\tside: "bottom",
\t\t\t\t\t\t\t\t\tdelayMs: 500,
\t\t\t\t\t\t\t\t\tchildren: (0, react_jsx_runtime.jsx)("button", {
\t\t\t\t\t\t\t\t\t\tid: "archived-sessions",
\t\t\t\t\t\t\t\t\t\ttype: "button",
\t\t\t\t\t\t\t\t\t\tclassName: WorkspaceBrowser_module_css_default.iconButton,
\t\t\t\t\t\t\t\t\t\t"aria-label": t("archive.manager.title"),
\t\t\t\t\t\t\t\t\t\tonClick: () => { if (openArchivedSettings()) return; setArchiveError(null); setArchiveManagerOpen(true); },
\t\t\t\t\t\t\t\t\t\tchildren: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconArchiveOutline20, { size: wide ? 16 : 18 })
\t\t\t\t\t\t\t\t\t})
\t\t\t\t\t\t\t\t}), openArchivedSettings(true) && (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
                    label: t("archive.manager.advanced"), side: "bottom", delayMs: 500,
                    children: (0, react_jsx_runtime.jsx)("button", {
                        type: "button", className: WorkspaceBrowser_module_css_default.iconButton,
                        "aria-label": t("archive.manager.advanced"),
                        onClick: () => { setArchiveError(null); setArchiveManagerOpen(true); },
                        children: (0, react_jsx_runtime.jsx)("svg", {
                            width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", "aria-hidden": true,
                            children: (0, react_jsx_runtime.jsx)("path", { d: "M11 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm-1 3 4 4" })
                        })
                    })
                }), wide && (0, react_jsx_runtime.jsx)(ViewOptionsMenu, {`,
    'archive manager header action',
  )
  patch(
    'max-width:60px;transition:max-width .18s var(--ds-ease-in-out)',
    'max-width:124px;transition:max-width .18s var(--ds-ease-in-out)',
    'workspace header action capacity',
  )
  patch(
    `\t\t\t\t\t(0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Modal, {\n\t\t\t\t\t\topen: deleteTarget !== null,\n`,
    `\t\t\t\t\t(0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
\t\t\t\t\t\topen: archiveManagerOpen,\n\t\t\t\t\t\tonClose: () => { if (archiveBusyId === null) setArchiveManagerOpen(false); },\n\t\t\t\t\t\tcloseLabel: t(\"close\"),\n\t\t\t\t\t\ttitle: t(openArchivedSettings(true) ? \"archive.manager.advanced\" : \"archive.manager.title\"),\n\t\t\t\t\t\tdescription: t(\"archive.manager.description\", { n: archivedSessionIds.length }),\n\t\t\t\t\t\tclassName: \"dcmArchiveDialog\",\n\t\t\t\t\t\tfooter: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {\n\t\t\t\t\t\t\tvariant: \"outline\",\n\t\t\t\t\t\t\tdisabled: archiveBusyId !== null,\n\t\t\t\t\t\t\tonClick: () => setArchiveManagerOpen(false),\n\t\t\t\t\t\t\tchildren: t(\"close\")\n\t\t\t\t\t\t}),\n\t\t\t\t\t\tchildren: [(0, react_jsx_runtime.jsx)(\"input\", {\n\t\t\t\t\t\t\tclassName: WorkspaceBrowser_module_css_default.renameInput,\n\t\t\t\t\t\t\ttype: \"search\",\n\t\t\t\t\t\t\tvalue: archiveQuery,\n\t\t\t\t\t\t\tmaxLength: SEARCH_QUERY_MAX_CODE_UNITS,\n\t\t\t\t\t\t\tplaceholder: t(\"archive.manager.searchPlaceholder\"),\n\t\t\t\t\t\t\t\"aria-label\": t(\"archive.manager.searchPlaceholder\"),\n\t\t\t\t\t\t\tonChange: (event) => { setArchiveQuery(event.target.value); setArchiveError(null); }\n\t\t\t\t\t\t}), archiveSearch.status === \"loading\" && (0, react_jsx_runtime.jsx)(\"div\", {\n\t\t\t\t\t\t\tclassName: \"dcmArchiveNotice\",\n\t\t\t\t\t\t\trole: \"status\",\n\t\t\t\t\t\t\tchildren: t(\"archive.manager.searching\")\n\t\t\t\t\t\t}), archiveSearch.status === \"error\" && (0, react_jsx_runtime.jsx)(\"div\", {\n\t\t\t\t\t\t\tclassName: \"dcmArchiveError\",\n\t\t\t\t\t\t\trole: \"status\",\n\t\t\t\t\t\t\tchildren: t(\"archive.manager.searchUnavailable\")\n\t\t\t\t\t\t}), (0, react_jsx_runtime.jsxs)(\"div\", {\n\t\t\t\t\t\t\tclassName: \"dcmArchiveLayout\",\n\t\t\t\t\t\t\tchildren: [(0, react_jsx_runtime.jsxs)(\"div\", {\n\t\t\t\t\t\t\t\tclassName: \"dcmArchiveListPane\",\n\t\t\t\t\t\t\t\tchildren: [(0, react_jsx_runtime.jsx)(\"div\", {\n\t\t\t\t\t\t\t\t\tclassName: \"dcmArchiveList\",\n\t\t\t\t\t\t\t\t\tchildren: archiveRows.length === 0 ? (0, react_jsx_runtime.jsx)(\"div\", {\n\t\t\t\t\t\t\t\t\t\tclassName: \"dcmArchivePlaceholder\",\n\t\t\t\t\t\t\t\t\t\tchildren: normalizedArchiveQuery === \"\" ? t(\"archive.manager.empty\") : t(\"archive.manager.noMatches\")\n\t\t\t\t\t\t\t\t\t}) : archiveRows.map((row) => (0, react_jsx_runtime.jsxs)(\"div\", {\n\t\t\t\t\t\t\t\t\t\tkey: row.id,\n\t\t\t\t\t\t\t\t\t\tclassName: archiveDetail.sessionId === row.id ? \"dcmArchiveRow dcmArchiveRowActive\" : \"dcmArchiveRow\",\n\t\t\t\t\t\t\t\t\t\trole: \"button\",\n\t\t\t\t\t\t\t\t\t\ttabIndex: 0,\n\t\t\t\t\t\t\t\t\t\t\"aria-pressed\": archiveDetail.sessionId === row.id,\n\t\t\t\t\t\t\t\t\t\tonClick: () => onArchiveSelect(row.id, row.title),\n\t\t\t\t\t\t\t\t\t\tonKeyDown: (event) => {\n\t\t\t\t\t\t\t\t\t\t\tif (event.target !== event.currentTarget) return;\n\t\t\t\t\t\t\t\t\t\t\tif (event.key !== \"Enter\" && event.key !== \" \") return;\n\t\t\t\t\t\t\t\t\t\t\tevent.preventDefault();\n\t\t\t\t\t\t\t\t\t\t\tonArchiveSelect(row.id, row.title);\n\t\t\t\t\t\t\t\t\t\t},\n\t\t\t\t\t\t\t\t\t\tchildren: [(0, react_jsx_runtime.jsx)(\"div\", {\n\t\t\t\t\t\t\t\t\t\t\tclassName: \"dcmArchiveRowTitle\",\n\t\t\t\t\t\t\t\t\t\t\tchildren: row.title\n\t\t\t\t\t\t\t\t\t\t}), (0, react_jsx_runtime.jsx)(\"div\", {\n\t\t\t\t\t\t\t\t\t\t\tclassName: \"dcmArchiveRowMeta\",\n\t\t\t\t\t\t\t\t\t\t\tchildren: row.workspace\n\t\t\t\t\t\t\t\t\t\t}), archiveSnippets.has(row.id) && (0, react_jsx_runtime.jsx)(\"div\", {\n\t\t\t\t\t\t\t\t\t\t\tclassName: \"dcmArchiveRowSnippet\",\n\t\t\t\t\t\t\t\t\t\t\tchildren: archiveSnippets.get(row.id)\n\t\t\t\t\t\t\t\t\t\t}), (0, react_jsx_runtime.jsxs)(\"div\", {\n\t\t\t\t\t\t\t\t\t\t\tclassName: \"dcmArchiveRowActions\",\n\t\t\t\t\t\t\t\t\t\t\tchildren: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {\n\t\t\t\t\t\t\t\t\t\t\t\tvariant: \"outline\",\n\t\t\t\t\t\t\t\t\t\t\t\tclassName: \"dcmArchiveRowAction\",\n\t\t\t\t\t\t\t\t\t\t\t\tdisabled: archiveBusyId !== null,\n\t\t\t\t\t\t\t\t\t\t\t\tonClick: (event) => { event.stopPropagation(); onArchiveRestore(row.id); },\n\t\t\t\t\t\t\t\t\t\t\t\tchildren: archiveBusyId === row.id ? t(\"archive.manager.restoring\") : t(\"archive.manager.restore\")\n\t\t\t\t\t\t\t\t\t\t\t}), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {\n\t\t\t\t\t\t\t\t\t\t\t\tvariant: \"outline\",\n\t\t\t\t\t\t\t\t\t\t\t\tclassName: \"dcmArchiveRowAction \" + WorkspaceBrowser_module_css_default.deleteAction,\n\t\t\t\t\t\t\t\t\t\t\t\tdisabled: archiveBusyId !== null,\n\t\t\t\t\t\t\t\t\t\t\t\tonClick: (event) => { event.stopPropagation(); onSessionDelete(row.id, row.title); },\n\t\t\t\t\t\t\t\t\t\t\t\tchildren: t(\"archive.manager.delete\")\n\t\t\t\t\t\t\t\t\t\t\t})]\n\t\t\t\t\t\t\t\t\t\t})]\n\t\t\t\t\t\t\t\t\t}, row.id))\n\t\t\t\t\t\t\t\t}), archiveSearch.hasMore && (0, react_jsx_runtime.jsx)(\"div\", {\n\t\t\t\t\t\t\t\t\tclassName: \"dcmArchiveNotice\",\n\t\t\t\t\t\t\t\t\tchildren: t(\"archive.manager.hasMore\")\n\t\t\t\t\t\t\t\t}), archiveError !== null && (0, react_jsx_runtime.jsx)(\"div\", {\n\t\t\t\t\t\t\t\t\tclassName: \"dcmArchiveError\",\n\t\t\t\t\t\t\t\t\trole: \"alert\",\n\t\t\t\t\t\t\t\t\tchildren: archiveError\n\t\t\t\t\t\t\t\t})]\n\t\t\t\t\t\t\t}), (0, react_jsx_runtime.jsxs)(\"div\", {\n\t\t\t\t\t\t\t\tclassName: \"dcmArchiveDetailPane\",\n\t\t\t\t\t\t\t\tchildren: [(0, react_jsx_runtime.jsxs)(\"div\", {\n\t\t\t\t\t\t\t\t\tclassName: \"dcmArchiveDetailHead\",\n\t\t\t\t\t\t\t\t\tchildren: [(0, react_jsx_runtime.jsx)(\"div\", {\n\t\t\t\t\t\t\t\t\t\tclassName: \"dcmArchiveDetailTitle\",\n\t\t\t\t\t\t\t\t\t\tchildren: archiveDetail.sessionId === null ? t(\"archive.manager.detail.title\") : archiveDetail.title\n\t\t\t\t\t\t\t\t\t}), (0, react_jsx_runtime.jsxs)(\"div\", {\n\t\t\t\t\t\t\t\t\t\tclassName: \"dcmArchiveDetailMeta\",\n\t\t\t\t\t\t\t\t\t\tchildren: [(0, react_jsx_runtime.jsx)(\"span\", {\n\t\t\t\t\t\t\t\t\t\t\tchildren: archiveDetail.status === \"ready\" ? t(\"archive.manager.detail.meta\", { n: archiveDetail.total }) : \"\"\n\t\t\t\t\t\t\t\t\t\t}), archiveDetail.status === \"ready\" && archiveClipboardAvailable && (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {\n\t\t\t\t\t\t\t\t\t\t\tvariant: \"outline\",\n\t\t\t\t\t\t\t\t\t\t\tclassName: \"dcmArchiveRowAction\",\n\t\t\t\t\t\t\t\t\t\t\tonClick: onArchiveCopy,\n\t\t\t\t\t\t\t\t\t\t\tchildren: archiveCopyState === \"copied\" ? t(\"archive.manager.copied\") : t(\"archive.manager.copy\")\n\t\t\t\t\t\t\t\t\t\t})]\n\t\t\t\t\t\t\t\t\t})]\n\t\t\t\t\t\t\t\t}), (0, react_jsx_runtime.jsx)(\"div\", {\n\t\t\t\t\t\t\t\t\tclassName: \"dcmArchiveTranscript\",\n\t\t\t\t\t\t\t\t\tchildren: renderArchiveTranscript()\n\t\t\t\t\t\t\t\t})]\n\t\t\t\t\t\t\t})]\n\t\t\t\t\t\t})]\n\t\t\t\t\t}),\n\t\t\t\t\t(0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Modal, {\n\t\t\t\t\t\topen: deleteTarget !== null,
`,
    'archive manager modal',
  )
  patch(
    `\t\t\t\t\t(0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Modal, {\n\t\t\t\t\t\topen: deleteTarget !== null,\n`,
    `\t\t\t\t\t(0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Modal, {\n\t\t\t\t\t\topen: sessionDeleteTarget !== null,\n\t\t\t\t\t\tonClose: closeSessionDelete,\n\t\t\t\t\t\tcloseLabel: t("close"),\n\t\t\t\t\t\ttitle: t("delete.session.title"),\n\t\t\t\t\t\t...sessionDeleteTarget === null ? {} : { description: t("delete.session.desc", { name: sessionDeleteTarget.title }) },\n\t\t\t\t\t\tfooter: (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {\n\t\t\t\t\t\t\tvariant: "outline",\n\t\t\t\t\t\t\tdisabled: sessionDeleting,\n\t\t\t\t\t\t\tonClick: closeSessionDelete,\n\t\t\t\t\t\t\tchildren: t("cancel")\n\t\t\t\t\t\t}), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {\n\t\t\t\t\t\t\tvariant: "outline",\n\t\t\t\t\t\t\tclassName: WorkspaceBrowser_module_css_default.deleteAction,\n\t\t\t\t\t\t\tdisabled: sessionDeleting,\n\t\t\t\t\t\t\tonClick: confirmSessionDelete,\n\t\t\t\t\t\t\tchildren: t("delete.session.confirm")\n\t\t\t\t\t\t})] }),\n\t\t\t\t\t\tchildren: [sessionDeleting && (0, react_jsx_runtime.jsx)("div", {\n\t\t\t\t\t\t\tclassName: WorkspaceBrowser_module_css_default.deleteStatus,\n\t\t\t\t\t\t\trole: "status",\n\t\t\t\t\t\t\tchildren: t("delete.session.pending")\n\t\t\t\t\t\t}), sessionDeleteError !== null && (0, react_jsx_runtime.jsx)("div", {\n\t\t\t\t\t\t\tclassName: WorkspaceBrowser_module_css_default.renameError,\n\t\t\t\t\t\t\trole: "alert",\n\t\t\t\t\t\t\tchildren: sessionDeleteError\n\t\t\t\t\t\t})]\n\t\t\t\t\t}),\n\t\t\t\t\t(0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Modal, {\n\t\t\t\t\t\topen: deleteTarget !== null,\n`,
    'session delete confirmation modal',
  )
  patch(
    '\t\t\t"menu.archiveSession": "归档会话",\n',
    '\t\t\t"menu.archiveSession": "归档会话",\n\t\t\t"archive.manager.title": "归档会话",\n\t\t\t"archive.manager.advanced": "归档内容搜索与管理",\n\t\t\t"archive.manager.description": "共 {n} 个归档会话。可按名称、工作区或聊天内容搜索。",\n\t\t\t"archive.manager.searchPlaceholder": "搜索归档名称、工作区或聊天内容…",\n\t\t\t"archive.manager.searching": "正在搜索归档聊天记录…",\n\t\t\t"archive.manager.searchUnavailable": "内容搜索暂不可用，仅显示名称与工作区匹配。",\n\t\t\t"archive.manager.empty": "暂无归档会话",\n\t\t\t"archive.manager.noMatches": "没有匹配的归档会话",\n\t\t\t"archive.manager.hasMore": "仅显示前 20 条内容匹配，请缩小搜索范围。",\n\t\t\t"archive.manager.restore": "恢复",\n\t\t\t"archive.manager.restoring": "恢复中…",\n\t\t\t"archive.manager.delete": "永久删除",\n\t\t\t"menu.deleteSession": "删除会话",\n\t\t\t"delete.session.title": "永久删除会话？",\n\t\t\t"delete.session.desc": "“{name}”的会话记录将从本机永久删除，且无法恢复。正在运行的任务会先安全停止。",\n\t\t\t"delete.session.confirm": "永久删除",\n\t\t\t"delete.session.pending": "正在永久删除会话…",\n\t\t\t\t\t\t\"archive.manager.detail.title\": \"归档对话内容\",\n\t\t\t\"archive.manager.detail.empty\": \"在左侧选择一个归档会话，即可查看完整对话内容。\",\n\t\t\t\"archive.manager.detail.loading\": \"正在读取归档对话…\",\n\t\t\t\"archive.manager.detail.error\": \"读取归档对话失败：{message}\",\n\t\t\t\"archive.manager.detail.noMessages\": \"该归档会话没有可显示的对话消息。\",\n\t\t\t\"archive.manager.detail.meta\": \"共 {n} 条消息\",\n\t\t\t\"archive.manager.detail.truncated\": \"内容较长，仅显示前 {n} 条消息。\",\n\t\t\t\"archive.manager.roleUser\": \"我\",\n\t\t\t\"archive.manager.roleAssistant\": \"助手\",\n\t\t\t\"archive.manager.copy\": \"复制对话\",\n\t\t\t\"archive.manager.copied\": \"已复制\",\n\t\t\t\"archive.manager.retry\": \"重试\",\n',
    'Chinese delete locale',
  )
  patch(
    '\t\t\t"menu.archiveSession": "Archive session",\n',
    '\t\t\t"menu.archiveSession": "Archive session",\n\t\t\t"archive.manager.title": "Archived sessions",\n\t\t\t"archive.manager.advanced": "Search and manage archived content",\n\t\t\t"archive.manager.description": "{n} archived sessions. Search by name, workspace, or conversation content.",\n\t\t\t"archive.manager.searchPlaceholder": "Search archived names, workspaces, or conversation content…",\n\t\t\t"archive.manager.searching": "Searching archived conversation history…",\n\t\t\t"archive.manager.searchUnavailable": "Content search is temporarily unavailable. Showing name and workspace matches.",\n\t\t\t"archive.manager.empty": "No archived sessions",\n\t\t\t"archive.manager.noMatches": "No matching archived sessions",\n\t\t\t"archive.manager.hasMore": "Showing the first 20 content matches. Narrow your search.",\n\t\t\t"archive.manager.restore": "Restore",\n\t\t\t"archive.manager.restoring": "Restoring…",\n\t\t\t"archive.manager.delete": "Delete permanently",\n\t\t\t"menu.deleteSession": "Delete session",\n\t\t\t"delete.session.title": "Permanently delete session?",\n\t\t\t"delete.session.desc": "The local record for “{name}” will be permanently deleted and cannot be recovered. Running work will be stopped safely before deletion.",\n\t\t\t"delete.session.confirm": "Delete permanently",\n\t\t\t"delete.session.pending": "Permanently deleting session…",\n\t\t\t\t\t\t\"archive.manager.detail.title\": \"Archived conversation\",\n\t\t\t\"archive.manager.detail.empty\": \"Select an archived session on the left to read its full conversation.\",\n\t\t\t\"archive.manager.detail.loading\": \"Reading the archived conversation…\",\n\t\t\t\"archive.manager.detail.error\": \"Reading the archived conversation failed: {message}\",\n\t\t\t\"archive.manager.detail.noMessages\": \"This archived session has no conversation messages to show.\",\n\t\t\t\"archive.manager.detail.meta\": \"{n} messages\",\n\t\t\t\"archive.manager.detail.truncated\": \"Only the first {n} messages are shown.\",\n\t\t\t\"archive.manager.roleUser\": \"You\",\n\t\t\t\"archive.manager.roleAssistant\": \"Assistant\",\n\t\t\t\"archive.manager.copy\": \"Copy conversation\",\n\t\t\t\"archive.manager.copied\": \"Copied\",\n\t\t\t\"archive.manager.retry\": \"Retry\",\n',
    'English delete locale',
  )
  const archiveActionMarker = findMarker(source, [
    `\t\t\t\tarchiveSession: async (sessionId) => {\n\t\t\t\t\tawait ctx.workspaces.archiveSession(sessionId);\n\t\t\t\t},\n`,
    `\t\t\t\tarchiveSession: async (sessionId) => {\n\t\t\t\t\tawait uiWorkspace.archiveSession(sessionId);\n\t\t\t\t},\n`,
  ], 'browser archive action')
  patch(
    archiveActionMarker,
    `\t\t\t\tarchiveSession: async (sessionId) => {\n\t\t\t\t\tawait ctx.workspaces.archiveSession(sessionId);\n\t\t\t\t},\n\t\t\t\tdeleteSession: async (sessionId) => {\n\t\t\t\t\tconst response = await fetch("/plugins/dsh-session-delete/delete", {\n\t\t\t\t\t\tmethod: "POST",\n\t\t\t\t\t\theaders: {\n\t\t\t\t\t\t\t"content-type": "application/json",\n\t\t\t\t\t\t\t"x-dsh-session-delete-confirmation": "delete-session"\n\t\t\t\t\t\t},\n\t\t\t\t\t\tbody: JSON.stringify({ sessionId })\n\t\t\t\t\t});\n\t\t\t\t\tconst payload = await response.json().catch(() => null);\n\t\t\t\t\tif (!response.ok || payload?.ok !== true) {\n\t\t\t\t\t\tthrow new Error(payload?.error?.message ?? \`Delete failed (HTTP \${response.status})\`);\n\t\t\t\t\t}\n\t\t\t\t\tif (ctx.sessions.list.getSnapshot().current === sessionId) ctx.sessions.clear();\n\t\t\t\t\tconst refreshes = await Promise.allSettled([\n\t\t\t\t\t\tctx.sessions.refresh(),\n\t\t\t\t\t\tctx.workspaces.refresh()\n\t\t\t\t\t]);\n\t\t\t\t\tfor (const refresh of refreshes) {\n\t\t\t\t\t\tif (refresh.status === "rejected") console.warn("session deletion succeeded but runtime refresh failed:", refresh.reason);\n\t\t\t\t\t}\n\t\t\t\t},\n`,
    'browser delete request',
  )
  patch(
    '\t\t\t\tinsertSessionBefore: async (workspaceId, sessionId, beforeSessionId) => {\n',
    `\t\t\t\topenArchivedSettings: (probe = false) => (${openOfficialArchives.toString()})(ctx, probe),
\t\t\t\trestoreSession: async (sessionId) => {
\t\t\t\t\tconst response = await fetch("/plugins/dsh-session-delete/restore", {
\t\t\t\t\t\tmethod: "POST",
\t\t\t\t\t\theaders: {
\t\t\t\t\t\t\t"content-type": "application/json",
\t\t\t\t\t\t\t"x-dsh-session-manager-action": "restore-session"
\t\t\t\t\t\t},
\t\t\t\t\t\tbody: JSON.stringify({ sessionId })
\t\t\t\t\t});
\t\t\t\t\tconst payload = await response.json().catch(() => null);
\t\t\t\t\tif (!response.ok || payload?.ok !== true) throw new Error(payload?.error?.message ?? \`Restore failed (HTTP \${response.status})\`);
\t\t\t\t\tconst refreshes = await Promise.allSettled([ctx.sessions.refresh(), ctx.workspaces.refresh()]);
\t\t\t\t\tfor (const refresh of refreshes) if (refresh.status === "rejected") console.warn("session restore succeeded but runtime refresh failed:", refresh.reason);
\t\t\t\t},
\t\t\t\t\t\t\t\treadArchivedSession: async (sessionId, signal) => {\n\t\t\t\t\tconst response = await fetch(\"/plugins/dsh-session-delete/archive-detail\", {\n\t\t\t\t\t\tmethod: \"POST\",\n\t\t\t\t\t\theaders: { \"content-type\": \"application/json\" },\n\t\t\t\t\t\tbody: JSON.stringify({ sessionId }),\n\t\t\t\t\t\tsignal\n\t\t\t\t\t});\n\t\t\t\t\tconst payload = await response.json().catch(() => null);\n\t\t\t\t\tif (!response.ok || payload?.ok !== true) throw new Error(payload?.error?.message ?? \"Archived detail failed (HTTP \" + response.status + \")\");\n\t\t\t\t\treturn payload.value;\n\t\t\t\t},\n\t\t\t\tsearchArchivedSessions: async (query, signal) => {
\t\t\t\t\tconst response = await fetch("/plugins/dsh-session-delete/archive-search", {
\t\t\t\t\t\tmethod: "POST",
\t\t\t\t\t\theaders: { "content-type": "application/json" },
\t\t\t\t\t\tbody: JSON.stringify({ query }),
\t\t\t\t\t\tsignal
\t\t\t\t\t});
\t\t\t\t\tconst payload = await response.json().catch(() => null);
\t\t\t\t\tif (!response.ok || payload?.ok !== true) throw new Error(payload?.error?.message ?? \`Archived search failed (HTTP \${response.status})\`);
\t\t\t\t\treturn payload.value;
\t\t\t\t},
\t\t\t\tinsertSessionBefore: async (workspaceId, sessionId, beforeSessionId) => {
`,
    'browser archive manager requests',
  )
  const workspaceRefreshCall = 'ctx.workspaces.refresh()'
  if (source.split(workspaceRefreshCall).length !== 3) {
    throw new Error('upstream marker mismatch: workspace refresh compatibility')
  }
  source = source.replaceAll(
    workspaceRefreshCall,
    'typeof ctx.workspaces.refresh === "function" ? ctx.workspaces.refresh() : Promise.resolve()',
  )
  const homePathCall = '(0, _deepseek_ai_dsh_client_runtime_client.abbreviateHomePath)(row.cwd, home)'
  if (source.includes(homePathCall)) {
    patch(
      homePathCall,
      'typeof _deepseek_ai_dsh_client_runtime_client.abbreviateHomePath === "function" ? (0, _deepseek_ai_dsh_client_runtime_client.abbreviateHomePath)(row.cwd, home) : row.cwd',
      'home path compatibility fallback',
    )
  }

  source = source.replace(
    /\/\/#region \\0dsh-css:[^\r\n]*?packages[\\/]client[\\/]ui-workspace[\\/]/g,
    '//#region \\0dsh-css:@deepseek-ai/dsh-client-ui-workspace/',
  )
  source = source.replace(
    /(^\s*\/\/#region \\0dsh-css:@deepseek-ai\/dsh-client-ui-workspace\/)([^\r\n]+)/gm,
    (_, prefix, modulePath) => `${prefix}${modulePath.replaceAll('\\', '/')}`,
  )
  source = normalizeCssModulePrefix(source, 'Rows', 'dcmRows')
  source = normalizeCssModulePrefix(source, 'WorkspacePicker', 'dcmPicker')
  source = normalizeCssModulePrefix(source, 'WorkspaceBrowser', 'dcmBrowser')

  const notice = `// Modified from @deepseek-ai/dsh-client-ui-workspace ${upstreamVersion} by DSH Chat Manager. See THIRD_PARTY_NOTICES.md.\n`
  return `${notice}${source}`
}

export async function buildClient() {
  const stableManifest = JSON.parse(await readFile(resolveLegacyManifest(), 'utf8'))
  const expectedStableVersion = compatibility.legacyWorkspaceFixture === undefined
    ? LATEST_UPSTREAM_VERSION
    : Object.entries(compatibility.workspaceFixtures).find(([, fixture]) => fixture === compatibility.legacyWorkspaceFixture)?.[0]
  if (stableManifest.version !== expectedStableVersion) {
    throw new Error(
      `unsupported stable @deepseek-ai/dsh-client-ui-workspace version: ${stableManifest.version ?? 'unknown'}`,
    )
  }
  const previewManifest = JSON.parse(await readFile(
    compatibility.legacyWorkspaceFixture === undefined ? resolvePreviewManifest() : resolveUpstreamManifest(),
    'utf8',
  ))
  if (compatibility.legacyWorkspaceFixture === undefined
    ? !compatibility.previews.includes(previewManifest.version)
    : previewManifest.version !== LATEST_UPSTREAM_VERSION) {
    throw new Error(`unreviewed DSH preview ${String(previewManifest.version)}`)
  }
  const stable = patchWorkspaceClient(await readFile(resolveLegacyClient(), 'utf8'), stableManifest.version)
  const preview = patchWorkspaceClient(await readFile(
    compatibility.legacyWorkspaceFixture === undefined ? resolvePreviewClient() : resolveUpstreamClient(),
    'utf8',
  ), previewManifest.version)
  const patched = composeCompatibleClients(stable, preview)
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, patched, 'utf8')
  return output
}

if (process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  process.stdout.write(`${await buildClient()}\n`)
}
