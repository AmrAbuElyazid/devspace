export function normalizeBrowserInput(input: string): string {
  let url = input.trim()

  if (!url) return 'about:blank'

  if (url.includes(' ')) {
    return `https://www.google.com/search?q=${encodeURIComponent(url)}`
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
    url = `https://www.google.com/search?q=${encodeURIComponent(url)}`
  }

  return url
}
