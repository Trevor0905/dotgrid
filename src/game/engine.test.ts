import { describe, expect, it } from 'vitest'
import { createGame, DOTS, expireTurn, playMove, type GameState, type Move } from './engine'

const move = (state: GameState, data: Omit<Move, 'player'>) => playMove(state, { ...data, player: state.currentPlayer })

describe('Dots and Boxes engine', () => {
  it('creates the opening state', () => { const game = createGame(); expect(game.currentPlayer).toBe('one'); expect(game.scores).toEqual({ one: 0, two: 0 }) })
  it('alternates players after an ordinary legal move', () => { const result = move(createGame(), { orientation: 'h', row: 0, column: 0 }); expect(result.ok && result.state.currentPlayer).toBe('two') })
  it('passes the turn when the local demo clock expires', () => { const result = expireTurn(createGame()); expect(result.ok && result.state.currentPlayer).toBe('two') })
  it('rejects duplicate lines and out-of-turn moves', () => { const first = move(createGame(), { orientation: 'h', row: 0, column: 0 }); if (!first.ok) throw new Error('expected legal move'); expect(playMove(first.state, { player: 'one', orientation: 'h', row: 0, column: 1 }).ok).toBe(false); expect(playMove(first.state, { player: 'two', orientation: 'h', row: 0, column: 0 }).ok).toBe(false) })
  it('claims a completed box and grants an extra turn', () => { let game = createGame(); for (const data of [{ orientation: 'h' as const, row: 0, column: 0 }, { orientation: 'v' as const, row: 0, column: 0 }, { orientation: 'h' as const, row: 1, column: 0 }]) { const result = move(game, data); if (!result.ok) throw new Error(result.reason); game = result.state }; const result = move(game, { orientation: 'v', row: 0, column: 1 }); expect(result.ok && result.completed).toBe(1); expect(result.ok && result.state.scores[result.state.currentPlayer]).toBe(1) })
  it('claims both boxes closed by one shared edge', () => {
    const game: GameState = {
      ...createGame(),
      edges: { 'h:0:0': 'two', 'h:1:0': 'two', 'h:0:1': 'two', 'h:1:1': 'two', 'v:0:0': 'two', 'v:0:2': 'two' },
    }
    const result = move(game, { orientation: 'v', row: 0, column: 1 })
    expect(result.ok && result.completed).toBe(2)
    if (!result.ok) throw new Error(result.reason)
    expect(result.state.boxes).toEqual({ '0:0': 'one', '0:1': 'one' })
    expect(result.state.scores).toEqual({ one: 2, two: 0 })
    expect(result.state.currentPlayer).toBe('one')
  })
  it('finishes when the final box is claimed', () => {
    const boxes: Record<string, 'one'> = {}
    for (let row = 0; row < DOTS - 1; row++) for (let column = 0; column < DOTS - 1; column++) if (row !== DOTS - 2 || column !== DOTS - 2) boxes[`${row}:${column}`] = 'one'
    const final = DOTS - 2
    const game: GameState = { edges: { [`h:${final}:${final}`]: 'one', [`h:${final + 1}:${final}`]: 'one', [`v:${final}:${final}`]: 'one' }, boxes, scores: { one: (DOTS - 1) ** 2 - 1, two: 0 }, currentPlayer: 'one', status: 'playing' }
    const result = move(game, { orientation: 'v', row: final, column: final + 1 })
    expect(result.ok && result.completed).toBe(1)
    expect(result.ok && result.state.status).toBe('finished')
    expect(result.ok && result.state.scores).toEqual({ one: (DOTS - 1) ** 2, two: 0 })
  })
})
