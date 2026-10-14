import { describe, expect, it } from 'vitest'
import { MATCH_SERVER_URL, explainMatchError, matchEndpoint, matchSocketEndpoint } from './matchApi'

describe('match client endpoints', () => {
  it('uses the configured Worker for a create request', () => {
    expect(matchEndpoint('create')).toBe(`${MATCH_SERVER_URL}/matches`)
  })

  it('uses an uppercase friend code for a join request', () => {
    expect(matchEndpoint('join', 'ab12cd34')).toBe(`${MATCH_SERVER_URL}/matches/AB12CD34/join`)
  })

  it('does not use a player-supplied Worker URL', () => {
    expect(matchEndpoint('create')).toMatch(/^https:\/\/dotgrid-match-server\.tovix\.workers\.dev\/matches$/)
  })

  it('uses a secure WebSocket endpoint for match updates', () => {
    expect(matchSocketEndpoint('AB12CD34', 'token value')).toBe('wss://dotgrid-match-server.tovix.workers.dev/matches/AB12CD34/connect?token=token%20value')
  })

  it('turns route errors into player-facing messages', () => {
    expect(explainMatchError('join', 404)).toContain('not found')
    expect(explainMatchError('join', 409)).toContain('already has two players')
  })
})
