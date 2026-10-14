export const MATCH_SERVER_URL = 'https://dotgrid-match-server.tovix.workers.dev'

export type MatchAction = 'create' | 'join'

export function matchEndpoint(action: MatchAction, code?: string) {
  const base = MATCH_SERVER_URL.replace(/\/$/, '')
  return action === 'create'
    ? `${base}/matches`
    : `${base}/matches/${code?.trim().toUpperCase() ?? ''}/join`
}

export function matchSocketEndpoint(code: string, token: string) {
  const base = MATCH_SERVER_URL.replace(/^https/, 'wss').replace(/^http/, 'ws').replace(/\/$/, '')
  return `${base}/matches/${code}/connect?token=${encodeURIComponent(token)}`
}

export function explainMatchError(action: MatchAction, status?: number) {
  if (action === 'join' && status === 404) return 'That match code was not found. Check the code with your friend and try again.'
  if (action === 'join' && status === 409) return 'That match already has two players. Ask your friend to create a new one.'
  if (status === 401 || status === 403) return 'Your match session could not be verified. Please create or join the match again.'
  return action === 'create'
    ? 'We could not create a match right now. Please try again.'
    : 'We could not join that match right now. Please try again.'
}
