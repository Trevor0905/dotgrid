import { describe, expect, it, vi } from 'vitest'
import worker from './index'

const allowedOrigin = 'https://trevor0905.github.io'

function createEnv(response = new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } })) {
  const fetch = vi.fn(async () => response)
  const room = { fetch }
  const getByName = vi.fn(() => room)
  return { env: { ALLOWED_ORIGIN: allowedOrigin, MATCH_ROOMS: { getByName } } as unknown as Parameters<typeof worker.fetch>[1], fetch, getByName }
}

describe('match Worker routes', () => {
  it('returns the health payload', async () => {
    const { env } = createEnv()
    const response = await worker.fetch(new Request('https://worker.test/health', { headers: { origin: allowedOrigin } }), env, {} as ExecutionContext)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, service: 'dotgrid-match-server' })
    expect(response.headers.get('access-control-allow-origin')).toBe(allowedOrigin)
  })

  it('forwards create-match as POST to the Durable Object', async () => {
    const response = new Response(JSON.stringify({ code: 'AB12CD34' }), { status: 201 })
    const { env, fetch, getByName } = createEnv(response)
    const result = await worker.fetch(new Request('https://worker.test/matches', { method: 'POST' }), env, {} as ExecutionContext)
    expect(result.status).toBe(201)
    const code = getByName.mock.calls[0][0] as string
    expect(code).toMatch(/^[A-Z0-9]{8}$/)
    const forwarded = fetch.mock.calls[0][0] as Request
    expect(forwarded.method).toBe('POST')
    expect(forwarded.url).toBe(`https://match-room/create?code=${code}`)
  })

  it('does not accidentally turn a create-match request into a GET', async () => {
    const { env, fetch } = createEnv()
    await worker.fetch(new Request('https://worker.test/matches', { method: 'POST' }), env, {} as ExecutionContext)
    const forwarded = fetch.mock.calls[0][0] as Request
    expect(forwarded.method).not.toBe('GET')
  })

  it('forwards join-match as POST to the matching Durable Object', async () => {
    const { env, fetch, getByName } = createEnv()
    const result = await worker.fetch(new Request('https://worker.test/matches/AB12CD34/join', { method: 'POST' }), env, {} as ExecutionContext)
    expect(result.status).toBe(200)
    expect(getByName).toHaveBeenCalledWith('AB12CD34')
    const forwarded = fetch.mock.calls[0][0] as Request
    expect(forwarded.method).toBe('POST')
    expect(forwarded.url).toBe('https://match-room/join')
  })

  it('rejects an invalid match code before it reaches a Durable Object', async () => {
    const { env, fetch } = createEnv()
    const result = await worker.fetch(new Request('https://worker.test/matches/NOPE/join', { method: 'POST' }), env, {} as ExecutionContext)
    expect(result.status).toBe(404)
    await expect(result.json()).resolves.toEqual({ error: 'Not found.' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('returns CORS headers for an allowed preflight request', async () => {
    const { env } = createEnv()
    const result = await worker.fetch(new Request('https://worker.test/matches', { method: 'OPTIONS', headers: { origin: allowedOrigin } }), env, {} as ExecutionContext)
    expect(result.status).toBe(200)
    expect(result.headers.get('access-control-allow-origin')).toBe(allowedOrigin)
    expect(result.headers.get('access-control-allow-methods')).toContain('POST')
  })
})
