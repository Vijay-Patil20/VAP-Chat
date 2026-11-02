import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeChatCode } from '../src/utils/chatCode.js'

test('normalizes valid 12-character chat codes without changing identity', () => {
  assert.equal(
    normalizeChatCode('abcd-efgh-2345'),
    'ABCD-EFGH-2345'
  )
  assert.equal(
    normalizeChatCode(' ABCD-EFGH-2345 '),
    'ABCD-EFGH-2345'
  )
})

test('rejects old short codes, malformed codes, and non-string values', () => {
  for (const value of [
    null,
    undefined,
    123456,
    '',
    'ABC-DEF',
    'ABCDEFGHIJKL',
    'ABCD_EFGH_2345',
    'ABCD-EFGH-234',
    'ABCDE-FGH-2345',
    'ABCD-EFGH-23456',
    'ABCD-EFGH-0I45',
    'ABCD-EFGH-IOU5',
    'ABCD-EFGH-2345<script>',
  ]) {
    assert.equal(normalizeChatCode(value), null, String(value))
  }
})
