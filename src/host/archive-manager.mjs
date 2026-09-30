const SEARCH_LIMIT = 20
const MESSAGE_TYPES = new Set(['user/message', 'assistant/message'])
const MAX_REQUEST_BYTES = 8 * 1024

const assertSessionId = sessionId => {
  if (typeof sessionId !== 'string' || sessionId.length === 0 || sessionId.length > 512 || sessionId.includes('\0')) {
    throw new TypeError('invalid archived session id')
  }
  return sessionId
}

const archiveIds = workspaceRegistry => {
  const ids = workspaceRegistry?.archivedSessionIds
  if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string')) {
    throw new Error('unsupported workspace registry archive snapshot')
  }
  return [...ids]
}

const plainSnippet = (text, query) => {
  const compact = text.replace(/\s+/g, ' ').trim()
  if (compact.length <= 240) return compact
  const matchAt = compact.toLowerCase().indexOf(query.toLowerCase())
  const start = Math.max(0, (matchAt === -1 ? 0 : matchAt) - 80)
  const end = Math.min(compact.length, start + 240)
  return `${start > 0 ? '…' : ''}${compact.slice(start, end)}${end < compact.length ? '…' : ''}`
}

const scanArchivedEvents = async (sessionQuery, archivedSessionIds, query, signal) => {
  if (typeof sessionQuery?.filterEvents !== 'function') {
    throw new Error('archived history scan is unavailable')
  }
  const filters = [
    { kind: 'type', values: ['user/message', 'assistant/message'] },
    { kind: 'surface', values: ['current'] },
    { kind: 'text', text: query },
  ]
  const items = []
  for (let offset = 0; offset < archivedSessionIds.length && items.length <= SEARCH_LIMIT; offset += 4) {
    signal?.throwIfAborted()
    const batch = archivedSessionIds.slice(offset, offset + 4)
    const matches = await Promise.all(batch.map(sessionId => sessionQuery.filterEvents(sessionId, filters)))
    signal?.throwIfAborted()
    for (let index = 0; index < batch.length; index += 1) {
      const match = Array.isArray(matches[index])
        ? matches[index].find(event => typeof event?.text === 'string' && event.text.trim().length > 0)
        : undefined
      if (match !== undefined) items.push({ sessionId: batch[index], snippet: plainSnippet(match.text, query) })
      if (items.length > SEARCH_LIMIT) break
    }
  }
  return { items: items.slice(0, SEARCH_LIMIT), hasMore: items.length > SEARCH_LIMIT }
}

/**
 * Remove one id from DSH's registry-global archive set without touching the
 * session log or its workspace accounting position. Prefer the public DSH
 * unarchive operation; older cores retain the validated registry fallback.
 */
export async function restoreArchivedSession(workspaceRegistry, sessionId) {
  const id = assertSessionId(sessionId)
  if (typeof workspaceRegistry?.unarchiveSession === 'function') {
    const wasArchived = archiveIds(workspaceRegistry).includes(id)
    await workspaceRegistry.unarchiveSession(id)
    return { restored: wasArchived, archivedSessionIds: [...archiveIds(workspaceRegistry)] }
  }
  if (
    typeof workspaceRegistry?.enqueueOperation !== 'function'
    || typeof workspaceRegistry?.requireState !== 'function'
    || typeof workspaceRegistry?.setState !== 'function'
  ) {
    throw new Error('unsupported workspace registry restore seam')
  }

  return workspaceRegistry.enqueueOperation(async () => {
    const state = workspaceRegistry.requireState()
    if (!Array.isArray(state?.archivedSessionIds)) {
      throw new Error('unsupported workspace registry restore state')
    }
    if (!state.archivedSessionIds.includes(id)) {
      return { restored: false, archivedSessionIds: [...state.archivedSessionIds] }
    }
    const archivedSessionIds = state.archivedSessionIds.filter(candidate => candidate !== id)
    await workspaceRegistry.setState({ ...state, archivedSessionIds })
    return { restored: true, archivedSessionIds }
  })
}

/** Keep DSH's archive registry free of ids whose storage was permanently removed. */
export async function deleteSessionAndReconcileArchive({ workspaceRegistry, deleteSession, warn = console.warn }, sessionId) {
  const result = await deleteSession(sessionId)
  if (result?.ok !== true) return result
  try {
    await restoreArchivedSession(workspaceRegistry, sessionId)
    return { ok: true, value: { ...result.value, archiveReconciled: true } }
  } catch (error) {
    warn('session storage was deleted but its archive marker could not be reconciled:', error)
    return { ok: true, value: { ...result.value, archiveReconciled: false } }
  }
}

/** Search current user/assistant message history inside the archive set only. */
export async function searchArchivedSessions({ workspaceRegistry, sessionQuery }, query, signal) {
  signal?.throwIfAborted()
  const normalized = typeof query === 'string' ? query.trim() : ''
  if (normalized.length === 0 || normalized.length > 500 || normalized.includes('\0')) {
    throw new TypeError('invalid archive search query')
  }
  if (typeof sessionQuery?.searchSessions !== 'function') {
    throw new Error('archived history search is unavailable')
  }

  const archivedSessionIds = archiveIds(workspaceRegistry)
  if (archivedSessionIds.length === 0) return { items: [], hasMore: false }

  let page
  try {
    page = await sessionQuery.searchSessions({
      query: normalized,
      sessionFilters: [{ kind: 'id', values: archivedSessionIds }],
      eventFilters: [
        { kind: 'type', values: ['user/message', 'assistant/message'] },
        { kind: 'surface', values: ['current'] },
      ],
      limit: SEARCH_LIMIT,
    }, { signal })
    signal?.throwIfAborted()
  } catch (error) {
    if (error?.code !== 'SESSION_QUERY_SEARCH_DISABLED') throw error
    return scanArchivedEvents(sessionQuery, archivedSessionIds, normalized, signal)
  }

  const archived = new Set(archivedSessionIds)
  const items = []
  const included = new Set()
  for (const hit of Array.isArray(page?.items) ? page.items : []) {
    const sessionId = hit?.header?.id
    const match = hit?.bestMatch
    if (
      typeof sessionId !== 'string'
      || !archived.has(sessionId)
      || included.has(sessionId)
      || match?.sessionId !== sessionId
      || match?.surface !== 'current'
      || !MESSAGE_TYPES.has(match?.type)
      || typeof match?.snippet !== 'string'
    ) continue
    included.add(sessionId)
    items.push({ sessionId, snippet: match.snippet })
    if (items.length >= SEARCH_LIMIT) break
  }

  return { items, hasMore: page?.nextCursor !== undefined }
}

const DETAIL_MESSAGE_LIMIT = 4000
const DETAIL_TEXT_LIMIT = 40000
const DETAIL_TOTAL_TEXT_LIMIT = 4 * 1024 * 1024
const REASONING_TEXT_LIMIT = 20000
const TOOL_ARGUMENT_LIMIT = 8000
const TOOL_RESULT_TEXT_LIMIT = 20000

/**
 * Loop-owned runtime-context snapshots reach the surface as `user/message`
 * events whose `source.kind` is this marker (dsh-agent-loop `isOwned`), so the
 * archived transcript can fold them instead of presenting them as user turns.
 */
const INJECTED_SOURCE_KIND = 'runtime-context'
/**
 * Text fallback for logs written before the source marker existed. Both
 * preambles are hard-coded English constants in dsh-system-prompt /
 * dsh-agent-loop, and a snapshot is always one text block.
 */
const INJECTED_PREAMBLES = [
  'Current runtime context. This snapshot supersedes earlier runtime-context snapshots.',
  'Current runtime context: none. Earlier runtime-context snapshots no longer apply.',
]

const clampDetail = (value, limit) => (value.length > limit
  ? { text: `${value.slice(0, limit)}…`, truncated: true }
  : { text: value, truncated: false })

const blockTextOf = content => (Array.isArray(content) ? content : [])
  .filter(block => block?.type === 'text' && typeof block.text === 'string')
  .map(block => block.text)
  .join('\n')

/** Index every tool result by call id so a tool-call block can carry its output. */
const indexToolResults = events => {
  const results = new Map()
  for (const event of events) {
    if (event?.type !== 'tool/result') continue
    const callId = event.data?.callId
    if (typeof callId !== 'string' || callId.length === 0) continue
    const message = event.data?.message
    results.set(callId, {
      text: blockTextOf(message?.content),
      isError: message?.isError === true || event.data?.error !== undefined,
    })
  }
  return results
}

/**
 * Split one user text block into authored prose and an injected snapshot.
 * The marker is honoured first; the preamble scan covers older logs.
 */
const userTextBlocks = (text, markedInjected) => {
  const finds = INJECTED_PREAMBLES.map(preamble => text.indexOf(preamble)).filter(index => index >= 0)
  const at = finds.length === 0 ? -1 : Math.min(...finds)
  if (markedInjected && at < 0) return [{ kind: 'injected', text }]
  if (at < 0) return [{ kind: 'text', text }]
  const blocks = []
  const head = text.slice(0, at).trim()
  if (head.length > 0) blocks.push({ kind: 'text', text: head })
  blocks.push({ kind: 'injected', text: text.slice(at) })
  return blocks
}

/**
 * Turn one surface event's content blocks into structured transcript blocks.
 * Every text-carrying block is charged to the shared budget.
 */
const transcriptBlocks = (content, budget, markedInjected) => {
  const blocks = []
  let truncated = false
  for (const block of Array.isArray(content) ? content : []) {
    if (block?.type === 'text' && typeof block.text === 'string' && block.text.trim().length > 0) {
      for (const piece of userTextBlocks(block.text, markedInjected)) {
        const clamped = clampDetail(piece.text, DETAIL_TEXT_LIMIT)
        if (!budget.take(clamped.text.length)) return { blocks, truncated: true }
        if (clamped.truncated) truncated = true
        blocks.push({ kind: piece.kind, text: clamped.text })
      }
    } else if (block?.type === 'reasoning' && typeof block.text === 'string' && block.text.trim().length > 0) {
      const clamped = clampDetail(block.text, REASONING_TEXT_LIMIT)
      if (!budget.take(clamped.text.length)) return { blocks, truncated: true }
      if (clamped.truncated) truncated = true
      blocks.push({ kind: 'reasoning', text: clamped.text })
    } else if (block?.type === 'tool-call') {
      const raw = typeof block.arguments === 'string' ? block.arguments : ''
      const clamped = clampDetail(raw, TOOL_ARGUMENT_LIMIT)
      if (!budget.take(clamped.text.length)) return { blocks, truncated: true }
      if (clamped.truncated) truncated = true
      blocks.push({
        kind: 'tool',
        name: typeof block.name === 'string' ? block.name : '',
        arguments: clamped.text,
        argumentsTruncated: clamped.truncated,
        ...(typeof block.id === 'string' ? { callId: block.id } : {}),
      })
    } else if (block?.type === 'image') {
      blocks.push({
        kind: 'image',
        name: typeof block.attachment?.name === 'string' ? block.attachment.name : '',
        bytes: typeof block.attachment?.bytes === 'number' ? block.attachment.bytes : 0,
      })
    } else if (block?.type === 'file') {
      blocks.push({
        kind: 'file',
        name: typeof block.attachment?.name === 'string' ? block.attachment.name : '',
        bytes: typeof block.attachment?.bytes === 'number' ? block.attachment.bytes : 0,
      })
    }
  }
  return { blocks, truncated }
}

/**
 * Read the current user/assistant transcript of one archived session with its
 * content structure intact.
 *
 * `sessionQuery.filterEvents` returns a flattened `text` that joins assistant
 * prose, tool names and raw tool arguments and drops reasoning, which is why the
 * archived transcript used to look crowded. `readSurface` exposes the same
 * current surface with the original `text` / `reasoning` / `tool-call` blocks.
 *
 * Archive membership is re-checked here so this read stays inside the archive set.
 */
export async function readArchivedSessionDetail({ workspaceRegistry, sessionQuery }, sessionId) {
  const id = assertSessionId(sessionId)
  if (!archiveIds(workspaceRegistry).includes(id)) {
    throw new TypeError('session is not archived')
  }
  if (typeof sessionQuery?.readSurface === 'function') {
    return readStructuredDetail(sessionQuery, id)
  }
  if (typeof sessionQuery?.filterEvents !== 'function') {
    throw new Error('archived history read is unavailable')
  }
  return readFlattenedDetail(sessionQuery, id)
}

const readStructuredDetail = async (sessionQuery, id) => {
  const snapshot = await sessionQuery.readSurface(id)
  const events = Array.isArray(snapshot?.events) ? snapshot.events : []
  const toolResults = indexToolResults(events)

  let textBudget = 0
  let truncated = false
  let total = 0
  const budget = {
    exhausted: false,
    take(length) {
      if (textBudget + length > DETAIL_TOTAL_TEXT_LIMIT) {
        budget.exhausted = true
        return false
      }
      textBudget += length
      return true
    },
  }
  const items = []

  for (const event of events) {
    const isUser = event?.type === 'user/message'
    if (!isUser && event?.type !== 'assistant/message') continue
    if (items.length >= DETAIL_MESSAGE_LIMIT) {
      truncated = true
      break
    }
    const content = isUser ? event.data?.content : event.data?.message?.content
    const markedInjected = isUser && event.data?.source?.kind === INJECTED_SOURCE_KIND
    const extracted = transcriptBlocks(content, budget, markedInjected)
    if (extracted.truncated) truncated = true
    if (extracted.blocks.length === 0) {
      if (budget.exhausted) {
        truncated = true
        break
      }
      continue
    }
    total += 1
    // Attach each tool output to the call that produced it.
    for (const block of extracted.blocks) {
      if (block.kind !== 'tool' || block.callId === undefined) continue
      const result = toolResults.get(block.callId)
      if (result === undefined) continue
      const clamped = clampDetail(result.text, TOOL_RESULT_TEXT_LIMIT)
      if (!budget.take(clamped.text.length)) {
        truncated = true
        break
      }
      if (clamped.truncated) truncated = true
      block.result = { text: clamped.text, isError: result.isError }
    }
    const item = {
      seq: Number.isInteger(event.seq) ? event.seq : items.length,
      role: isUser ? 'user' : 'assistant',
      time: typeof event.time === 'number' ? event.time : null,
      blocks: extracted.blocks,
    }
    if (markedInjected) item.injected = true
    if (!isUser && event.data?.interrupted === true) item.interrupted = true
    const usage = isUser ? undefined : event.data?.usage
    if (usage !== undefined && typeof usage.inputTokens === 'number' && typeof usage.outputTokens === 'number') {
      item.usage = { input: usage.inputTokens, output: usage.outputTokens }
    }
    items.push(item)
    if (budget.exhausted) {
      truncated = true
      break
    }
  }

  return { items, total, shown: items.length, truncated }
}

/** Graceful degradation for a backend without `readSurface`: flat text only. */
const readFlattenedDetail = async (sessionQuery, id) => {
  const documents = await sessionQuery.filterEvents(id, [
    { kind: 'type', values: ['user/message', 'assistant/message'] },
    { kind: 'surface', values: ['current'] },
  ])
  const found = Array.isArray(documents) ? documents : []
  const items = []
  let textBudget = 0
  let truncated = false
  let total = 0
  for (const document of found) {
    if (items.length >= DETAIL_MESSAGE_LIMIT) {
      truncated = true
      break
    }
    const text = typeof document?.text === 'string' ? document.text : ''
    if (text.trim().length === 0) continue
    const clamped = clampDetail(text, DETAIL_TEXT_LIMIT)
    if (textBudget + clamped.text.length > DETAIL_TOTAL_TEXT_LIMIT) {
      truncated = true
      break
    }
    if (clamped.truncated) truncated = true
    textBudget += clamped.text.length
    total += 1
    items.push({
      seq: Number.isInteger(document?.seq) ? document.seq : items.length,
      role: document?.type === 'user/message' ? 'user' : 'assistant',
      time: typeof document?.time === 'number' ? document.time : null,
      blocks: [{ kind: 'text', text: clamped.text }],
      degraded: true,
    })
  }
  return { items, total, shown: items.length, truncated }
}

const sendJson = (res, status, payload) => {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(JSON.stringify(payload))
}

const failure = (code, message) => ({ ok: false, error: { code, message } })

const readJsonBody = async req => {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > MAX_REQUEST_BYTES) throw new Error('request-too-large')
    chunks.push(buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

const acceptJsonPost = (req, res) => {
  if (req.method !== 'POST') {
    sendJson(res, 405, failure('method-not-allowed', '只允许使用 POST 管理归档会话。'))
    return false
  }
  const host = req.headers.host
  if (typeof host !== 'string' || req.headers.origin !== `http://${host}`) {
    sendJson(res, 403, failure('forbidden', '归档管理请求未通过同源校验。'))
    return false
  }
  const contentType = req.headers['content-type']
  if (typeof contentType !== 'string' || !contentType.toLowerCase().startsWith('application/json')) {
    sendJson(res, 415, failure('unsupported-media-type', '归档管理请求必须使用 JSON。'))
    return false
  }
  return true
}

const parseBody = async (req, res) => {
  try {
    return await readJsonBody(req)
  } catch (error) {
    const tooLarge = error instanceof Error && error.message === 'request-too-large'
    sendJson(
      res,
      tooLarge ? 413 : 400,
      failure(tooLarge ? 'request-too-large' : 'invalid-json', tooLarge ? '归档管理请求过大。' : '归档管理请求不是有效 JSON。'),
    )
    return undefined
  }
}

/** Same-origin HTTP boundary consumed by the native archive manager UI. */
export function createArchiveRequestHandlers({ restore, search, detail, warn = console.warn }) {
  return {
    restore: async (req, res) => {
      if (!acceptJsonPost(req, res)) return
      if (req.headers['x-dsh-session-manager-action'] !== 'restore-session') {
        sendJson(res, 403, failure('forbidden', '恢复请求缺少明确的操作标记。'))
        return
      }
      const body = await parseBody(req, res)
      if (body === undefined) return
      try {
        const sessionId = assertSessionId(body?.sessionId)
        sendJson(res, 200, { ok: true, value: await restore(sessionId) })
      } catch (error) {
        if (error instanceof TypeError) {
          sendJson(res, 400, failure('invalid-session-id', '会话 ID 无效。'))
        } else {
          sendJson(res, 500, failure('restore-failed', '取消归档失败，归档状态未确认改变。'))
        }
      }
    },
    detail: async (req, res) => {
      if (!acceptJsonPost(req, res)) return
      const body = await parseBody(req, res)
      if (body === undefined) return
      try {
        const sessionId = assertSessionId(body?.sessionId)
        sendJson(res, 200, { ok: true, value: await detail(sessionId) })
      } catch (error) {
        if (error instanceof TypeError) {
          sendJson(res, 400, failure('invalid-session-id', '会话 ID 无效或不在归档集合中。'))
        } else {
          warn('archived history read failed:', error)
          sendJson(res, 503, failure('detail-unavailable', '归档对话内容暂不可用。'))
        }
      }
    },
    search: async (req, res) => {
      if (!acceptJsonPost(req, res)) return
      const body = await parseBody(req, res)
      if (body === undefined) return
      const query = typeof body?.query === 'string' ? body.query.trim() : ''
      if (query.length === 0 || query.length > 500 || query.includes('\0')) {
        sendJson(res, 400, failure('invalid-query', '搜索内容无效。'))
        return
      }
      const controller = new AbortController()
      const abort = () => controller.abort(new Error('archive search request closed'))
      req.once('aborted', abort)
      if (typeof res.once === 'function') res.once('close', abort)
      try {
        const value = await search(query, controller.signal)
        if (controller.signal.aborted) return
        sendJson(res, 200, { ok: true, value })
      } catch (error) {
        if (controller.signal.aborted) return
        warn('archived history search failed:', error)
        sendJson(res, 503, failure('search-unavailable', '归档内容搜索暂不可用。'))
      } finally {
        req.off('aborted', abort)
        if (typeof res.off === 'function') res.off('close', abort)
      }
    },
  }
}
