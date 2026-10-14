import { createGame, expireTurn, playMove, type GameState, type Orientation, type Player } from '../../../src/game/engine'

type Env = {
  ALLOWED_ORIGIN: string
  MATCH_ROOMS: DurableObjectNamespace
}

type StoredMatch = {
  code: string
  players: Partial<Record<Player, string>>
  game: GameState
  deadline: number
}

type SocketAttachment = { player: Player }

const TURN_LENGTH_MS = 30_000
const matchKey = 'match'

const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), {
  ...init,
  headers: { 'content-type': 'application/json; charset=utf-8', ...init.headers },
})

const randomToken = () => crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '')
const randomCode = () => crypto.randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()

function cors(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('origin')
  return origin === env.ALLOWED_ORIGIN
    ? { 'access-control-allow-origin': origin, vary: 'Origin', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type' }
    : {}
}

function withCors(response: Response, request: Request, env: Env) {
  const headers = new Headers(response.headers)
  for (const [name, value] of Object.entries(cors(request, env))) headers.set(name, value)
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

function snapshot(match: StoredMatch) {
  return { type: 'state', code: match.code, game: match.game, deadline: match.deadline, joined: Boolean(match.players.two) }
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
    const existing = await this.state.storage.get<StoredMatch>(matchKey)
    if (existing) return json({ error: 'This match already exists.' }, { status: 409 })
    const code = url.searchParams.get('code') ?? randomCode()
    const match: StoredMatch = { code, players: { one: randomToken() }, game: createGame(), deadline: Date.now() + TURN_LENGTH_MS }
    await this.save(match)
    return json({ code: match.code, player: 'one', token: match.players.one, state: snapshot(match) }, { status: 201 })
  }

  private async join() {
    const match = await this.load()
    if (!match) return json({ error: 'Match not found.' }, { status: 404 })
    if (match.players.two) return json({ error: 'This match already has two players.' }, { status: 409 })
    match.players.two = randomToken()
    await this.save(match)
    this.broadcast(snapshot(match))
    return json({ code: match.code, player: 'two', token: match.players.two, state: snapshot(match) })
  }

  private async connect(url: URL) {
    const match = await this.load()
    if (!match) return new Response('Match not found.', { status: 404 })
    const token = url.searchParams.get('token')
    const player = (Object.entries(match.players) as Array<[Player, string]>).find(([, value]) => value === token)?.[0]
    if (!player) return new Response('Invalid player session.', { status: 401 })
    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)
    this.state.acceptWebSocket(server)
    server.serializeAttachment({ player } satisfies SocketAttachment)
    server.send(JSON.stringify(snapshot(match)))
    this.broadcast({ type: 'presence', players: this.connectedPlayers() })
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
    const result = playMove(match.game, { player: attachment.player, orientation: message.orientation, row: message.row, column: message.column })
    if (!result.ok) return this.send(socket, { type: 'error', message: result.reason })
    match.game = result.state
    match.deadline = result.state.status === 'playing' ? Date.now() + TURN_LENGTH_MS : 0
    await this.save(match)
    this.broadcast(snapshot(match))
  }

  async webSocketClose() {
    this.broadcast({ type: 'presence', players: this.connectedPlayers() })
  }

  async alarm() {
    const match = await this.load()
    if (!match || match.game.status !== 'playing' || Date.now() < match.deadline) return
    const result = expireTurn(match.game)
    if (!result.ok) return
    match.game = result.state
    match.deadline = Date.now() + TURN_LENGTH_MS
    await this.save(match)
    this.broadcast({ ...snapshot(match), notice: 'Turn expired. The move passed to the other player.' })
  }

  private async load() { return this.state.storage.get<StoredMatch>(matchKey) }

  private async save(match: StoredMatch) {
    await this.state.storage.put(matchKey, match)
    if (match.deadline) await this.state.storage.setAlarm(match.deadline)
  }

  private connectedPlayers() {
    return this.state.getWebSockets().flatMap((socket) => {
      const attachment = socket.deserializeAttachment() as SocketAttachment | null
      return attachment ? [attachment.player] : []
    })
  }

  private broadcast(message: unknown) {
    const payload = JSON.stringify(message)
    for (const socket of this.state.getWebSockets()) this.send(socket, payload, true)
  }

  private send(socket: WebSocket, message: unknown, serialized = false) {
    try { socket.send(serialized ? message as string : JSON.stringify(message)) } catch { socket.close(1011, 'Connection unavailable.') }
  }
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
    const roomRequest = new Request(roomUrl, request)
    return withCors(await room.fetch(roomRequest), request, env)
  },
}

export default worker
