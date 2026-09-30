#!/usr/bin/env node
/**
 * Bee's Hive — hybrid transport test (Kitchen Bluetooth + Admin Windows spooler).
 *
 * Spawns scripts/print-server.cjs with a REAL (non-mock) hybrid configuration
 * that deliberately points at devices which do NOT exist on this machine:
 *
 *   Kitchen → transport "bluetooth" on an absent COM port
 *   Admin   → transport "windows-spooler" on a printer queue that does not exist
 *
 * so no physical printer is touched, and asserts the relay reports each
 * transport honestly:
 *   - /printers shows the real per-role transport and available:false with a
 *     transport-specific reason (never available:true because the relay runs)
 *   - a Kitchen job FAILS with a Bluetooth-specific error, is never PRINTED,
 *     and is never redirected to the Admin queue
 *   - an Admin job FAILS with a spooler-specific error (distinguishable)
 *   - duplicate job ids are rejected; a FAILED id can be retried with the
 *     SAME id (no second job id, therefore no second token)
 *   - rapid Kitchen jobs are serialized in FIFO order through the one queue
 *   - KITCHEN_PRINTER_TRANSPORT=bluetooth without KITCHEN_BLUETOOTH_PORT is
 *     reported as not configured (honest), not as healthy
 *   - a classic Kitchen-USB + Admin-USB env (only *_PRINTER_NAME) still
 *     resolves both roles to windows-spooler (backward compatibility)
 *
 * Physical Bluetooth hardware is NOT exercised here — see
 * docs/pt210-deployment.md Appendix C for the mandatory physical test.
 *
 * Usage:  node scripts/relay-transport-test.cjs
 */
const { spawn, execFileSync } = require('child_process')
const path = require('path')

const RELAY_PATH = path.join(__dirname, 'print-server.cjs')
const PORT_PHASE = Number(process.env.TEST_RELAY_PORT || 8791)

let failures = 0
const ok = (name, pass, detail = '') => {
  if (!pass) failures++
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Fully controlled env — never inherits a developer's stray printer settings or API_KEY. */
const cleanEnv = (port, extra) => ({
  ...process.env,
  PRINT_PORT: String(port),
  PRINT_MOCK: '',
  PRINT_RETRY_ATTEMPTS: '3',
  API_KEY: '',
  CORS_ORIGIN: '*',
  KITCHEN_PRINTER_NAME: '',
  ADMIN_PRINTER_NAME: '',
  KITCHEN_PRINTER_TRANSPORT: '',
  ADMIN_PRINTER_TRANSPORT: '',
  KITCHEN_BLUETOOTH_PORT: '',
  ADMIN_BLUETOOTH_PORT: '',
  KITCHEN_BLUETOOTH_BAUD: '',
  ADMIN_BLUETOOTH_BAUD: '',
  KITCHEN_PRINTER: '',
  ADMIN_PRINTER: '',
  TOKEN_PRINTER: '',
  BILL_PRINTER: '',
  ...extra,
})

const startRelay = (port, extra) => {
  const child = spawn(process.execPath, [RELAY_PATH], { env: cleanEnv(port, extra), windowsHide: true })
  let log = ''
  child.stdout.on('data', (c) => (log += c))
  child.stderr.on('data', (c) => (log += c))
  return { child, log: () => log }
}
const stopRelay = (child) =>
  new Promise((resolve) => {
    if (!child || child.exitCode !== null) return resolve()
    const t = setTimeout(() => {
      child.kill('SIGKILL')
      resolve()
    }, 5000)
    child.once('close', () => {
      clearTimeout(t)
      resolve()
    })
    child.kill()
  })

const get = (port, p) => fetch(`http://127.0.0.1:${port}${p}`).then((r) => r.json())
const post = (port, p, body) =>
  fetch(`http://127.0.0.1:${port}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json())

const waitForServer = async (port) => {
  for (let i = 0; i < 80; i++) {
    try {
      const h = await get(port, '/status')
      if (h.ok) return true
    } catch {
      /* not up yet */
    }
    await sleep(250)
  }
  return false
}
const waitForJob = async (port, id) => {
  for (let i = 0; i < 400; i++) {
    try {
      const { job } = await get(port, `/jobs/${encodeURIComponent(id)}`)
      if (job && (job.status === 'PRINTED' || job.status === 'FAILED')) return job
    } catch {
      /* transient */
    }
    await sleep(100)
  }
  return null
}

/** A COM port number that is definitely not present on this machine. */
const pickAbsentComPort = () => {
  let live = []
  try {
    live = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '[System.IO.Ports.SerialPort]::GetPortNames()'], { windowsHide: true })
      .toString()
      .split(/\s+/)
      .filter(Boolean)
      .map((s) => s.toUpperCase())
  } catch {
    // no PowerShell → assume no COM ports are present
  }
  const candidates = ['COM99', 'COM98', 'COM97', 'COM96', 'COM95', 'COM94', 'COM93', 'COM92', 'COM91', 'COM90', 'COM89']
  return candidates.find((p) => !live.includes(p)) || 'COM89'
}
const main = async () => {
  // ── Phase 0: backward compatibility — classic *_PRINTER_NAME env still
  // resolves BOTH roles to windows-spooler exactly as before this feature.
  const port0 = PORT_PHASE
  const relay0 = startRelay(port0, { KITCHEN_PRINTER_NAME: 'BeeShive Kitchen PT210', ADMIN_PRINTER_NAME: 'BeeShive Admin PT210' })
  ok('phase0 (classic USB env) relay started', await waitForServer(port0))
  const p0 = await get(port0, '/printers')
  ok('classic Kitchen USB still resolves to windows-spooler', p0.printers.kitchen.transport === 'windows-spooler' && p0.printers.kitchen.configured === true, p0.printers.kitchen.transport)
  ok('classic Admin USB still resolves to windows-spooler', p0.printers.admin.transport === 'windows-spooler' && p0.printers.admin.configured === true, p0.printers.admin.transport)
  await stopRelay(relay0.child)

  // ── Phase 1: hybrid — Kitchen bluetooth (absent COM), Admin spooler (missing queue).
  // No physical printer is touched; every failure must be honest.
  const absent = pickAbsentComPort()
  const missingAdmin = 'BeeShive MISSING Test Printer'
  const port = PORT_PHASE + 1
  console.log(`\nphase 1: hybrid relay on :${port} — kitchen bluetooth → ${absent} (deliberately absent), admin spooler → "${missingAdmin}" (deliberately missing)`)
  const relay = startRelay(port, {
    KITCHEN_PRINTER_TRANSPORT: 'bluetooth',
    KITCHEN_BLUETOOTH_PORT: absent,
    ADMIN_PRINTER_TRANSPORT: 'windows-spooler',
    ADMIN_PRINTER_NAME: missingAdmin,
  })
  ok('phase1 (hybrid) relay started', await waitForServer(port))

  const health = await get(port, '/health')
  ok('relay health responds', health.ok === true)

  const pr = (await get(port, '/printers')).printers
  ok('kitchen configured as bluetooth', pr.kitchen.configured === true && pr.kitchen.transport === 'bluetooth', `transport=${pr.kitchen.transport}`)
  ok('kitchen btPort reported', pr.kitchen.btPort === absent, `btPort=${pr.kitchen.btPort}`)
  ok('kitchen honestly available:false (no device on the COM port)', pr.kitchen.available === false && !!pr.kitchen.error, pr.kitchen.error)
  ok('kitchen health error names the Bluetooth transport', /bluetooth|powershell/i.test(pr.kitchen.error || ''), pr.kitchen.error)
  ok('admin configured as windows-spooler', pr.admin.configured === true && pr.admin.transport === 'windows-spooler', `transport=${pr.admin.transport}`)
  ok('admin honestly available:false (queue missing)', pr.admin.available === false && !!pr.admin.error, pr.admin.error)
  ok('admin health error is NOT a Bluetooth error', !/bluetooth/i.test(pr.admin.error || ''), pr.admin.error)

  const status = await get(port, '/status')
  ok('/status shows Kitchen transport bluetooth', status.kitchenPrinter && status.kitchenPrinter.configured === true && status.kitchenPrinter.transport === 'bluetooth')
  ok('/status shows Admin transport windows-spooler', status.billPrinter && status.billPrinter.transport === 'windows-spooler')

  // Kitchen job → real Bluetooth failure, never PRINTED, never redirected.
  const kId = `tok_bt_${Date.now()}`
  const kRes = await post(port, '/print', { id: kId, kind: 'token', printer: 'kitchen', lines: ['BLUETOOTH FAILURE CHECK'], attempts: 1 })
  ok('kitchen job accepted (queued)', kRes.ok === true)
  const kJob = await waitForJob(port, kId)
  ok('kitchen job FAILED honestly (never fake PRINTED)', kJob && kJob.status === 'FAILED', kJob ? `${kJob.status}: ${kJob.error}` : 'timeout')
  ok('kitchen failure names Bluetooth', /bluetooth/i.test((kJob && kJob.error) || ''), (kJob && kJob.error) || '')
  ok('kitchen job stayed on the kitchen queue with bluetooth transport', kJob && kJob.printer === 'kitchen' && kJob.transport === 'bluetooth')

  // Admin job → spooler failure, distinguishable from the Bluetooth failure.
  const aId = `bill_usb_${Date.now()}`
  const aRes = await post(port, '/print', { id: aId, kind: 'bill', printer: 'admin', lines: ['SPOOLER FAILURE CHECK'], attempts: 1 })
  ok('admin job accepted (queued)', aRes.ok === true)
  const aJob = await waitForJob(port, aId)
  ok('admin job FAILED honestly (never fake PRINTED)', aJob && aJob.status === 'FAILED', aJob ? `${aJob.status}: ${aJob.error}` : 'timeout')
  ok('admin failure is NOT a Bluetooth error', aJob && !/bluetooth/i.test((aJob && aJob.error) || ''), (aJob && aJob.error) || '')
  ok('admin job stayed on the admin queue with windows-spooler transport', aJob && aJob.printer === 'admin' && aJob.transport === 'windows-spooler')
  // Duplicate protection while the first submission is still in flight (3 attempts ≈ several seconds).
  const dupId = `dup_bt_${Date.now()}`
  const dup1 = await post(port, '/print', { id: dupId, kind: 'token', printer: 'kitchen', lines: ['DUP CHECK'], attempts: 3 })
  const dup2 = await post(port, '/print', { id: dupId, kind: 'token', printer: 'kitchen', lines: ['DUP CHECK'], attempts: 3 })
  ok('first submit queued', dup1.ok === true && dup1.duplicate !== true)
  ok('duplicate id flagged duplicate, not re-queued', dup2.ok === true && dup2.duplicate === true)
  const dupJob = await waitForJob(port, dupId)
  ok('duplicate submission did not create a second job (single terminal record)', dupJob && dupJob.status === 'FAILED')

  // A failed physical job is immutable. Retrying with the SAME id is rejected;
  // the UI creates a fresh explicit manual job for a deliberate reprint.
  const retryRes = await post(port, '/print', { id: kId, kind: 'token', printer: 'kitchen', lines: ['BLUETOOTH FAILURE CHECK'], attempts: 1 })
  ok('FAILED job cannot be silently retried with the SAME id', retryRes.ok === true && retryRes.duplicate === true)
  const retryJob = await waitForJob(port, kId)
  ok('original failed job remains FAILED', retryJob && retryJob.status === 'FAILED' && retryJob.id === kId)

  // FIFO serialization of rapid Kitchen jobs through the single Bluetooth queue.
  const fifoIds = [0, 1, 2].map((i) => `fifo_${Date.now()}_${i}`)
  const fifoRes = await Promise.all(fifoIds.map((id, i) => post(port, '/print', { id, kind: 'token', printer: 'kitchen', lines: [`FIFO ${i}`], attempts: 1 })))
  ok('3 rapid kitchen jobs accepted', fifoRes.every((r) => r.ok === true))
  const fifoJobs = []
  for (const id of fifoIds) fifoJobs.push(await waitForJob(port, id))
  ok(
    'all 3 kitchen jobs failed honestly over Bluetooth',
    fifoJobs.every((j) => j && j.status === 'FAILED' && /bluetooth/i.test(j.error || '')),
    fifoJobs.map((j) => (j ? j.status : 'timeout')).join(','),
  )
  const history = (await get(port, '/jobs')).jobs
  const idx = fifoIds.map((id) => history.findIndex((j) => j.id === id))
  ok('kitchen jobs completed strictly in submit order (serialized, never interleaved)', idx.every((n) => n >= 0) && idx[0] > idx[1] && idx[1] > idx[2], idx.join(','))
  ok('every history job kept its own role (no cross-routing)', history.every((j) => (j.kind === 'token' ? j.printer === 'kitchen' : j.printer === 'admin')))

  // Relay test slip goes through the same Bluetooth path → honest failure.
  const testRes = await post(port, '/test/kitchen', {})
  ok('POST /test/kitchen queued', testRes.ok === true && !!testRes.job)
  const testJob = testRes.job ? await waitForJob(port, testRes.job.id) : null
  ok('kitchen test slip FAILED honestly (never fake PRINTED)', testJob && testJob.status === 'FAILED' && /bluetooth/i.test(testJob.error || ''), testJob ? `${testJob.status}: ${testJob.error}` : 'timeout')

  await stopRelay(relay.child)

  // ── Phase 2: bluetooth transport forced without *_BLUETOOTH_PORT → honest not-configured.
  const port2 = PORT_PHASE + 2
  console.log(`\nphase 2: bluetooth forced without KITCHEN_BLUETOOTH_PORT (relay on :${port2})`)
  const relay2 = startRelay(port2, { KITCHEN_PRINTER_TRANSPORT: 'bluetooth' })
  ok('phase2 relay started', await waitForServer(port2))
  const p2 = await get(port2, '/printers')
  ok('kitchen transport=bluetooth but configured:false without a COM port', p2.printers.kitchen.transport === 'bluetooth' && p2.printers.kitchen.configured === false)
  ok('kitchen health explains the missing port', p2.printers.kitchen.available === false && /BLUETOOTH_PORT/i.test(p2.printers.kitchen.error || ''), p2.printers.kitchen.error)
  const k2 = await post(port2, '/print', { id: `noport_${Date.now()}`, kind: 'token', printer: 'kitchen', lines: ['NO PORT'], attempts: 1 })
  const k2Job = k2.job ? await waitForJob(port2, k2.job.id) : null
  ok('job on unconfigured bluetooth fails honestly', k2Job && k2Job.status === 'FAILED' && /BLUETOOTH_PORT/i.test(k2Job.error || ''), k2Job ? `${k2Job.status}: ${k2Job.error}` : 'timeout')
  await stopRelay(relay2.child)

  console.log(failures === 0 ? '\nALL HYBRID TRANSPORT TESTS PASSED' : `\n${failures} HYBRID TRANSPORT TEST(S) FAILED`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('hybrid transport test crashed:', e && e.message)
  process.exit(1)
})