import assert from 'node:assert/strict'
import test from 'node:test'
import { getTrafficLightPosition } from '../window-chrome'

test('uses the original lower traffic lights position when the sidebar is expanded', () => {
  assert.deepEqual(getTrafficLightPosition(true), { x: 16, y: 18 })
})

test('uses a higher traffic lights position when the sidebar is collapsed', () => {
  assert.deepEqual(getTrafficLightPosition(false), { x: 16, y: 6 })
})
