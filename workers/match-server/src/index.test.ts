import { describe, expect, it, vi } from 'vitest'
import worker, { MatchRoom } from './index'
import { createGame } from '../../../src/game/engine'

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

describe('match room lifecycle', () => {
  it('keeps a newly-created room waiting with no timer, then admits player two', async () => {
    const values = new Map<string, unknown>()
    const storage = {
      get: vi.fn(async <T>(key: string) => values.get(key) as T | undefined),
      put: vi.fn(async (key: string, value: unknown) => { values.set(key, value) }),
      setAlarm: vi.fn(async () => undefined),
      deleteAlarm: vi.fn(async () => undefined),
    }
    const state = { storage, getWebSockets: vi.fn(() => []) } as unknown as DurableObjectState
    const room = new MatchRoom(state)

    const created = await room.fetch(new Request('https://match-room/create?code=AB12CD34', { method: 'POST' }))
    const createdBody = await created.json() as { player: string; state: { phase: string; deadline: number; game: { scores: Record<string, number> } } }
    expect(created.status).toBe(201)
    expect(createdBody.player).toBe('one')
    expect(createdBody.state.phase).toBe('waiting')
    expect(createdBody.state.deadline).toBe(0)
    expect(createdBody.state.game.scores).toEqual({ one: 0, two: 0 })
    expect(storage.setAlarm).not.toHaveBeenCalled()

    const joined = await room.fetch(new Request('https://match-room/join', { method: 'POST' }))
    const joinedBody = await joined.json() as { player: string; state: { phase: string; deadline: number; joined: boolean } }
    expect(joined.status).toBe(200)
    expect(joinedBody.player).toBe('two')
    expect(joinedBody.state).toMatchObject({ phase: 'waiting', deadline: 0, joined: true })
    expect(storage.setAlarm).not.toHaveBeenCalled()
  })

  it('rejects a second player after the friend-code room is full', async () => {
    const match = {
      code: 'AB12CD34', players: { one: 'one-token', two: 'two-token' }, game: createGame(), phase: 'waiting', deadline: 0, pausedRemaining: null,
    }
    const storage = { get: vi.fn(async () => match), put: vi.fn(), setAlarm: vi.fn(), deleteAlarm: vi.fn() }
    const room = new MatchRoom({ storage, getWebSockets: vi.fn(() => []) } as unknown as DurableObjectState)
    const response = await room.fetch(new Request('https://match-room/join', { method: 'POST' }))
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({ error: 'This match already has two players.' })
  })
})
