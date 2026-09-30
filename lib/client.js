// dsh-chat-manager-wide — DSH Chat Manager Wide client half (official slots, MIT; unofficial fork of dsh-chat-manager by WSL043).
window.__ModuleLoader__.load({
	id: "dsh-chat-manager-wide",
	factory: (require) => {
		// ---------------------------------------------------------------------------
		// dsh-chat-manager-wide — browser half.
		//
		// Route C: this is an ordinary client plugin built on the official slots. It
		// does NOT replace the official workspace client and does NOT bundle any
		// upstream byte.
		//
		// This file is the source of `lib/client.js`. `scripts/build-client.mjs` pastes
		// its text verbatim into the `factory` body of the DSH client-module envelope
		// and derives the module id from `package.json#name` (identity binding #3).
		// It uses the CommonJS-flavoured dialect the browser module loader supplies to
		// a factory (`require`, `module`, `exports`) and is never executed by Node.js.
		//
		// Slots it fills (all declared by shipped packages, all additive):
		//   sidebar.workspaces.session.menu.item  -> "View archived transcript", danger "Delete session"
		//   settings.section (id archived-sessions) -> the archived-session browser page
		//   shell.overlay                          -> delete confirmation + wide transcript dialog
		//
		// Host routes it consumes (src/index.js, same-origin JSON POST):
		//   /plugins/dsh-session-delete/archive-detail   read one archived transcript
		//   /plugins/dsh-session-delete/archive-search   search archived message content
		//   /plugins/dsh-session-delete/delete           confirmed permanent deletion
		//   /plugins/dsh-session-delete/restore          archive-set fallback for cancel-archive
		// ---------------------------------------------------------------------------

		var module = { exports: {} }
		var exports = module.exports
		Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

		const React = require('react')
		const primitives = require('@deepseek-ai/dsh-client-ui-primitives')

		/** Locale namespace owned by this plugin. */
		const NS = 'dsh-chat-manager-wide'
		/** Settings section key reserved by the official settings shell. */
		const ARCHIVED_SECTION_ID = 'archived-sessions'
		const DETAIL_ROUTE = '/plugins/dsh-session-delete/archive-detail'
		const SEARCH_ROUTE = '/plugins/dsh-session-delete/archive-search'
		const RESTORE_ROUTE = '/plugins/dsh-session-delete/restore'
		const DELETE_ROUTE = '/plugins/dsh-session-delete/delete'
		const SEARCH_QUERY_MAX_CODE_UNITS = 500
		const SEARCH_DEBOUNCE_MS = 250
		const STYLE_ID = 'dcm-archive-style'

		/** Menu ids: package-namespaced so they never collide with a shipped row. */
		const MENU_ID_VIEW = 'dsh-chat-manager-wide.view-archived-transcript'
		const MENU_ID_DELETE = 'dsh-chat-manager-wide.delete-session'
		const OVERLAY_ID_DELETE = 'dsh-chat-manager-wide.delete-confirm'
		const OVERLAY_ID_ARCHIVE = 'dsh-chat-manager-wide.archive-dialog'

		/** Shipped row-menu orders: pin 100 / rename 200 / fork 300 / archive 400. */
		const MENU_ORDER_VIEW = 500
		const MENU_ORDER_DELETE = 510
		/** Shipped settings orders: account -10 / general 0 / models 10 / plugins 15 / presets 20. */
		const SECTION_ORDER = 25

		const EMPTY_LIST = []
		const EMPTY_MAP = Object.create(null)
		const IDLE_DETAIL = {
		  sessionId: null,
		  title: '',
		  status: 'idle',
		  items: EMPTY_LIST,
		  error: null,
		  truncated: false,
		  shown: 0,
		  total: 0,
		}

		// Keep the previous release's class names and geometry: the wide left-list +
		// right-transcript layout is the reason this fork exists.
		const ARCHIVE_CSS = [
		  '.dcmArchiveDialog.dcmArchiveDialog{width:min(1120px,100%);max-width:min(1120px,100%)}',
		  '.dcmArchiveLayout{display:flex;align-items:stretch;gap:12px;height:min(56vh,620px);min-height:240px;margin-top:12px}',
		  '.dcmArchiveSection{display:flex;flex-direction:column;gap:10px;min-width:0;max-width:1100px}',
		  '.dcmArchiveSection .dcmArchiveLayout{height:min(62vh,640px)}',
		  '.dcmArchiveHeading{margin:0;color:var(--dsw-alias-label-primary);font-size:18px;font-weight:600}',
		  '.dcmArchiveIntro{margin:0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px}',
		  '.dcmArchiveListPane{display:flex;flex-direction:column;gap:8px;width:340px;min-width:240px;flex:none;min-height:0}',
		  '.dcmArchiveList{display:flex;flex-direction:column;gap:8px;flex:1;min-height:0;overflow-y:auto;padding-right:4px}',
		  '.dcmArchiveRow{cursor:pointer;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:6px;background:transparent}',
		  '.dcmArchiveRow:hover{background:var(--dsw-alias-bg-layer-1)}',
		  '.dcmArchiveRowActive{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-1)}',
		  '.dcmArchiveRowTitle{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;line-height:18px;overflow-wrap:anywhere}',
		  '.dcmArchiveRowMeta{color:var(--dsw-alias-label-secondary);font-size:12px;overflow-wrap:anywhere}',
		  '.dcmArchiveRowSnippet{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;overflow-wrap:anywhere}',
		  '.dcmArchiveRowActions{display:flex;justify-content:flex-end;gap:8px}',
		  '.dcmArchiveRowAction{min-height:26px;height:26px;padding-inline:10px;font-size:12px}',
		  '.dcmArchiveDetailPane{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;overflow:hidden}',
		  '.dcmArchiveDetailHead{display:flex;flex-direction:column;gap:2px;padding:10px 12px;border-bottom:1px solid var(--dsw-alias-border-l2)}',
		  '.dcmArchiveDetailTitle{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;overflow-wrap:anywhere}',
		  '.dcmArchiveDetailMeta{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:20px;color:var(--dsw-alias-label-secondary);font-size:12px}',
		  '.dcmArchiveTranscript{flex:1;min-height:0;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:10px}',
		  '.dcmArchiveDay{display:flex;align-items:center;gap:8px;margin:2px 0;color:var(--dsw-alias-label-secondary);font-size:11px}',
		  '.dcmArchiveDay:before,.dcmArchiveDay:after{content:"";flex:1;height:1px;background:var(--dsw-alias-border-l2)}',
		  '.dcmArchiveTurn{display:flex;flex-direction:column;gap:4px;max-width:90%;border-radius:14px}',
		  '.dcmArchiveTurn-user{align-self:flex-end;align-items:flex-end}',
		  '.dcmArchiveTurn-assistant{align-self:flex-start}',
		  '.dcmArchiveTurn-synthetic{align-self:flex-start}',
		  '.dcmArchiveTurn-synthetic .dcmArchiveTurnBody{background:var(--dsw-alias-bg-layer-2);border-style:dashed}',
		  '.dcmArchiveTurn-synthetic .dcmArchiveRoleChip{color:var(--dsw-alias-label-secondary)}',
		  '.dcmArchiveTurnHit{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}',
		  '.dcmArchiveRole{display:flex;align-items:center;gap:6px;color:var(--dsw-alias-label-secondary);font-size:11px}',
		  '.dcmArchiveRoleChip{font-weight:500}',
		  '.dcmArchiveTurn-user .dcmArchiveRoleChip{color:var(--dsw-alias-brand-primary)}',
		  '.dcmArchiveTurnBody{display:flex;flex-direction:column;gap:8px;padding:8px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;overflow-wrap:anywhere}',
		  '.dcmArchiveTurn-user .dcmArchiveTurnBody{background:var(--dsw-alias-bg-layer-1);border-color:transparent}',
		  '.dcmArchiveTurn-assistant .dcmArchiveTurnBody{background:transparent}',
		  '.dcmArchivePlain{white-space:pre-wrap;color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px}',
		  '.dcmArchiveMark{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border-radius:3px;padding:0 1px}',
		  '.dcmArchiveFolded{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-1);font-size:12px}',
		  '.dcmArchiveFolded>summary{cursor:pointer;padding:6px 10px;color:var(--dsw-alias-label-secondary);display:flex;align-items:center;gap:8px;min-width:0}',
		  '.dcmArchiveToolName{color:var(--dsw-alias-label-primary);font-weight:500;flex:none}',
		  '.dcmArchiveToolHint{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
		  '.dcmArchiveToolFlag{flex:none;color:var(--dsw-alias-state-error-primary)}',
		  '.dcmArchiveFoldedBody{display:flex;flex-direction:column;gap:4px;padding:0 10px 8px}',
		  '.dcmArchiveFoldedLabel{color:var(--dsw-alias-label-secondary);font-size:11px}',
		  '.dcmArchivePre{margin:0;padding:8px 10px;border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:12px;line-height:18px;white-space:pre-wrap;overflow-wrap:anywhere;max-height:280px;overflow:auto}',
		  '.dcmArchiveToolError{border-color:var(--dsw-alias-state-error-primary)}',
		  '.dcmArchiveChip{display:inline-flex;align-items:center;gap:6px;align-self:flex-start;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:4px 8px;color:var(--dsw-alias-label-secondary);font-size:12px}',
		  '.dcmArchiveUsage{color:var(--dsw-alias-label-secondary)}',
		  '.dcmArchiveInterrupted{color:var(--dsw-alias-state-warn-primary)}',
		  '.dcmArchiveInjection{display:flex;flex-direction:column;gap:8px}',
		  '.dcmArchiveInjectionIntro{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}',
		  '.dcmArchiveFileList{display:flex;flex-direction:column;gap:2px}',
		  '.dcmArchiveFileRow{display:flex;align-items:center;gap:8px;min-width:0;font-size:12px}',
		  '.dcmArchiveFilePath{color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
		  '.dcmArchiveFileAction{flex:none;color:var(--dsw-alias-label-secondary)}',
		  '.dcmArchiveInjectionSection{display:flex;flex-direction:column;gap:4px;padding-left:8px;border-left:2px solid var(--dsw-alias-border-l2)}',
		  '.dcmArchivePlaceholder{display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:8px;flex:1;min-height:0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px}',
		  '.dcmArchiveNotice{color:var(--dsw-alias-label-secondary);font-size:12px}',
		  '.dcmArchiveError{color:var(--dsw-alias-state-error-primary);font-size:12px;overflow-wrap:anywhere}',
		  '.dcmArchiveSearch{width:100%;box-sizing:border-box;min-height:32px;padding:6px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:13px}',
		  '.dcmArchiveRowActionDanger{color:var(--dsw-alias-state-error-primary)}',
		].join('')

		if (typeof document !== 'undefined' && document.getElementById(STYLE_ID) === null) {
		  const styleTag = document.createElement('style')
		  styleTag.id = STYLE_ID
		  styleTag.textContent = ARCHIVE_CSS
		  document.head.appendChild(styleTag)
		}

		// ---------------------------------------------------------------------------
		// Module-scoped shared state: one menu row opens what one overlay row renders.
		// ---------------------------------------------------------------------------

		const createStore = initial => {
		  let value = initial
		  const listeners = new Set()
		  return {
		    get: () => value,
		    set: next => {
		      value = next
		      for (const listener of [...listeners]) listener()
		    },
		    subscribe: listener => {
		      listeners.add(listener)
		      return () => { listeners.delete(listener) }
		    },
		  }
		}

		const useStoreValue = store => {
		  const [value, setValue] = React.useState(store.get)
		  React.useEffect(() => store.subscribe(() => setValue(store.get())), [store])
		  return value
		}

		/** Pending permanent-deletion target: `{ sessionId, title }` or null. */
		const deleteTargetStore = createStore(null)
		/** Wide transcript dialog: `{ open, sessionId, title }`. */
		const archiveDialogStore = createStore({ open: false, sessionId: null, title: '' })
		/** Last successful deletion, so an open transcript pane can drop the row. */
		const deletedSessionStore = createStore({ id: null, seq: 0 })

		const openArchiveDialog = (sessionId, title) => {
		  archiveDialogStore.set({
		    open: true,
		    sessionId: typeof sessionId === 'string' && sessionId.length > 0 ? sessionId : null,
		    title: typeof title === 'string' ? title : '',
		  })
		}
		const closeArchiveDialog = () => { archiveDialogStore.set({ open: false, sessionId: null, title: '' }) }

		const requestSessionDelete = (sessionId, title) => {
		  deleteTargetStore.set({ sessionId, title: typeof title === 'string' ? title : '' })
		}

		/** A stable no-op hook keeps the hook order identical when a standard prop is missing. */
		const noopHook = () => undefined
		const selectWith = (hook, selector, fallback) => {
		  const use = typeof hook === 'function' ? hook : noopHook
		  const value = use(selector)
		  return value === undefined ? fallback : value
		}

		const sameOriginPost = async (path, body, headers, signal) => {
		  const response = await fetch(path, {
		    method: 'POST',
		    headers: { 'content-type': 'application/json', ...headers },
		    body: JSON.stringify(body),
		    ...(signal === undefined ? {} : { signal }),
		  })
		  const payload = await response.json().catch(() => null)
		  if (!response.ok || payload?.ok !== true) {
		    throw new Error(payload?.error?.message ?? `${path} failed (HTTP ${response.status})`)
		  }
		  return payload.value
		}

		// Each route carries this plugin's own action header. The Host half needs it to
		// recognise a call from a shell whose page origin is opaque: the Desktop app
		// serves this UI from `dsh-app://app/`, so its fetch origin can never equal
		// `http(s)://<host>`. A cross-site page cannot add a custom header without a
		// CORS preflight, which is why the header is a sound gate.
		const readArchivedSession = (sessionId, signal) => sameOriginPost(
		  DETAIL_ROUTE,
		  { sessionId },
		  { 'x-dsh-session-manager-action': 'read-archive-detail' },
		  signal,
		)
		const searchArchivedSessions = (query, signal) => sameOriginPost(
		  SEARCH_ROUTE,
		  { query },
		  { 'x-dsh-session-manager-action': 'search-archive-content' },
		  signal,
		)
		const deleteSessionRemotely = sessionId => sameOriginPost(
		  DELETE_ROUTE,
		  { sessionId },
		  { 'x-dsh-session-delete-confirmation': 'delete-session' },
		)
		const restoreSessionRemotely = sessionId => sameOriginPost(
		  RESTORE_ROUTE,
		  { sessionId },
		  { 'x-dsh-session-manager-action': 'restore-session' },
		)

		/** Prefer the official archive remote so the sidebar archive set stays in sync. */
		const unarchiveSession = async (ctx, sessionId) => {
		  const workspaces = ctx.get('workspaces')
		  if (workspaces !== undefined && typeof workspaces.unarchiveSession === 'function') {
		    await workspaces.unarchiveSession(sessionId)
		    return
		  }
		  await restoreSessionRemotely(sessionId)
		}

		/** Ask the session list to re-read Host metadata after a deletion. */
		const refreshSessionList = async ctx => {
		  const sessions = ctx.get('sessions')
		  if (sessions === undefined || typeof sessions.refresh !== 'function') return
		  try {
		    await sessions.refresh()
		  } catch (error) {
		    console.warn('dsh-chat-manager-wide: session list refresh failed after deletion:', error)
		  }
		}

		const formatArchiveTime = time => {
		  if (typeof time !== 'number' || !Number.isFinite(time)) return ''
		  const date = new Date(time)
		  const pad = value => String(value).padStart(2, '0')
		  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
		}

		const messageOf = reason => (reason instanceof Error ? reason.message : String(reason))

		/**
		 * Tolerate a Host half that still answers with the pre-1.5.0 flattened `text`:
		 * a browser refresh can reach a DSH process whose host half has not restarted
		 * yet, and a missing `blocks` array must degrade instead of rendering nothing.
		 */
		const normalizeDetailItem = item => {
		  if (Array.isArray(item?.blocks) && item.blocks.length > 0) return item
		  const text = typeof item?.text === 'string' ? item.text : ''
		  return {
		    seq: typeof item?.seq === 'number' ? item.seq : 0,
		    role: item?.role === 'user' ? 'user' : 'assistant',
		    time: typeof item?.time === 'number' ? item.time : null,
		    blocks: text.trim().length === 0 ? EMPTY_LIST : [{ kind: 'text', text }],
		    degraded: true,
		  }
		}

		// ---------------------------------------------------------------------------
		// Locale dictionaries (both shipped locales are required by the registry).
		// ---------------------------------------------------------------------------

		const zh = {
		  nav: '已归档会话',
		  heading: '已归档会话',
		  intro: '归档会话无法在侧栏中打开；在这里可以阅读它们的完整正文，也可以恢复或永久删除。',
		  dialogTitle: '归档会话',
		  dialogDescription: '共 {n} 个归档会话。可按名称、工作区或聊天内容搜索。',
		  searchPlaceholder: '搜索归档名称、工作区或聊天内容…',
		  searching: '正在搜索归档聊天记录…',
		  searchUnavailable: '内容搜索暂不可用，仅显示名称与工作区匹配。',
		  empty: '暂无归档会话',
		  noMatches: '没有匹配的归档会话',
		  hasMore: '仅显示前 20 条内容匹配，请缩小搜索范围。',
		  ungrouped: '未分组',
		  restore: '恢复',
		  restoring: '恢复中…',
		  deleteRow: '永久删除',
		  detailTitle: '归档对话内容',
		  detailEmpty: '在左侧选择一个归档会话，即可查看完整对话内容。',
		  detailLoading: '正在读取归档对话…',
		  detailError: '读取归档对话失败：{message}',
		  detailNoMessages: '该归档会话没有可显示的对话消息。',
		  detailMeta: '共 {n} 条消息',
		  detailTruncated: '内容较长，仅显示前 {n} 条消息。',
		  degradedNotice: '当前 DSH 后端不提供结构化事件，这里只能显示压平后的文本。',
		  roleUser: '我',
		  roleAssistant: '助手',
		  reasoning: '思考过程',
		  toolCall: '工具调用',
		  toolArguments: '参数',
		  toolResult: '结果',
		  toolResultFailed: '结果（失败）',
		  toolFailed: '失败',
		  injectedContext: '系统注入的运行时上下文',
		  roleInjected: '系统注入',
		  injectedInstructions: '系统注入的工作区指令',
		  injectedFiles: '涉及文件',
		  rawInjection: '原始注入文本',
		  actionSet: '新增',
		  actionReplace: '更新',
		  actionRemove: '移除',
		  interrupted: '已中断',
		  imageAttachment: '图片',
		  fileAttachment: '文件',
		  bytesUnit: '字节',
		  matchCount: '{n} 处匹配',
		  jumpToMatch: '跳到首处匹配',
		  copyCode: '复制代码',
		  copiedCode: '已复制',
		  footnotes: '脚注',
		  copy: '复制对话',
		  copied: '已复制',
		  retry: '重试',
		  menuView: '查看归档正文',
		  menuDelete: '删除会话',
		  deleteTitle: '永久删除会话？',
		  deleteDesc: '“{name}”的会话记录将从本机永久删除，且无法恢复。正在运行的任务会先安全停止。',
		  deleteConfirm: '永久删除',
		  deletePending: '正在永久删除会话…',
		  cancel: '取消',
		  close: '关闭',
		}

		const en = {
		  nav: 'Archived sessions',
		  heading: 'Archived sessions',
		  intro: 'Archived sessions cannot be opened from the sidebar. Read their full transcript here, or restore and permanently delete them.',
		  dialogTitle: 'Archived sessions',
		  dialogDescription: '{n} archived sessions. Search by name, workspace, or conversation content.',
		  searchPlaceholder: 'Search archived names, workspaces, or conversation content…',
		  searching: 'Searching archived conversation history…',
		  searchUnavailable: 'Content search is temporarily unavailable. Showing name and workspace matches.',
		  empty: 'No archived sessions',
		  noMatches: 'No matching archived sessions',
		  hasMore: 'Showing the first 20 content matches. Narrow your search.',
		  ungrouped: 'Ungrouped',
		  restore: 'Restore',
		  restoring: 'Restoring…',
		  deleteRow: 'Delete permanently',
		  detailTitle: 'Archived conversation',
		  detailEmpty: 'Select an archived session on the left to read its full conversation.',
		  detailLoading: 'Reading the archived conversation…',
		  detailError: 'Reading the archived conversation failed: {message}',
		  detailNoMessages: 'This archived session has no conversation messages to show.',
		  detailMeta: '{n} messages',
		  detailTruncated: 'Only the first {n} messages are shown.',
		  degradedNotice: 'This DSH backend exposes no structured events, so only flattened text is available here.',
		  roleUser: 'Me',
		  roleAssistant: 'Assistant',
		  reasoning: 'Reasoning',
		  toolCall: 'Tool call',
		  toolArguments: 'Arguments',
		  toolResult: 'Result',
		  toolResultFailed: 'Result (failed)',
		  toolFailed: 'failed',
		  injectedContext: 'System-injected runtime context',
		  roleInjected: 'System-injected',
		  injectedInstructions: 'System-injected workspace instructions',
		  injectedFiles: 'Files',
		  rawInjection: 'Verbatim injected text',
		  actionSet: 'added',
		  actionReplace: 'updated',
		  actionRemove: 'removed',
		  interrupted: 'interrupted',
		  imageAttachment: 'Image',
		  fileAttachment: 'File',
		  bytesUnit: 'bytes',
		  matchCount: '{n} matches',
		  jumpToMatch: 'Jump to first match',
		  copyCode: 'Copy code',
		  copiedCode: 'Copied',
		  footnotes: 'Footnotes',
		  copy: 'Copy conversation',
		  copied: 'Copied',
		  retry: 'Retry',
		  menuView: 'View archived transcript',
		  menuDelete: 'Delete session',
		  deleteTitle: 'Permanently delete session?',
		  deleteDesc: 'The local record for “{name}” will be permanently deleted and cannot be recovered. Running work will be stopped safely before deletion.',
		  deleteConfirm: 'Delete permanently',
		  deletePending: 'Permanently deleting session…',
		  cancel: 'Cancel',
		  close: 'Close',
		}

		/** Required services (cordis fiber). */
		const inject = ['slots', 'locale']

		function apply(ctx) {
		  const boundT = ctx.locale.bind(NS)
		  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-chat-manager-wide: locale dictionaries')

		  const h = React.createElement

		  // -------------------------------------------------------------------------
		  // The shared left-list + right-transcript browser.
		  // -------------------------------------------------------------------------

		  const ArchiveBrowser = props => {
		    const t = props.t ?? boundT
		    const variant = props.variant === 'section' ? 'section' : 'dialog'
		    const archivedSessionIds = selectWith(
		      props.useWorkspaces,
		      state => (state === undefined ? undefined : state.archivedSessionIds),
		      EMPTY_LIST,
		    )
		    const workspaceRows = selectWith(
		      props.useWorkspaces,
		      state => (state === undefined ? undefined : state.items),
		      EMPTY_LIST,
		    )
		    const summaries = selectWith(
		      props.useSessions,
		      state => (state === undefined ? undefined : state.byId),
		      EMPTY_MAP,
		    )

		    const [query, setQuery] = React.useState('')
		    const [remote, setRemote] = React.useState({ query: '', status: 'idle', items: EMPTY_LIST, hasMore: false })
		    const [detail, setDetail] = React.useState(IDLE_DETAIL)
		    const [copyState, setCopyState] = React.useState('idle')
		    const [busyId, setBusyId] = React.useState(null)
		    const [actionError, setActionError] = React.useState(null)
		    const detailAbort = React.useRef(null)
		    const normalizedQuery = query.trim()
		    const clipboardAvailable = typeof navigator !== 'undefined'
		      && navigator.clipboard !== undefined
		      && typeof navigator.clipboard.writeText === 'function'

		    const loadDetail = React.useCallback((sessionId, title) => {
		      if (detailAbort.current !== null) detailAbort.current.abort()
		      const controller = new AbortController()
		      detailAbort.current = controller
		      setCopyState('idle')
		      setDetail({ ...IDLE_DETAIL, sessionId, title: title ?? '', status: 'loading' })
		      readArchivedSession(sessionId, controller.signal).then(result => {
		        if (controller.signal.aborted) return
		        setDetail({
		          sessionId,
		          title: title ?? '',
		          status: 'ready',
		          items: (Array.isArray(result?.items) ? result.items : EMPTY_LIST).map(normalizeDetailItem),
		          error: null,
		          truncated: result?.truncated === true,
		          shown: typeof result?.shown === 'number' ? result.shown : 0,
		          total: typeof result?.total === 'number' ? result.total : 0,
		        })
		      }).catch(reason => {
		        if (controller.signal.aborted) return
		        setDetail({ ...IDLE_DETAIL, sessionId, title: title ?? '', status: 'error', error: messageOf(reason) })
		      })
		    }, [])

		    // The row menu entry hands its session to this pane on mount.
		    const initialSessionId = props.initialSessionId
		    const initialTitle = props.initialTitle
		    React.useEffect(() => {
		      if (typeof initialSessionId !== 'string' || initialSessionId.length === 0) return
		      loadDetail(initialSessionId, initialTitle)
		    }, [initialSessionId, initialTitle, loadDetail])

		    React.useEffect(() => () => {
		      if (detailAbort.current !== null) detailAbort.current.abort()
		    }, [])

		    // Debounced archived-content search over the plugin's own Host route.
		    React.useEffect(() => {
		      if (normalizedQuery === '') {
		        setRemote({ query: '', status: 'idle', items: EMPTY_LIST, hasMore: false })
		        return undefined
		      }
		      const controller = new AbortController()
		      setRemote({ query: normalizedQuery, status: 'loading', items: EMPTY_LIST, hasMore: false })
		      const timer = window.setTimeout(() => {
		        searchArchivedSessions(normalizedQuery, controller.signal).then(result => {
		          if (controller.signal.aborted) return
		          setRemote({
		            query: normalizedQuery,
		            status: 'ready',
		            items: Array.isArray(result?.items) ? result.items : EMPTY_LIST,
		            hasMore: result?.hasMore === true,
		          })
		        }).catch(() => {
		          if (controller.signal.aborted) return
		          setRemote({ query: normalizedQuery, status: 'error', items: EMPTY_LIST, hasMore: false })
		        })
		      }, SEARCH_DEBOUNCE_MS)
		      return () => {
		        window.clearTimeout(timer)
		        controller.abort()
		      }
		    }, [normalizedQuery])

		    const workspaceTitleBySession = React.useMemo(() => {
		      const result = new Map()
		      for (const workspace of workspaceRows) {
		        for (const sessionId of workspace.sessionIds ?? EMPTY_LIST) {
		          if (!result.has(sessionId)) result.set(sessionId, workspace.title ?? workspace.path)
		        }
		      }
		      return result
		    }, [workspaceRows])

		    const snippets = React.useMemo(
		      () => new Map(remote.items.map(item => [item.sessionId, item.snippet])),
		      [remote.items],
		    )

		    const rows = React.useMemo(() => {
		      const list = archivedSessionIds.map(sessionId => {
		        const summary = summaries[sessionId]
		        return {
		          id: sessionId,
		          title: summary === undefined ? sessionId : (summary.displayTitle || sessionId),
		          workspace: workspaceTitleBySession.get(sessionId) ?? t('ungrouped'),
		          updatedAt: summary?.updatedAt ?? 0,
		        }
		      })
		      list.sort((left, right) => right.updatedAt - left.updatedAt)
		      if (normalizedQuery === '') return list
		      const needle = normalizedQuery.toLowerCase()
		      const remoteIds = new Set(remote.items.map(item => item.sessionId))
		      return list.filter(row => (
		        row.title.toLowerCase().includes(needle)
		        || row.workspace.toLowerCase().includes(needle)
		        || remoteIds.has(row.id)
		      ))
		    }, [archivedSessionIds, normalizedQuery, remote.items, summaries, workspaceTitleBySession, t])

		    // A successful deletion lands here from the shell overlay.
		    const deleted = useStoreValue(deletedSessionStore)
		    React.useEffect(() => {
		      if (deleted.id === null) return
		      setDetail(current => (current.sessionId === deleted.id ? IDLE_DETAIL : current))
		    }, [deleted])

		    const restoreRow = sessionId => {
		      if (busyId !== null) return
		      setBusyId(sessionId)
		      setActionError(null)
		      unarchiveSession(ctx, sessionId).then(() => {
		        setBusyId(null)
		        setDetail(current => (current.sessionId === sessionId ? IDLE_DETAIL : current))
		      }).catch(reason => {
		        setBusyId(null)
		        setActionError(messageOf(reason))
		      })
		    }

		    // --- structured transcript rendering ---------------------------------
		    // The Host hands over the original content blocks, so prose, reasoning and
		    // tool calls are rendered apart instead of as one flattened text.
		    const markdownLabels = React.useMemo(() => ({
		      code: { copyLabel: t('copyCode'), copiedLabel: t('copiedCode') },
		      footnotes: t('footnotes'),
		    }), [t])

		    const searchNeedle = normalizedQuery.toLowerCase()
		    const blockSearchText = block => [
		      typeof block.text === 'string' ? block.text : '',
		      typeof block.name === 'string' ? block.name : '',
		      typeof block.arguments === 'string' ? block.arguments : '',
		      block.result === undefined ? '' : block.result.text,
		    ].join('\n').toLowerCase()
		    const matchedSeqs = React.useMemo(() => {
		      if (searchNeedle.length === 0) return EMPTY_LIST
		      return detail.items
		        .filter(item => item.blocks.some(block => blockSearchText(block).includes(searchNeedle)))
		        .map(item => item.seq)
		    }, [detail.items, searchNeedle])

		    const transcriptRef = React.useRef(null)
		    const firstMatchSeq = matchedSeqs.length > 0 ? matchedSeqs[0] : null
		    React.useEffect(() => {
		      const container = transcriptRef.current
		      if (firstMatchSeq === null || container === null || typeof container.querySelector !== 'function') return
		      const node = container.querySelector(`[data-seq="${firstMatchSeq}"]`)
		      if (node !== null && typeof node.scrollIntoView === 'function') node.scrollIntoView({ block: 'center' })
		    }, [firstMatchSeq, detail.sessionId])

		    const blockCopyText = block => {
		      if (block.kind === 'text' || block.kind === 'injected' || block.kind === 'reasoning') return block.text
		      if (block.kind === 'tool') {
		        return [block.name, block.arguments, block.result === undefined ? '' : block.result.text]
		          .filter(part => typeof part === 'string' && part.length > 0)
		          .join('\n')
		      }
		      if (block.kind === 'image') return `[${t('imageAttachment')}${block.name === '' ? '' : ` ${block.name}`}]`
		      if (block.kind === 'file') return `[${t('fileAttachment')}${block.name === '' ? '' : ` ${block.name}`}]`
		      return ''
		    }

		    const copyDetail = () => {
		      if (!clipboardAvailable || detail.items.length === 0) return
		      const text = detail.items
		        .map(item => {
		          const head = `${item.role === 'user' ? t('roleUser') : t('roleAssistant')} ${formatArchiveTime(item.time)}`
		          const body = item.blocks.map(blockCopyText).filter(part => part.length > 0).join('\n')
		          return `${head}\n${body}`
		        })
		        .join('\n\n')
		      navigator.clipboard.writeText(text).then(() => {
		        setCopyState('copied')
		        window.setTimeout(() => setCopyState('idle'), 1600)
		      }).catch(() => setCopyState('idle'))
		    }

		    /** Highlight plain-text matches; Markdown bodies rely on the turn outline. */
		    const highlight = text => {
		      if (searchNeedle.length === 0) return text
		      const lower = text.toLowerCase()
		      if (!lower.includes(searchNeedle)) return text
		      const parts = []
		      let cursor = 0
		      let at = lower.indexOf(searchNeedle)
		      while (at >= 0) {
		        if (at > cursor) parts.push(text.slice(cursor, at))
		        parts.push(h('mark', { key: `mark-${at}`, className: 'dcmArchiveMark' }, text.slice(at, at + searchNeedle.length)))
		        cursor = at + searchNeedle.length
		        at = lower.indexOf(searchNeedle, cursor)
		      }
		      if (cursor < text.length) parts.push(text.slice(cursor))
		      return parts
		    }

		    const toolHint = block => {
		      try {
		        const parsed = JSON.parse(block.arguments)
		        if (parsed !== null && typeof parsed === 'object') {
		          for (const field of ['description', 'command', 'path']) {
		            if (typeof parsed[field] === 'string' && parsed[field].length > 0) return parsed[field]
		          }
		        }
		      } catch {
		        // Not JSON: the raw text below is the only honest rendering.
		      }
		      return ''
		    }

		    const prettyArguments = block => {
		      try {
		        return JSON.stringify(JSON.parse(block.arguments), null, 2)
		      } catch {
		        return block.arguments
		      }
		    }

		    const actionKey = action => (action === 'remove' ? 'actionRemove' : action === 'replace' ? 'actionReplace' : 'actionSet')

		    const renderInjection = (block, key) => {
		      const children = []
		      if (block.intro !== '') {
		        children.push(h('div', { key: 'intro', className: 'dcmArchiveInjectionIntro' }, block.intro))
		      }
		      if (block.files.length > 0) {
		        children.push(h('div', { key: 'files', className: 'dcmArchiveFileList' }, block.files.map(file => h(
		          'div',
		          { key: file.path, className: 'dcmArchiveFileRow' },
		          [
		            h('span', { key: 'path', className: 'dcmArchiveFilePath' }, file.path),
		            h('span', { key: 'action', className: 'dcmArchiveFileAction' }, t(actionKey(file.action))),
		          ],
		        ))))
		      }
		      block.sections.forEach((section, index) => {
		        children.push(h('div', { key: `section-${index}`, className: 'dcmArchiveInjectionSection' }, [
		          h('div', { key: 'label', className: 'dcmArchiveFoldedLabel' }, section.path),
		          h(primitives.MarkdownText, { key: 'body', text: section.text, labels: markdownLabels }),
		        ]))
		      })
		      // The framing is part of what the model actually read: keep it reachable.
		      children.push(h('details', { key: 'raw', className: 'dcmArchiveFolded' }, [
		        h('summary', { key: 'summary' }, t('rawInjection')),
		        h('pre', { key: 'body', className: 'dcmArchivePre' }, block.raw),
		      ]))
		      return h('div', { key, className: 'dcmArchiveInjection' }, children)
		    }

		    const renderBlock = (item, block, index) => {
		      const key = `${item.seq}-${index}`
		      if (block.kind === 'injection') return renderInjection(block, key)
		      if (block.kind === 'text') {
		        // Authored user text stays literal; assistant prose and synthetic
		        // injections carry Markdown that should render.
		        return item.role === 'user' && item.synthetic !== true
		          ? h('div', { key, className: 'dcmArchivePlain' }, highlight(block.text))
		          : h(primitives.MarkdownText, { key, text: block.text, labels: markdownLabels })
		      }
		      if (block.kind === 'injected') {
		        return h('details', { key, className: 'dcmArchiveFolded' }, [
		          h('summary', { key: 'summary' }, t('injectedContext')),
		          h('pre', { key: 'body', className: 'dcmArchivePre' }, block.text),
		        ])
		      }
		      if (block.kind === 'reasoning') {
		        return h('details', { key, className: 'dcmArchiveFolded' }, [
		          h('summary', { key: 'summary' }, t('reasoning')),
		          h('pre', { key: 'body', className: 'dcmArchivePre' }, block.text),
		        ])
		      }
		      if (block.kind === 'tool') {
		        const hint = toolHint(block)
		        const failed = block.result !== undefined && block.result.isError === true
		        const children = [
		          h('summary', { key: 'summary' }, [
		            h('span', { key: 'name', className: 'dcmArchiveToolName' }, block.name === '' ? t('toolCall') : block.name),
		            hint === '' ? null : h('span', { key: 'hint', className: 'dcmArchiveToolHint' }, hint),
		            failed ? h('span', { key: 'flag', className: 'dcmArchiveToolFlag' }, t('toolFailed')) : null,
		          ]),
		          h('div', { key: 'arguments', className: 'dcmArchiveFoldedBody' }, [
		            h('div', { key: 'label', className: 'dcmArchiveFoldedLabel' }, t('toolArguments')),
		            h('pre', { key: 'pre', className: 'dcmArchivePre' }, prettyArguments(block)),
		          ]),
		        ]
		        if (block.result !== undefined) {
		          children.push(h('div', { key: 'result', className: 'dcmArchiveFoldedBody' }, [
		            h('div', { key: 'label', className: 'dcmArchiveFoldedLabel' }, failed ? t('toolResultFailed') : t('toolResult')),
		            h('pre', { key: 'pre', className: 'dcmArchivePre' }, block.result.text),
		          ]))
		        }
		        return h('details', {
		          key,
		          className: failed ? 'dcmArchiveFolded dcmArchiveToolError' : 'dcmArchiveFolded',
		        }, children)
		      }
		      if (block.kind === 'image' || block.kind === 'file') {
		        const label = block.kind === 'image' ? t('imageAttachment') : t('fileAttachment')
		        const size = block.bytes > 0 ? ` · ${block.bytes} ${t('bytesUnit')}` : ''
		        return h('div', { key, className: 'dcmArchiveChip' }, `${label}${block.name === '' ? '' : ` ${block.name}`}${size}`)
		      }
		      return null
		    }

		    const dayOf = time => {
		      if (typeof time !== 'number' || !Number.isFinite(time)) return ''
		      const date = new Date(time)
		      const pad = value => String(value).padStart(2, '0')
		      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
		    }

		    const renderTranscript = () => {
		      if (detail.sessionId === null) {
		        return h('div', { className: 'dcmArchivePlaceholder' }, t('detailEmpty'))
		      }
		      if (detail.status === 'loading') {
		        return h('div', { className: 'dcmArchivePlaceholder', role: 'status' }, t('detailLoading'))
		      }
		      if (detail.status === 'error') {
		        return h('div', { className: 'dcmArchivePlaceholder', role: 'alert' }, [
		          h('div', { key: 'message' }, t('detailError', { message: detail.error })),
		          h(primitives.Button, {
		            key: 'retry',
		            variant: 'outline',
		            className: 'dcmArchiveRowAction',
		            onClick: () => loadDetail(detail.sessionId, detail.title),
		          }, t('retry')),
		        ])
		      }
		      if (detail.items.length === 0) {
		        return h('div', { className: 'dcmArchivePlaceholder' }, t('detailNoMessages'))
		      }
		      const nodes = []
		      let day = null
		      for (const item of detail.items) {
		        const itemDay = dayOf(item.time)
		        if (itemDay !== '' && itemDay !== day) {
		          day = itemDay
		          nodes.push(h('div', { key: `day-${itemDay}-${item.seq}`, className: 'dcmArchiveDay' }, itemDay))
		        }
		        // A synthetic `agent.inject()` context is not something the user said.
		        const synthetic = item.synthetic === true || item.injected === true
		        const lane = synthetic ? 'synthetic' : item.role
		        nodes.push(h('div', {
		          key: item.seq,
		          'data-seq': item.seq,
		          className: [
		            'dcmArchiveTurn',
		            `dcmArchiveTurn-${lane}`,
		            matchedSeqs.includes(item.seq) ? 'dcmArchiveTurnHit' : null,
		          ].filter(Boolean).join(' '),
		        }, [
		          h('div', { key: 'role', className: 'dcmArchiveRole' }, [
		            h('span', { key: 'chip', className: 'dcmArchiveRoleChip' }, synthetic
		              ? t('roleInjected')
		              : (item.role === 'user' ? t('roleUser') : t('roleAssistant'))),
		            synthetic && item.source === 'agent-instructions'
		              ? h('span', { key: 'kind' }, t('injectedInstructions'))
		              : null,
		            h('span', { key: 'time' }, formatArchiveTime(item.time)),
		            item.interrupted === true
		              ? h('span', { key: 'interrupted', className: 'dcmArchiveInterrupted' }, t('interrupted'))
		              : null,
		            item.usage === undefined
		              ? null
		              : h('span', { key: 'usage', className: 'dcmArchiveUsage' }, `↑${item.usage.input} ↓${item.usage.output}`),
		          ]),
		          h('div', { key: 'body', className: 'dcmArchiveTurnBody' }, [
		            ...item.blocks.map((block, index) => renderBlock(item, block, index)),
		            item.degraded === true
		              ? h('div', { key: 'degraded', className: 'dcmArchiveNotice' }, t('degradedNotice'))
		              : null,
		          ]),
		        ]))
		      }
		      if (detail.truncated) {
		        nodes.push(h('div', { key: 'truncated', className: 'dcmArchiveNotice' }, t('detailTruncated', { n: detail.shown })))
		      }
		      return h(React.Fragment, null, nodes)
		    }

		    const searchBox = h('input', {
		      className: 'dcmArchiveSearch',
		      type: 'search',
		      value: query,
		      maxLength: SEARCH_QUERY_MAX_CODE_UNITS,
		      placeholder: t('searchPlaceholder'),
		      'aria-label': t('searchPlaceholder'),
		      onChange: event => {
		        setQuery(event.target.value)
		        setActionError(null)
		      },
		    })

		    const layout = h('div', { className: 'dcmArchiveLayout' }, [
		      h('div', { className: 'dcmArchiveListPane', key: 'list' }, [
		        h('div', { className: 'dcmArchiveList', key: 'rows' }, rows.length === 0
		          ? h('div', { className: 'dcmArchivePlaceholder' }, normalizedQuery === '' ? t('empty') : t('noMatches'))
		          : rows.map(row => h('div', {
		            key: row.id,
		            className: detail.sessionId === row.id ? 'dcmArchiveRow dcmArchiveRowActive' : 'dcmArchiveRow',
		            role: 'button',
		            tabIndex: 0,
		            'aria-pressed': detail.sessionId === row.id,
		            onClick: () => loadDetail(row.id, row.title),
		            onKeyDown: event => {
		              if (event.target !== event.currentTarget) return
		              if (event.key !== 'Enter' && event.key !== ' ') return
		              event.preventDefault()
		              loadDetail(row.id, row.title)
		            },
		          }, [
		            h('div', { className: 'dcmArchiveRowTitle', key: 'title' }, highlight(row.title)),
		            h('div', { className: 'dcmArchiveRowMeta', key: 'meta' }, row.workspace),
		            snippets.has(row.id)
		              ? h('div', { className: 'dcmArchiveRowSnippet', key: 'snippet' }, highlight(snippets.get(row.id)))
		              : null,
		            h('div', { className: 'dcmArchiveRowActions', key: 'actions' }, [
		              h(primitives.Button, {
		                key: 'restore',
		                variant: 'outline',
		                className: 'dcmArchiveRowAction',
		                disabled: busyId !== null,
		                onClick: event => {
		                  event.stopPropagation()
		                  restoreRow(row.id)
		                },
		              }, busyId === row.id ? t('restoring') : t('restore')),
		              h(primitives.Button, {
		                key: 'delete',
		                variant: 'outline',
		                className: 'dcmArchiveRowAction dcmArchiveRowActionDanger',
		                disabled: busyId !== null,
		                onClick: event => {
		                  event.stopPropagation()
		                  requestSessionDelete(row.id, row.title)
		                },
		              }, t('deleteRow')),
		            ]),
		          ]))),
		        remote.hasMore ? h('div', { className: 'dcmArchiveNotice', key: 'more' }, t('hasMore')) : null,
		        actionError !== null
		          ? h('div', { className: 'dcmArchiveError', key: 'error', role: 'alert' }, actionError)
		          : null,
		      ]),
		      h('div', { className: 'dcmArchiveDetailPane', key: 'detail' }, [
		        h('div', { className: 'dcmArchiveDetailHead', key: 'head' }, [
		          h('div', { className: 'dcmArchiveDetailTitle', key: 'title' }, detail.sessionId === null ? t('detailTitle') : detail.title),
		          h('div', { className: 'dcmArchiveDetailMeta', key: 'meta' }, [
		            h('span', { key: 'count' }, detail.status === 'ready' ? t('detailMeta', { n: detail.total }) : ''),
		            detail.status === 'ready' && matchedSeqs.length > 0
		              ? h('span', { key: 'matches', className: 'dcmArchiveNotice' }, t('matchCount', { n: matchedSeqs.length }))
		              : null,
		            detail.status === 'ready' && clipboardAvailable
		              ? h(primitives.Button, {
		                key: 'copy',
		                variant: 'outline',
		                className: 'dcmArchiveRowAction',
		                onClick: copyDetail,
		              }, copyState === 'copied' ? t('copied') : t('copy'))
		              : null,
		          ]),
		        ]),
		        h('div', { className: 'dcmArchiveTranscript', key: 'transcript', ref: transcriptRef }, renderTranscript()),
		      ]),
		    ])

		    return h('div', { className: variant === 'section' ? 'dcmArchiveSection' : 'dcmArchiveSectionBody' }, [
		      searchBox,
		      remote.status === 'loading'
		        ? h('div', { className: 'dcmArchiveNotice', key: 'searching', role: 'status' }, t('searching'))
		        : null,
		      remote.status === 'error'
		        ? h('div', { className: 'dcmArchiveError', key: 'search-error', role: 'status' }, t('searchUnavailable'))
		        : null,
		      layout,
		    ])
		  }

		  // -------------------------------------------------------------------------
		  // settings.section: the official settings navigation reserves this seat.
		  // -------------------------------------------------------------------------

		  const ArchivedSessionsSection = props => {
		    const t = props.t ?? boundT
		    return h('div', { className: 'dcmArchiveSection' }, [
		      h('h2', { className: 'dcmArchiveHeading', key: 'heading' }, t('heading')),
		      h('p', { className: 'dcmArchiveIntro', key: 'intro' }, t('intro')),
		      h(ArchiveBrowser, {
		        key: 'browser',
		        t,
		        variant: 'section',
		        useSessions: props.useSessions,
		        useWorkspaces: props.useWorkspaces,
		      }),
		    ])
		  }

		  // -------------------------------------------------------------------------
		  // shell.overlay: the wide transcript dialog opened from a session row menu.
		  // -------------------------------------------------------------------------

		  const ArchiveDialogOverlay = props => {
		    const t = props.t ?? boundT
		    const dialog = useStoreValue(archiveDialogStore)
		    // All hooks run before the early return: `open` flips on a mounted entry.
		    const archivedCount = selectWith(
		      props.useWorkspaces,
		      state => (state === undefined ? undefined : (state.archivedSessionIds ?? EMPTY_LIST).length),
		      0,
		    )
		    if (!dialog.open) return null
		    return h(primitives.Modal, {
		      open: true,
		      onClose: closeArchiveDialog,
		      closeLabel: t('close'),
		      title: t('dialogTitle'),
		      description: t('dialogDescription', { n: archivedCount }),
		      className: 'dcmArchiveDialog',
		      footer: h(primitives.Button, { variant: 'outline', onClick: closeArchiveDialog }, t('close')),
		    }, h(ArchiveBrowser, {
		      t,
		      variant: 'dialog',
		      initialSessionId: dialog.sessionId,
		      initialTitle: dialog.title,
		      useSessions: props.useSessions,
		      useWorkspaces: props.useWorkspaces,
		    }))
		  }

		  // -------------------------------------------------------------------------
		  // shell.overlay: the two-step permanent-deletion confirmation. A cancel
		  // closes the dialog and sends no request (AGENTS.md safety contract).
		  // -------------------------------------------------------------------------

		  const DeleteConfirmOverlay = props => {
		    const t = props.t ?? boundT
		    const target = useStoreValue(deleteTargetStore)
		    const [busy, setBusy] = React.useState(false)
		    const [error, setError] = React.useState(null)
		    React.useEffect(() => {
		      if (target === null) {
		        setBusy(false)
		        setError(null)
		      }
		    }, [target])
		    if (target === null) return null

		    const close = () => {
		      if (busy) return
		      deleteTargetStore.set(null)
		    }
		    const confirm = () => {
		      if (busy) return
		      setBusy(true)
		      setError(null)
		      deleteSessionRemotely(target.sessionId).then(async () => {
		        // Tell any mounted transcript pane to drop the row, then re-read Host metadata.
		        deletedSessionStore.set({ id: target.sessionId, seq: deletedSessionStore.get().seq + 1 })
		        await refreshSessionList(ctx)
		        deleteTargetStore.set(null)
		      }).catch(reason => {
		        setBusy(false)
		        setError(messageOf(reason))
		      })
		    }

		    return h(primitives.Modal, {
		      open: true,
		      onClose: close,
		      closeLabel: t('close'),
		      title: t('deleteTitle'),
		      description: t('deleteDesc', { name: target.title || target.sessionId }),
		      footer: h(React.Fragment, null, [
		        h(primitives.Button, { key: 'cancel', variant: 'outline', disabled: busy, onClick: close }, t('cancel')),
		        h(primitives.Button, {
		          key: 'confirm',
		          variant: 'outline',
		          className: 'dcmArchiveRowActionDanger',
		          disabled: busy,
		          onClick: confirm,
		        }, t('deleteConfirm')),
		      ]),
		    }, [
		      busy
		        ? h('div', { className: 'dcmArchiveNotice', key: 'pending', role: 'status' }, t('deletePending'))
		        : null,
		      error !== null
		        ? h('div', { className: 'dcmArchiveError', key: 'error', role: 'alert' }, error)
		        : null,
		    ])
		  }

		  // -------------------------------------------------------------------------
		  // sidebar.workspaces.session.menu.item: two additive rows after `archive`.
		  // -------------------------------------------------------------------------

		  const ViewArchivedMenuItem = props => {
		    const t = props.t ?? boundT
		    const { sessionId, useMenuOpenState } = props
		    // The menu's open-state hook is a render-time hook; only its setter is used later.
		    const menuOpenState = typeof useMenuOpenState === 'function' ? useMenuOpenState() : undefined
		    const setMenuOpen = Array.isArray(menuOpenState) ? menuOpenState[1] : undefined
		    const archived = selectWith(
		      props.useWorkspaces,
		      state => (state === undefined ? undefined : (state.archivedSessionIds ?? EMPTY_LIST).includes(sessionId)),
		      false,
		    )
		    // An archived row cannot be opened by the official UI; this is the only way in.
		    if (!archived) return null
		    return h(primitives.MenuItemButton, {
		      icon: h(primitives.IconArchiveOutlineMedium, {}),
		      separatorBefore: true,
		      onSelect: () => {
		        if (typeof setMenuOpen === 'function') setMenuOpen(false)
		        openArchiveDialog(sessionId, props.displayTitle)
		      },
		    }, t('menuView'))
		  }

		  const DeleteSessionMenuItem = props => {
		    const t = props.t ?? boundT
		    const { sessionId, useMenuOpenState, displayTitle } = props
		    const menuOpenState = typeof useMenuOpenState === 'function' ? useMenuOpenState() : undefined
		    const setMenuOpen = Array.isArray(menuOpenState) ? menuOpenState[1] : undefined
		    return h(primitives.MenuItemButton, {
		      danger: true,
		      icon: h(primitives.IconTrashOutlineMedium, {}),
		      separatorBefore: true,
		      onSelect: () => {
		        if (typeof setMenuOpen === 'function') setMenuOpen(false)
		        requestSessionDelete(sessionId, displayTitle)
		      },
		    }, t('menuDelete'))
		  }

		  // `inject` waits for each declaration and releases with this fiber.
		  ctx.slots.inject('sidebar.workspaces.session.menu.item', () => [
		    ctx.slots.register({
		      name: 'sidebar.workspaces.session.menu.item',
		      id: MENU_ID_VIEW,
		      order: MENU_ORDER_VIEW,
		      locale: NS,
		    }, ViewArchivedMenuItem),
		    ctx.slots.register({
		      name: 'sidebar.workspaces.session.menu.item',
		      id: MENU_ID_DELETE,
		      order: MENU_ORDER_DELETE,
		      locale: NS,
		    }, DeleteSessionMenuItem),
		  ])

		  ctx.slots.inject('settings.section', () => ctx.slots.register({
		    name: 'settings.section',
		    id: ARCHIVED_SECTION_ID,
		    order: SECTION_ORDER,
		    label: () => boundT('nav'),
		    locale: NS,
		  }, ArchivedSessionsSection))

		  ctx.slots.inject('shell.overlay', () => [
		    ctx.slots.register({
		      name: 'shell.overlay',
		      id: OVERLAY_ID_DELETE,
		      locale: NS,
		    }, DeleteConfirmOverlay),
		    ctx.slots.register({
		      name: 'shell.overlay',
		      id: OVERLAY_ID_ARCHIVE,
		      locale: NS,
		    }, ArchiveDialogOverlay),
		  ])
		}

		exports.apply = apply
		exports.inject = inject
		exports.NS = NS
		exports.ARCHIVED_SECTION_ID = ARCHIVED_SECTION_ID
		exports.MENU_ID_VIEW = MENU_ID_VIEW
		exports.MENU_ID_DELETE = MENU_ID_DELETE

		// `scripts/build-client.mjs` appends the factory's `return module.exports`
		// after this body, so this file stays parseable on its own.
		return module.exports
	}
});
