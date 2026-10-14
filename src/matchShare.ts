const codePattern = /^[A-Z0-9]{8}$/

export function normaliseMatchCode(value: string | null | undefined) {
  const code = value?.trim().toUpperCase() ?? ''
  return codePattern.test(code) ? code : ''
}

export function matchCodeFromLocation(search = window.location.search) {
  return normaliseMatchCode(new URLSearchParams(search).get('join'))
}

export function inviteUrl(code: string, location = window.location) {
  const url = new URL(location.href)
  const validCode = normaliseMatchCode(code)
  if (validCode) url.searchParams.set('join', validCode)
  else url.searchParams.delete('join')
  return url.toString()
}

export function whatsappInvite(code: string, location = window.location) {
  const url = inviteUrl(code, location)
  return `https://wa.me/?text=${encodeURIComponent(`Join my DotGrid match: ${url}`)}`
}

export async function copyText(value: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      return true
    }
  } catch { /* Fall through to the legacy clipboard path. */ }
  const field = document.createElement('textarea')
  field.value = value
  field.setAttribute('readonly', '')
  field.style.position = 'fixed'
  field.style.opacity = '0'
  document.body.append(field)
  field.select()
  const copied = document.execCommand('copy')
  field.remove()
  return copied
}
