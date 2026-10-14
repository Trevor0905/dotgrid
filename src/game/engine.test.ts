import { describe, expect, it } from 'vitest'
import { createGame, expireTurn, playMove, type GameState, type Move } from './engine'

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
    for (let row = 0; row < 6; row++) for (let column = 0; column < 6; column++) if (row !== 5 || column !== 5) boxes[`${row}:${column}`] = 'one'
    const game: GameState = { edges: { 'h:5:5': 'one', 'h:6:5': 'one', 'v:5:5': 'one' }, boxes, scores: { one: 35, two: 0 }, currentPlayer: 'one', status: 'playing' }
    const result = move(game, { orientation: 'v', row: 5, column: 6 })
    expect(result.ok && result.completed).toBe(1)
    expect(result.ok && result.state.status).toBe('finished')
    expect(result.ok && result.state.scores).toEqual({ one: 36, two: 0 })
  })
  it('permits a draw when the final box equalises the score', () => {
    const boxes: Record<string, 'one' | 'two'> = {}
    let claimedByOne = 0
    for (let row = 0; row < 6; row++) for (let column = 0; column < 6; column++) {
      if (row === 5 && column === 5) continue
      boxes[`${row}:${column}`] = claimedByOne < 18 ? 'one' : 'two'
      claimedByOne++
    }
    const game: GameState = { edges: { 'h:5:5': 'one', 'h:6:5': 'one', 'v:5:5': 'one' }, boxes, scores: { one: 18, two: 17 }, currentPlayer: 'two', status: 'playing' }
    const result = move(game, { orientation: 'v', row: 5, column: 6 })
    expect(result.ok && result.state.status).toBe('finished')
    expect(result.ok && result.state.scores).toEqual({ one: 18, two: 18 })
  })
})
