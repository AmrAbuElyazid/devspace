import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  BrowserImportService,
  BrowserImportServiceError,
  collectChromiumCookies,
  dedupeHistoryEntries,
  decodeSafariBinaryCookies,
  toElectronCookieInput,
} from '../browser-import-service'

test('dedupeHistoryEntries removes exact duplicate imports', () => {
  const result = dedupeHistoryEntries([
    {
      url: 'https://example.com',
      title: 'Example',
      visitedAt: 1,
      source: 'chrome-import',
      browserProfile: 'Default',
    },
    {
      url: 'https://example.com',
      title: 'Example',
      visitedAt: 1,
      source: 'chrome-import',
      browserProfile: 'Default',
    },
  ])

  assert.equal(result.length, 1)
})

test('toElectronCookieInput maps secure cookie to https URL', () => {
  const cookie = toElectronCookieInput({
    host: '.example.com',
    path: '/',
    name: 'sid',
    value: 'abc',
    secure: true,
    httpOnly: true,
    expiresAt: null,
  })

  assert.equal(cookie.url, 'https://example.com/')
})

test('toElectronCookieInput preserves host-only cookies without widening them to domain cookies', () => {
  const cookie = toElectronCookieInput({
    host: 'example.com',
    path: '/',
    name: 'sid',
    value: 'abc',
  })

  assert.equal(cookie.url, 'http://example.com/')
  assert.equal('domain' in cookie, false)
})

test('listChromeProfiles reads available Chrome profile directories', async () => {
  const chromeUserDataDir = mkdtempSync(join(tmpdir(), 'devspace-chrome-profiles-'))

  try {
    mkdirSync(join(chromeUserDataDir, 'Default'))
    mkdirSync(join(chromeUserDataDir, 'Profile 1', 'Network'), { recursive: true })
    writeFileSync(join(chromeUserDataDir, 'Default', 'History'), '')
    writeFileSync(join(chromeUserDataDir, 'Profile 1', 'Network', 'Cookies'), '')
    writeFileSync(
      join(chromeUserDataDir, 'Local State'),
      JSON.stringify({
        profile: {
          info_cache: {
            Default: { name: 'Personal' },
            'Profile 1': { name: 'Work' },
          },
        },
      }),
      'utf8',
    )

    const service = new BrowserImportService({
      chromeUserDataDir,
      sessionManager: {
        getSession: () => ({ cookies: { set: async () => undefined, flushStore: async () => undefined } }) as never,
      },
      historyService: { importEntries: () => 0 },
    })

    const profiles = await service.listChromeProfiles()

    assert.deepEqual(profiles, [
      { name: 'Personal', path: join(chromeUserDataDir, 'Default') },
      { name: 'Work', path: join(chromeUserDataDir, 'Profile 1') },
    ])
  } finally {
    rmSync(chromeUserDataDir, { recursive: true, force: true })
  }
})

test('importChrome returns retryable keychain failure after importing history', async () => {
  const importedHistory: Array<{ url: string; title: string; visitedAt: number; source: string; browserProfile?: string }> = []

  const service = new BrowserImportService({
    sessionManager: {
      getSession: () => ({ cookies: { set: async () => undefined, flushStore: async () => undefined } }) as never,
    },
    historyService: {
      importEntries: (entries) => {
        importedHistory.push(...entries)
        return entries.length
      },
    },
    loadChromeHistoryImpl: async () => [
      {
        url: 'https://example.com',
        title: 'Example',
        visitedAt: 1,
        source: 'chrome-import',
        browserProfile: 'Default',
      },
    ],
    loadChromeCookiesImpl: async () => {
      throw new BrowserImportServiceError('CHROME_KEYCHAIN_ACCESS_REQUIRED', 'Keychain access denied', true)
    },
  })

  const result = await service.importChrome('/tmp/Default')

  assert.deepEqual(importedHistory, [
    {
      url: 'https://example.com',
      title: 'Example',
      visitedAt: 1,
      source: 'chrome-import',
      browserProfile: 'Default',
    },
  ])
  assert.deepEqual(result, {
    ok: false,
    code: 'CHROME_KEYCHAIN_ACCESS_REQUIRED',
    importedCookies: 0,
    importedHistory: 1,
    retryable: true,
    message: 'Keychain access denied',
  })
})

test('importSafari returns explicit Full Disk Access missing status', async () => {
  const service = new BrowserImportService({
    sessionManager: {
      getSession: () => ({ cookies: { set: async () => undefined, flushStore: async () => undefined } }) as never,
    },
    historyService: { importEntries: () => 0 },
    detectSafariAccessImpl: async () => ({
      ok: false,
      code: 'SAFARI_FULL_DISK_ACCESS_REQUIRED',
      message: 'Grant Full Disk Access to DevSpace.',
    }),
  })

  const result = await service.importSafari()

  assert.deepEqual(result, {
    ok: false,
    code: 'SAFARI_FULL_DISK_ACCESS_REQUIRED',
    importedCookies: 0,
    importedHistory: 0,
    message: 'Grant Full Disk Access to DevSpace.',
  })
})

test('importChrome supports history-only imports without loading cookies', async () => {
  let loadChromeCookiesCalls = 0
  const importedHistory: Array<{ url: string; title: string; visitedAt: number; source: string; browserProfile?: string }> = []

  const service = new BrowserImportService({
    sessionManager: {
      getSession: () => ({ cookies: { set: async () => undefined, flushStore: async () => undefined } }) as never,
    },
    historyService: {
      importEntries: (entries) => {
        importedHistory.push(...entries)
        return entries.length
      },
    },
    loadChromeHistoryImpl: async () => [
      {
        url: 'https://example.com/history-only',
        title: 'History Only',
        visitedAt: 10,
        source: 'chrome-import',
        browserProfile: 'Default',
      },
    ],
    loadChromeCookiesImpl: async () => {
      loadChromeCookiesCalls += 1
      return []
    },
  })

  const result = await service.importChrome('/tmp/Default', 'history')

  assert.equal(loadChromeCookiesCalls, 0)
  assert.equal(importedHistory.length, 1)
  assert.deepEqual(result, { ok: true, importedCookies: 0, importedHistory: 1 })
})

test('importSafari supports cookies-only imports without loading history', async () => {
  let loadSafariHistoryCalls = 0
  const service = new BrowserImportService({
    sessionManager: {
      getSession: () => ({ cookies: { set: async () => undefined, flushStore: async () => undefined } }) as never,
    },
    historyService: {
      importEntries: () => {
        throw new Error('history import should not run')
      },
    },
    detectSafariAccessImpl: async () => ({ ok: true }),
    loadSafariHistoryImpl: async () => {
      loadSafariHistoryCalls += 1
      return []
    },
    loadSafariCookiesImpl: async () => [
      {
        host: '.example.com',
        path: '/',
        name: 'sid',
        value: 'abc',
      },
    ],
  })

  const result = await service.importSafari('cookies')

  assert.equal(loadSafariHistoryCalls, 0)
  assert.deepEqual(result, { ok: true, importedCookies: 1, importedHistory: 0 })
})

test('detectSafariAccess reports Full Disk Access requirement for protected Safari files', async () => {
  const service = new BrowserImportService({
    sessionManager: {
      getSession: () => ({ cookies: { set: async () => undefined, flushStore: async () => undefined } }) as never,
    },
    historyService: { importEntries: () => 0 },
    safariPaths: {
      cookiesFile: '/Users/example/Library/Cookies/Cookies.binarycookies',
      historyDb: '/Users/example/Library/Safari/History.db',
    },
    statPathImpl: () => {
      const error = new Error('operation not permitted') as Error & { code?: string }
      error.code = 'EPERM'
      throw error
    },
  })

  const result = await service.detectSafariAccess()

  assert.deepEqual(result, {
    ok: false,
    code: 'SAFARI_FULL_DISK_ACCESS_REQUIRED',
    message: 'Grant Full Disk Access to DevSpace to import Safari data.',
  })
})

test('importChrome loads full-profile cookies without a URL slice', async () => {
  const capturedCalls: Array<Record<string, unknown>> = []

  const service = new BrowserImportService({
    sessionManager: {
      getSession: () => ({ cookies: { set: async () => undefined, flushStore: async () => undefined } }) as never,
    },
    historyService: { importEntries: () => 0 },
    getCookiesImpl: async (options) => {
      capturedCalls.push(options as unknown as Record<string, unknown>)
      return {
        cookies: [
          {
            host: '.example.com',
            path: '/',
            name: 'sid',
            value: 'abc',
          },
        ],
        warnings: [],
      }
    },
    loadChromeHistoryImpl: async () => [],
  })

  const result = await service.importChrome('/tmp/Default')

  assert.equal(result.ok, true)
  assert.equal(capturedCalls.length, 1)
  assert.equal('url' in capturedCalls[0], false)
  assert.equal(capturedCalls[0]?.chromeProfile, '/tmp/Default')
})

test('importSafari copies the cookie file to a temp path before reading it', async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'devspace-safari-cookie-copy-'))
  const originalCookieFile = join(tempRoot, 'Cookies.binarycookies')
  writeFileSync(originalCookieFile, 'cookie-data', 'utf8')

  const seenFiles: string[] = []
  const seenContents: string[] = []

  try {
    const service = new BrowserImportService({
      sessionManager: {
        getSession: () => ({ cookies: { set: async () => undefined, flushStore: async () => undefined } }) as never,
      },
      historyService: { importEntries: () => 0 },
      detectSafariAccessImpl: async () => ({ ok: true }),
      safariPaths: {
        cookiesFile: originalCookieFile,
      },
      getCookiesImpl: async (options) => {
        seenFiles.push(String(options.safariCookiesFile))
        seenContents.push(readFileSync(String(options.safariCookiesFile), 'utf8'))
        return { cookies: [], warnings: [] }
      },
      loadSafariHistoryImpl: async () => [],
    })

    const result = await service.importSafari()

    assert.equal(result.ok, true)
    assert.equal(seenFiles.length, 1)
    assert.notEqual(seenFiles[0], originalCookieFile)
    assert.equal(seenContents[0], 'cookie-data')
  } finally {
    rmSync(tempRoot, { recursive: true, force: true })
  }
})

test('importChrome surfaces provider warnings as structured cookie failures after importing history', async () => {
  const importedHistory: Array<{ url: string; title: string; visitedAt: number; source: string; browserProfile?: string }> = []

  const service = new BrowserImportService({
    sessionManager: {
      getSession: () => ({ cookies: { set: async () => undefined, flushStore: async () => undefined } }) as never,
    },
    historyService: {
      importEntries: (entries) => {
        importedHistory.push(...entries)
        return entries.length
      },
    },
    getCookiesImpl: async () => ({
      cookies: [],
      warnings: ['failed to copy locked cookie database'],
    }),
    loadChromeHistoryImpl: async () => [
      {
        url: 'https://example.com',
        title: 'Example',
        visitedAt: 1,
        source: 'chrome-import',
        browserProfile: 'Default',
      },
    ],
  })

  const result = await service.importChrome('/tmp/Default')

  assert.equal(importedHistory.length, 1)
  assert.deepEqual(result, {
    ok: false,
    code: 'CHROME_COOKIE_IMPORT_FAILED',
    importedCookies: 0,
    importedHistory: 1,
    message: 'failed to copy locked cookie database',
  })
})

test('importChrome rolls back cookies written during the current import attempt when a later write fails', async () => {
  const setCalls: Electron.CookiesSetDetails[] = []
  const removeCalls: Array<{ url: string; name: string; storeId?: string }> = []

  const service = new BrowserImportService({
    sessionManager: {
      getSession: () => ({
        cookies: {
          set: async (details: Electron.CookiesSetDetails) => {
            setCalls.push(details)
            if (details.name === 'broken') {
              throw new Error('write failed')
            }
          },
          remove: async (url: string, name: string) => {
            removeCalls.push({ url, name })
          },
          flushStore: async () => undefined,
        },
      }) as never,
    },
    historyService: { importEntries: () => 0 },
    loadChromeHistoryImpl: async () => [],
    loadChromeCookiesImpl: async () => [
      {
        host: '.example.com',
        path: '/',
        name: 'ok',
        value: '1',
      },
      {
        host: '.example.com',
        path: '/',
        name: 'broken',
        value: '2',
      },
    ],
  })

  const result = await service.importChrome('/tmp/Default')

  assert.equal(setCalls.length, 2)
  assert.deepEqual(removeCalls, [
    {
      url: 'http://example.com/',
      name: 'ok',
    },
  ])
  assert.deepEqual(result, {
    ok: false,
    code: 'CHROME_COOKIE_IMPORT_FAILED',
    importedCookies: 0,
    importedHistory: 0,
    message: 'write failed',
  })
})

test('importChrome restores an overwritten cookie when a later write fails', async () => {
  const operations: string[] = []

  const service = new BrowserImportService({
    sessionManager: {
      getSession: () => ({
        cookies: {
          get: async (filter: { url?: string; name?: string }) => {
            if (filter.name === 'session') {
              return [
                {
                  name: 'session',
                  value: 'old-value',
                  domain: 'example.com',
                  path: '/',
                  secure: false,
                  httpOnly: true,
                  session: false,
                  hostOnly: true,
                },
              ] as Electron.Cookie[]
            }

            return []
          },
          set: async (details: Electron.CookiesSetDetails) => {
            operations.push(`set:${details.name}:${details.value}`)
            if (details.name === 'broken') {
              throw new Error('write failed')
            }
          },
          remove: async (url: string, name: string) => {
            operations.push(`remove:${name}:${url}`)
          },
          flushStore: async () => undefined,
        },
      }) as never,
    },
    historyService: { importEntries: () => 0 },
    loadChromeHistoryImpl: async () => [],
    loadChromeCookiesImpl: async () => [
      {
        host: 'example.com',
        path: '/',
        name: 'session',
        value: 'new-value',
        httpOnly: true,
      },
      {
        host: '.example.com',
        path: '/',
        name: 'broken',
        value: '2',
      },
    ],
  })

  const result = await service.importChrome('/tmp/Default')

  assert.deepEqual(operations, [
    'set:session:new-value',
    'set:broken:2',
    'remove:session:http://example.com/',
    'set:session:old-value',
  ])
  assert.deepEqual(result, {
    ok: false,
    code: 'CHROME_COOKIE_IMPORT_FAILED',
    importedCookies: 0,
    importedHistory: 0,
    message: 'write failed',
  })
})

test('collectChromiumCookies preserves host-only host_key values', () => {
  const cookies = collectChromiumCookies(
    [
      {
        name: 'sid',
        value: 'abc',
        host_key: 'example.com',
        path: '/',
        expires_utc: 0,
        samesite: -1,
        is_secure: 0,
        is_httponly: 1,
      },
    ],
    {
      browser: 'chrome',
      profile: 'Default',
      includeExpired: false,
      decrypt: () => null,
    },
  )

  assert.equal(cookies.length, 1)
  const cookie = toElectronCookieInput(cookies[0])
  assert.equal(cookie.url, 'http://example.com/')
  assert.equal('domain' in cookie, false)
})

test('collectChromiumCookies keeps host-only and domain cookies distinct', () => {
  const cookies = collectChromiumCookies(
    [
      {
        name: 'sid',
        value: 'host-only',
        host_key: 'example.com',
        path: '/',
        expires_utc: 0,
        samesite: -1,
        is_secure: 0,
        is_httponly: 1,
      },
      {
        name: 'sid',
        value: 'domain',
        host_key: '.example.com',
        path: '/',
        expires_utc: 0,
        samesite: -1,
        is_secure: 0,
        is_httponly: 1,
      },
    ],
    {
      browser: 'chrome',
      profile: 'Default',
      includeExpired: false,
      decrypt: () => null,
    },
  )

  assert.equal(cookies.length, 2)

  const mapped = cookies.map((value) => toElectronCookieInput(value))
  assert.equal(mapped.filter((cookie) => 'domain' in cookie).length, 1)
  assert.equal(mapped.filter((cookie) => !('domain' in cookie)).length, 1)
})

test('importChrome restores the matching host-only cookie variant on rollback', async () => {
  const operations: string[] = []

  const service = new BrowserImportService({
    sessionManager: {
      getSession: () => ({
        cookies: {
          get: async () => [
            {
              name: 'session',
              value: 'old-host-only',
              domain: 'example.com',
              path: '/',
              secure: false,
              httpOnly: true,
              session: false,
              hostOnly: true,
            },
            {
              name: 'session',
              value: 'old-domain',
              domain: 'example.com',
              path: '/',
              secure: false,
              httpOnly: true,
              session: false,
              hostOnly: false,
            },
          ] as Electron.Cookie[],
          set: async (details: Electron.CookiesSetDetails) => {
            operations.push(`set:${details.name}:${details.value}:${'domain' in details ? 'domain' : 'host'}`)
            if (details.name === 'broken') {
              throw new Error('write failed')
            }
          },
          remove: async (url: string, name: string) => {
            operations.push(`remove:${name}:${url}`)
          },
          flushStore: async () => undefined,
        },
      }) as never,
    },
    historyService: { importEntries: () => 0 },
    loadChromeHistoryImpl: async () => [],
    loadChromeCookiesImpl: async () => [
      {
        host: 'example.com',
        path: '/',
        name: 'session',
        value: 'new-host-only',
        httpOnly: true,
      },
      {
        host: '.example.com',
        path: '/',
        name: 'broken',
        value: '2',
      },
    ],
  })

  const result = await service.importChrome('/tmp/Default')

  assert.deepEqual(operations, [
    'set:session:new-host-only:host',
    'set:broken:2:domain',
    'remove:session:http://example.com/',
    'set:session:old-host-only:host',
  ])
  assert.equal(result.ok, false)
})

test('importChrome restores host-only and domain cookie variants independently on rollback', async () => {
  const operations: string[] = []

  const service = new BrowserImportService({
    sessionManager: {
      getSession: () => ({
        cookies: {
          get: async () => [
            {
              name: 'session',
              value: 'old-host-only',
              domain: 'example.com',
              path: '/',
              secure: false,
              httpOnly: true,
              session: false,
              hostOnly: true,
            },
            {
              name: 'session',
              value: 'old-domain',
              domain: 'example.com',
              path: '/',
              secure: false,
              httpOnly: true,
              session: false,
              hostOnly: false,
            },
          ] as Electron.Cookie[],
          set: async (details: Electron.CookiesSetDetails) => {
            operations.push(`set:${details.name}:${details.value}:${'domain' in details ? 'domain' : 'host'}`)
            if (details.name === 'broken') {
              throw new Error('write failed')
            }
          },
          remove: async (url: string, name: string) => {
            operations.push(`remove:${name}:${url}`)
          },
          flushStore: async () => undefined,
        },
      }) as never,
    },
    historyService: { importEntries: () => 0 },
    loadChromeHistoryImpl: async () => [],
    loadChromeCookiesImpl: async () => [
      {
        host: 'example.com',
        path: '/',
        name: 'session',
        value: 'new-host-only',
        httpOnly: true,
      },
      {
        domain: 'example.com',
        path: '/',
        name: 'session',
        value: 'new-domain',
        httpOnly: true,
      },
      {
        host: '.example.com',
        path: '/',
        name: 'broken',
        value: '2',
      },
    ],
  })

  const result = await service.importChrome('/tmp/Default')

  assert.deepEqual(operations, [
    'set:session:new-host-only:host',
    'set:session:new-domain:domain',
    'set:broken:2:domain',
    'remove:session:http://example.com/',
    'set:session:old-domain:domain',
    'set:session:old-host-only:host',
  ])
  assert.equal(result.ok, false)
})

test('decodeSafariBinaryCookies preserves host-only cookies without widening them', () => {
  const cookieBuffer = Buffer.alloc(128)
  cookieBuffer.writeUInt32LE(128, 0)
  cookieBuffer.writeUInt32LE(0, 4)
  cookieBuffer.writeUInt32LE(0, 8)
  cookieBuffer.writeUInt32LE(48, 12)
  cookieBuffer.writeUInt32LE(64, 16)
  cookieBuffer.writeUInt32LE(76, 20)
  cookieBuffer.writeUInt32LE(80, 24)
  cookieBuffer.writeUInt32LE(82, 28)
  cookieBuffer.writeDoubleLE(0, 40)
  cookieBuffer.write('example.com\0', 64, 'utf8')
  cookieBuffer.write('sid\0', 76, 'utf8')
  cookieBuffer.write('/\0', 80, 'utf8')
  cookieBuffer.write('abc\0', 82, 'utf8')

  const page = Buffer.alloc(8 + 4 + 128)
  page.writeUInt32BE(0x00000100, 0)
  page.writeUInt32LE(1, 4)
  page.writeUInt32LE(12, 8)
  cookieBuffer.copy(page, 12)

  const file = Buffer.alloc(8 + 4 + page.length)
  file.write('cook', 0, 'utf8')
  file.writeUInt32BE(1, 4)
  file.writeUInt32BE(page.length, 8)
  page.copy(file, 12)

  const cookies = decodeSafariBinaryCookies(file)

  assert.equal(cookies.length, 1)
  const cookie = toElectronCookieInput(cookies[0])
  assert.equal(cookie.url, 'http://example.com/')
  assert.equal('domain' in cookie, false)
})

test('decodeSafariBinaryCookies keeps distinct host-only cookies for different hosts', () => {
  function makeCookie(rawHost: string, name: string, value: string): Buffer {
    const cookieBuffer = Buffer.alloc(160)
    cookieBuffer.writeUInt32LE(160, 0)
    cookieBuffer.writeUInt32LE(0, 4)
    cookieBuffer.writeUInt32LE(0, 8)
    cookieBuffer.writeUInt32LE(48, 12)
    cookieBuffer.writeUInt32LE(64, 16)
    cookieBuffer.writeUInt32LE(96, 20)
    cookieBuffer.writeUInt32LE(112, 24)
    cookieBuffer.writeUInt32LE(120, 28)
    cookieBuffer.writeDoubleLE(0, 40)
    cookieBuffer.write(`${rawHost}\0`, 64, 'utf8')
    cookieBuffer.write(`${name}\0`, 96, 'utf8')
    cookieBuffer.write('/\0', 112, 'utf8')
    cookieBuffer.write(`${value}\0`, 120, 'utf8')
    return cookieBuffer
  }

  const firstCookie = makeCookie('a.example.com', 'sid', 'one')
  const secondCookie = makeCookie('b.example.com', 'sid', 'two')

  const firstOffset = 16
  const secondOffset = firstOffset + firstCookie.length
  const pageLength = secondOffset + secondCookie.length
  const page = Buffer.alloc(pageLength)
  page.writeUInt32BE(0x00000100, 0)
  page.writeUInt32LE(2, 4)
  page.writeUInt32LE(firstOffset, 8)
  page.writeUInt32LE(secondOffset, 12)
  firstCookie.copy(page, firstOffset)
  secondCookie.copy(page, secondOffset)

  const file = Buffer.alloc(8 + 4 + page.length)
  file.write('cook', 0, 'utf8')
  file.writeUInt32BE(1, 4)
  file.writeUInt32BE(page.length, 8)
  page.copy(file, 12)

  const cookies = decodeSafariBinaryCookies(file)

  assert.equal(cookies.length, 2)
  const urls = cookies.map((cookie) => toElectronCookieInput(cookie).url).sort()
  assert.deepEqual(urls, ['http://a.example.com/', 'http://b.example.com/'])
})

test('decodeSafariBinaryCookies keeps host-only and domain cookies distinct for the same hostname', () => {
  function makeCookie(rawHost: string, name: string, value: string): Buffer {
    const cookieBuffer = Buffer.alloc(160)
    cookieBuffer.writeUInt32LE(160, 0)
    cookieBuffer.writeUInt32LE(0, 4)
    cookieBuffer.writeUInt32LE(0, 8)
    cookieBuffer.writeUInt32LE(48, 12)
    cookieBuffer.writeUInt32LE(64, 16)
    cookieBuffer.writeUInt32LE(96, 20)
    cookieBuffer.writeUInt32LE(112, 24)
    cookieBuffer.writeUInt32LE(120, 28)
    cookieBuffer.writeDoubleLE(0, 40)
    cookieBuffer.write(`${rawHost}\0`, 64, 'utf8')
    cookieBuffer.write(`${name}\0`, 96, 'utf8')
    cookieBuffer.write('/\0', 112, 'utf8')
    cookieBuffer.write(`${value}\0`, 120, 'utf8')
    return cookieBuffer
  }

  const firstCookie = makeCookie('example.com', 'sid', 'host-only')
  const secondCookie = makeCookie('.example.com', 'sid', 'domain')

  const firstOffset = 16
  const secondOffset = firstOffset + firstCookie.length
  const pageLength = secondOffset + secondCookie.length
  const page = Buffer.alloc(pageLength)
  page.writeUInt32BE(0x00000100, 0)
  page.writeUInt32LE(2, 4)
  page.writeUInt32LE(firstOffset, 8)
  page.writeUInt32LE(secondOffset, 12)
  firstCookie.copy(page, firstOffset)
  secondCookie.copy(page, secondOffset)

  const file = Buffer.alloc(8 + 4 + page.length)
  file.write('cook', 0, 'utf8')
  file.writeUInt32BE(1, 4)
  file.writeUInt32BE(page.length, 8)
  page.copy(file, 12)

  const cookies = decodeSafariBinaryCookies(file)

  assert.equal(cookies.length, 2)
  const mapped = cookies.map((cookie) => toElectronCookieInput(cookie))
  assert.equal(mapped.filter((cookie) => 'domain' in cookie).length, 1)
  assert.equal(mapped.filter((cookie) => !('domain' in cookie)).length, 1)
})

test('importChrome rollback removes touched cookie family before restoring prior variants', async () => {
  const operations: string[] = []

  const service = new BrowserImportService({
    sessionManager: {
      getSession: () => ({
        cookies: {
          get: async (filter: { url?: string; name?: string }) => {
            if (filter.name === 'session') {
              return [
                {
                  name: 'session',
                  value: 'old-host-only',
                  domain: 'example.com',
                  path: '/',
                  secure: false,
                  httpOnly: true,
                  session: false,
                  hostOnly: true,
                },
                {
                  name: 'session',
                  value: 'old-domain',
                  domain: 'example.com',
                  path: '/',
                  secure: false,
                  httpOnly: true,
                  session: false,
                  hostOnly: false,
                },
              ] as Electron.Cookie[]
            }

            return []
          },
          set: async (details: Electron.CookiesSetDetails) => {
            operations.push(`set:${details.name}:${details.value}:${'domain' in details ? 'domain' : 'host'}`)
            if (details.name === 'broken') {
              throw new Error('write failed')
            }
          },
          remove: async (url: string, name: string) => {
            operations.push(`remove:${name}:${url}`)
          },
          flushStore: async () => undefined,
        },
      }) as never,
    },
    historyService: { importEntries: () => 0 },
    loadChromeHistoryImpl: async () => [],
    loadChromeCookiesImpl: async () => [
      {
        host: 'example.com',
        path: '/',
        name: 'session',
        value: 'new-host-only',
        httpOnly: true,
      },
      {
        domain: 'example.com',
        path: '/',
        name: 'session',
        value: 'new-domain',
        httpOnly: true,
      },
      {
        host: '.example.com',
        path: '/',
        name: 'broken',
        value: '2',
      },
    ],
  })

  const result = await service.importChrome('/tmp/Default')

  assert.deepEqual(operations, [
    'set:session:new-host-only:host',
    'set:session:new-domain:domain',
    'set:broken:2:domain',
    'remove:session:http://example.com/',
    'set:session:old-domain:domain',
    'set:session:old-host-only:host',
  ])
  assert.equal(result.ok, false)
})

test('importChrome restores the exact prior domain variant after family rollback', async () => {
  const operations: string[] = []

  const service = new BrowserImportService({
    sessionManager: {
      getSession: () => ({
        cookies: {
          get: async () => [
            {
              name: 'session',
              value: 'old-root-domain',
              domain: 'example.com',
              path: '/',
              secure: false,
              httpOnly: true,
              session: false,
              hostOnly: false,
            },
            {
              name: 'session',
              value: 'old-sub-domain',
              domain: 'sub.example.com',
              path: '/',
              secure: false,
              httpOnly: true,
              session: false,
              hostOnly: false,
            },
          ] as Electron.Cookie[],
          set: async (details: Electron.CookiesSetDetails) => {
            operations.push(`set:${details.name}:${details.value}:${details.url}`)
            if (details.name === 'broken') {
              throw new Error('write failed')
            }
          },
          remove: async (url: string, name: string) => {
            operations.push(`remove:${name}:${url}`)
          },
          flushStore: async () => undefined,
        },
      }) as never,
    },
    historyService: { importEntries: () => 0 },
    loadChromeHistoryImpl: async () => [],
    loadChromeCookiesImpl: async () => [
      {
        domain: 'sub.example.com',
        path: '/',
        name: 'session',
        value: 'new-sub-domain',
        httpOnly: true,
      },
      {
        host: '.example.com',
        path: '/',
        name: 'broken',
        value: '2',
      },
    ],
  })

  const result = await service.importChrome('/tmp/Default')

  assert.deepEqual(operations, [
    'set:session:new-sub-domain:http://sub.example.com/',
    'set:broken:2:http://example.com/',
    'remove:session:http://sub.example.com/',
    'set:session:old-sub-domain:http://sub.example.com/',
  ])
  assert.equal(result.ok, false)
})
