// Cloudflare Worker for the hosted SPA. Static assets are served by the platform; this
// script only runs for the paths listed in wrangler.jsonc `run_worker_first` and forwards
// them to the Symfony API — the same job nginx/default.conf does in the Docker image — so
// the browser sees a single origin: the session cookie stays first-party and SSE just works.

interface Env {
  readonly ASSETS: Fetcher
  /** Public origin of the API, e.g. https://tetris-api.onrender.com (set at deploy time). */
  readonly API_ORIGIN?: string
}

const PROXIED_PREFIXES = ['/api/', '/.well-known/mercure']

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url)
    if (!PROXIED_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
      return env.ASSETS.fetch(request)
    }
    if (!env.API_ORIGIN) {
      return new Response('API_ORIGIN is not configured for this Worker', { status: 500 })
    }

    const target = new URL(url.pathname + url.search, env.API_ORIGIN)
    const headers = new Headers(request.headers)
    // Hand the visitor's IP to the API for its rate limiters; Render appends its own hop.
    const clientIp = request.headers.get('CF-Connecting-IP')
    if (clientIp) headers.set('X-Forwarded-For', clientIp)

    // Streaming passthrough: the Mercure event stream is returned as-is, chunk by chunk.
    return fetch(new Request(target, { method: request.method, headers, body: request.body, redirect: 'manual' }))
  },
} satisfies ExportedHandler<Env>
