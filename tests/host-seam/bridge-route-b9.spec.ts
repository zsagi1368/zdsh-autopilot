/**
 * TC-B3-33C3b B9 lock — the `/api/autopilot-bridge` GET route exists on the
 * host side (it was the missing registration: the client status panel fetches
 * GET /api/autopilot-bridge via src/client/index.ts refreshStatus and
 * dist/client.cjs:105, and the host answered 404 — contract-autopilot B9).
 *
 * Locks:
 * 1. the route is registered in the route table (404-gone criterion);
 * 2. the response body parses under the CLIENT's consumption path and carries
 *    the BridgeSnapshot shape the panel renders (version/paused/circuitOpen/
 *    modules/today/recent) — the shape comparison against the client's
 *    safeParse expectation is done literally by replaying refreshStatus's
 *    fetchText + safeParse chain;
 * 3. authorization boundary (same-origin-or-token) on the native header reads;
 * 4. 405 on non-GET;
 * 5. dispose paths (ctx.effect + runtime.dispose) unregister the route.
 */
import { describe, expect, it } from 'vitest'
import { apply, runtimeFor } from '../../src/index.js'
import type { ConsoleState } from '../../src/console/bridge.js'
import { createConsoleFiber } from '../../src/client/index.js'

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
  headers: Record<string, string | string[] | undefined> = {},
): { method: string; url: string; headers: Record<string, string | string[] | undefined> } & AsyncIterable<unknown> {
  return {
    method,
    url: '/api/autopilot-bridge',
    headers,
    async *[Symbol.asyncIterator]() { /* GET carries no body */ },
  }
}

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

function bridgeRoute(mounted: ReturnType<typeof mountWithWebServer>) {
  const route = mounted.routes.get('exact:/api/autopilot-bridge')
  if (route === undefined) throw new Error('bridge route not registered')
  return route
}

/**
 * Shape comparison (对拍): replay the CLIENT's refreshStatus chain —
 * fetchText(url) → safeParse(raw) — against the bridge route's response.
 * createConsoleFiber is the same fiber the host bundles into dist/client.cjs;
 * refreshStatus is its status fetch entry.
 */
async function clientSafeParseRefresh(raw: string): Promise<unknown> {
  const fiber = createConsoleFiber({
    fetchText: async () => raw,
    actionToken: () => undefined,
  })
  return fiber.refreshStatus()
}

describe('B9 — /api/autopilot-bridge GET route registered on the host side', () => {
  it('route table contains exact /api/autopilot-bridge (the 404 panel root cause is gone)', () => {
    const mounted = mountWithWebServer()
    expect(mounted.routes.has('exact:/api/autopilot-bridge')).toBe(true)
    // The action route stays registered alongside (B3 companion route).
    expect(mounted.routes.has('exact:/api/autopilot-action')).toBe(true)
  })

  it('GET same-origin: 200 BridgeSnapshot shape, and the CLIENT refreshStatus chain (fetchText → safeParse) round-trips it', async () => {
    const mounted = mountWithWebServer()
    const route = bridgeRoute(mounted)
    const cs = mounted.runtime?.consoleState as ConsoleState
    cs.note('continue', 'resumed s1')
    const { res, resLike } = stubRes()
    await route.handler(stubReq('GET', { host: '127.0.0.1:5800' }), resLike)
    expect(res.statusCode).toBe(200)
    expect(res.ended).toBe(true)
    expect(res.headers['content-type']).toBe('application/json; charset=utf-8')
    const payload = JSON.parse(res.body) as Record<string, unknown>
    expect(payload['version']).toBe(1)
    expect(typeof payload['paused']).toBe('boolean')
    expect(typeof payload['circuitOpen']).toBe('boolean')
    // continue module needs the agents service; a bare ctx has none, so its
    // capability flag degrades to false (feature-detection, not a defect).
    expect(payload['modules']).toEqual({ continue: false, guard: true, review: false })
    expect(payload['today']).toEqual({ sent: 0, skipped: 0, allowed: 0, denied: 0, reviewed: 0 })
    expect(payload['recent']).toEqual([{ moduleId: 'continue', summary: 'resumed s1' }])
    // 对拍: the exact client consumption path parses this body without loss.
    const clientView = await clientSafeParseRefresh(res.body)
    expect(clientView).toEqual(payload)
  })

  it('cross-origin Origin with mismatched host: 403 (authorization boundary on the bridge too)', async () => {
    const mounted = mountWithWebServer()
    const route = bridgeRoute(mounted)
    const { res, resLike } = stubRes()
    await route.handler(stubReq('GET', { origin: 'http://evil.example', host: '127.0.0.1:5800' }), resLike)
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body)).toEqual({ ok: false, error: 'unauthorized' })
  })

  it('non-GET method: 405 method not allowed', async () => {
    const mounted = mountWithWebServer()
    const route = bridgeRoute(mounted)
    const { res, resLike } = stubRes()
    await route.handler(stubReq('POST'), resLike)
    expect(res.statusCode).toBe(405)
    expect(JSON.parse(res.body)).toEqual({ ok: false, error: 'method not allowed' })
  })

  it('ctx.effect disposers unregister the bridge route (fiber unload); runtime.dispose() does too', () => {
    const mounted = mountWithWebServer()
    expect(mounted.routes.has('exact:/api/autopilot-bridge')).toBe(true)
    const disposers = mounted.effects.flatMap(setup => {
      const d = setup()
      return typeof d === 'function' ? [d] : [...(d ?? [])]
    })
    for (const dispose of disposers) dispose()
    expect(mounted.routes.has('exact:/api/autopilot-bridge')).toBe(false)
    expect(mounted.routes.has('exact:/api/autopilot-action')).toBe(false)
  })

  it('runtime.dispose() unregisters the bridge route for direct-call consumers', () => {
    const mounted = mountWithWebServer()
    mounted.runtime?.dispose()
    expect(mounted.routes.has('exact:/api/autopilot-bridge')).toBe(false)
  })
})
