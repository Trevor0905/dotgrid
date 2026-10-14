import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createGame, DOTS, expireTurn, playMove, type GameState, type Orientation, type Player } from './game/engine'
import { explainMatchError, matchEndpoint, matchSocketEndpoint } from './matchApi'
import logoUrl from '/favicon.svg'
import './App.css'

type MatchPhase = 'waiting' | 'playing' | 'finished'
type ConnectionStatus = 'offline' | 'connecting' | 'connected' | 'reconnecting'

function App() {
  const [screen, setScreen] = useState<'home' | 'lobby' | 'match'>('home')
  const [game, setGame] = useState<GameState>(() => createGame())
  const [notice, setNotice] = useState('')
  const [turnTimer, setTurnTimer] = useState<{ player: Player; seconds: number }>({ player: 'one', seconds: 30 })
  const [matchCode, setMatchCode] = useState('')
  const [session, setSession] = useState<{ code: string; player: Player; token: string } | null>(null)
  const [deadline, setDeadline] = useState(0)
  const [phase, setPhase] = useState<MatchPhase>('waiting')
  const [connected, setConnected] = useState<Player[]>([])
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('offline')
  const socket = useRef<WebSocket | null>(null)
  const retryAttempt = useRef(0)
  const player = game.currentPlayer
  const playerName = player === 'one' ? 'You' : 'Player 2'
  const secondsRemaining = turnTimer.player === player ? turnTimer.seconds : 30
  const cells = useMemo(() => Array.from({ length: DOTS * DOTS }), [])
  useEffect(() => {
    if (screen !== 'match' || session || game.status !== 'playing') return
    const timer = window.setInterval(() => {
      setTurnTimer((currentTimer) => {
        const seconds = currentTimer.player === player ? currentTimer.seconds : 30
        if (seconds > 1) return { player, seconds: seconds - 1 }
        setGame((currentGame) => {
          const result = expireTurn(currentGame)
          if (result.ok) {
            setNotice(`${currentGame.currentPlayer === 'one' ? 'You' : 'Player 2'}'s demo timer expired. Turn passed.`)
            return result.state
          }
          return currentGame
        })
        return { player, seconds: 30 }
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [game.status, player, screen, session])
  useEffect(() => {
    if (!session || screen !== 'match') return
    let stopped = false
    let retryTimer: number | undefined
    const connect = () => {
      if (stopped) return
      setConnectionStatus(retryAttempt.current ? 'reconnecting' : 'connecting')
      const connection = new WebSocket(matchSocketEndpoint(session.code, session.token))
      socket.current = connection
      connection.onopen = () => {
        if (stopped || socket.current !== connection) return
        retryAttempt.current = 0
        setConnectionStatus('connected')
      }
      connection.onmessage = ({ data }) => {
        try {
          const message = JSON.parse(data) as { type: string; game?: GameState; deadline?: number; phase?: MatchPhase; connected?: Player[]; notice?: string; message?: string }
          if (message.type === 'state' && message.game) {
            setGame(message.game)
            setDeadline(message.deadline ?? 0)
            setPhase(message.phase ?? (message.game.status === 'finished' ? 'finished' : 'playing'))
            setConnected(message.connected ?? [])
            if (message.notice) setNotice(message.notice)
          }
          if (message.type === 'error') setNotice(message.message ?? 'The server rejected that move. Nothing changed.')
        } catch { setNotice('The match server sent an unreadable update. Reconnecting…'); connection.close() }
      }
      connection.onclose = () => {
        if (stopped || socket.current !== connection) return
        socket.current = null
        setConnectionStatus('reconnecting')
        setNotice('Connection lost. Reconnecting to your match…')
        const delay = Math.min(1_000 * 2 ** retryAttempt.current++, 10_000)
        retryTimer = window.setTimeout(connect, delay)
      }
    }
    connect()
    return () => { stopped = true; if (retryTimer) window.clearTimeout(retryTimer); if (socket.current) { socket.current.close(); socket.current = null } }
  }, [screen, session])
  useEffect(() => {
    if (!deadline || !session || game.status !== 'playing') return
    const update = () => setTurnTimer({ player: game.currentPlayer, seconds: Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) })
    update()
    const timer = window.setInterval(update, 250)
    return () => window.clearInterval(timer)
  }, [deadline, game.currentPlayer, game.status, session])
  const move = (orientation: Orientation, row: number, column: number) => {
    if (session) {
      if (phase !== 'playing') return setNotice(phase === 'waiting' ? 'Waiting for both players to connect before the match begins.' : 'This match is complete.')
      if (connectionStatus !== 'connected' || socket.current?.readyState !== WebSocket.OPEN) return setNotice('Your connection is recovering. Your move was not sent; please wait for reconnection.')
      socket.current.send(JSON.stringify({ type: 'move', orientation, row, column }))
      return
    }
    const result = playMove(game, { player, orientation, row, column })
    if (!result.ok) return setNotice(result.reason)
    setGame(result.state)
    setNotice(result.completed ? `${playerName} completed ${result.completed} box${result.completed > 1 ? 'es' : ''}!` : '')
  }
  const newGame = () => { setGame(createGame()); setNotice(''); setTurnTimer({ player: 'one', seconds: 30 }); setScreen('match') }
  const startOnline = async (joining: boolean) => {
    try {
      const action = joining ? 'join' : 'create'
      const response = await fetch(matchEndpoint(action, matchCode), { method: 'POST' })
      const data = await response.json() as { code?: string; player?: Player; token?: string; state?: { game: GameState; deadline: number; phase?: MatchPhase; connected?: Player[] }; error?: string }
      if (!response.ok || !data.code || !data.player || !data.token || !data.state) return setNotice(explainMatchError(action, response.status))
      setGame(data.state.game); setDeadline(data.state.deadline); setPhase(data.state.phase ?? 'waiting'); setConnected(data.state.connected ?? []); setSession({ code: data.code, player: data.player, token: data.token }); setScreen('match'); setNotice(data.player === 'one' ? `Share code ${data.code} with your friend. The timer starts only when both players connect.` : 'Joined. Connecting to your friend…')
    } catch { setNotice('We could not reach DotGrid’s match service. Check your connection and try again.') }
  }
  if (screen === 'home') return <main className="home"><nav className="nav"><a className="brand" href="#top"><Logo /> DotGrid</a><span className="status"><i /> Multiplayer staging</span></nav><section className="hero" id="top"><div className="hero-copy"><p className="eyebrow">A classic, recharged</p><h1>Claim the grid.<br /><em>Own the moment.</em></h1><p className="lede">A quick two-player game of dots, lines, and just the right amount of strategy.</p><button className="primary" onClick={() => setScreen('lobby')}>Play with a friend <span>→</span></button><button className="demo-link" onClick={newGame}>Open developer demo</button><p className="micro">Private friend-code matches are available in this staging build.</p></div><div className="board-art" aria-hidden="true"><PreviewBoard /></div></section><section className="how"><p className="eyebrow">Simple to learn. Hard to put down.</p><div className="steps"><Step n="01" title="Draw a line" text="Connect any two neighbouring dots." /><Step n="02" title="Complete a box" text="Close the fourth side to claim it." /><Step n="03" title="Keep your turn" text="A completed box earns you another move." /></div></section></main>
  if (screen === 'lobby') return <main className="lobby"><header className="match-header"><button className="back" onClick={() => setScreen('home')}>← Back</button><a className="brand" href="#top"><Logo /> DotGrid</a></header><section className="lobby-card"><p className="eyebrow">Two-player staging</p><h1>Play on separate devices.</h1><p>Create a private match and share its code with a friend, or enter a code to join them.</p><div className="lobby-actions"><button className="primary" onClick={() => startOnline(false)}>Create match</button><input value={matchCode} onChange={(event) => setMatchCode(event.target.value.toUpperCase())} placeholder="Friend’s match code" maxLength={8} /><button className="new-game" onClick={() => startOnline(true)}>Join match</button></div><p className="match-note" aria-live="polite">{notice}</p></section></main>
  const winnerPlayer = game.scores.one === game.scores.two ? null : game.scores.one > game.scores.two ? 'one' : 'two'
  const winner = game.status === 'finished' ? winnerPlayer ? (session ? winnerPlayer === session.player ? 'You win!' : 'Your friend wins!' : winnerPlayer === 'one' ? 'You win!' : 'Player 2 wins!') : 'It’s a draw.' : null
  const onlineReady = !session || (phase === 'playing' && connectionStatus === 'connected')
  const matchStatus = phase === 'waiting' ? 'Waiting for both players' : connectionStatus === 'reconnecting' ? 'Reconnecting…' : game.status === 'finished' ? 'Match complete' : `${playerName}'s turn`
  return <main className="match-page"><header className="match-header"><button className="back" onClick={() => { setSession(null); setScreen('home') }}>← {session ? 'Leave match' : 'Exit demo'}</button><a className="brand" href="#top"><Logo /> DotGrid</a><span className="turn-pill"><i /> {matchStatus}</span></header><section className="match-layout"><Player label={session?.player === 'one' ? 'You' : 'Friend'} colour="you" score={game.scores.one} active={phase === 'playing' && player === 'one'} /><div className="game-area"><div className="match-note" aria-live="polite">{winner ?? (notice || (phase === 'waiting' ? 'Waiting for both players to connect.' : 'Connect two dots to make your move.'))}</div>{session && <><p className="share-code">Match code: <b>{session.code}</b></p><p className="timer-note">{connectionStatus === 'connected' ? `Connected: ${connected.length}/2 players.` : connectionStatus === 'connecting' ? 'Connecting to the match server…' : 'Reconnecting automatically. Your game state is safe on the server.'}</p></>}{phase === 'playing' && game.status === 'playing' && <div className="turn-timer" aria-label={`${playerName} has ${secondsRemaining} seconds remaining`}><div className="timer-label"><span>{playerName}'s turn</span><b>{secondsRemaining}s</b></div><div className="timer-track"><i style={{ transform: `scaleX(${secondsRemaining / 30})` }} /></div></div>}<div className="game-board" role="grid" aria-label="Dots and Boxes board" style={{ '--grid-tracks': String(DOTS * 2 - 1) } as CSSProperties}>{Array.from({ length: DOTS - 1 }, (_, row) => Array.from({ length: DOTS - 1 }, (_, column) => { const owner = game.boxes[`${row}:${column}`]; return <div className={`box ${owner ? `box-${owner}` : ''}`} key={`b-${row}-${column}`} style={{ gridColumn: column * 2 + 2, gridRow: row * 2 + 2 }} /> }))}{cells.map((_, i) => <span className="dot" key={`d-${i}`} style={{ gridColumn: (i % DOTS) * 2 + 1, gridRow: Math.floor(i / DOTS) * 2 + 1 }} />)}<Edges game={game} move={move} interactive={onlineReady} /></div><p className="timer-note">{session ? 'Authoritative match state is held by the Cloudflare server.' : 'Developer demo only — the live match timer is server-enforced.'}</p>{!session && <button className="new-game" onClick={newGame}>{game.status === 'finished' ? 'Play again' : 'Restart demo'}</button>}</div><Player label={session?.player === 'two' ? 'You' : 'Friend'} colour="opponent" score={game.scores.two} active={phase === 'playing' && player === 'two'} /></section></main>
}

function Edges({ game, move, interactive }: { game: GameState; move: (orientation: Orientation, row: number, column: number) => void; interactive: boolean }) { return <>{Array.from({ length: DOTS }, (_, row) => Array.from({ length: DOTS - 1 }, (_, column) => { const key = `h:${row}:${column}`, owner = game.edges[key]; return <button aria-label={`Horizontal line ${row + 1}, ${column + 1}`} className={`edge horizontal ${owner ? `edge-${owner}` : ''}`} disabled={Boolean(owner) || game.status === 'finished' || !interactive} onClick={() => move('h', row, column)} key={key} style={{ gridColumn: column * 2 + 2, gridRow: row * 2 + 1 }} /> }))}{Array.from({ length: DOTS - 1 }, (_, row) => Array.from({ length: DOTS }, (_, column) => { const key = `v:${row}:${column}`, owner = game.edges[key]; return <button aria-label={`Vertical line ${row + 1}, ${column + 1}`} className={`edge vertical ${owner ? `edge-${owner}` : ''}`} disabled={Boolean(owner) || game.status === 'finished' || !interactive} onClick={() => move('v', row, column)} key={key} style={{ gridColumn: column * 2 + 1, gridRow: row * 2 + 2 }} /> }))}</> }
function Logo() { return <img className="logo-mark" src={logoUrl} alt="" /> }
function Step({ n, title, text }: { n: string; title: string; text: string }) { return <article><span>{n}</span><h2>{title}</h2><p>{text}</p></article> }
function Player({ label, colour, score, active }: { label: string; colour: string; score: number; active: boolean }) { return <aside className={`player-card ${active ? 'active' : ''}`}><span className={`avatar ${colour}`}>{label[0]}</span><div><strong>{label}</strong><small>{colour === 'you' ? 'Sky blue' : 'Coral red'}</small></div><b>{score}</b></aside> }
function PreviewBoard() { return <div className="preview-grid">{Array.from({ length: 36 }, (_, i) => <i key={i} />)}<b className="preview-line line-a" /><b className="preview-line line-b" /><b className="preview-line line-c" /><b className="preview-box" /></div> }
export default App
