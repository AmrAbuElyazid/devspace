export function buildSearchUrl(input: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(input.trim())}`
}

export function getAddressBarSubmitValue(liveInputValue: string | undefined, fallbackValue: string): string {
  const trimmed = liveInputValue?.trim()
  return trimmed && trimmed.length > 0 ? liveInputValue! : fallbackValue
}

export function normalizeBrowserInput(input: string): string {
  let url = input.trim()

  if (!url) return 'about:blank'

  if (url.includes(' ')) {
    return buildSearchUrl(url)
  }

  if (/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(url) || /^(about|mailto|tel|data|file):/i.test(url)) {
    return url
  }

  if (/^(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0)(:\d+)?(\/.*)?$/i.test(url)) {
    return `http://${url}`
  }

  if (!url.includes('://') && url.includes('.') && !url.includes(' ')) {
    url = `https://${url}`
  }

  if (!url.includes('://') && !url.includes('.')) {
    url = buildSearchUrl(url)
  }

  return url
}
