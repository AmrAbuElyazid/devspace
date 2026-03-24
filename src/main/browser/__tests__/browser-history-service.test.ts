import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { BrowserHistoryService } from '../browser-history-service'

test('dedupes imported history by source/profile/url/visitedAt', () => {
  const service = new BrowserHistoryService()
  service.importEntries([
    { id: '1', url: 'https://example.com', title: 'Example', visitedAt: 1, source: 'chrome-import', browserProfile: 'Default' },
    { id: '2', url: 'https://example.com', title: 'Example', visitedAt: 1, source: 'chrome-import', browserProfile: 'Default' },
  ])

  assert.equal(service.getEntries().length, 1)
})

test('persists visits and reloads stored history on startup', () => {
  const appDataPath = mkdtempSync(join(tmpdir(), 'devspace-history-'))

  try {
    const service = new BrowserHistoryService({ appDataPath })
    service.recordVisit({
      url: 'https://devspace.example.com',
      title: 'DevSpace',
      visitedAt: 123,
      source: 'devspace',
    })

    const storedJson = readFileSync(join(appDataPath, 'browser-history.json'), 'utf8')
    const storedEntries = JSON.parse(storedJson) as Array<{ url: string }>
    assert.equal(storedEntries.length, 1)
    assert.equal(storedEntries[0]?.url, 'https://devspace.example.com')

    const reloadedService = new BrowserHistoryService({ appDataPath })
    assert.equal(reloadedService.getEntries().length, 1)
    assert.equal(reloadedService.getEntries()[0]?.title, 'DevSpace')
  } finally {
    rmSync(appDataPath, { recursive: true, force: true })
  }
})

test('keeps last good history when storage is interrupted or corrupted on startup', () => {
  const appDataPath = mkdtempSync(join(tmpdir(), 'devspace-history-'))

  try {
    const service = new BrowserHistoryService({ appDataPath })
    service.recordVisit({
      url: 'https://devspace.example.com',
      title: 'DevSpace',
      visitedAt: 123,
      source: 'devspace',
    })

    writeFileSync(join(appDataPath, 'browser-history.json'), '{"broken":', 'utf8')

    const reloadedService = new BrowserHistoryService({ appDataPath })

    assert.equal(reloadedService.getEntries().length, 1)
    assert.equal(reloadedService.getEntries()[0]?.title, 'DevSpace')
  } finally {
    rmSync(appDataPath, { recursive: true, force: true })
  }
})

test('failed recovery attempt does not destroy the last good backup before a later retry', () => {
  const appDataPath = mkdtempSync(join(tmpdir(), 'devspace-history-'))

  try {
    const service = new BrowserHistoryService({ appDataPath })
    service.recordVisit({
      url: 'https://devspace.example.com',
      title: 'DevSpace',
      visitedAt: 123,
      source: 'devspace',
    })

    const backupPath = join(appDataPath, 'browser-history.json.bak')
    const primaryPath = join(appDataPath, 'browser-history.json')
    const tempPath = join(appDataPath, 'browser-history.json.tmp')
    const originalBackup = readFileSync(backupPath, 'utf8')

    writeFileSync(primaryPath, '{"broken":', 'utf8')
    mkdirSync(tempPath)

    assert.throws(() => new BrowserHistoryService({ appDataPath }))

    assert.equal(readFileSync(backupPath, 'utf8'), originalBackup)

    rmSync(tempPath, { recursive: true, force: true })
    const recoveredService = new BrowserHistoryService({ appDataPath })

    assert.equal(recoveredService.getEntries().length, 1)
    assert.equal(readFileSync(backupPath, 'utf8'), originalBackup)
    assert.equal(readFileSync(primaryPath, 'utf8'), originalBackup)
  } finally {
    rmSync(appDataPath, { recursive: true, force: true })
  }
})
