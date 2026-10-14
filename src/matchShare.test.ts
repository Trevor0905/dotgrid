import { describe, expect, it } from 'vitest'
import { inviteUrl, matchCodeFromLocation, normaliseMatchCode, whatsappInvite } from './matchShare'

const location = new URL('https://trevor0905.github.io/dotgrid/') as unknown as Location

describe('match sharing', () => {
  it('creates a GitHub Pages invite URL with an encoded friend code', () => {
    expect(inviteUrl('ab12cd34', location)).toBe('https://trevor0905.github.io/dotgrid/?join=AB12CD34')
  })

  it('reads only valid join codes from an invite URL', () => {
    expect(matchCodeFromLocation('?join=ab12cd34')).toBe('AB12CD34')
    expect(matchCodeFromLocation('?join=nope')).toBe('')
    expect(normaliseMatchCode(' ab12cd34 ')).toBe('AB12CD34')
  })

  it('builds a WhatsApp URL containing the exact invite', () => {
    const url = new URL(whatsappInvite('AB12CD34', location))
    expect(url.origin).toBe('https://wa.me')
    expect(url.searchParams.get('text')).toContain('https://trevor0905.github.io/dotgrid/?join=AB12CD34')
  })
})
