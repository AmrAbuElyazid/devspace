export function normalizeBrowserInput(input: string): string {
  let url = input.trim()

  if (!url) return 'about:blank'

  if (!url.includes('://') && url.includes('.') && !url.includes(' ')) {
    url = `https://${url}`
  }

  if (!url.includes('://') && !url.includes('.')) {
    url = `https://www.google.com/search?q=${encodeURIComponent(url)}`
  }

  return url
}
