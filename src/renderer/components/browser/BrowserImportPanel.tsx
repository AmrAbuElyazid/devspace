import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, ExternalLink, LoaderCircle } from 'lucide-react'
import type { BrowserImportMode, BrowserImportResult, ChromeProfileDescriptor } from '../../../shared/browser'
import { Button } from '../ui/button'

type BrowserSource = 'chrome' | 'safari'

type ImportState =
  | { status: 'idle' }
  | { status: 'loading'; browser: BrowserSource; mode: BrowserImportMode }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string; code?: string }

const SAFARI_SETTINGS_URL = 'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles'

const browserOptions: Array<{ label: string; value: BrowserSource }> = [
  { label: 'Chrome', value: 'chrome' },
  { label: 'Safari', value: 'safari' },
]

const importModeOptions: Array<{ label: string; value: BrowserImportMode }> = [
  { label: 'Cookies + Session', value: 'cookies' },
  { label: 'History', value: 'history' },
  { label: 'Everything', value: 'everything' },
]

export default function BrowserImportPanel(): JSX.Element {
  const [browser, setBrowser] = useState<BrowserSource>('chrome')
  const [chromeProfiles, setChromeProfiles] = useState<ChromeProfileDescriptor[]>([])
  const [profilesStatus, setProfilesStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [profilesMessage, setProfilesMessage] = useState<string | null>(null)
  const [selectedChromeProfilePath, setSelectedChromeProfilePath] = useState('')
  const [importState, setImportState] = useState<ImportState>({ status: 'idle' })

  useEffect(() => {
    let cancelled = false

    if (browser !== 'chrome') {
      return () => {
        cancelled = true
      }
    }

    setProfilesStatus('loading')
    setProfilesMessage(null)

    void window.api.browser.listChromeProfiles()
      .then((profiles) => {
        if (cancelled) return
        setChromeProfiles(profiles)
        setSelectedChromeProfilePath((current) => {
          if (current && profiles.some((profile) => profile.path === current)) {
            return current
          }
          return profiles[0]?.path ?? ''
        })
        setProfilesStatus('ready')
      })
      .catch((error) => {
        if (cancelled) return
        setChromeProfiles([])
        setSelectedChromeProfilePath('')
        setProfilesStatus('error')
        setProfilesMessage(error instanceof Error ? error.message : 'Failed to load Chrome profiles.')
      })

    return () => {
      cancelled = true
    }
  }, [browser])

  const isImporting = importState.status === 'loading'
  const hasChromeProfile = selectedChromeProfilePath.length > 0
  const importDisabled = isImporting || (browser === 'chrome' && !hasChromeProfile)
  const selectedChromeProfileName = useMemo(
    () => chromeProfiles.find((profile) => profile.path === selectedChromeProfilePath)?.name,
    [chromeProfiles, selectedChromeProfilePath],
  )

  async function handleImport(mode: BrowserImportMode): Promise<void> {
    if (importDisabled) {
      return
    }

    setImportState({ status: 'loading', browser, mode })

    try {
      let result: BrowserImportResult

      if (browser === 'chrome') {
        result = await window.api.browser.importChrome(selectedChromeProfilePath, mode)
      } else {
        const access = await window.api.browser.detectSafariAccess(mode)
        if (!access.ok) {
          setImportState({ status: 'error', code: access.code, message: access.message })
          return
        }
        result = await window.api.browser.importSafari(mode)
      }

      if (result.ok) {
        setImportState({ status: 'success', message: buildSuccessMessage(browser, mode, result, selectedChromeProfileName) })
        return
      }

      setImportState({
        status: 'error',
        code: result.code,
        message: result.message ?? buildErrorMessage(browser, mode, result),
      })
    } catch (error) {
      setImportState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Browser import failed.',
      })
    }
  }

  return (
    <div className="browser-import-panel">
      <div className="browser-import-card">
        <div className="browser-import-card-header">
          <div>
            <h3 className="browser-import-card-title">Browser</h3>
            <p className="browser-import-card-copy">Import existing browsing data into the in-app browser session.</p>
          </div>
        </div>

        <div className="browser-import-stack">
          <div className="browser-import-field">
            <span className="browser-import-label">Source browser</span>
            <div className="browser-import-segmented" role="tablist" aria-label="Source browser">
              {browserOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className="browser-import-segmented-option"
                  data-active={browser === option.value ? 'true' : 'false'}
                  onClick={() => setBrowser(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {browser === 'chrome' ? (
            <div className="browser-import-field">
              <span className="browser-import-label">Chrome profile</span>
              {chromeProfiles.length > 0 ? (
                <select
                  className="browser-import-select"
                  value={selectedChromeProfilePath}
                  onChange={(event) => setSelectedChromeProfilePath(event.target.value)}
                  disabled={profilesStatus === 'loading' || isImporting}
                >
                  {chromeProfiles.map((profile) => (
                    <option key={profile.path} value={profile.path}>{profile.name}</option>
                  ))}
                </select>
              ) : (
                <div className="browser-import-note">
                  {profilesStatus === 'loading'
                    ? 'Looking for Chrome profiles...'
                    : profilesStatus === 'error'
                      ? profilesMessage ?? 'Failed to load Chrome profiles.'
                      : 'No importable Chrome profiles were found on this machine.'}
                </div>
              )}
            </div>
          ) : (
            <div
              className="browser-import-note"
              data-variant={importState.status === 'error' && importState.code === 'SAFARI_FULL_DISK_ACCESS_REQUIRED' ? 'warning' : 'default'}
            >
              <div>
                Safari imports may require Full Disk Access before DevSpace can read Safari cookies or history.
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => window.api.shell.openExternal(SAFARI_SETTINGS_URL)}
              >
                <ExternalLink size={13} />
                Open Privacy Settings
              </Button>
            </div>
          )}

          <div className="browser-import-field">
            <span className="browser-import-label">Import</span>
            <div className="browser-import-actions">
              {importModeOptions.map((option) => {
                const isCurrentAction = importState.status === 'loading' && importState.browser === browser && importState.mode === option.value
                return (
                  <Button
                    key={option.value}
                    type="button"
                    variant={option.value === 'everything' ? 'default' : 'secondary'}
                    onClick={() => void handleImport(option.value)}
                    disabled={importDisabled}
                  >
                    {isCurrentAction ? <LoaderCircle size={14} className="animate-spin" /> : null}
                    {option.label}
                  </Button>
                )
              })}
            </div>
          </div>

          {importState.status !== 'idle' ? (
            <div className="browser-import-status" data-status={importState.status}>
              <span className="browser-import-status-icon">
                {importState.status === 'loading' ? <LoaderCircle size={15} className="animate-spin" /> : null}
                {importState.status === 'success' ? <CheckCircle2 size={15} /> : null}
                {importState.status === 'error' ? <AlertCircle size={15} /> : null}
              </span>
              <span>
                {importState.status === 'loading'
                  ? `Importing ${labelForMode(importState.mode).toLowerCase()} from ${browserLabel(importState.browser)}...`
                  : importState.message}
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function browserLabel(browser: BrowserSource): string {
  return browser === 'chrome' ? 'Chrome' : 'Safari'
}

function labelForMode(mode: BrowserImportMode): string {
  return importModeOptions.find((option) => option.value === mode)?.label ?? 'Everything'
}

function buildSuccessMessage(
  browser: BrowserSource,
  mode: BrowserImportMode,
  result: Extract<BrowserImportResult, { ok: true }>,
  selectedChromeProfileName?: string,
): string {
  const source = browser === 'chrome' && selectedChromeProfileName ? `Chrome (${selectedChromeProfileName})` : browserLabel(browser)
  const details: string[] = []

  if (mode !== 'history') {
    details.push(`${result.importedCookies} cookies`)
  }
  if (mode !== 'cookies') {
    details.push(`${result.importedHistory} history entries`)
  }

  return `Imported ${details.join(' and ')} from ${source}.`
}

function buildErrorMessage(
  browser: BrowserSource,
  mode: BrowserImportMode,
  result: Extract<BrowserImportResult, { ok: false }>,
): string {
  return `Failed to import ${labelForMode(mode).toLowerCase()} from ${browserLabel(browser)} (${result.code}).`
}
