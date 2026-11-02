import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeChatCode } from '../src/worker.js'

test('normalizes valid chat codes without changing their identity', () => {
  assert.equal(normalizeChatCode('abc-def'), 'ABC-DEF')
  assert.equal(normalizeChatCode(' ABC-DEF '), 'ABC-DEF')
})

test('rejects malformed or non-string chat codes', () => {
  for (const value of [
    null,
    undefined,
    123456,
    '',
    'ABCDEF',
    'ABC_DEF',
    'ABC-DE',
    'ABCD-EF',
    'ABC-DEF1',
    'ABC-DEF-',
    'ABC-0EF',
    'ABC-IOU',
    'ABC-DEF<script>',
  ]) {
    assert.equal(normalizeChatCode(value), null, String(value))
  }
})
