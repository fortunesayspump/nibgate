import assert from 'node:assert/strict'
import test from 'node:test'
import { generateIntakeBatch } from '../dr-nib/backend/src/llm/generate.js'

test('intake deadline cancels the underlying model request', async () => {
  const previous = process.env.OPENROUTER_API_KEY
  process.env.OPENROUTER_API_KEY = 'offline-test'
  const controller = new AbortController()
  let aborted = false
  try {
    const pending = generateIntakeBatch({
      topic: 'Compare two payment networks', count: 3, signal: controller.signal,
      fetchImpl: async (_url, { signal }) => new Promise((_, reject) => {
        signal.addEventListener('abort', () => { aborted = true; reject(signal.reason) }, { once: true })
      }),
    })
    controller.abort(new Error('Intake deadline reached'))
    const result = await pending
    assert.equal(aborted, true)
    assert.equal(result.source, 'fallback')
    assert.deepEqual(result.questions, [])
    assert.match(result.llmError, /deadline/)
  } finally {
    if (previous === undefined) delete process.env.OPENROUTER_API_KEY
    else process.env.OPENROUTER_API_KEY = previous
  }
})
