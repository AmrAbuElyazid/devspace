import { execFileSync } from 'node:child_process'
import { createDecipheriv, pbkdf2Sync } from 'node:crypto'
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import type { Cookie as SweetCookie, GetCookiesOptions } from '@steipete/sweet-cookie'
import type { BrowserImportMode } from '../../shared/browser'
import type { BrowserHistoryEntryInput, BrowserHistoryRecorder } from './browser-history-service'
import type { BrowserSessionManager } from './browser-session-manager'

const CHROME_HISTORY_SOURCE = 'chrome-import'
const SAFARI_HISTORY_SOURCE = 'safari-import'
const CHROME_ROOT = join(homedir(), 'Library', 'Application Support', 'Google', 'Chrome')
const SAFARI_COOKIE_CANDIDATES = [
  join(homedir(), 'Library', 'Cookies', 'Cookies.binarycookies'),
  join(homedir(), 'Library', 'Containers', 'com.apple.Safari', 'Data', 'Library', 'Cookies', 'Cookies.binarycookies'),
]
const SAFARI_HISTORY_DB = join(homedir(), 'Library', 'Safari', 'History.db')

export interface ChromeProfileDescriptor {
  name: string
  path: string
}

export type BrowserImportResult =
  | { ok: true; importedCookies: number; importedHistory: number }
  | {
      ok: false
      code: string
      importedCookies: number
      importedHistory: number
      message?: string
      retryable?: boolean
    }

export type SafariAccessResult =
  | { ok: true }
  | { ok: false; code: 'SAFARI_FULL_DISK_ACCESS_REQUIRED'; message: string }

type ImportedHistoryEntry = Omit<BrowserHistoryEntryInput, 'id'>

type CookieWriter = {
  cookies: {
    get?: (filter: Electron.CookiesGetFilter) => Promise<Electron.Cookie[]>
    set: (details: Electron.CookiesSetDetails) => Promise<void>
    remove?: (url: string, name: string) => Promise<void>
    flushStore: () => Promise<void>
  }
}

type ElectronCookieSameSite = Electron.CookiesSetDetails['sameSite']
type GetCookiesResult = {
  cookies: SweetCookie[]
  warnings: string[]
}
type GetCookiesImpl = (options: GetCookiesOptions) => Promise<GetCookiesResult>

type ImportedBrowserCookie = SweetCookie & {
  host?: string
  hostOnly?: boolean
  expiresAt?: number | null
}
type ImportedCookieSnapshot = Electron.CookiesSetDetails & {
  hostOnly?: boolean
}

type ImportedCookieInput = Electron.CookiesSetDetails & {
  hostOnly?: boolean
}

type BrowserImportServiceDeps = {
  sessionManager: Pick<BrowserSessionManager, 'getSession'>
  historyService: Pick<BrowserHistoryRecorder, 'importEntries'>
  chromeUserDataDir?: string
  safariPaths?: {
    cookiesFile?: string
    historyDb?: string
  }
  getCookiesImpl?: GetCookiesImpl
  loadChromeHistoryImpl?: (profilePath: string) => Promise<ImportedHistoryEntry[]>
  loadSafariHistoryImpl?: () => Promise<ImportedHistoryEntry[]>
  loadChromeCookiesImpl?: (profilePath: string) => Promise<SweetCookie[]>
  loadSafariCookiesImpl?: () => Promise<SweetCookie[]>
  detectSafariAccessImpl?: (mode: BrowserImportMode) => Promise<SafariAccessResult>
  statPathImpl?: (path: string) => { isFile: () => boolean; isDirectory: () => boolean }
}

export class BrowserImportServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable = false,
  ) {
    super(message)
    this.name = 'BrowserImportServiceError'
  }
}

export function dedupeHistoryEntries(entries: ImportedHistoryEntry[]): ImportedHistoryEntry[] {
  const seen = new Set<string>()
  const deduped: ImportedHistoryEntry[] = []

  for (const entry of entries) {
    const key = [entry.source, entry.browserProfile ?? '', entry.url, String(entry.visitedAt)].join('::')
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    deduped.push(entry)
  }

  return deduped.sort((left, right) => right.visitedAt - left.visitedAt)
}

export function toElectronCookieInput(cookie: ImportedBrowserCookie): ImportedCookieInput {
  const rawHost = cookie.domain ?? cookie.host ?? ''
  const normalizedDomain = rawHost.replace(/^\./, '')
  const isDomainCookie = cookie.hostOnly ? false : (typeof cookie.domain === 'string' || rawHost.startsWith('.'))
  const isHostOnlyCookie = Boolean(normalizedDomain) && !isDomainCookie
  const normalizedPath = cookie.path && cookie.path.startsWith('/') ? cookie.path : '/'
  const protocol = cookie.secure ? 'https' : 'http'
  const url = `${protocol}://${normalizedDomain || 'localhost'}${normalizedPath}`
  const expirationDate = cookie.expires ?? cookie.expiresAt ?? undefined

  return {
    url,
    name: cookie.name,
    value: cookie.value,
    path: normalizedPath,
    secure: cookie.secure ?? false,
    httpOnly: cookie.httpOnly ?? false,
    ...(isDomainCookie && normalizedDomain ? { domain: normalizedDomain } : {}),
    ...(typeof expirationDate === 'number' ? { expirationDate } : {}),
    ...(cookie.sameSite ? { sameSite: toElectronSameSite(cookie.sameSite) } : {}),
    ...(isHostOnlyCookie ? { hostOnly: true } : {}),
  }
}

export class BrowserImportService {
  private readonly chromeUserDataDir: string
  private readonly safariPaths: { cookiesFile?: string; historyDb?: string }
  private readonly getCookiesImpl: GetCookiesImpl | null
  private readonly loadChromeHistoryImpl: (profilePath: string) => Promise<ImportedHistoryEntry[]>
  private readonly loadSafariHistoryImpl: () => Promise<ImportedHistoryEntry[]>
  private readonly loadChromeCookiesImpl: (profilePath: string) => Promise<ImportedBrowserCookie[]>
  private readonly loadSafariCookiesImpl: () => Promise<ImportedBrowserCookie[]>
  private readonly detectSafariAccessImpl: (mode: BrowserImportMode) => Promise<SafariAccessResult>
  private readonly statPathImpl: (path: string) => { isFile: () => boolean; isDirectory: () => boolean }

  constructor(private readonly deps: BrowserImportServiceDeps) {
    this.chromeUserDataDir = deps.chromeUserDataDir ?? CHROME_ROOT
    this.safariPaths = {
      cookiesFile: deps.safariPaths?.cookiesFile ?? SAFARI_COOKIE_CANDIDATES.find((candidate) => existsSync(candidate)),
      historyDb: deps.safariPaths?.historyDb ?? SAFARI_HISTORY_DB,
    }
    this.getCookiesImpl = deps.getCookiesImpl ?? null
    this.loadChromeHistoryImpl = deps.loadChromeHistoryImpl ?? ((profilePath) => this.loadChromeHistory(profilePath))
    this.loadSafariHistoryImpl = deps.loadSafariHistoryImpl ?? (() => this.loadSafariHistory())
    this.loadChromeCookiesImpl = deps.loadChromeCookiesImpl ?? ((profilePath) => this.loadChromeCookies(profilePath))
    this.loadSafariCookiesImpl = deps.loadSafariCookiesImpl ?? (() => this.loadSafariCookies())
    this.detectSafariAccessImpl = deps.detectSafariAccessImpl ?? ((mode) => this.detectSafariAccessFromFs(mode))
    this.statPathImpl = deps.statPathImpl ?? ((path) => statSync(path))
  }

  async listChromeProfiles(): Promise<ChromeProfileDescriptor[]> {
    if (!existsSync(this.chromeUserDataDir)) {
      return []
    }

    const metadata = this.readChromeProfileMetadata()
    const entries = readdirSync(this.chromeUserDataDir, { withFileTypes: true })
    const profiles = entries
      .filter((entry) => entry.isDirectory())
      .filter((entry) => entry.name === 'Default' || /^Profile \d+$/.test(entry.name))
      .map((entry) => ({
        key: entry.name,
        path: join(this.chromeUserDataDir, entry.name),
      }))
      .filter((entry) => this.hasChromeImportableData(entry.path))
      .map((entry) => ({
        name: metadata[entry.key] ?? entry.key,
        path: entry.path,
      }))

    return profiles.sort((left, right) => left.name.localeCompare(right.name))
  }

  async importChrome(profilePath: string, mode: BrowserImportMode = 'everything'): Promise<BrowserImportResult> {
    const browserProfile = basename(profilePath)
    let importedHistory = 0

    try {
      if (mode !== 'cookies') {
        const historyEntries = dedupeHistoryEntries(await this.loadChromeHistoryImpl(profilePath))
        importedHistory = this.importHistory(historyEntries)
      }

      let importedCookies = 0
      if (mode !== 'history') {
        const cookies = await this.loadChromeCookiesImpl(profilePath)
        importedCookies = await this.importCookies(cookies)
      }

      return { ok: true, importedCookies, importedHistory }
    } catch (error) {
      if (error instanceof BrowserImportServiceError) {
        const code = error.code === 'COOKIE_WRITE_FAILED' ? 'CHROME_COOKIE_IMPORT_FAILED' : error.code
        return {
          ok: false,
          code,
          importedCookies: 0,
          importedHistory,
          ...(error.retryable ? { retryable: true } : {}),
          message: error.message,
        }
      }

      return {
        ok: false,
        code: 'CHROME_IMPORT_FAILED',
        importedCookies: 0,
        importedHistory,
        message: error instanceof Error ? error.message : String(error),
      }
    }
  }

  async importSafari(mode: BrowserImportMode = 'everything'): Promise<BrowserImportResult> {
    const safariAccess = await this.detectSafariAccessImpl(mode)
    if (!safariAccess.ok) {
      return {
        ok: false,
        code: safariAccess.code,
        importedCookies: 0,
        importedHistory: 0,
        message: safariAccess.message,
      }
    }

    let importedHistory = 0

    try {
      if (mode !== 'cookies') {
        const historyEntries = dedupeHistoryEntries(await this.loadSafariHistoryImpl())
        importedHistory = this.importHistory(historyEntries)
      }

      let importedCookies = 0
      if (mode !== 'history') {
        const cookies = await this.loadSafariCookiesImpl()
        importedCookies = await this.importCookies(cookies)
      }

      return { ok: true, importedCookies, importedHistory }
    } catch (error) {
      if (error instanceof BrowserImportServiceError) {
        const code = error.code === 'COOKIE_WRITE_FAILED' ? 'SAFARI_COOKIE_IMPORT_FAILED' : error.code
        return {
          ok: false,
          code,
          importedCookies: 0,
          importedHistory,
          ...(error.retryable ? { retryable: true } : {}),
          message: error.message,
        }
      }

      return {
        ok: false,
        code: 'SAFARI_IMPORT_FAILED',
        importedCookies: 0,
        importedHistory,
        message: error instanceof Error ? error.message : String(error),
      }
    }
  }

  async detectSafariAccess(mode: BrowserImportMode = 'everything'): Promise<SafariAccessResult> {
    return this.detectSafariAccessImpl(mode)
  }

  private readChromeProfileMetadata(): Record<string, string> {
    const localStatePath = join(this.chromeUserDataDir, 'Local State')
    if (!existsSync(localStatePath)) {
      return {}
    }

    try {
      const parsed = JSON.parse(readFileSync(localStatePath, 'utf8')) as {
        profile?: { info_cache?: Record<string, { name?: string }> }
      }
      const infoCache = parsed.profile?.info_cache ?? {}
      return Object.fromEntries(
        Object.entries(infoCache)
          .filter(([, value]) => typeof value?.name === 'string' && value.name.length > 0)
          .map(([key, value]) => [key, value.name as string]),
      )
    } catch {
      return {}
    }
  }

  private hasChromeImportableData(profilePath: string): boolean {
    return existsSync(join(profilePath, 'History')) ||
      existsSync(join(profilePath, 'Network', 'Cookies')) ||
      existsSync(join(profilePath, 'Cookies'))
  }

  private async loadChromeCookies(profilePath: string): Promise<ImportedBrowserCookie[]> {
    if (!this.getCookiesImpl) {
      return loadChromeCookiesFromProfileSnapshot(profilePath)
    }

    try {
      const result = await this.getCookiesImpl({
        browsers: ['chrome'],
        chromeProfile: profilePath,
        chromiumBrowser: 'chrome',
        includeExpired: false,
      } as GetCookiesOptions)

      const keychainWarning = result.warnings.find((warning) => /keychain/i.test(warning))
      if (keychainWarning) {
        throw new BrowserImportServiceError('CHROME_KEYCHAIN_ACCESS_REQUIRED', keychainWarning, true)
      }

      const providerWarning = result.warnings[0]
      if (providerWarning) {
        throw new BrowserImportServiceError('CHROME_COOKIE_IMPORT_FAILED', providerWarning)
      }

      return result.cookies
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (/keychain/i.test(message)) {
        throw new BrowserImportServiceError('CHROME_KEYCHAIN_ACCESS_REQUIRED', message, true)
      }

      throw new BrowserImportServiceError('CHROME_COOKIE_IMPORT_FAILED', message)
    }
  }

  private async loadSafariCookies(): Promise<ImportedBrowserCookie[]> {
    if (!this.getCookiesImpl) {
      return loadSafariCookiesFromSnapshot(this.safariPaths.cookiesFile)
    }

    const cookiesFile = this.safariPaths.cookiesFile
    if (!cookiesFile || !existsSync(cookiesFile)) {
      return []
    }

    const snapshot = copyFileToTemp(cookiesFile)

    try {
      const result = await this.getCookiesImpl({
        browsers: ['safari'],
        safariCookiesFile: snapshot.filePath,
        includeExpired: false,
      } as GetCookiesOptions)

      const providerWarning = result.warnings[0]
      if (providerWarning) {
        throw new BrowserImportServiceError('SAFARI_COOKIE_IMPORT_FAILED', providerWarning)
      }

      return result.cookies
    } catch (error) {
      throw new BrowserImportServiceError(
        'SAFARI_COOKIE_IMPORT_FAILED',
        error instanceof Error ? error.message : String(error),
      )
    } finally {
      snapshot.cleanup()
    }
  }

  private async loadChromeHistory(profilePath: string): Promise<ImportedHistoryEntry[]> {
    const historyDbPath = join(profilePath, 'History')
    if (!existsSync(historyDbPath)) {
      return []
    }

    const rows = await this.queryHistoryDb(historyDbPath, `
      SELECT urls.url AS url, urls.title AS title, visits.visit_time AS visited_at
      FROM visits
      INNER JOIN urls ON urls.id = visits.url
      ORDER BY visits.visit_time DESC
    `)

    const browserProfile = basename(profilePath)
    const entries: ImportedHistoryEntry[] = []

    for (const row of rows) {
      const url = asString(row.url)
      const visitedAt = chromeTimeToUnixMs(row.visited_at)
      if (!url || !Number.isFinite(visitedAt)) {
        continue
      }

      entries.push({
        url,
        title: asString(row.title) ?? url,
        visitedAt,
        source: CHROME_HISTORY_SOURCE,
        browserProfile,
      })
    }

    return entries
  }

  private async loadSafariHistory(): Promise<ImportedHistoryEntry[]> {
    const historyDbPath = this.safariPaths.historyDb
    if (!historyDbPath || !existsSync(historyDbPath)) {
      return []
    }

    const rows = await this.queryHistoryDb(historyDbPath, `
      SELECT history_items.url AS url, history_visits.title AS title, history_visits.visit_time AS visited_at
      FROM history_visits
      INNER JOIN history_items ON history_items.id = history_visits.history_item
      ORDER BY history_visits.visit_time DESC
    `)

    const entries: ImportedHistoryEntry[] = []

    for (const row of rows) {
      const url = asString(row.url)
      const visitedAt = safariTimeToUnixMs(row.visited_at)
      if (!url || !Number.isFinite(visitedAt)) {
        continue
      }

      entries.push({
        url,
        title: asString(row.title) ?? url,
        visitedAt,
        source: SAFARI_HISTORY_SOURCE,
      })
    }

    return entries
  }

  private async queryHistoryDb(dbPath: string, sql: string): Promise<Array<Record<string, unknown>>> {
    const snapshot = copyDatabaseToTemp(dbPath)

    try {
      const db = await openReadonlyDatabase(snapshot.dbPath)
      try {
        return db.query(sql)
      } finally {
        db.close()
      }
    } finally {
      snapshot.cleanup()
    }
  }

  private async importCookies(cookies: ImportedBrowserCookie[]): Promise<number> {
    const electronCookies = cookies.map((cookie) => toElectronCookieInput(cookie) as ImportedCookieInput)
    const session = this.deps.sessionManager.getSession() as CookieWriter
    const appliedCookies: Electron.CookiesSetDetails[] = []
    const previousCookies = await snapshotExistingCookies(session, electronCookies)

    try {
      for (const cookie of electronCookies) {
        await session.cookies.set(cookie)
        appliedCookies.push(cookie)
      }

      if (electronCookies.length > 0) {
        await session.cookies.flushStore()
      }

      return electronCookies.length
    } catch (error) {
      await rollbackImportedCookies(session, appliedCookies, previousCookies)
      throw new BrowserImportServiceError(
        'COOKIE_WRITE_FAILED',
        error instanceof Error ? error.message : String(error),
      )
    }
  }

  private importHistory(entries: ImportedHistoryEntry[]): number {
    if (entries.length === 0) {
      return 0
    }

    this.deps.historyService.importEntries(entries)
    return entries.length
  }

  private async detectSafariAccessFromFs(mode: BrowserImportMode): Promise<SafariAccessResult> {
    const protectedPaths = [
      ...(mode !== 'history' ? [this.safariPaths.cookiesFile] : []),
      ...(mode !== 'cookies' ? [this.safariPaths.historyDb] : []),
    ].filter((value): value is string => Boolean(value))

    for (const path of protectedPaths) {
      try {
        this.statPathImpl(path)
      } catch (error) {
        const code = typeof error === 'object' && error !== null && 'code' in error ? (error as { code?: string }).code : undefined
        if (code === 'EPERM' || code === 'EACCES') {
          return {
            ok: false,
            code: 'SAFARI_FULL_DISK_ACCESS_REQUIRED',
            message: 'Grant Full Disk Access to DevSpace to import Safari data.',
          }
        }
      }
    }

    return { ok: true }
  }
}

function copyDatabaseToTemp(dbPath: string): { dbPath: string; cleanup: () => void } {
  const tempDir = mkdtempSync(join(tmpdir(), 'devspace-browser-import-'))
  const tempDbPath = join(tempDir, basename(dbPath))

  copyFileSync(dbPath, tempDbPath)
  copyOptionalSidecar(dbPath, tempDbPath, '-wal')
  copyOptionalSidecar(dbPath, tempDbPath, '-shm')

  return {
    dbPath: tempDbPath,
    cleanup: () => {
      rmSync(tempDir, { recursive: true, force: true })
    },
  }
}

function copyFileToTemp(filePath: string): { filePath: string; cleanup: () => void } {
  const tempDir = mkdtempSync(join(tmpdir(), 'devspace-browser-import-'))
  const tempFilePath = join(tempDir, basename(filePath))
  copyFileSync(filePath, tempFilePath)

  return {
    filePath: tempFilePath,
    cleanup: () => {
      rmSync(tempDir, { recursive: true, force: true })
    },
  }
}

function copyOptionalSidecar(sourceDbPath: string, tempDbPath: string, suffix: string): void {
  const sidecarPath = `${sourceDbPath}${suffix}`
  if (!existsSync(sidecarPath)) {
    return
  }

  try {
    copyFileSync(sidecarPath, `${tempDbPath}${suffix}`)
  } catch {
    // Best effort copy for WAL/SHM sidecars.
  }
}

function chromeTimeToUnixMs(value: unknown): number {
  const numeric = asNumber(value)
  if (numeric === null || numeric <= 0) {
    return 0
  }

  return Math.round(numeric / 1000 - 11_644_473_600_000)
}

function safariTimeToUnixMs(value: unknown): number {
  const numeric = asNumber(value)
  if (numeric === null) {
    return 0
  }

  return Math.round((numeric + 978_307_200) * 1000)
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value === 'bigint') {
    const result = Number(value)
    return Number.isFinite(result) ? result : null
  }

  if (typeof value === 'string') {
    const result = Number(value)
    return Number.isFinite(result) ? result : null
  }

  return null
}

type ReadonlyDatabase = {
  query: (sql: string) => Array<Record<string, unknown>>
  close: () => void
}

async function openReadonlyDatabase(dbPath: string): Promise<ReadonlyDatabase> {
  if ('Bun' in globalThis) {
    const bunSqlite = await importBunSqlite()
    const db = new bunSqlite.Database(dbPath, { readonly: true })
    return {
      query: (sql) => db.query(sql).all() as Array<Record<string, unknown>>,
      close: () => db.close(),
    }
  }

  const nodeSqlite = await import('node:sqlite')
  const db = new nodeSqlite.DatabaseSync(dbPath, { readOnly: true, readBigInts: true })
  return {
    query: (sql) => db.prepare(sql).all() as Array<Record<string, unknown>>,
    close: () => db.close(),
  }
}

async function importBunSqlite(): Promise<{
  Database: new (path: string, options: { readonly: boolean }) => {
    query: (sql: string) => { all: () => Array<Record<string, unknown>> }
    close: () => void
  }
}> {
  return (0, eval)("import('bun:sqlite')") as Promise<{
    Database: new (path: string, options: { readonly: boolean }) => {
      query: (sql: string) => { all: () => Array<Record<string, unknown>> }
      close: () => void
    }
  }>
}

async function snapshotExistingCookies(
  session: CookieWriter,
  cookies: ImportedCookieInput[],
): Promise<Map<string, ImportedCookieSnapshot>> {
  const getCookies = session.cookies.get
  if (typeof getCookies !== 'function') {
    return new Map()
  }

  const snapshots = new Map<string, ImportedCookieSnapshot>()

  for (const cookie of cookies) {
    const key = toCookieSnapshotKey(cookie)
    if (snapshots.has(key) || !cookie.url || !cookie.name) {
      continue
    }

    try {
      const existing = await getCookies({ url: cookie.url, name: cookie.name })
      const expectedHostOnly = !('domain' in cookie)
      const matching = existing.find((candidate) => {
        const samePath = (candidate.path ?? '/') === (cookie.path ?? '/')
        const sameHostOnly = Boolean(candidate.hostOnly) === expectedHostOnly
        const candidateSnapshot = fromElectronCookie(candidate)
        const sameUrl = candidateSnapshot.url === cookie.url
        return samePath && sameHostOnly && sameUrl
      })
      if (matching) {
        snapshots.set(key, fromElectronCookie(matching))
      }
    } catch {
      // Best effort snapshot; rollback still removes imported cookies when lookup fails.
    }
  }

  return snapshots
}

async function rollbackImportedCookies(
  session: CookieWriter,
  cookies: ImportedCookieInput[],
  previousCookies: Map<string, ImportedCookieSnapshot>,
): Promise<void> {
  const removeCookie = session.cookies.remove
  const removedFamilies = new Set<string>()

  for (const cookie of cookies.reverse()) {
    if (!cookie.url || !cookie.name) {
      continue
    }

    const familyKey = `${cookie.name}|${cookie.url}`
    if (typeof removeCookie === 'function' && !removedFamilies.has(familyKey)) {
      removedFamilies.add(familyKey)
      try {
        await removeCookie(cookie.url, cookie.name)
      } catch {
        // Best effort rollback; preserve the original write failure.
      }
    }

    const previous = previousCookies.get(toCookieSnapshotKey(cookie))
    if (!previous) {
      continue
    }

    try {
      await session.cookies.set(previous)
    } catch {
      // Best effort rollback; preserve the original write failure.
    }
  }

  if (cookies.length > 0) {
    try {
      await session.cookies.flushStore()
    } catch {
      // Best effort rollback; preserve the original write failure.
    }
  }
}

function toCookieSnapshotKey(cookie: Pick<Electron.CookiesSetDetails, 'url' | 'name' | 'path'> & { hostOnly?: boolean }): string {
  return `${cookie.name}|${cookie.url ?? ''}|${cookie.path ?? '/'}|${cookie.hostOnly ? 'host' : 'domain'}`
}

function fromElectronCookie(cookie: Electron.Cookie): ImportedCookieSnapshot {
  const normalizedDomain = (cookie.domain ?? '').replace(/^\./, '')
  const protocol = cookie.secure ? 'https' : 'http'
  const path = cookie.path && cookie.path.startsWith('/') ? cookie.path : '/'

  return {
    url: `${protocol}://${normalizedDomain || 'localhost'}${path}`,
    name: cookie.name,
    value: cookie.value,
    path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    ...(!cookie.hostOnly && normalizedDomain ? { domain: normalizedDomain } : {}),
    ...(!cookie.session && typeof cookie.expirationDate === 'number' ? { expirationDate: cookie.expirationDate } : {}),
    ...(cookie.sameSite ? { sameSite: cookie.sameSite as Electron.CookiesSetDetails['sameSite'] } : {}),
    ...(cookie.hostOnly ? { hostOnly: true } : {}),
  }
}

async function loadChromeCookiesFromProfileSnapshot(profilePath: string): Promise<ImportedBrowserCookie[]> {
  const dbPath = resolveChromeCookiesDbPath(profilePath)
  if (!dbPath) {
    return []
  }

  const snapshot = copyDatabaseToTemp(dbPath)

  try {
    const key = readChromeSafeStorageKey(dbPath)
    const metaVersion = await readChromiumMetaVersion(snapshot.dbPath)
    const rows = await queryCookieDb(snapshot.dbPath)
    return collectChromiumCookies(rows, {
      browser: 'chrome',
      profile: basename(profilePath),
      includeExpired: false,
      decrypt: (encryptedValue) => decryptChromiumCookieValue(encryptedValue, key, metaVersion >= 24),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/keychain/i.test(message)) {
      throw new BrowserImportServiceError('CHROME_KEYCHAIN_ACCESS_REQUIRED', message, true)
    }

    throw new BrowserImportServiceError('CHROME_COOKIE_IMPORT_FAILED', message)
  } finally {
    snapshot.cleanup()
  }
}

async function loadSafariCookiesFromSnapshot(cookiesFile: string | undefined): Promise<ImportedBrowserCookie[]> {
  if (!cookiesFile || !existsSync(cookiesFile)) {
    return []
  }

  const snapshot = copyFileToTemp(cookiesFile)

  try {
    const parsed = decodeSafariBinaryCookies(readFileSync(snapshot.filePath))
    return parsed.filter((cookie) => !cookie.expires || cookie.expires >= Math.floor(Date.now() / 1000))
  } catch (error) {
    throw new BrowserImportServiceError(
      'SAFARI_COOKIE_IMPORT_FAILED',
      error instanceof Error ? error.message : String(error),
    )
  } finally {
    snapshot.cleanup()
  }
}

function resolveChromeCookiesDbPath(profilePath: string): string | null {
  const candidates = [join(profilePath, 'Network', 'Cookies'), join(profilePath, 'Cookies')]
  return candidates.find((candidate) => existsSync(candidate)) ?? null
}

function readChromeSafeStorageKey(dbPath: string): Buffer {
  const browser = resolveChromiumBrowserFromDbPath(dbPath)
  const keychain = CHROMIUM_KEYCHAINS[browser]
  const args = ['find-generic-password', '-w', '-a', keychain.account, '-s', keychain.service]

  try {
    const password = execFileSync('security', args, { encoding: 'utf8', timeout: 3000 }).trim()
    if (!password) {
      throw new Error(`Failed to read macOS Keychain (${keychain.label}): empty password.`)
    }

    return pbkdf2Sync(password, 'saltysalt', 1003, 16, 'sha1')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to read macOS Keychain (${keychain.label}): ${message}`)
  }
}

function resolveChromiumBrowserFromDbPath(dbPath: string): ChromiumBrowserTarget {
  const lower = dbPath.toLowerCase()
  for (const browser of Object.keys(CHROMIUM_KEYCHAINS) as ChromiumBrowserTarget[]) {
    const root = CHROMIUM_KEYCHAINS[browser].root.toLowerCase()
    if (lower.includes(root)) {
      return browser
    }
  }

  return 'chrome'
}

async function readChromiumMetaVersion(dbPath: string): Promise<number> {
  const db = await openReadonlyDatabase(dbPath)

  try {
    const rows = db.query(`SELECT value FROM meta WHERE key = 'version' LIMIT 1`)
    const value = rows[0]?.value
    return asNumber(value) ?? 0
  } catch {
    return 0
  } finally {
    db.close()
  }
}

async function queryCookieDb(dbPath: string): Promise<Array<Record<string, unknown>>> {
  const db = await openReadonlyDatabase(dbPath)

  try {
    return db.query(
      'SELECT name, value, host_key, path, expires_utc, samesite, encrypted_value, is_secure, is_httponly FROM cookies ORDER BY expires_utc DESC',
    )
  } finally {
    db.close()
  }
}

export function collectChromiumCookies(
  rows: Array<Record<string, unknown>>,
  options: {
    browser: 'chrome'
    profile: string
    includeExpired: boolean
    decrypt: (encryptedValue: Uint8Array) => string | null
  },
): ImportedBrowserCookie[] {
  const cookies: ImportedBrowserCookie[] = []
  const seen = new Set<string>()
  const now = Math.floor(Date.now() / 1000)

  for (const row of rows) {
    const name = asString(row.name)
    const hostKey = asString(row.host_key)
    if (!name || !hostKey) {
      continue
    }

    let value = typeof row.value === 'string' ? row.value : ''
    if (!value) {
      const encryptedValue = row.encrypted_value instanceof Uint8Array ? row.encrypted_value : null
      if (!encryptedValue) {
        continue
      }

      value = options.decrypt(encryptedValue) ?? ''
      if (!value) {
        continue
      }
    }

      const expires = normalizeExpirationSeconds(row.expires_utc)
    if (!options.includeExpired && expires && expires < now) {
      continue
    }

      const domain = hostKey.replace(/^\./, '')
      const hostOnly = !hostKey.startsWith('.')
      const path = asString(row.path) ?? '/'
      const key = `${name}|${domain}|${path}|${hostOnly ? 'host' : 'domain'}`
      if (seen.has(key)) {
        continue
      }

    seen.add(key)
    cookies.push({
      name,
        value,
        ...(domain ? { domain } : {}),
        path,
        ...(hostOnly ? { hostOnly: true } : {}),
        secure: isTruthyDbFlag(row.is_secure),
        httpOnly: isTruthyDbFlag(row.is_httponly),
      ...(expires ? { expires } : {}),
      ...(normalizeChromiumSameSite(row.samesite) ? { sameSite: normalizeChromiumSameSite(row.samesite) } : {}),
      source: {
        browser: options.browser,
        profile: options.profile,
      },
    })
  }

  return cookies
}

function decryptChromiumCookieValue(encryptedValue: Uint8Array, key: Buffer, stripHashPrefix: boolean): string | null {
  const buf = Buffer.from(encryptedValue)
  if (buf.length < 3) {
    return null
  }

  const prefix = buf.subarray(0, 3).toString('utf8')
  if (!/^v\d\d$/.test(prefix)) {
    return decodeUtf8CookieValue(buf, false)
  }

  const ciphertext = buf.subarray(3)
  if (!ciphertext.length) {
    return ''
  }

  try {
    const iv = Buffer.alloc(16, 0x20)
    const decipher = createDecipheriv('aes-128-cbc', key, iv)
    decipher.setAutoPadding(false)
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
    return decodeUtf8CookieValue(removePkcs7Padding(plaintext), stripHashPrefix)
  } catch {
    return null
  }
}

function decodeUtf8CookieValue(value: Uint8Array, stripHashPrefix: boolean): string | null {
  const bytes = stripHashPrefix && value.length >= 32 ? value.subarray(32) : value

  try {
    return stripLeadingControlChars(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    return null
  }
}

function removePkcs7Padding(value: Buffer): Buffer {
  if (!value.length) {
    return value
  }

  const padding = value[value.length - 1]
  if (!padding || padding > 16) {
    return value
  }

  return value.subarray(0, value.length - padding)
}

function stripLeadingControlChars(value: string): string {
  let index = 0
  while (index < value.length && value.charCodeAt(index) < 0x20) {
    index += 1
  }

  return value.slice(index)
}

function normalizeExpirationSeconds(value: unknown): number | undefined {
  const numeric = asNumber(value)
  if (numeric === null || numeric <= 0) {
    return undefined
  }

  if (numeric > 10_000_000_000_000) {
    return Math.round(numeric / 1_000_000 - 11_644_473_600)
  }

  if (numeric > 10_000_000_000) {
    return Math.round(numeric / 1000)
  }

  return Math.round(numeric)
}

function normalizeChromiumSameSite(value: unknown): SweetCookie['sameSite'] | undefined {
  const numeric = asNumber(value)
  if (numeric === 2) {
    return 'Strict'
  }

  if (numeric === 1) {
    return 'Lax'
  }

  if (numeric === 0) {
    return 'None'
  }

  if (typeof value === 'string') {
    const normalized = value.toLowerCase()
    if (normalized === 'strict') {
      return 'Strict'
    }
    if (normalized === 'lax') {
      return 'Lax'
    }
    if (normalized === 'none' || normalized === 'no_restriction') {
      return 'None'
    }
  }

  return undefined
}

function isTruthyDbFlag(value: unknown): boolean {
  return value === 1 || value === 1n || value === '1' || value === true
}

function decodeSafariBinaryCookies(buffer: Buffer): ImportedBrowserCookie[] {
  if (buffer.length < 8 || buffer.subarray(0, 4).toString('utf8') !== 'cook') {
    return []
  }

  const pageCount = buffer.readUInt32BE(4)
  let cursor = 8
  const pageSizes: number[] = []
  for (let index = 0; index < pageCount; index += 1) {
    pageSizes.push(buffer.readUInt32BE(cursor))
    cursor += 4
  }

  const cookies: ImportedBrowserCookie[] = []
  for (const pageSize of pageSizes) {
    const page = buffer.subarray(cursor, cursor + pageSize)
    cursor += pageSize
    cookies.push(...decodeSafariCookiePage(page))
  }

  return dedupeCookies(cookies)
}

export { decodeSafariBinaryCookies }

function decodeSafariCookiePage(page: Buffer): ImportedBrowserCookie[] {
  if (page.length < 16 || page.readUInt32BE(0) !== 0x00000100) {
    return []
  }

  const cookieCount = page.readUInt32LE(4)
  const offsets: number[] = []
  let cursor = 8
  for (let index = 0; index < cookieCount; index += 1) {
    offsets.push(page.readUInt32LE(cursor))
    cursor += 4
  }

  return offsets
    .map((offset) => decodeSafariCookie(page.subarray(offset)))
    .filter((cookie): cookie is ImportedBrowserCookie => Boolean(cookie))
}

function decodeSafariCookie(cookieBuffer: Buffer): ImportedBrowserCookie | null {
  if (cookieBuffer.length < 48) {
    return null
  }

  const size = cookieBuffer.readUInt32LE(0)
  if (size < 48 || size > cookieBuffer.length) {
    return null
  }

  const flagsValue = cookieBuffer.readUInt32LE(8)
  const rawUrl = readCString(cookieBuffer, cookieBuffer.readUInt32LE(16), size)
  const name = readCString(cookieBuffer, cookieBuffer.readUInt32LE(20), size)
  const cookiePath = readCString(cookieBuffer, cookieBuffer.readUInt32LE(24), size) ?? '/'
  const value = readCString(cookieBuffer, cookieBuffer.readUInt32LE(28), size) ?? ''
  if (!name) {
    return null
  }

  const rawHost = rawUrl ? safeHostnameFromUrl(rawUrl) : undefined
  const domain = rawHost?.replace(/^\./, '')
  const hostOnly = Boolean(domain) && !String(rawUrl).trim().startsWith('.')
  const expiration = readDoubleLE(cookieBuffer, 40)
  const expires = expiration && expiration > 0 ? Math.round(expiration + 978_307_200) : undefined

  return {
    name,
    value,
    path: cookiePath,
    secure: (flagsValue & 1) !== 0,
    httpOnly: (flagsValue & 4) !== 0,
    ...(domain ? (hostOnly ? { host: domain, hostOnly: true } : { domain }) : {}),
    ...(expires ? { expires } : {}),
    source: { browser: 'safari' },
  }
}

function readDoubleLE(buffer: Buffer, offset: number): number {
  if (offset + 8 > buffer.length) {
    return 0
  }

  return buffer.subarray(offset, offset + 8).readDoubleLE(0)
}

function readCString(buffer: Buffer, offset: number, end: number): string | null {
  if (offset <= 0 || offset >= end) {
    return null
  }

  let cursor = offset
  while (cursor < end && buffer[cursor] !== 0) {
    cursor += 1
  }

  if (cursor >= end) {
    return null
  }

  return buffer.toString('utf8', offset, cursor)
}

function safeHostnameFromUrl(raw: string): string | undefined {
  try {
    const url = raw.includes('://') ? raw : `https://${raw}`
    const parsed = new URL(url)
    return parsed.hostname.startsWith('.') ? parsed.hostname.slice(1) : parsed.hostname
  } catch {
    const cleaned = raw.trim()
    if (!cleaned) {
      return undefined
    }

    return cleaned.startsWith('.') ? cleaned.slice(1) : cleaned
  }
}

function dedupeCookies(cookies: ImportedBrowserCookie[]): ImportedBrowserCookie[] {
  const merged = new Map<string, ImportedBrowserCookie>()
  for (const cookie of cookies) {
    const variant = cookie.hostOnly ? 'host' : 'domain'
    const key = `${cookie.name}|${cookie.domain ?? cookie.host ?? ''}|${cookie.path ?? ''}|${variant}`
    if (!merged.has(key)) {
      merged.set(key, cookie)
    }
  }

  return Array.from(merged.values())
}

type ChromiumBrowserTarget = keyof typeof CHROMIUM_KEYCHAINS

const CHROMIUM_KEYCHAINS = {
  chrome: {
    root: 'Google/Chrome',
    account: 'Chrome',
    service: 'Chrome Safe Storage',
    label: 'Chrome Safe Storage',
  },
  brave: {
    root: 'BraveSoftware/Brave-Browser',
    account: 'Brave',
    service: 'Brave Safe Storage',
    label: 'Brave Safe Storage',
  },
  arc: {
    root: 'Arc/User Data',
    account: 'Arc',
    service: 'Arc Safe Storage',
    label: 'Arc Safe Storage',
  },
  chromium: {
    root: 'Chromium',
    account: 'Chromium',
    service: 'Chromium Safe Storage',
    label: 'Chromium Safe Storage',
  },
} as const

function toElectronSameSite(value: SweetCookie['sameSite']): ElectronCookieSameSite {
  if (value === 'Strict') {
    return 'strict'
  }

  if (value === 'Lax') {
    return 'lax'
  }

  return 'no_restriction'
}
