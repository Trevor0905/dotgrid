import { createGame, expireTurn, playMove, type GameState, type Orientation, type Player } from '../../../src/game/engine'

type Env = { ALLOWED_ORIGIN: string; MATCH_ROOMS: DurableObjectNamespace }
export type MatchPhase = 'waiting' | 'playing' | 'finished'
export type StoredMatch = { code: string; players: Partial<Record<Player, string>>; game: GameState; phase: MatchPhase; deadline: number; pausedRemaining: number | null }
type SocketAttachment = { player: Player }

const TURN_LENGTH_MS = 30_000
const matchKey = 'match'
const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { ...init, headers: { 'content-type': 'application/json; charset=utf-8', ...init.headers } })
const randomToken = () => crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '')
const randomCode = () => crypto.randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()

function cors(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('origin')
  return origin === env.ALLOWED_ORIGIN ? { 'access-control-allow-origin': origin, vary: 'Origin', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type' } : {}
}
function withCors(response: Response, request: Request, env: Env) {
  const headers = new Headers(response.headers)
  for (const [name, value] of Object.entries(cors(request, env))) headers.set(name, value)
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}
function snapshot(match: StoredMatch, connected: Player[], notice?: string) {
  return { type: 'state', code: match.code, game: match.game, phase: match.phase, deadline: match.deadline, joined: Boolean(match.players.two), connected, ...(notice ? { notice } : {}) }
}

export function reconcileMatchConnections(match: StoredMatch, connected: Player[], now = Date.now()) {
  const ready = Boolean(match.players.one && match.players.two && connected.includes('one') && connected.includes('two'))
  const next = { ...match }
  if (next.phase === 'waiting' && ready) {
    next.phase = 'playing'
    next.deadline = now + TURN_LENGTH_MS
    next.pausedRemaining = null
    return { match: next, changed: true, notice: 'Opponent connected — starting game.' }
  }
  if (next.phase === 'playing' && !ready) {
    next.pausedRemaining = next.deadline ? Math.max(1_000, next.deadline - now) : TURN_LENGTH_MS
    next.deadline = 0
    return { match: next, changed: true, notice: 'A player disconnected. The match is paused until they reconnect.' }
  }
  if (next.phase === 'playing' && ready && !next.deadline) {
    next.deadline = now + Math.max(1_000, next.pausedRemaining ?? TURN_LENGTH_MS)
    next.pausedRemaining = null
    return { match: next, changed: true, notice: 'Opponent reconnected — the turn timer resumed.' }
  }
  return { match: next, changed: false, notice: undefined }
}

export class MatchRoom {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const action = url.pathname.split('/').at(-1)
    if (request.method === 'POST' && action === 'create') return this.create(url)
    if (request.method === 'POST' && action === 'join') return this.join()
    if (request.headers.get('upgrade') === 'websocket' && action === 'connect') return this.connect(url)
    return json({ error: 'Unknown match endpoint.' }, { status: 404 })
  }

  private async create(url: URL) {
    if (await this.state.storage.get<StoredMatch>(matchKey)) return json({ error: 'This match already exists.' }, { status: 409 })
    const match: StoredMatch = { code: url.searchParams.get('code') ?? randomCode(), players: { one: randomToken() }, game: createGame(), phase: 'waiting', deadline: 0, pausedRemaining: null }
    await this.save(match)
    return json({ code: match.code, player: 'one', token: match.players.one, state: snapshot(match, []) }, { status: 201 })
  }

  private async join() {
    const match = await this.load()
    if (!match) return json({ error: 'Match not found.' }, { status: 404 })
    if (match.players.two) return json({ error: 'This match already has two players.' }, { status: 409 })
    match.players.two = randomToken()
    await this.save(match)
    const state = snapshot(match, this.connectedPlayers())
    this.broadcast(state)
    return json({ code: match.code, player: 'two', token: match.players.two, state })
  }

  private async connect(url: URL) {
    const match = await this.load()
    if (!match) return new Response('Match not found.', { status: 404 })
    const token = url.searchParams.get('token')
    const player = (Object.entries(match.players) as Array<[Player, string]>).find(([, value]) => value === token)?.[0]
    if (!player) return new Response('Invalid player session.', { status: 401 })
    for (const existing of this.state.getWebSockets()) {
      const attachment = existing.deserializeAttachment() as SocketAttachment | null
      if (attachment?.player === player) existing.close(1000, 'Replaced by a newer connection.')
    }
    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)
    this.state.acceptWebSocket(server)
    server.serializeAttachment({ player } satisfies SocketAttachment)
    const updated = await this.reconcileConnections(match)
    this.broadcast(snapshot(updated.match, this.connectedPlayers(), updated.notice))
    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(socket: WebSocket, rawMessage: string | ArrayBuffer) {
    if (typeof rawMessage !== 'string') return this.send(socket, { type: 'error', message: 'Messages must be JSON.' })
    const attachment = socket.deserializeAttachment() as SocketAttachment | null
    if (!attachment) return socket.close(1008, 'Missing player session.')
    let message: { type?: string; orientation?: Orientation; row?: number; column?: number }
    try { message = JSON.parse(rawMessage) } catch { return this.send(socket, { type: 'error', message: 'Messages must be valid JSON.' }) }
    if (message.type !== 'move' || !message.orientation || message.row === undefined || message.column === undefined) return this.send(socket, { type: 'error', message: 'Unknown game message.' })
    const match = await this.load()
    if (!match) return socket.close(1011, 'Match no longer exists.')
    if (match.phase === 'waiting') return this.send(socket, { type: 'error', message: 'Waiting for both players to connect before the match starts.' })
    if (match.phase === 'finished') return this.send(socket, { type: 'error', message: 'This match is already complete.' })
    if (!this.readyToPlay(match)) return this.send(socket, { type: 'error', message: 'The match is paused while a player reconnects.' })
    const result = playMove(match.game, { player: attachment.player, orientation: message.orientation, row: message.row, column: message.column })
    if (!result.ok) return this.send(socket, { type: 'error', message: result.reason })
    match.game = result.state
    if (result.state.status === 'finished') { match.phase = 'finished'; match.deadline = 0; match.pausedRemaining = null } else match.deadline = Date.now() + TURN_LENGTH_MS
    await this.save(match)
    this.broadcast(snapshot(match, this.connectedPlayers(), result.completed ? 'Box completed — take another turn.' : undefined))
  }

  async webSocketClose() { await this.publishConnectionChange() }
  async webSocketError() { await this.publishConnectionChange() }
  async alarm() {
    const match = await this.load()
    if (!match || match.phase !== 'playing' || !match.deadline || Date.now() < match.deadline) return
    if (!this.readyToPlay(match)) return this.publishConnectionChange()
    const result = expireTurn(match.game)
    if (!result.ok) return
    match.game = result.state
    match.deadline = Date.now() + TURN_LENGTH_MS
    await this.save(match)
    this.broadcast(snapshot(match, this.connectedPlayers(), 'Turn expired. The move passed to the other player.'))
  }

  private async publishConnectionChange() {
    const match = await this.load()
    if (!match) return
    const updated = await this.reconcileConnections(match)
    this.broadcast(snapshot(updated.match, this.connectedPlayers(), updated.notice))
  }
  private async reconcileConnections(match: StoredMatch) {
    const updated = reconcileMatchConnections(match, this.connectedPlayers())
    if (updated.changed) await this.save(updated.match)
    return updated
  }
  private readyToPlay(match: StoredMatch) { const connected = new Set(this.connectedPlayers()); return Boolean(match.players.one && match.players.two && connected.has('one') && connected.has('two')) }
  private async load() { return this.state.storage.get<StoredMatch>(matchKey) }
  private async save(match: StoredMatch) { await this.state.storage.put(matchKey, match); if (match.deadline) await this.state.storage.setAlarm(match.deadline); else await this.state.storage.deleteAlarm() }
  private connectedPlayers() { const players = new Set<Player>(); for (const socket of this.state.getWebSockets()) { const attachment = socket.deserializeAttachment() as SocketAttachment | null; if (attachment) players.add(attachment.player) }; return [...players] }
  private broadcast(message: unknown) { const payload = JSON.stringify(message); for (const socket of this.state.getWebSockets()) this.send(socket, payload, true) }
  private send(socket: WebSocket, message: unknown, serialized = false) { try { socket.send(serialized ? message as string : JSON.stringify(message)) } catch { socket.close(1011, 'Connection unavailable.') } }
}

const worker: ExportedHandler<Env> = {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url)
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors(request, env) })
    if (url.pathname === '/health') return withCors(json({ ok: true, service: 'dotgrid-match-server' }), request, env)
    if (request.method === 'POST' && url.pathname === '/matches') {
      const code = randomCode()
      const room = env.MATCH_ROOMS.getByName(code)
      const roomRequest = new Request(`https://match-room/create?code=${code}`, { method: 'POST' })
      return withCors(await room.fetch(roomRequest), request, env)
    }
    const match = /^\/matches\/([A-Z0-9]{8})\/(join|connect)$/.exec(url.pathname)
    if (!match) return withCors(json({ error: 'Not found.' }, { status: 404 }), request, env)
    const [, code, action] = match
    const room = env.MATCH_ROOMS.getByName(code)
    const roomUrl = new URL(`https://match-room/${action}`)
    roomUrl.search = url.search
    const response = await room.fetch(new Request(roomUrl, request))
    // A 101 response carries the accepted WebSocket object. Re-wrapping it for CORS
    // drops that object and makes every browser connection close immediately.
    return action === 'connect' ? response : withCors(response, request, env)
  },
}
export default worker
