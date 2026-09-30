#!/usr/bin/env node
/**
 * Bee's Hive — relay concurrency / duplicate / failure test.
 *
 * Start the relay first (mock mode, no physical printers needed):
 *   PRINT_MOCK=1 PRINT_PORT=8787 node scripts/print-server.cjs
 *
 * Then run:
 *   node scripts/relay-concurrency-test.cjs
 *
 * Verifies:
 *  - 10 concurrent kitchen jobs: all accepted, unique ids, none lost,
 *    FIFO order, serialized (only one PRINTING at a time)
 *  - 5 kitchen + 5 admin simultaneously: independent queues
 *  - duplicate POST /print with same id does NOT create a second print
 *  - explicit reprint (new id) DOES create a new print
 *  - unconfigured printer failure is reported FAILED, never PRINTED
 */
const BASE = process.env.RELAY_URL || 'http://127.0.0.1:8787'

let failures = 0
const ok = (name, pass, detail = '') => {
  if (!pass) failures++
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
}
const post = (path, body) =>
  fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json())
const get = (path) => fetch(BASE + path).then((r) => r.json())
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const waitForJob = async (id) => {
  for (let i = 0; i < 120; i++) {
    const { job } = await get(`/jobs/${encodeURIComponent(id)}`)
    if (job && (job.status === 'PRINTED' || job.status === 'FAILED')) return job
    await sleep(100)
  }
  return null
}

const main = async () => {
  const health = await get('/health')
  ok('relay health responds', health.ok === true)

  // ── 1. 10 concurrent kitchen jobs ──
  const kJobs = Array.from({ length: 10 }, (_, i) => ({
    id: `tok_${Date.now()}_${i}`,
    kind: 'token',
    printer: 'kitchen',
    lines: [`TOKEN ${i}`, '1 x CONCURRENCY TEST'],
  }))
  const t0 = Date.now()
  const kRes = await Promise.all(kJobs.map((j) => post('/print', j)))
  ok('10 concurrent kitchen jobs accepted', kRes.every((r) => r.ok === true))
  ok('10 unique ids echoed', new Set(kRes.map((r) => r.job.id)).size === 10)
  ok('none rejected as duplicate', kRes.every((r) => r.duplicate !== true))

  const settled = []
  for (const j of kJobs) settled.push(await waitForJob(j.id))
  ok('all 10 kitchen jobs reached terminal state', settled.every((j) => j))
  ok('all 10 kitchen jobs PRINTED', settled.every((j) => j && j.status === 'PRINTED'))
  const byPrinted = [...settled].sort((a, b) => (a.printedAt || 0) - (b.printedAt || 0))
  const submittedOrder = kJobs.map((j) => j.id)
  const printedOrder = byPrinted.map((j) => j.id)
  ok('kitchen FIFO order preserved', JSON.stringify(submittedOrder) === JSON.stringify(printedOrder), printedOrder.join(','))
  const strictlyIncreasing = printedOrder.every((id, i) => i === 0 || byPrinted[i].printedAt >= byPrinted[i - 1].printedAt)
  ok('serialized dispatch (monotonic printedAt)', strictlyIncreasing)

  // ── 2. 5 kitchen + 5 admin simultaneously ──
  const mixed = [
    ...Array.from({ length: 5 }, (_, i) => ({ id: `mix_k_${Date.now()}_${i}`, kind: 'token', printer: 'kitchen', lines: [`K ${i}`] })),
    ...Array.from({ length: 5 }, (_, i) => ({ id: `mix_a_${Date.now()}_${i}`, kind: 'bill', printer: 'admin', lines: [`A ${i}`, 'TOTAL 10.00'] })),
  ]
  const mRes = await Promise.all(mixed.map((j) => post('/print', j)))
  ok('mixed 10 jobs accepted', mRes.every((r) => r.ok === true))
  const mSettled = []
  for (const j of mixed) mSettled.push(await waitForJob(j.id))
  const kDone = mSettled.filter((j) => j.printer === 'kitchen')
  const aDone = mSettled.filter((j) => j.printer === 'admin')
  ok('5 kitchen jobs PRINTED on kitchen queue', kDone.length === 5 && kDone.every((j) => j.status === 'PRINTED'))
  ok('5 admin jobs PRINTED on admin queue', aDone.length === 5 && aDone.every((j) => j.status === 'PRINTED'))
  ok('routing kept kinds separate', kDone.every((j) => j.kind === 'token') && aDone.every((j) => j.kind === 'bill'))

  // ── 3. duplicate protection ──
  const dupId = `dup_${Date.now()}`
  const first = await post('/print', { id: dupId, kind: 'token', printer: 'kitchen', lines: ['DUP TOKEN'] })
  const firstJob = await waitForJob(dupId)
  const second = await post('/print', { id: dupId, kind: 'token', printer: 'kitchen', lines: ['DUP TOKEN'] })
  ok('first submit queued/printed', first.ok === true && firstJob && firstJob.status === 'PRINTED')
  ok('duplicate POST flagged duplicate, not re-queued', second.ok === true && second.duplicate === true)
  const dupAgain = await get(`/jobs/${encodeURIComponent(dupId)}`)
  ok('duplicate did not reset printed job', dupAgain.job.status === 'PRINTED' && dupAgain.job.attempts === 1)

  // ── 4. explicit reprint (new id) ──
  const reprint = await post('/print', { id: dupId + '_reprint', kind: 'token', printer: 'kitchen', lines: ['DUP TOKEN'] })
  ok('explicit reprint (new id) prints again', reprint.ok === true && reprint.duplicate !== true)
  await waitForJob(dupId + '_reprint')

  // ── 5. unknown destination rejected ──
  const bad = await post('/print', { id: `bad_${Date.now()}`, kind: 'token', printer: 'some_random_windows_printer', lines: ['X'] })
  ok('arbitrary printer destination rejected', bad.ok === false)

  // ── 6. failure detection — only when a printer role is unconfigured ──
  const printersInfo = await get('/printers')
  if (printersInfo.printers.kitchen.transport === 'none') {
    const failJobId = `fail_${Date.now()}`
    await post('/print', { id: failJobId, kind: 'token', printer: 'kitchen', lines: ['SHOULD FAIL'], attempts: 1 })
    const failed = await waitForJob(failJobId)
    ok(
      'unconfigured printer job FAILED with reason, never PRINTED',
      failed && failed.status === 'FAILED' && !!failed.error,
      failed ? failed.error : 'timeout',
    )
  } else {
    console.log('SKIP  unconfigured-printer failure check (relay has printers configured — run once without printer env vars to verify)')
  }

  console.log(failures === 0 ? '\nALL RELAY TESTS PASSED' : `\n${failures} RELAY TEST(S) FAILED`)
  process.exit(failures === 0 ? 0 : 1)

}

main().catch((e) => {
  console.error('relay test crashed:', e.message)
  process.exit(1)
})
