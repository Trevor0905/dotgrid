export type Player = 'one' | 'two'
export type Orientation = 'h' | 'v'
export type Move = { player: Player; orientation: Orientation; row: number; column: number }
export type GameState = { edges: Record<string, Player>; boxes: Record<string, Player>; scores: Record<Player, number>; currentPlayer: Player; status: 'playing' | 'finished' }

export const DOTS = 6
const other = (player: Player): Player => player === 'one' ? 'two' : 'one'
const edgeKey = (orientation: Orientation, row: number, column: number) => `${orientation}:${row}:${column}`
const boxKey = (row: number, column: number) => `${row}:${column}`

export function createGame(): GameState { return { edges: {}, boxes: {}, scores: { one: 0, two: 0 }, currentPlayer: 'one', status: 'playing' } }

export function expireTurn(state: GameState): { ok: true; state: GameState } | { ok: false; reason: string } {
  if (state.status !== 'playing') return { ok: false, reason: 'This match is already complete.' }
  return { ok: true, state: { ...state, currentPlayer: other(state.currentPlayer) } }
}

export function playMove(state: GameState, move: Move): { ok: true; state: GameState; completed: number } | { ok: false; reason: string } {
  if (state.status !== 'playing') return { ok: false, reason: 'This match is already complete.' }
  if (move.player !== state.currentPlayer) return { ok: false, reason: 'It is not this player’s turn.' }
  const maxRow = move.orientation === 'h' ? DOTS : DOTS - 1
  const maxColumn = move.orientation === 'h' ? DOTS - 1 : DOTS
  if (!Number.isInteger(move.row) || !Number.isInteger(move.column) || move.row < 0 || move.column < 0 || move.row >= maxRow || move.column >= maxColumn) return { ok: false, reason: 'That line is outside the board.' }
  const key = edgeKey(move.orientation, move.row, move.column)
  if (state.edges[key]) return { ok: false, reason: 'That line has already been drawn.' }
  const edges = { ...state.edges, [key]: move.player }
  const boxes = { ...state.boxes }
  const candidates = move.orientation === 'h' ? [[move.row - 1, move.column], [move.row, move.column]] : [[move.row, move.column - 1], [move.row, move.column]]
  let completed = 0
  for (const [row, column] of candidates) {
    if (row < 0 || column < 0 || row >= DOTS - 1 || column >= DOTS - 1 || boxes[boxKey(row, column)]) continue
    const sides = [edgeKey('h', row, column), edgeKey('h', row + 1, column), edgeKey('v', row, column), edgeKey('v', row, column + 1)]
    if (sides.every((side) => edges[side])) { boxes[boxKey(row, column)] = move.player; completed++ }
  }
  const scores = { ...state.scores, [move.player]: state.scores[move.player] + completed }
  const status = Object.keys(boxes).length === (DOTS - 1) ** 2 ? 'finished' : 'playing'
  return { ok: true, completed, state: { edges, boxes, scores, currentPlayer: completed ? move.player : other(move.player), status } }
}
