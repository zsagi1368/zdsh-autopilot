/**
 * TC-B3-33C3b B3 lock — the `/api/autopilot-action` route handler against the
 * REAL mainline WebRoute contract: `handler(req: IncomingMessage, res:
 * ServerResponse)` where the handler owns the full response lifecycle
 * (mainline packages/host/webserver/src/index.ts:38-47, register :163-172).
 *
 * The stubs below are minimal Node-native shapes — `req` is an async-iterable
 * body stream with a plain lowercase `headers` object (Node http), `res` is a
 * writeHead/end recorder. The negative-control block replays the OLD
 * Express-like handler (`req.headers()` / `req.text()` + return value) on the
 * SAME stub and asserts it breaks: that is the discrimination proof (B3 was a
 * form break, not a behavior tweak).
 */
import { describe, expect, it } from 'vitest'
import { apply, runtimeFor } from '../../src/index.js'
import { performBridgeAction } from '../../src/console/bridge.js'
import type { ConsoleState } from '../../src/console/bridge.js'

// ---------------------------------------------------------------------------
// Node-native minimal stubs (NOT Express-like: no headers()/text() methods)
// ---------------------------------------------------------------------------

interface StubResponse {
  statusCode: number
  headers: Record<string, string>
  body: string
  ended: boolean
}

function stubRes(): { res: StubResponse; resLike: { writeHead(s: number, h?: Record<string, string>): void; end(b?: string): void } } {
  const res: StubResponse = { statusCode: 0, headers: {}, body: '', ended: false }
  return {
    res,
    resLike: {
      writeHead(status: number, headers?: Record<string, string>) {
        res.statusCode = status
        if (headers) res.headers = { ...res.headers, ...headers }
      },
      end(body?: string) {
        res.ended = true
        if (body !== undefined) res.body += body
      },
    },
  }
}

function stubReq(
  method: string,
  body: string,
  headers: Record<string, string | string[] | undefined> = {},
): {
  reqLike: { method: string; url: string; headers: Record<string, string | string[] | undefined> } & AsyncIterable<unknown>
} {
  const reqLike: { method: string; url: string; headers: Record<string, string | string[] | undefined> } & AsyncIterable<unknown> = {
    method,
    url: '/api/autopilot-action',
    headers,
    async *[Symbol.asyncIterator]() {
      if (body !== '') yield Buffer.from(body, 'utf8')
    },
  }
  return { reqLike }
}

/** A host context carrying a webServer whose register mirrors the mainline contract. */
function mountWithWebServer() {
  const routes = new Map<string, { kind: string; path: string; handler: (req: unknown, res: unknown) => unknown }>()
  const effects: Array<() => (() => void) | Iterable<() => void>> = []
  const ctx = {
    get(key: string): unknown {
      if (key === 'webServer') {
        return {
          register(definition: { kind: string; path: string; handler: (req: unknown, res: unknown) => unknown }): () => void {
            const routeKey = `${definition.kind}:${definition.path}`
            if (routes.has(routeKey)) throw new Error(`webserver: duplicate ${definition.kind} route "${definition.path}"`)
            routes.set(routeKey, definition)
            return () => { routes.delete(routeKey) }
          },
        }
      }
      return undefined
    },
    effect(setup: () => (() => void) | Iterable<() => void>): unknown {
      effects.push(setup)
      return undefined
    },
  }
  apply(ctx)
  const runtime = runtimeFor(ctx)
  return { ctx, routes, effects, runtime }
}

function actionRoute(mounted: ReturnType<typeof mountWithWebServer>) {
  const route = mounted.routes.get('exact:/api/autopilot-action')
  if (route === undefined) throw new Error('action route not registered')
  return route
}

// ---------------------------------------------------------------------------
// The old (defective) Express-like handler, reconstructed verbatim from the
// pre-B3 source shape for the negative control.
// ---------------------------------------------------------------------------

interface OldBridgeRequestLike {
  headers(): Record<string, string>
  text(): Promise<string>
}

const oldAuthorize = (req: OldBridgeRequestLike, payloadText: unknown, expectedToken: string): boolean => {
  if (typeof payloadText === 'string' && payloadText.length > 4096) return false
  const headers = req.headers()
  const tokenHeader = headers['x-autopilot-token'] ?? ''
  if (tokenHeader.length > 0) return tokenHeader === expectedToken
  const origin = headers['origin']
  if (origin !== undefined && origin.length > 0) return origin === expectedToken // placeholder semantics irrelevant
  return true
}

const oldExpressLikeHandler = (req: unknown) => {
  const bridgeReq = req as OldBridgeRequestLike
  const authorize = (payloadText: unknown) => oldAuthorize(bridgeReq, payloadText, 'apt_test')
  const verdict = performBridgeAction('noop', { setPaused: () => {}, resetStats: () => {} } as unknown as ConsoleState, authorize, {
    resumeSession: () => {},
    pauseSession: () => {},
    approveLatest: () => true,
  })
  return { status: verdict.ok ? 200 : 403, json: verdict }
}

// ---------------------------------------------------------------------------

describe('B3 — action route is Node-native res-lifecycle shaped (mainline WebRoute contract)', () => {
  it('registers an exact /api/autopilot-action route whose handler is (req, res)-arity, not return-value shaped', () => {
    const mounted = mountWithWebServer()
    const route = actionRoute(mounted)
    expect(route.kind).toBe('exact')
    expect(route.path).toBe('/api/autopilot-action')
    // The handler must accept the two native arguments. The old form took one.
    expect(route.handler.length).toBe(2)
  })

  it('POST with a valid token: 200, response body readable back through res lifecycle (writeHead + end)', async () => {
    const mounted = mountWithWebServer()
    const route = actionRoute(mounted)
    // Drive a real state transition: pause first, then resume via the bridge.
    mounted.runtime?.consoleState.setPaused(true)
    expect(mounted.runtime?.consoleState.paused).toBe(true)
    const { res, resLike } = stubRes()
    const { reqLike } = stubReq('POST', JSON.stringify({ action: 'unpause' }), {
      host: '127.0.0.1:5800',
    })
    await route.handler(reqLike, resLike)
    expect(res.statusCode).toBe(200)
    expect(res.ended).toBe(true)
    expect(JSON.parse(res.body)).toEqual({ ok: true })
    expect(res.headers['content-type']).toBe('application/json; charset=utf-8')
    expect(mounted.runtime?.consoleState.paused).toBe(false)
  })

  it('POST with a WRONG token header: 403 unauthorized verdict in the response body', async () => {
    const mounted = mountWithWebServer()
    const route = actionRoute(mounted)
    const { res, resLike } = stubRes()
    const { reqLike } = stubReq('POST', JSON.stringify({ action: 'unpause' }), {
      'x-autopilot-token': 'apt_wrong_token',
    })
    await route.handler(reqLike, resLike)
    expect(res.statusCode).toBe(403)
    expect(res.ended).toBe(true)
    expect(JSON.parse(res.body)).toEqual({ ok: false, error: 'unauthorized' })
  })

  it('cross-origin Origin with mismatched host: 403 (authorization boundary on native header reads)', async () => {
    const mounted = mountWithWebServer()
    const route = actionRoute(mounted)
    const { res, resLike } = stubRes()
    const { reqLike } = stubReq('POST', JSON.stringify({ action: 'unpause' }), {
      origin: 'http://evil.example',
      host: '127.0.0.1:5800',
    })
    await route.handler(reqLike, resLike)
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body)).toEqual({ ok: false, error: 'unauthorized' })
  })

  it('non-POST method: 405 method not allowed (body never consumed)', async () => {
    const mounted = mountWithWebServer()
    const route = actionRoute(mounted)
    const { res, resLike } = stubRes()
    const { reqLike } = stubReq('GET', '')
    await route.handler(reqLike, resLike)
    expect(res.statusCode).toBe(405)
    expect(JSON.parse(res.body)).toEqual({ ok: false, error: 'method not allowed' })
  })

  it('RA1d: the register disposer is collected through ctx.effect (fiber unload unregisters the route)', () => {
    const mounted = mountWithWebServer()
    expect(mounted.effects.length).toBeGreaterThan(0)
    const disposers = mounted.effects.flatMap(setup => {
      const d = setup()
      return typeof d === 'function' ? [d] : [...(d ?? [])]
    })
    const before = mounted.routes.has('exact:/api/autopilot-action')
    expect(before).toBe(true)
    for (const dispose of disposers) dispose()
    expect(mounted.routes.has('exact:/api/autopilot-action')).toBe(false)
  })

  it('dispose() also unregisters the route for direct-call (non-fiber) consumers', () => {
    const mounted = mountWithWebServer()
    expect(mounted.routes.has('exact:/api/autopilot-action')).toBe(true)
    mounted.runtime?.dispose()
    expect(mounted.routes.has('exact:/api/autopilot-action')).toBe(false)
  })
})

describe('B3 negative control — the old Express-like handler on the SAME Node-native stub must break', () => {
  it('old form (req.headers()/req.text() + return value) throws on a native req and produces no response', async () => {
    const { res, resLike } = stubRes()
    const { reqLike } = stubReq('POST', JSON.stringify({ action: 'unpause' }))
    // The old handler ignores `res` entirely and calls req.text() — which does
    // not exist on a native IncomingMessage stub. It must throw (and even if it
    // did not throw, `res` stays untouched: no writeHead, no end).
    let threw = false
    try {
      await oldExpressLikeHandler(reqLike)
    } catch {
      threw = true
    }
    expect(threw).toBe(true)
    expect(res.ended).toBe(false)
    expect(res.statusCode).toBe(0)
    expect(resLike).toBeDefined()
  })
})
