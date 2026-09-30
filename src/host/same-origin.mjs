/**
 * Shared request gate for this plugin's local HTTP routes.
 *
 * Two client environments reach these routes, and only one of them looks like a
 * web page:
 *
 * - `dsh web` serves the client from the same http(s) origin as the routes, so
 *   the request's `Origin` equals `http(s)://<Host>`.
 * - The Desktop application serves its renderer from its own `dsh-app://app/`
 *   scheme and forwards plugin calls to the local server. Such a page's
 *   `Origin` is a non-http(s) value (`dsh-app://app`) or `null`, so it can never
 *   equal `http(s)://<Host>`; an equality-only check rejects every Desktop call.
 *
 * The security property these routes need is "a cross-site web page cannot make
 * this call". A page cannot add one of this plugin's headers to a cross-origin
 * request without a CORS preflight, and this server never approves one, so the
 * plugin header is the real gate. The strict Origin comparison remains for
 * ordinary web clients (which keeps older clients working), and the header path
 * additionally requires that the page origin is absent, opaque, or loopback —
 * so a public site can never qualify through it.
 */

/** Authorities that mean "this machine". */
const LOOPBACK_HOSTNAME = /^(?:localhost|127(?:\.\d{1,3}){3}|\[::1\]|::1)$/iu

/** Hostname of an http(s) page origin; undefined for opaque, absent, or non-web origins. */
const webOrigin = origin => {
  if (typeof origin !== 'string' || origin.length === 0 || origin === 'null') return undefined
  try {
    const url = new URL(origin)
    return /^https?:$/iu.test(url.protocol) ? { hostname: url.hostname, port: url.port } : undefined
  } catch {
    return undefined
  }
}

/** Authority parts of the request's own Host header. */
const requestAuthority = authority => {
  if (typeof authority !== 'string' || authority.length === 0) return undefined
  try {
    const url = new URL(`http://${authority}`)
    return { hostname: url.hostname, port: url.port }
  } catch {
    return undefined
  }
}

const isLoopback = hostname => typeof hostname === 'string' && LOOPBACK_HOSTNAME.test(hostname)

/** Keep diagnostics short and free of control characters. */
const describe = value => {
  if (typeof value !== 'string') return '(none)'
  const trimmed = value.replace(/[\u0000-\u001f\u007f]/gu, '').slice(0, 64)
  return trimmed.length === 0 ? '(empty)' : trimmed
}

/**
 * Decide whether one JSON POST may proceed.
 *
 * @param req - Node request carrying `method` and `headers`.
 * @param options - The plugin header this route requires, and the refusal wording.
 * @returns `{ ok: true }`, or a status/code/message to answer with.
 */
export const judgeJsonPost = (req, { header, value, forbiddenMessage }) => {
  const refuse = (status, code, message) => ({ ok: false, status, code, message })

  if (req.method !== 'POST') {
    return refuse(405, 'method-not-allowed', '只允许使用 POST。')
  }

  const host = req.headers.host
  const authority = requestAuthority(host)
  const origin = req.headers.origin
  const pageOrigin = webOrigin(origin)
  const carriesHeader = header !== undefined && req.headers[header] === value

  // Strict same-origin: the ordinary web client, with no plugin header needed.
  const strictSameOrigin = authority !== undefined
    && pageOrigin !== undefined
    && pageOrigin.hostname === authority.hostname
    && pageOrigin.port === authority.port

  // Opaque shell origin (Desktop `dsh-app://app/`, `null`), or the same loopback
  // authority spelled with another name (`localhost` vs `127.0.0.1`): the latter
  // still has to match the port, so another local service is not a web origin we
  // accept. Both need the plugin's own header.
  const aliasSameAuthority = pageOrigin !== undefined
    && authority !== undefined
    && pageOrigin.port === authority.port
    && (isLoopback(pageOrigin.hostname) || pageOrigin.hostname === authority.hostname)
  const opaqueOrigin = pageOrigin === undefined

  if (!strictSameOrigin && !(carriesHeader && (opaqueOrigin || aliasSameAuthority))) {
    return refuse(
      403,
      'forbidden',
      `${forbiddenMessage}（origin=${describe(origin)} host=${describe(host)}）`,
    )
  }

  const contentType = req.headers['content-type']
  if (typeof contentType !== 'string' || !contentType.toLowerCase().startsWith('application/json')) {
    return refuse(415, 'unsupported-media-type', '请求必须使用 JSON。')
  }

  return { ok: true }
}
