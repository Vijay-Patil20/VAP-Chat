import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CHAT_CODE_LENGTH,
  generateChatCode,
} from '../src/utils/chatCode.js'

test('generates a formatted 12-character code from cryptographic random values', () => {
  const values = Uint32Array.from({ length: 12 }, (_, index) => index)
  const code = generateChatCode(values)

  assert.equal(CHAT_CODE_LENGTH, 12)
  assert.equal(code, 'ABCD-EFGH-JKLM')
})

test('uses the complete uint32 range without modulo bias', () => {
  const values = [
    0x100000000, // Invalid out-of-range input is ignored.
    0xffffffff,
    0,
    1,
    2,
    3,
    4,
    5,
    6,
    7,
    8,
    9,
    10,
  ]

  assert.equal(generateChatCode(values), '9ABC-DEFG-HJKL')
})

test('returns null when there are not enough valid random values', () => {
  assert.equal(generateChatCode([0, 1, 2]), null)
  assert.equal(generateChatCode(null), null)
})
