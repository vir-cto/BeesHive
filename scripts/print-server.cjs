// #!/usr/bin/env node
// /**
//  * Bee's Hive — Central Print Relay (Windows PT-210 USB production setup).
//  *
//  * Runs on the ONE Windows machine that owns both physical DIVYE PT-210
//  * printers (USB). All waiter phones/admin browsers POST jobs here over the
//  * local Wi-Fi — no waiter device ever talks to a printer directly, so 5+
//  * concurrent waiters cannot fight over a printer connection.
//  *
//  * Transports (auto-selected per printer):
//  *   - windows-spooler : KITCHEN_PRINTER_NAME / ADMIN_PRINTER_NAME set →
//  *                       raw ESC/POS bytes written straight into the Windows
//  *                       print spooler (winspool.Drv WritePrinter) for the
//  *                       named PT-210 USB queue. No temp files, no dialogs.
//  *   - tcp             : KITCHEN_PRINTER / ADMIN_PRINTER (host:port 9100)
//  *                       legacy raw-TCP printers still supported.
//  *   - bluetooth       : *_PRINTER_TRANSPORT=bluetooth + *_BLUETOOTH_PORT=COMx
//  *                       REAL Windows Bluetooth path for a PT-210 paired over
//  *                       the Serial Port Profile: Windows exposes the printer
//  *                       as a Bluetooth COM port (Device Manager → Ports
//  *                       (COM & LPT) → "Standard Serial over Bluetooth link").
//  *                       A PowerShell helper opens that COM port
//  *                       (System.IO.Ports.SerialPort) and writes the SAME raw
//  *                       ESC/POS bytes as the USB/spooler path. The relay
//  *                       process owns the single Bluetooth connection; waiter
//  *                       phones never pair with the printer. If Windows
//  *                       instead exposes the paired PT-210 as a normal printer
//  *                       queue, keep *_PRINTER_NAME — the existing
//  *                       windows-spooler transport is reused unchanged.
//  *   - mock            : PRINT_MOCK=1 — simulated printers for testing.
//  *
//  * Env vars:
//  *   PRINT_PORT=8787            relay HTTP port (legacy PORT still honoured)
//  *   BIND_ADDRESS=0.0.0.0       bind address (use LAN IP or 127.0.0.1 to restrict)
//  *   KITCHEN_PRINTER_NAME=...   exact Windows printer name for kitchen PT-210
//  *   ADMIN_PRINTER_NAME=...     exact Windows printer name for admin PT-210
//  *   KITCHEN_PRINTER=host:port  legacy TCP kitchen printer (unused if NAME set)
//  *   ADMIN_PRINTER=host:port    legacy TCP admin printer   (unused if NAME set)
//  *   KITCHEN_PRINTER_TRANSPORT  optional override: bluetooth|windows-spooler|tcp
//  *   ADMIN_PRINTER_TRANSPORT    optional override: bluetooth|windows-spooler|tcp
//  *   KITCHEN_BLUETOOTH_PORT     paired Bluetooth SPP COM port (e.g. COM5)
//  *   ADMIN_BLUETOOTH_PORT       paired Bluetooth SPP COM port (e.g. COM7)
//  *   *_BLUETOOTH_BAUD           optional serial baud (default 9600)
//  *   PRINT_RETRY_ATTEMPTS=1     retained for config compatibility; physical jobs are one-shot
//  *   API_KEY=secret             if set, POST /print requires X-Api-Key header
//  *   CORS_ORIGIN=*              allowed browser origin
//  *
//  * Endpoints: POST /print  GET /jobs  GET /jobs/:id  GET /status  GET /health
//  *            GET /printers  POST /test/kitchen  POST /test/admin  GET /
//  *
//  * CRITICAL: a 200 on POST /print only means "queued". A job becomes PRINTED
//  * only after the configured transport (windows-spooler / bluetooth / tcp)
//  * reports the physical write completed successfully. Failures surface as
//  * FAILED with a reason — there is no silent fallback to another printer,
//  * to browser printing, or to a mock.
//  */
// const http = require('http')
// const net = require('net')
// const { spawn } = require('child_process')

// const PORT = Number(process.env.PRINT_PORT || process.env.PORT || 9100)
// const BIND_ADDRESS = process.env.BIND_ADDRESS || '0.0.0.0'
// // A physical PT-210 job is deliberately one-shot. If the transport result is
// ambiguous, retrying the same bytes can print a second receipt. Operators can
// explicitly press PRINT again, which creates a new manual job.
// const MAX_ATTEMPTS = 1
// /** Post-write spool drain window in seconds (0 disables the drain check). */
// const DRAIN_SECONDS = Math.max(0, Math.min(Number(process.env.SPOOL_DRAIN_SECONDS ?? 20), 120))
// const API_KEY = process.env.API_KEY || ''
// const CORS_ORIGIN = process.env.CORS_ORIGIN || '*'

// const LEGACY = { token: process.env.TOKEN_PRINTER || process.env.KITCHEN_PRINTER || '', bill: process.env.BILL_PRINTER || process.env.ADMIN_PRINTER || '' }

// /** Logical destination → transport config. Clients may ONLY send 'kitchen'|'admin' (or legacy 'token'|'bill'). */
// const printers = {
//   kitchen: {
//     kind: 'token',
//     label: 'Kitchen',
//     transport: 'none',
//     printerName: '', // exact Windows queue name (windows-spooler)
//     tcpTarget: '', // host:port (tcp)
//     btPort: '', // paired Bluetooth SPP COM port (bluetooth), e.g. COM5
//     btBaud: 9600,
//   },
//   admin: {
//     kind: 'bill',
//     label: 'Admin',
//     transport: 'none',
//     printerName: '',
//     tcpTarget: '',
//     btPort: '',
//     btBaud: 9600,
//   },
// }
// const roleEnv = (role, key) => process.env[(role === 'kitchen' ? 'KITCHEN_' : 'ADMIN_') + key]
// /**
//  * Only a well-formed COM port name may ever reach the PowerShell helpers
//  * (also prevents any injection through the env file).
//  */
// const normalizeBtPort = (value) => {
//   const v = String(value || '').trim().toUpperCase()
//   return /^COM\d{1,3}$/.test(v) ? v : ''
// }
// const TRANSPORTS = new Set(['windows-spooler', 'tcp', 'bluetooth'])
// if (process.env.PRINT_MOCK === '1') {
//   printers.kitchen.transport = 'mock'
//   printers.admin.transport = 'mock'
// } else {
//   for (const role of ['kitchen', 'admin']) {
//     const nameEnv = roleEnv(role, 'PRINTER_NAME')
//     const tcpEnv = LEGACY[role === 'kitchen' ? 'token' : 'bill']
//     const rawBtPort = roleEnv(role, 'BLUETOOTH_PORT')
//     printers[role].btPort = normalizeBtPort(rawBtPort)
//     if (rawBtPort && !printers[role].btPort) {
//       console.warn(`[config] ${role.toUpperCase()}_BLUETOOTH_PORT "${rawBtPort}" is not a valid COM port (expected e.g. COM5) — Bluetooth transport will be reported as not configured`)
//     }
//     const baud = Number(roleEnv(role, 'BLUETOOTH_BAUD'))
//     if (Number.isFinite(baud) && baud >= 1200) printers[role].btBaud = Math.round(baud)
//     const forced = String(roleEnv(role, 'PRINTER_TRANSPORT') || '')
//       .trim()
//       .toLowerCase()
//     if (forced && !TRANSPORTS.has(forced)) {
//       console.warn(`[config] ignoring invalid ${role.toUpperCase()}_PRINTER_TRANSPORT="${forced}" (expected windows-spooler|tcp|bluetooth)`)
//     }
//     // Auto resolution keeps existing USB installs working unchanged:
//     //   NAME set → windows-spooler (original behaviour, wins),
//     //   else a paired COM port configured → bluetooth (new opt-in),
//     //   else legacy host:port TCP.
//     const transport = TRANSPORTS.has(forced)
//       ? forced
//       : nameEnv
//         ? 'windows-spooler'
//         : printers[role].btPort
//           ? 'bluetooth'
//           : tcpEnv
//             ? 'tcp'
//             : 'none'
//     printers[role].transport = transport
//     if (transport === 'windows-spooler') printers[role].printerName = nameEnv || ''
//     else if (transport === 'tcp') printers[role].tcpTarget = tcpEnv || ''
//     // bluetooth: btPort may be empty when *_PRINTER_TRANSPORT=bluetooth was
//     // forced without *_BLUETOOTH_PORT — reported honestly as NOT configured.
//   }
// }

// const escpos = (lines) => {
//   const ESC = 0x1b
//   const text = lines.join('\n') + '\n\n\n'
//   // init + text + feed 3 lines + partial cut
//   return Buffer.concat([
//     Buffer.from([ESC, 0x40]), // ESC @ init
//     Buffer.from(text, 'utf8'),
//     Buffer.from([ESC, 0x64, 3]), // ESC d 3 (feed)
//     Buffer.from([ESC, 0x56, 66, 0]), // ESC V 66 0 (partial cut)
//   ])
// }

// /* ------------------------------------------------------------------ *
//  * Transport: windows-spooler — raw ESC/POS via winspool.Drv.
//  * A PowerShell helper opens the named printer queue and WritePrinter's
//  * the bytes. Bytes arrive on stdin as JSON+base64 → no temp files.
//  * ------------------------------------------------------------------ */
// const PS_SPOOLER_SCRIPT = `
// $ErrorActionPreference = 'Stop'
// $raw = [Console]::In.ReadToEnd()
// $req = $raw | ConvertFrom-Json
// $bytes = [Convert]::FromBase64String($req.dataB64)
// function Out($o) { Write-Output ($o | ConvertTo-Json -Compress) }
// $printer = Get-Printer -Name $req.printer -ErrorAction SilentlyContinue
// if (-not $printer) { Out @{ok=$false; error=('printer not found: ' + $req.printer); code=2}; exit 2 }
// Add-Type -TypeDefinition @'
// using System;
// using System.Runtime.InteropServices;
// public class RawPt210 {
//   [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]
//   public struct DOCINFOA { [MarshalAs(UnmanagedType.LPStr)] public string pDocName; [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile; [MarshalAs(UnmanagedType.LPStr)] public string pDataType; }
//   [DllImport("winspool.Drv", EntryPoint="OpenPrinterA", SetLastError=true, CharSet=CharSet.Ansi)]
//   public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);
//   [DllImport("winspool.Drv", SetLastError=true)] public static extern bool ClosePrinter(IntPtr hPrinter);
//   [DllImport("winspool.Drv", EntryPoint="StartDocPrinterA", SetLastError=true, CharSet=CharSet.Ansi)]
//   public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);
//   [DllImport("winspool.Drv", SetLastError=true)] public static extern bool EndDocPrinter(IntPtr hPrinter);
//   [DllImport("winspool.Drv", SetLastError=true)] public static extern bool StartPagePrinter(IntPtr hPrinter);
//   [DllImport("winspool.Drv", SetLastError=true)] public static extern bool EndPagePrinter(IntPtr hPrinter);
//   [DllImport("winspool.Drv", SetLastError=true)] public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);
//   public static int Send(string printerName, byte[] data, string docName) {
//     IntPtr hPrinter;
//     if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) return 10;
//     try {
//       var di = new DOCINFOA();
//       di.pDocName = docName; di.pDataType = "RAW";
//       if (!StartDocPrinter(hPrinter, 1, di)) return 11;
//       if (!StartPagePrinter(hPrinter)) { EndDocPrinter(hPrinter); return 12; }
//       IntPtr pBytes = Marshal.AllocHGlobal(data.Length);
//       try {
//         Marshal.Copy(data, 0, pBytes, data.Length);
//         int written;
//         if (!WritePrinter(hPrinter, pBytes, data.Length, out written) || written != data.Length) { return 13; }
//       } finally { Marshal.FreeHGlobal(pBytes); }
//       if (!EndPagePrinter(hPrinter)) return 14;
//       if (!EndDocPrinter(hPrinter)) return 15;
//       return 0;
//     } finally { ClosePrinter(hPrinter); }
//   }
// }
// '@
// $code = [RawPt210]::Send($req.printer, $bytes, $req.docName)
// if ($code -ne 0) { Out @{ok=$false; error=('spooler write failed (code ' + $code + ')'); code=$code}; exit 3 }
// # Post-write drain check: prove the spool actually processed the job. If the
// # driver exposes print jobs, wait until ours leaves the queue (physically
// # printed) or report an error/offline/paper-out state instead of faking success.
// $drainSec = [int]$req.drainSec
// if ($drainSec -gt 0) {
//   $bad  = 2 -bor 32 -bor 64 -bor 512 -bor 1024   # Error, Offline, PaperOut, Blocked, UserIntervention
//   $done = 128 -bor 4096                          # Printed, Complete
//   $deadline = (Get-Date).AddSeconds($drainSec)
//   while ((Get-Date) -lt $deadline) {
//     Start-Sleep -Milliseconds 800
//     $job = Get-PrintJob -PrinterName $req.printer -ErrorAction SilentlyContinue | Where-Object { $_.DocumentName -eq $req.docName }
//     if (-not $job) { Out @{ok=$true; printer=$req.printer; drained=$true}; exit 0 }
//     if ([int]$job.JobStatus -band $done) { Out @{ok=$true; printer=$req.printer; drained=$true}; exit 0 }
//     if ([int]$job.JobStatus -band $bad) { Out @{ok=$false; error=('printer reports error state (spooler status ' + [int]$job.JobStatus + ' - offline/paper-out/disconnected)'); code=20}; exit 4 }
//   }
//   Out @{ok=$false; error=('print job still queued after ' + $drainSec + 's - printer may be disconnected or offline'); code=21}; exit 4
// }
// Out @{ok=$true; printer=$req.printer}
// `

// /** Send raw bytes to a named Windows printer via the spooler. Resolves when the spooler accepted the physical write; rejects with a human-readable reason. */
// const windowsSpoolerPrint = (printerName, buffer, docName) =>
//   new Promise((resolve, reject) => {
//     const ps = spawn(
//       'powershell.exe',
//       ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(PS_SPOOLER_SCRIPT, 'utf16le').toString('base64')],
//       { windowsHide: true },
//     )
//     let out = ''
//     let err = ''
//     const timer = setTimeout(() => {
//       ps.kill()
//       reject(new Error('spooler helper timeout (printer may be offline)'))
//     }, Math.max(60_000, (DRAIN_SECONDS + 20) * 1000))
//     ps.stdout.on('data', (c) => (out += c))
//     ps.stderr.on('data', (c) => (err += c))
//     ps.on('error', (e) => {
//       clearTimeout(timer)
//       reject(new Error('cannot start spooler helper: ' + e.message))
//     })
//     ps.on('close', (code) => {
//       clearTimeout(timer)
//       if (code === 0) return resolve()
//       // Prefer the structured JSON the helper prints on stdout; fall back to a
//       // decoded CLIXML stderr message, then to a plain exit-code meaning.
//       let detail = ''
//       try {
//         detail = JSON.parse(out.trim().split('\n').pop()).error || ''
//       } catch {
//         detail = String(err || '')
//           .replace(/#< CLIXML/g, '')
//           .replace(/<S S="Error">(.*?)<\/S>/g, (_, m) => '\n' + m)
//           .replace(/_x000D_|_x000A_/g, ' ')
//           .replace(/<[^>]+>/g, '')
//           .trim()
//           .split('\n')[0] || ''
//       }
//       const codeText = {
//         2: 'printer not found',
//         10: 'printer not found (OpenPrinter failed — wrong name or disconnected)',
//         11: 'spooler rejected the print job (printer offline or paused)',
//         12: 'spooler could not start the page (printer offline)',
//         13: 'spooler write failed (printer disconnected mid-print)',
//         14: 'spooler page end failed (printer disconnected)',
//         15: 'spooler doc end failed (printer disconnected)',
//         20: 'printer reports error state (offline/paper-out/disconnected)',
//         21: 'print job still queued — printer may be disconnected or offline',
//       }
//       reject(new Error(detail || codeText[code] || `spooler helper exited ${code}`))
//     })
//     ps.stdin.write(JSON.stringify({ printer: printerName, docName, dataB64: buffer.toString('base64'), drainSec: DRAIN_SECONDS }))
//     ps.stdin.end()
//   })

// /**
//  * Availability cache for /printers and /status — 10s TTL with in-flight
//  * dedup, so 5+ concurrent waiter/health requests spawn at most one probe.
//  * `available: true` is ONLY ever recorded from a successful probe of the
//  * actual device — never merely because the relay process is running.
//  */
// const printerAvailability = new Map() // key → { available, error, checkedAt }
// const pendingAvailability = new Map() // key → Promise
// const freshAvailability = (key, run) => {
//   const cached = printerAvailability.get(key)
//   if (cached && Date.now() - cached.checkedAt < 10_000) return Promise.resolve(cached)
//   const pending = pendingAvailability.get(key)
//   if (pending) return pending
//   const probe = run()
//     .catch((e) => ({ available: false, error: String((e && e.message) || e) }))
//     .then((result) => {
//       const entry = { ...result, checkedAt: Date.now() }
//       printerAvailability.set(key, entry)
//       pendingAvailability.delete(key)
//       return entry
//     })
//   pendingAvailability.set(key, probe)
//   return probe
// }

// const checkWindowsPrinter = (printerName) =>
//   freshAvailability(
//     `windows-spooler|${printerName}`,
//     () =>
//       new Promise((resolve) => {
//         const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
//           `$p = Get-Printer -Name '${printerName.replace(/'/g, "''")}' -ErrorAction SilentlyContinue; if ($p) { '{"ok":true}' } else { '{"ok":false,"error":"printer not found"}' }`],
//           { windowsHide: true })
//         let out = ''
//         let settled = false
//         const finish = (value) => {
//           if (settled) return
//           settled = true
//           clearTimeout(timer)
//           resolve(value)
//         }
//         const timer = setTimeout(() => {
//           ps.kill()
//           finish({ available: false, error: 'check timeout' })
//         }, 8000)
//         ps.stdout.on('data', (c) => (out += c))
//         ps.on('error', () => finish({ available: false, error: 'powershell unavailable' }))
//         ps.on('close', () => {
//           try {
//             const j = JSON.parse(out.trim().split('\n').pop())
//             finish(j.ok ? { available: true } : { available: false, error: j.error })
//           } catch {
//             finish({ available: false, error: 'printer check failed' })
//           }
//         })
//       }),
//   )

// /** Serialize every Bluetooth operation per COM port (a health probe can never collide with an active print). */
// const bluetoothLocks = new Map() // COM port → promise tail
// const withBluetoothLock = (port, fn) => {
//   const prev = bluetoothLocks.get(port) || Promise.resolve()
//   const run = prev.then(fn)
//   const tail = run.then(
//     () => undefined,
//     () => undefined,
//   )
//   bluetoothLocks.set(port, tail)
//   return run
// }

// const PS_BLUETOOTH_SCRIPT = `
// $ErrorActionPreference = 'Stop'
// $raw = [Console]::In.ReadToEnd()
// $req = $raw | ConvertFrom-Json
// $bytes = [Convert]::FromBase64String($req.dataB64)
// function Out($o) { Write-Output ($o | ConvertTo-Json -Compress) }
// if (-not $req.port) { Out @{ok=$false; error='Bluetooth COM port not configured (set *_BLUETOOTH_PORT to the paired PT-210 COM port)'; code=2}; exit 2 }
// $p = [string]$req.port
// $names = [System.IO.Ports.SerialPort]::GetPortNames()
// if ($names -notcontains $p) {
//   Out @{ok=$false; error=('Bluetooth printer not connected: port ' + $p + ' is not present. Pair the PT-210 (Windows Settings > Bluetooth & devices), power it on, and keep laptop Bluetooth enabled.'); code=3}
//   exit 3
// }
// $com = $null
// try { $com = Get-CimInstance Win32_PnPEntity -ErrorAction SilentlyContinue | Where-Object { $_.Name -like ('*(' + $p + ')*') } | Select-Object -First 1 } catch { $com = $null }
// if ($com -and $com.Status -ne 'OK') {
//   Out @{ok=$false; error=('Bluetooth device for ' + $p + ' reports status "' + [string]$com.Status + '" (printer powered off, out of range, or laptop Bluetooth disabled)'); code=6}
//   exit 6
// }
// $sp = $null
// $okWrite = $false
// $failMsg = ''
// try {
//   $sp = New-Object System.IO.Ports.SerialPort
//   $sp.PortName = $p
//   $sp.BaudRate = [int]$req.baud
//   $sp.Parity = 'None'
//   $sp.DataBits = 8
//   $sp.StopBits = 'One'
//   $sp.WriteTimeout = 8000
//   $sp.ReadTimeout = 1000
//   $sp.Open()
//   try { $sp.DiscardInBuffer() } catch {}
//   $sp.Write($bytes, 0, $bytes.Length)
//   $sp.BaseStream.Flush()
//   Start-Sleep -Milliseconds 400
//   $okWrite = $true
// } catch {
//   $failMsg = [string]$_.Exception.Message
// } finally {
//   if ($sp -and $sp.IsOpen) { try { $sp.Close() } catch {} }
// }
// if ($okWrite) { Out @{ok=$true; port=$p; written=$bytes.Length}; exit 0 }
// Out @{ok=$false; error=('Bluetooth write failed on ' + $p + ': ' + $failMsg); code=4}
// exit 4
// `

// /**
//  * Send raw ESC/POS bytes to the paired Bluetooth PT-210 (SPP COM port).
//  * Resolves only after the physical write completed; rejects with a
//  * human-readable reason that names the transport, so Kitchen Bluetooth
//  * failures are always distinguishable from Admin spooler failures.
//  */
// const bluetoothPrint = (cfg, buffer, docName) =>
//   withBluetoothLock(
//     cfg.btPort,
//     () =>
//       new Promise((resolve, reject) => {
//         const ps = spawn(
//           'powershell.exe',
//           ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(PS_BLUETOOTH_SCRIPT, 'utf16le').toString('base64')],
//           { windowsHide: true },
//         )
//         let out = ''
//         let err = ''
//         let settled = false
//         const timer = setTimeout(() => {
//           ps.kill()
//           if (settled) return
//           settled = true
//           reject(new Error(`${cfg.label} Bluetooth (${cfg.btPort}): connection timeout — printer powered off, out of range, or laptop Bluetooth disabled`))
//         }, 30_000)
//         const fail = (message) => {
//           if (settled) return
//           settled = true
//           clearTimeout(timer)
//           reject(new Error(`${cfg.label} Bluetooth (${cfg.btPort}): ${message}`))
//         }
//         ps.stdout.on('data', (c) => (out += c))
//         ps.stderr.on('data', (c) => (err += c))
//         ps.on('error', (e) => fail(`helper cannot start (${e.message})`))
//         ps.on('close', (code) => {
//           if (settled) return
//           if (code === 0) {
//             settled = true
//             clearTimeout(timer)
//             return resolve()
//           }
//           let detail = ''
//           try {
//             detail = JSON.parse(out.trim().split('\n').pop()).error || ''
//           } catch {
//             detail =
//               String(err || '')
//                 .replace(/#< CLIXML/g, '')
//                 .replace(/<S S="Error">(.*?)<\/S>/g, (_, m) => '\n' + m)
//                 .replace(/_x000D_|_x000A_/g, ' ')
//                 .replace(/<[^>]+>/g, '')
//                 .trim()
//                 .split('\n')[0] || ''
//           }
//           const codeText = {
//             2: 'Bluetooth COM port not configured (set *_BLUETOOTH_PORT)',
//             3: `port ${cfg.btPort} is not present — re-pair the PT-210 and power it on`,
//             4: 'write failed (printer disconnected mid-print)',
//             6: 'device not ready (powered off, out of range, or laptop Bluetooth disabled)',
//           }
//           fail(detail || codeText[code] || `Bluetooth helper exited ${code}`)
//         })
//         ps.stdin.write(JSON.stringify({ port: cfg.btPort, baud: cfg.btBaud, docName, dataB64: buffer.toString('base64') }))
//         ps.stdin.end()
//       }),
//   )

// /**
//  * Deep health probe for a paired Bluetooth PT-210 — cached 10s, deduplicated,
//  * and serialized with any active print on the same COM port. Reports
//  * available:false unless Windows can actually reach the printer (port present
//  * + device status OK + the port opens) — never "true because the relay is
//  * running".
//  */
// const checkBluetoothPrinter = (btPort) => {
//   if (!btPort) return Promise.resolve({ available: false, error: 'Bluetooth COM port not configured', checkedAt: Date.now() })
//   return freshAvailability(
//     `bluetooth|${btPort}`,
//     () =>
//       withBluetoothLock(
//         btPort,
//         () =>
//           new Promise((resolve) => {
//             const probe = `
// $p = '${btPort}'
// $names = [System.IO.Ports.SerialPort]::GetPortNames()
// if ($names -notcontains $p) { @{ ok = $false; error = "Bluetooth COM port $p not present - PT-210 not paired, powered off, or laptop Bluetooth disabled" } | ConvertTo-Json -Compress; return }
// $com = $null
// try { $com = Get-CimInstance Win32_PnPEntity -ErrorAction SilentlyContinue | Where-Object { $_.Name -like ('*(' + $p + ')*') } | Select-Object -First 1 } catch { $com = $null }
// if ($com -and $com.Status -ne 'OK') { @{ ok = $false; error = "Bluetooth printer reports device status $($com.Status) - powered off or out of range" } | ConvertTo-Json -Compress; return }
// try { $sp = New-Object System.IO.Ports.SerialPort $p; $sp.Open(); $sp.Close(); @{ ok = $true } | ConvertTo-Json -Compress } catch { @{ ok = $false; error = "Bluetooth port $p cannot be opened: $($_.Exception.Message)" } | ConvertTo-Json -Compress }
// `
//             const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', probe], { windowsHide: true })
//             let out = ''
//             let settled = false
//             const finish = (value) => {
//               if (settled) return
//               settled = true
//               clearTimeout(timer)
//               resolve(value)
//             }
//             const timer = setTimeout(() => {
//               ps.kill()
//               finish({ available: false, error: 'Bluetooth health check timeout' })
//             }, 8000)
//             ps.stdout.on('data', (c) => (out += c))
//             ps.on('error', () => finish({ available: false, error: 'powershell unavailable' }))
//             ps.on('close', () => {
//               try {
//                 const j = JSON.parse(out.trim().split('\n').pop())
//                 finish(j.ok ? { available: true } : { available: false, error: j.error || 'Bluetooth printer unavailable' })
//               } catch {
//                 finish({ available: false, error: 'Bluetooth health check failed' })
//               }
//             })
//           }),
//       ),
//   )
// }

// /* ------------------------------------------------------------------ *
//  * Per-printer FIFO queues — kitchen and admin are fully independent.
//  * Jobs for the SAME printer are strictly serialized (never two writes
//  * to one PT-210 at once); a slow kitchen printer never blocks admin.
//  * ------------------------------------------------------------------ */
// const queues = {
//   kitchen: [],
//   admin: [],
// }
// const pumping = { kitchen: false, admin: false }
// /** Idempotency ledger: job id → job (QUEUED/PRINTING/PRINTED reject duplicates). */
// const jobLedger = new Map()
// const jobHistory = [] // capped, for /jobs + status page

// const sendRawTcp = (target, buffer) =>
//   new Promise((resolve, reject) => {
//     const [host, port] = target.split(':')
//     const sock = net.connect({ host, port: Number(port) || 9100 }, () => sock.write(buffer))
//     sock.on('error', reject)
//     sock.on('data', () => {})
//     sock.setTimeout(8000, () => {
//       sock.destroy()
//       reject(new Error('printer timeout'))
//     })
//     sock.on('close', () => resolve())
//   })

// const transportPrint = async (job) => {
//   const cfg = printers[job.printer]
//   if (cfg.transport === 'windows-spooler') {
//     if (!cfg.printerName) throw new Error(`${cfg.label} Windows printer queue is not configured (set ${job.printer.toUpperCase()}_PRINTER_NAME)`)
//     await windowsSpoolerPrint(cfg.printerName, escpos(job.lines), `BeeShive ${job.kind} ${job.id}`)
//   } else if (cfg.transport === 'bluetooth') {
//     // Real Windows Bluetooth path — never falls back to spooler/mock/browser
//     // and never to the other role's printer.
//     if (!cfg.btPort) throw new Error(`${cfg.label} Bluetooth printer is not configured (set ${job.printer.toUpperCase()}_BLUETOOTH_PORT to the paired PT-210 COM port)`)
//     await bluetoothPrint(cfg, escpos(job.lines), `BeeShive ${job.kind} ${job.id}`)
//   } else if (cfg.transport === 'tcp') {
//     if (!cfg.tcpTarget) throw new Error(`${cfg.label} TCP printer is not configured (set ${job.printer.toUpperCase()}_PRINTER)`)
//     await sendRawTcp(cfg.tcpTarget, escpos(job.lines))
//   } else if (cfg.transport === 'mock') {
//     await new Promise((r) => setTimeout(r, 400))
//   } else {
//     throw new Error(`${job.printer} printer is not configured on this relay`)
//   }
// }

// async function pump(role) {
//   if (pumping[role]) return
//   pumping[role] = true
//   try {
//     for (;;) {
//       const job = queues[role][0]
//       if (!job) break
//       job.status = 'PRINTING'
//       job.startedAt = Date.now()
//       job.attempts = (job.attempts || 0) + 1
//       try {
//         await transportPrint(job)
//         job.status = 'PRINTED'
//         job.printedAt = Date.now()
//         job.error = undefined
//         const pCfg = printers[role]
//         job.via =
//           pCfg.transport === 'windows-spooler'
//             ? `spooler:${pCfg.printerName}`
//             : pCfg.transport === 'bluetooth'
//               ? `bluetooth:${pCfg.btPort}`
//               : pCfg.transport
//       } catch (err) {
//         job.error = String((err && err.message) || err)
//         if (job.attempts < job.maxAttempts) {
//           console.log(`[${role.toUpperCase()}] ${job.id} attempt ${job.attempts} failed (${job.error}) — retrying`)
//           await new Promise((r) => setTimeout(r, 1500))
//           continue // same job stays at queue head — FIFO preserved, no duplicate id
//         }
//         job.status = 'FAILED'
//       }
//       queues[role].shift()
//       jobHistory.unshift(job)
//       if (jobHistory.length > 300) jobHistory.pop()
//       // Evict old terminal jobs from the idempotency ledger so it cannot grow
//       // unbounded; a duplicate of an evicted id is legitimately a new submit.
//       if (job.status === 'FAILED' || job.status === 'PRINTED') {
//         const TERMINAL_TTL_MS = 6 * 60 * 60 * 1000 // 6h duplicate-protection window
//         setTimeout(() => {
//           const cur = jobLedger.get(job.id)
//           if (cur && (cur.status === 'FAILED' || cur.status === 'PRINTED')) jobLedger.delete(job.id)
//         }, TERMINAL_TTL_MS + 1000)
//       }
//       console.log(`[${role.toUpperCase()}] ${job.id} → ${job.status} ${job.error ? '(' + job.error + ')' : job.via}`)
//     }
//   } finally {
//     pumping[role] = false
//   }
// }

// const ROLE_BY_PRINTER = { kitchen: 'kitchen', supervisor_token: 'kitchen', admin: 'admin', counter_bill: 'admin' }
// const normalizeRole = (printer, kind) => {
//   // Clients may only target the two logical destinations. An explicit unknown
//   // printer value (e.g. an arbitrary Windows printer name) is ALWAYS rejected —
//   // kind cannot override it.
//   if (printer) return ROLE_BY_PRINTER[printer] || null
//   if (kind === 'token') return 'kitchen'
//   if (kind === 'bill') return 'admin'
//   return null
// }

// const publicJob = (job) => ({
//   id: job.id,
//   kind: job.kind,
//   printer: job.printer,
//   transport: job.transport,
//   referenceId: job.referenceId,
//   status: job.status,
//   attempts: job.attempts,
//   error: job.error,
//   receivedAt: job.receivedAt,
//   printedAt: job.printedAt,
//   via: job.via,
// })

// const submitJob = ({ id, kind, printer, referenceId, lines, attempts, intent }) => {
//   const role = normalizeRole(printer, kind)
//   if (!role) return { error: 'printer destination must be kitchen (token) or admin (bill)' }
//   if (!id || !Array.isArray(lines) || lines.some((l) => typeof l !== 'string') || lines.length === 0) {
//     return { error: 'id and lines[] of strings required' }
//   }
//   if (String(id).length > 120 || lines.length > 300) return { error: 'job too large' }
//   const existing = jobLedger.get(id)
//   if (existing && existing.status !== 'FAILED') return { duplicate: true, job: publicJob(existing) }
//   // FAILED jobs may be resubmitted with the same id (bounded retry semantics);
//   // explicit REPRINT always uses a NEW id from the client.
//   const job = {
//     id: String(id),
//     kind: role === 'kitchen' ? 'token' : 'bill',
//     printer: role,
//     transport: printers[role].transport,
//     referenceId: String(referenceId || ''),
//     lines,
//     status: 'QUEUED',
//     receivedAt: Date.now(),
//     attempts: 0,
//     maxAttempts: Math.min(Math.max(Number(attempts) || MAX_ATTEMPTS, 1), 10), // maxAttempts = TOTAL physical attempts
//   }
//   jobLedger.set(job.id, job)
//   queues[role].push(job)
//   return { queued: true, job: publicJob(job) }
// }

// /* ------------------------------------------------------------------ *
//  * HTTP API
//  * ------------------------------------------------------------------ */
// const withCors = (res) => {
//   res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN)
//   res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
//   res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Api-Key')
// }
// const json = (res, code, body) => {
//   withCors(res)
//   res.writeHead(code, { 'Content-Type': 'application/json' })
//   res.end(JSON.stringify(body))
// }

// /** Physical target of a role's transport (Windows queue name / host:port / COM port). Empty = not configured. */
// const printerTarget = (cfg) =>
//   cfg.transport === 'windows-spooler' ? cfg.printerName : cfg.transport === 'tcp' ? cfg.tcpTarget : cfg.transport === 'bluetooth' ? cfg.btPort : ''

// /** Human-readable transport for test slips, the status page and startup logs. */
// const transportLabel = (role) => {
//   const cfg = printers[role]
//   if (cfg.transport === 'bluetooth') return cfg.btPort ? `bluetooth (${cfg.btPort})` : 'bluetooth (COM port NOT SET)'
//   if (cfg.transport === 'windows-spooler') return `windows-spooler (${cfg.printerName || 'NOT SET'})`
//   if (cfg.transport === 'tcp') return `tcp (${cfg.tcpTarget || 'NOT SET'})`
//   return cfg.transport
// }

// const describePrinter = (role) => {
//   const cfg = printers[role]
//   const target = printerTarget(cfg)
//   const base = {
//     configured: cfg.transport === 'mock' ? true : cfg.transport !== 'none' && !!target,
//     transport: cfg.transport,
//     target,
//     printerName: cfg.printerName || cfg.tcpTarget || '',
//     role,
//     kind: cfg.kind,
//   }
//   if (cfg.transport === 'bluetooth') base.btPort = cfg.btPort
//   return base
// }

// const printersStatus = async () => {
//   const out = {}
//   for (const role of ['kitchen', 'admin']) {
//     const cfg = printers[role]
//     const base = describePrinter(role)
//     if (base.transport === 'windows-spooler' && cfg.printerName) {
//       const health = await checkWindowsPrinter(cfg.printerName)
//       base.available = health.available
//       if (health.error) base.error = health.error
//     } else if (base.transport === 'bluetooth' && cfg.btPort) {
//       const health = await checkBluetoothPrinter(cfg.btPort)
//       base.available = health.available
//       if (health.error) base.error = health.error
//     } else if ((base.transport === 'tcp' && cfg.tcpTarget) || base.transport === 'mock') {
//       base.available = true
//     } else {
//       base.available = false
//       base.error =
//         base.transport === 'bluetooth'
//           ? `${role.toUpperCase()}_BLUETOOTH_PORT is not set — pair the PT-210 and set its COM port`
//           : base.transport === 'none'
//             ? 'printer not configured on this relay'
//             : `${role.toUpperCase()}_PRINTER_NAME is not set — no Windows printer queue to use`
//     }
//     out[role] = base
//   }
//   return out
// }

// /**
//  * Lightweight transport view for /status and /health — NO PowerShell probe on
//  * the hot path (this endpoint is polled before every print). `available` is
//  * only reported from a probe made in the last 30s; otherwise it is null
//  * ("unknown") — never a fabricated true. Run GET /printers for live health.
//  */
// const statusPrinterView = (role) => {
//   const cfg = printers[role]
//   const target = printerTarget(cfg)
//   const view = {
//     configured: cfg.transport === 'mock' ? true : cfg.transport !== 'none' && !!target,
//     transport: cfg.transport,
//     target,
//     available: cfg.transport === 'mock' ? true : null,
//   }
//   if (target) {
//     const cached = printerAvailability.get(`${cfg.transport}|${target}`)
//     if (cached && Date.now() - cached.checkedAt < 30_000) {
//       view.available = cached.available === true
//       if (cached.error) view.error = cached.error
//     }
//   } else if (cfg.transport === 'bluetooth') {
//     view.error = `${role.toUpperCase()}_BLUETOOTH_PORT is not set`
//   } else if (cfg.transport === 'none') {
//     view.error = 'printer not configured on this relay'
//   }
//   return view
// }

// const authorized = (req) => !API_KEY || req.headers['x-api-key'] === API_KEY

// const buildTestReceipt = (role) => {
//   if (role === 'kitchen') {
//     return [
//       '==== KITCHEN PRINTER TEST ====',
//       `RELAY TIME : ${new Date().toLocaleString()}`,
//       `TRANSPORT  : ${transportLabel('kitchen')}`,
//       'PT-210 #1 (KITCHEN)',
//       'If you can read this on the',
//       'KITCHEN printer, routing OK.',
//       '------------------------------',
//       'SAMPLE TOKEN 001',
//       '1 x TEST ITEM',
//       '',
//     ]
//   }
//   return [
//     '==== ADMIN PRINTER TEST ====',
//     `RELAY TIME : ${new Date().toLocaleString()}`,
//     `TRANSPORT  : ${transportLabel('admin')}`,
//     'PT-210 #2 (ADMIN)',
//     'If you can read this on the',
//     'ADMIN printer, routing OK.',
//     '------------------------------',
//     'SAMPLE BILL  B-001',
//     '1 x TEST ITEM         10.00',
//     'TOTAL                  10.00',
//     '',
//   ]
// }

// const server = http.createServer((req, res) => {
//   if (req.method === 'OPTIONS') {
//     withCors(res)
//     res.writeHead(204)
//     res.end()
//     return
//   }
//   if (!authorized(req)) return json(res, 401, { ok: false, error: 'unauthorized' })

//   if (req.method === 'POST' && (req.url === '/print' || req.url === '/jobs')) {
//     let body = ''
//     req.on('data', (c) => {
//       body += c
//       if (body.length > 512_000) req.destroy()
//     })
//     req.on('end', () => {
//       try {
//         const payload = JSON.parse(body)
//         const result = submitJob(payload)
//         if (result.error) return json(res, 400, { ok: false, error: result.error })
//         pump(result.job.printer)
//         json(res, 200, { ok: true, duplicate: !!result.duplicate, job: result.job, queued: queues[result.job.printer].length })
//       } catch (e) {
//         json(res, 400, { ok: false, error: String((e && e.message) || e) })
//       }
//     })
//     return
//   }

//   if (req.method === 'POST' && req.url.startsWith('/test/')) {
//     const role = req.url.slice('/test/'.length)
//     if (role !== 'kitchen' && role !== 'admin') return json(res, 400, { ok: false, error: 'role must be kitchen or admin' })
//     const result = submitJob({ id: `test_${role}_${Date.now()}`, kind: role === 'kitchen' ? 'token' : 'bill', printer: role, lines: buildTestReceipt(role) })
//     if (result.error) return json(res, 400, { ok: false, error: result.error })
//     pump(role)
//     return json(res, 200, { ok: true, job: result.job })
//   }

//   if (req.method === 'GET' && req.url.startsWith('/jobs/')) {
//     const id = decodeURIComponent(req.url.slice('/jobs/'.length))
//     const job = jobLedger.get(id)
//     return job ? json(res, 200, { ok: true, job: publicJob(job) }) : json(res, 404, { ok: false, error: 'job not found' })
//   }
//   if (req.url === '/jobs') {
//     return json(res, 200, {
//       ok: true,
//       kitchenQueue: queues.kitchen.length,
//       adminQueue: queues.admin.length,
//       jobs: jobHistory.slice(0, 50).map(publicJob),
//     })
//   }
//   if (req.url === '/printers') return printersStatus().then((p) => json(res, 200, { ok: true, printers: p }))
//   if (req.url === '/status' || req.url === '/health') {
//     return json(res, 200, {
//       ok: true,
//       kitchenPrinter: statusPrinterView('kitchen'),
//       billPrinter: statusPrinterView('admin'),
//       kitchenQueue: queues.kitchen.length,
//       adminQueue: queues.admin.length,
//     })
//   }
//   if (req.url === '/') {
//     res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
//     const rows =
//       jobHistory
//         .slice(0, 25)
//         .map((j) => `<details><summary><b>${j.printer.toUpperCase()}</b> ${j.id} — ${j.status} <small>${j.error || j.via || ''}</small></summary><pre>${j.lines.map((l) => String(l).replace(/</g, '&lt;')).join('\n')}</pre></details>`)
//         .join('') || '<p>No jobs yet.</p>'
//     res.end(`<!doctype html><html><head><meta charset="utf-8"><title>Bee's Hive Print Relay</title><meta http-equiv="refresh" content="5"></head>
// <body style="font-family:monospace;max-width:720px;margin:2rem auto">
// <h1>🐝 Bee's Hive — Print Relay :${PORT}</h1>
// <p>Kitchen: <b>${printerTarget(printers.kitchen) || 'NOT CONFIGURED'}</b> (${transportLabel('kitchen')}) ·
//    Admin: <b>${printerTarget(printers.admin) || 'NOT CONFIGURED'}</b> (${transportLabel('admin')})</p>
// <p>Kitchen queue: <b>${queues.kitchen.length}</b> · Admin queue: <b>${queues.admin.length}</b></p>
// <h2>Recent jobs</h2>${rows}</body></html>`)
//     return
//   }
//   json(res, 404, { ok: false, error: 'not found' })
// })

// server.listen(PORT, BIND_ADDRESS, () => {
//   console.log(`Bee's Hive print relay on http://${BIND_ADDRESS}:${PORT}`)
//   for (const role of ['kitchen', 'admin']) {
//     const cfg = printers[role]
//     let target = printerTarget(cfg)
//     if (!target) {
//       if (cfg.transport === 'mock') target = 'MOCK (simulated)'
//       else if (cfg.transport === 'bluetooth') target = `NOT SET — set ${role.toUpperCase()}_BLUETOOTH_PORT to the paired PT-210 COM port (jobs will fail explicitly)`
//       else target = 'NOT CONFIGURED — jobs will fail explicitly'
//     }
//     console.log(`${role} printer (${cfg.transport}): ${target}`)
//   }
// })





// module.exports = { escpos, submitJob, printers } // exported for tests










// #!/usr/bin/env node
/**
 * Bee's Hive — Central Print Relay (Windows PT-210 USB production setup).
 *
 * Runs on the ONE Windows machine that owns both physical DIVYE PT-210
 * printers (USB). All waiter phones/admin browsers POST jobs here over the
 * local Wi-Fi — no waiter device ever talks to a printer directly, so 5+
 * concurrent waiters cannot fight over a printer connection.
 *
 * Transports (auto-selected per printer):
 *   - windows-spooler : KITCHEN_PRINTER_NAME / ADMIN_PRINTER_NAME set →
 *                       raw ESC/POS bytes written straight into the Windows
 *                       print spooler (winspool.Drv WritePrinter) for the
 *                       named PT-210 USB queue. No temp files, no dialogs.
 *   - tcp             : KITCHEN_PRINTER / ADMIN_PRINTER (host:port 9100)
 *                       legacy raw-TCP printers still supported.
 *   - bluetooth       : *_PRINTER_TRANSPORT=bluetooth + *_BLUETOOTH_PORT=COMx
 *                       REAL Windows Bluetooth path for a PT-210 paired over
 *                       the Serial Port Profile: Windows exposes the printer
 *                       as a Bluetooth COM port (Device Manager → Ports
 *                       (COM & LPT) → "Standard Serial over Bluetooth link").
 *                       A PowerShell helper opens that COM port
 *                       (System.IO.Ports.SerialPort) and writes the SAME raw
 *                       ESC/POS bytes as the USB/spooler path. The relay
 *                       process owns the single Bluetooth connection; waiter
 *                       phones never pair with the printer. If Windows
 *                       instead exposes the paired PT-210 as a normal printer
 *                       queue, keep *_PRINTER_NAME — the existing
 *                       windows-spooler transport is reused unchanged.
 *   - mock            : PRINT_MOCK=1 — simulated printers for testing.
 *
 * Env vars:
 *   PRINT_PORT=8787            relay HTTP port (legacy PORT still honoured)
 *   BIND_ADDRESS=0.0.0.0       bind address (use LAN IP or 127.0.0.1 to restrict)
 *   KITCHEN_PRINTER_NAME=...   exact Windows printer name for kitchen PT-210
 *   ADMIN_PRINTER_NAME=...     exact Windows printer name for admin PT-210
 *   KITCHEN_PRINTER=host:port  legacy TCP kitchen printer (unused if NAME set)
 *   ADMIN_PRINTER=host:port    legacy TCP admin printer   (unused if NAME set)
 *   KITCHEN_PRINTER_TRANSPORT  optional override: bluetooth|windows-spooler|tcp
 *   ADMIN_PRINTER_TRANSPORT    optional override: bluetooth|windows-spooler|tcp
 *   KITCHEN_BLUETOOTH_PORT     paired Bluetooth SPP COM port (e.g. COM5)
 *   ADMIN_BLUETOOTH_PORT       paired Bluetooth SPP COM port (e.g. COM7)
 *   *_BLUETOOTH_BAUD           optional serial baud (default 9600)
 *   PRINT_RETRY_ATTEMPTS=1     retained for config compatibility; physical jobs are one-shot
 *   API_KEY=secret             if set, POST /print requires X-Api-Key header
 *   CORS_ORIGIN=*              allowed browser origin
 *
 * Endpoints: POST /print  GET /jobs  GET /jobs/:id  GET /status  GET /health
 *            GET /printers  POST /test/kitchen  POST /test/admin  GET /
 *
 * CRITICAL: a 200 on POST /print only means "queued". A job becomes PRINTED
 * only after the configured transport (windows-spooler / bluetooth / tcp)
 * reports the physical write completed successfully. Failures surface as
 * FAILED with a reason — there is no silent fallback to another printer,
 * to browser printing, or to a mock.
 */
const http = require('http')
const net = require('net')
const { spawn } = require('child_process')

const PORT = Number(process.env.PRINT_PORT || process.env.PORT || 9100)
const BIND_ADDRESS = process.env.BIND_ADDRESS || '0.0.0.0'
// A physical PT-210 job is deliberately one-shot. If the transport result is
// ambiguous, retrying the same bytes can print a second receipt. Operators can
// explicitly press PRINT again, which creates a new manual job.
// const MAX_ATTEMPTS = 1
/** Post-write spool drain window in seconds. 0 is the safe default because a
 * successful RAW WritePrinter call must never be retried merely because the
 * Windows queue takes time to disappear; doing so can physically print twice. */
const DRAIN_SECONDS = Math.max(0, Math.min(Number(process.env.SPOOL_DRAIN_SECONDS ?? 0), 120))
const API_KEY = process.env.API_KEY || ''
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*'

const LEGACY = { token: process.env.TOKEN_PRINTER || process.env.KITCHEN_PRINTER || '', bill: process.env.BILL_PRINTER || process.env.ADMIN_PRINTER || '' }

/** Logical destination → transport config. Clients may ONLY send 'kitchen'|'admin' (or legacy 'token'|'bill'). */
const printers = {
  kitchen: {
    kind: 'token',
    label: 'Kitchen',
    transport: 'none',
    printerName: '', // exact Windows queue name (windows-spooler)
    tcpTarget: '', // host:port (tcp)
    btPort: '', // paired Bluetooth SPP COM port (bluetooth), e.g. COM5
    btBaud: 9600,
  },
  admin: {
    kind: 'bill',
    label: 'Admin',
    transport: 'none',
    printerName: '',
    tcpTarget: '',
    btPort: '',
    btBaud: 9600,
  },
}
const roleEnv = (role, key) => process.env[(role === 'kitchen' ? 'KITCHEN_' : 'ADMIN_') + key]
/**
 * Only a well-formed COM port name may ever reach the PowerShell helpers
 * (also prevents any injection through the env file).
 */
const normalizeBtPort = (value) => {
  const v = String(value || '').trim().toUpperCase()
  return /^COM\d{1,3}$/.test(v) ? v : ''
}
const TRANSPORTS = new Set(['windows-spooler', 'tcp', 'bluetooth'])
if (process.env.PRINT_MOCK === '1') {
  printers.kitchen.transport = 'mock'
  printers.admin.transport = 'mock'
} else {
  for (const role of ['kitchen', 'admin']) {
    const nameEnv = roleEnv(role, 'PRINTER_NAME')
    const tcpEnv = LEGACY[role === 'kitchen' ? 'token' : 'bill']
    const rawBtPort = roleEnv(role, 'BLUETOOTH_PORT')
    printers[role].btPort = normalizeBtPort(rawBtPort)
    if (rawBtPort && !printers[role].btPort) {
      console.warn(`[config] ${role.toUpperCase()}_BLUETOOTH_PORT "${rawBtPort}" is not a valid COM port (expected e.g. COM5) — Bluetooth transport will be reported as not configured`)
    }
    const baud = Number(roleEnv(role, 'BLUETOOTH_BAUD'))
    if (Number.isFinite(baud) && baud >= 1200) printers[role].btBaud = Math.round(baud)
    const forced = String(roleEnv(role, 'PRINTER_TRANSPORT') || '')
      .trim()
      .toLowerCase()
    if (forced && !TRANSPORTS.has(forced)) {
      console.warn(`[config] ignoring invalid ${role.toUpperCase()}_PRINTER_TRANSPORT="${forced}" (expected windows-spooler|tcp|bluetooth)`)
    }
    // Auto resolution keeps existing USB installs working unchanged:
    //   NAME set → windows-spooler (original behaviour, wins),
    //   else a paired COM port configured → bluetooth (new opt-in),
    //   else legacy host:port TCP.
    const transport = TRANSPORTS.has(forced)
      ? forced
      : nameEnv
        ? 'windows-spooler'
        : printers[role].btPort
          ? 'bluetooth'
          : tcpEnv
            ? 'tcp'
            : 'none'
    printers[role].transport = transport
    if (transport === 'windows-spooler') printers[role].printerName = nameEnv || ''
    else if (transport === 'tcp') printers[role].tcpTarget = tcpEnv || ''
    // bluetooth: btPort may be empty when *_PRINTER_TRANSPORT=bluetooth was
    // forced without *_BLUETOOTH_PORT — reported honestly as NOT configured.
  }
}

const escpos = (lines) => {
  const ESC = 0x1b
  const text = lines.join('\n') + '\n\n\n'
  // init + text + feed 3 lines + partial cut
  return Buffer.concat([
    Buffer.from([ESC, 0x40]), // ESC @ init
    Buffer.from(text, 'utf8'),
    Buffer.from([ESC, 0x64, 3]), // ESC d 3 (feed)
    Buffer.from([ESC, 0x56, 66, 0]), // ESC V 66 0 (partial cut)
  ])
}

/* ------------------------------------------------------------------ *
 * Transport: windows-spooler — raw ESC/POS via winspool.Drv.
 * A PowerShell helper opens the named printer queue and WritePrinter's
 * the bytes. Bytes arrive on stdin as JSON+base64 → no temp files.
 * ------------------------------------------------------------------ */
const PS_SPOOLER_SCRIPT = `
$ErrorActionPreference = 'Stop'
$raw = [Console]::In.ReadToEnd()
$req = $raw | ConvertFrom-Json
$bytes = [Convert]::FromBase64String($req.dataB64)
function Out($o) { Write-Output ($o | ConvertTo-Json -Compress) }
$printer = Get-Printer -Name $req.printer -ErrorAction SilentlyContinue
if (-not $printer) { Out @{ok=$false; error=('printer not found: ' + $req.printer); code=2}; exit 2 }
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class RawPt210 {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]
  public struct DOCINFOA { [MarshalAs(UnmanagedType.LPStr)] public string pDocName; [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile; [MarshalAs(UnmanagedType.LPStr)] public string pDataType; }
  [DllImport("winspool.Drv", EntryPoint="OpenPrinterA", SetLastError=true, CharSet=CharSet.Ansi)]
  public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);
  [DllImport("winspool.Drv", SetLastError=true)] public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="StartDocPrinterA", SetLastError=true, CharSet=CharSet.Ansi)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);
  [DllImport("winspool.Drv", SetLastError=true)] public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", SetLastError=true)] public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", SetLastError=true)] public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", SetLastError=true)] public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);
  public static int Send(string printerName, byte[] data, string docName) {
    IntPtr hPrinter;
    if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) return 10;
    try {
      var di = new DOCINFOA();
      di.pDocName = docName; di.pDataType = "RAW";
      if (!StartDocPrinter(hPrinter, 1, di)) return 11;
      if (!StartPagePrinter(hPrinter)) { EndDocPrinter(hPrinter); return 12; }
      IntPtr pBytes = Marshal.AllocHGlobal(data.Length);
      try {
        Marshal.Copy(data, 0, pBytes, data.Length);
        int written;
        if (!WritePrinter(hPrinter, pBytes, data.Length, out written) || written != data.Length) { return 13; }
      } finally { Marshal.FreeHGlobal(pBytes); }
      if (!EndPagePrinter(hPrinter)) return 14;
      if (!EndDocPrinter(hPrinter)) return 15;
      return 0;
    } finally { ClosePrinter(hPrinter); }
  }
}
'@
$code = [RawPt210]::Send($req.printer, $bytes, $req.docName)
if ($code -ne 0) { Out @{ok=$false; error=('spooler write failed (code ' + $code + ')'); code=$code}; exit 3 }
# Post-write drain check: prove the spool actually processed the job. If the
# driver exposes print jobs, wait until ours leaves the queue (physically
# printed) or report an error/offline/paper-out state instead of faking success.
$drainSec = [int]$req.drainSec
if ($drainSec -gt 0) {
  $bad  = 2 -bor 32 -bor 64 -bor 512 -bor 1024   # Error, Offline, PaperOut, Blocked, UserIntervention
  $done = 128 -bor 4096                          # Printed, Complete
  $deadline = (Get-Date).AddSeconds($drainSec)
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 800
    $job = Get-PrintJob -PrinterName $req.printer -ErrorAction SilentlyContinue | Where-Object { $_.DocumentName -eq $req.docName }
    if (-not $job) { Out @{ok=$true; printer=$req.printer; drained=$true}; exit 0 }
    if ([int]$job.JobStatus -band $done) { Out @{ok=$true; printer=$req.printer; drained=$true}; exit 0 }
    if ([int]$job.JobStatus -band $bad) { Out @{ok=$false; error=('printer reports error state (spooler status ' + [int]$job.JobStatus + ' - offline/paper-out/disconnected)'); code=20}; exit 4 }
  }
  Out @{ok=$false; error=('print job still queued after ' + $drainSec + 's - printer may be disconnected or offline'); code=21}; exit 4
}
Out @{ok=$true; printer=$req.printer}
`

/** Send raw bytes to a named Windows printer via the spooler. Resolves when the spooler accepted the physical write; rejects with a human-readable reason. */
const windowsSpoolerPrint = (printerName, buffer, docName) =>
  new Promise((resolve, reject) => {
    const ps = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(PS_SPOOLER_SCRIPT, 'utf16le').toString('base64')],
      { windowsHide: true },
    )
    let out = ''
    let err = ''
    const timer = setTimeout(() => {
      ps.kill()
      reject(new Error('spooler helper timeout (printer may be offline)'))
    }, Math.max(60_000, (DRAIN_SECONDS + 20) * 1000))
    ps.stdout.on('data', (c) => (out += c))
    ps.stderr.on('data', (c) => (err += c))
    ps.on('error', (e) => {
      clearTimeout(timer)
      reject(new Error('cannot start spooler helper: ' + e.message))
    })
    ps.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) return resolve()
      // Prefer the structured JSON the helper prints on stdout; fall back to a
      // decoded CLIXML stderr message, then to a plain exit-code meaning.
      let detail = ''
      try {
        detail = JSON.parse(out.trim().split('\n').pop()).error || ''
      } catch {
        detail = String(err || '')
          .replace(/#< CLIXML/g, '')
          .replace(/<S S="Error">(.*?)<\/S>/g, (_, m) => '\n' + m)
          .replace(/_x000D_|_x000A_/g, ' ')
          .replace(/<[^>]+>/g, '')
          .trim()
          .split('\n')[0] || ''
      }
      const codeText = {
        2: 'printer not found',
        10: 'printer not found (OpenPrinter failed — wrong name or disconnected)',
        11: 'spooler rejected the print job (printer offline or paused)',
        12: 'spooler could not start the page (printer offline)',
        13: 'spooler write failed (printer disconnected mid-print)',
        14: 'spooler page end failed (printer disconnected)',
        15: 'spooler doc end failed (printer disconnected)',
        20: 'printer reports error state (offline/paper-out/disconnected)',
        21: 'print job still queued — printer may be disconnected or offline',
      }
      reject(new Error(detail || codeText[code] || `spooler helper exited ${code}`))
    })
    ps.stdin.write(JSON.stringify({ printer: printerName, docName, dataB64: buffer.toString('base64'), drainSec: DRAIN_SECONDS }))
    ps.stdin.end()
  })

/**
 * Availability cache for /printers and /status — 10s TTL with in-flight
 * dedup, so 5+ concurrent waiter/health requests spawn at most one probe.
 * `available: true` is ONLY ever recorded from a successful probe of the
 * actual device — never merely because the relay process is running.
 */
const printerAvailability = new Map() // key → { available, error, checkedAt }
const pendingAvailability = new Map() // key → Promise
const freshAvailability = (key, run) => {
  const cached = printerAvailability.get(key)
  if (cached && Date.now() - cached.checkedAt < 10_000) return Promise.resolve(cached)
  const pending = pendingAvailability.get(key)
  if (pending) return pending
  const probe = run()
    .catch((e) => ({ available: false, error: String((e && e.message) || e) }))
    .then((result) => {
      const entry = { ...result, checkedAt: Date.now() }
      printerAvailability.set(key, entry)
      pendingAvailability.delete(key)
      return entry
    })
  pendingAvailability.set(key, probe)
  return probe
}

const checkWindowsPrinter = (printerName) =>
  freshAvailability(
    `windows-spooler|${printerName}`,
    () =>
      new Promise((resolve) => {
        const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
          `$p = Get-Printer -Name '${printerName.replace(/'/g, "''")}' -ErrorAction SilentlyContinue; if ($p) { '{"ok":true}' } else { '{"ok":false,"error":"printer not found"}' }`],
          { windowsHide: true })
        let out = ''
        let settled = false
        const finish = (value) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          resolve(value)
        }
        const timer = setTimeout(() => {
          ps.kill()
          finish({ available: false, error: 'check timeout' })
        }, 8000)
        ps.stdout.on('data', (c) => (out += c))
        ps.on('error', () => finish({ available: false, error: 'powershell unavailable' }))
        ps.on('close', () => {
          try {
            const j = JSON.parse(out.trim().split('\n').pop())
            finish(j.ok ? { available: true } : { available: false, error: j.error })
          } catch {
            finish({ available: false, error: 'printer check failed' })
          }
        })
      }),
  )

/** Serialize every Bluetooth operation per COM port (a health probe can never collide with an active print). */
const bluetoothLocks = new Map() // COM port → promise tail
const withBluetoothLock = (port, fn) => {
  const prev = bluetoothLocks.get(port) || Promise.resolve()
  const run = prev.then(fn)
  const tail = run.then(
    () => undefined,
    () => undefined,
  )
  bluetoothLocks.set(port, tail)
  return run
}

const PS_BLUETOOTH_SCRIPT = `
$ErrorActionPreference = 'Stop'
$raw = [Console]::In.ReadToEnd()
$req = $raw | ConvertFrom-Json
$bytes = [Convert]::FromBase64String($req.dataB64)
function Out($o) { Write-Output ($o | ConvertTo-Json -Compress) }
if (-not $req.port) { Out @{ok=$false; error='Bluetooth COM port not configured (set *_BLUETOOTH_PORT to the paired PT-210 COM port)'; code=2}; exit 2 }
$p = [string]$req.port
$names = [System.IO.Ports.SerialPort]::GetPortNames()
if ($names -notcontains $p) {
  Out @{ok=$false; error=('Bluetooth printer not connected: port ' + $p + ' is not present. Pair the PT-210 (Windows Settings > Bluetooth & devices), power it on, and keep laptop Bluetooth enabled.'); code=3}
  exit 3
}
$com = $null
try { $com = Get-CimInstance Win32_PnPEntity -ErrorAction SilentlyContinue | Where-Object { $_.Name -like ('*(' + $p + ')*') } | Select-Object -First 1 } catch { $com = $null }
if ($com -and $com.Status -ne 'OK') {
  Out @{ok=$false; error=('Bluetooth device for ' + $p + ' reports status "' + [string]$com.Status + '" (printer powered off, out of range, or laptop Bluetooth disabled)'); code=6}
  exit 6
}
$sp = $null
$okWrite = $false
$failMsg = ''
try {
  $sp = New-Object System.IO.Ports.SerialPort
  $sp.PortName = $p
  $sp.BaudRate = [int]$req.baud
  $sp.Parity = 'None'
  $sp.DataBits = 8
  $sp.StopBits = 'One'
  $sp.WriteTimeout = 8000
  $sp.ReadTimeout = 1000
  $sp.Open()
  try { $sp.DiscardInBuffer() } catch {}
  $sp.Write($bytes, 0, $bytes.Length)
  $sp.BaseStream.Flush()
  Start-Sleep -Milliseconds 400
  $okWrite = $true
} catch {
  $failMsg = [string]$_.Exception.Message
} finally {
  if ($sp -and $sp.IsOpen) { try { $sp.Close() } catch {} }
}
if ($okWrite) { Out @{ok=$true; port=$p; written=$bytes.Length}; exit 0 }
Out @{ok=$false; error=('Bluetooth write failed on ' + $p + ': ' + $failMsg); code=4}
exit 4
`

/**
 * Send raw ESC/POS bytes to the paired Bluetooth PT-210 (SPP COM port).
 * Resolves only after the physical write completed; rejects with a
 * human-readable reason that names the transport, so Kitchen Bluetooth
 * failures are always distinguishable from Admin spooler failures.
 */
const bluetoothPrint = (cfg, buffer, docName) =>
  withBluetoothLock(
    cfg.btPort,
    () =>
      new Promise((resolve, reject) => {
        const ps = spawn(
          'powershell.exe',
          ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(PS_BLUETOOTH_SCRIPT, 'utf16le').toString('base64')],
          { windowsHide: true },
        )
        let out = ''
        let err = ''
        let settled = false
        const timer = setTimeout(() => {
          ps.kill()
          if (settled) return
          settled = true
          reject(new Error(`${cfg.label} Bluetooth (${cfg.btPort}): connection timeout — printer powered off, out of range, or laptop Bluetooth disabled`))
        }, 30_000)
        const fail = (message) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          reject(new Error(`${cfg.label} Bluetooth (${cfg.btPort}): ${message}`))
        }
        ps.stdout.on('data', (c) => (out += c))
        ps.stderr.on('data', (c) => (err += c))
        ps.on('error', (e) => fail(`helper cannot start (${e.message})`))
        ps.on('close', (code) => {
          if (settled) return
          if (code === 0) {
            settled = true
            clearTimeout(timer)
            return resolve()
          }
          let detail = ''
          try {
            detail = JSON.parse(out.trim().split('\n').pop()).error || ''
          } catch {
            detail =
              String(err || '')
                .replace(/#< CLIXML/g, '')
                .replace(/<S S="Error">(.*?)<\/S>/g, (_, m) => '\n' + m)
                .replace(/_x000D_|_x000A_/g, ' ')
                .replace(/<[^>]+>/g, '')
                .trim()
                .split('\n')[0] || ''
          }
          const codeText = {
            2: 'Bluetooth COM port not configured (set *_BLUETOOTH_PORT)',
            3: `port ${cfg.btPort} is not present — re-pair the PT-210 and power it on`,
            4: 'write failed (printer disconnected mid-print)',
            6: 'device not ready (powered off, out of range, or laptop Bluetooth disabled)',
          }
          fail(detail || codeText[code] || `Bluetooth helper exited ${code}`)
        })
        ps.stdin.write(JSON.stringify({ port: cfg.btPort, baud: cfg.btBaud, docName, dataB64: buffer.toString('base64') }))
        ps.stdin.end()
      }),
  )

/**
 * Deep health probe for a paired Bluetooth PT-210 — cached 10s, deduplicated,
 * and serialized with any active print on the same COM port. Reports
 * available:false unless Windows can actually reach the printer (port present
 * + device status OK + the port opens) — never "true because the relay is
 * running".
 */
const checkBluetoothPrinter = (btPort) => {
  if (!btPort) return Promise.resolve({ available: false, error: 'Bluetooth COM port not configured', checkedAt: Date.now() })
  return freshAvailability(
    `bluetooth|${btPort}`,
    () =>
      withBluetoothLock(
        btPort,
        () =>
          new Promise((resolve) => {
            const probe = `
$p = '${btPort}'
$names = [System.IO.Ports.SerialPort]::GetPortNames()
if ($names -notcontains $p) { @{ ok = $false; error = "Bluetooth COM port $p not present - PT-210 not paired, powered off, or laptop Bluetooth disabled" } | ConvertTo-Json -Compress; return }
$com = $null
try { $com = Get-CimInstance Win32_PnPEntity -ErrorAction SilentlyContinue | Where-Object { $_.Name -like ('*(' + $p + ')*') } | Select-Object -First 1 } catch { $com = $null }
if ($com -and $com.Status -ne 'OK') { @{ ok = $false; error = "Bluetooth printer reports device status $($com.Status) - powered off or out of range" } | ConvertTo-Json -Compress; return }
try { $sp = New-Object System.IO.Ports.SerialPort $p; $sp.Open(); $sp.Close(); @{ ok = $true } | ConvertTo-Json -Compress } catch { @{ ok = $false; error = "Bluetooth port $p cannot be opened: $($_.Exception.Message)" } | ConvertTo-Json -Compress }
`
            const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', probe], { windowsHide: true })
            let out = ''
            let settled = false
            const finish = (value) => {
              if (settled) return
              settled = true
              clearTimeout(timer)
              resolve(value)
            }
            const timer = setTimeout(() => {
              ps.kill()
              finish({ available: false, error: 'Bluetooth health check timeout' })
            }, 8000)
            ps.stdout.on('data', (c) => (out += c))
            ps.on('error', () => finish({ available: false, error: 'powershell unavailable' }))
            ps.on('close', () => {
              try {
                const j = JSON.parse(out.trim().split('\n').pop())
                finish(j.ok ? { available: true } : { available: false, error: j.error || 'Bluetooth printer unavailable' })
              } catch {
                finish({ available: false, error: 'Bluetooth health check failed' })
              }
            })
          }),
      ),
  )
}

/* ------------------------------------------------------------------ *
 * Per-printer FIFO queues — kitchen and admin are fully independent.
 * Jobs for the SAME printer are strictly serialized (never two writes
 * to one PT-210 at once); a slow kitchen printer never blocks admin.
 * ------------------------------------------------------------------ */
const queues = {
  kitchen: [],
  admin: [],
}
const pumping = { kitchen: false, admin: false }
/** Idempotency ledger: job id → job (QUEUED/PRINTING/PRINTED reject duplicates). */
const jobLedger = new Map()
// Automatic business events are also idempotent by role + kind + referenceId.
// This prevents two different browser tabs/devices from printing the same
// confirmed order twice with different random job IDs. Manual reprints bypass
// this ledger by using intent='manual'.
const automaticLedger = new Map()
const jobHistory = [] // capped, for /jobs + status page

const sendRawTcp = (target, buffer) =>
  new Promise((resolve, reject) => {
    const [host, port] = target.split(':')
    const sock = net.connect({ host, port: Number(port) || 9100 }, () => sock.write(buffer))
    sock.on('error', reject)
    sock.on('data', () => {})
    sock.setTimeout(8000, () => {
      sock.destroy()
      reject(new Error('printer timeout'))
    })
    sock.on('close', () => resolve())
  })

const transportPrint = async (job) => {
  const cfg = printers[job.printer]
  if (cfg.transport === 'windows-spooler') {
    if (!cfg.printerName) throw new Error(`${cfg.label} Windows printer queue is not configured (set ${job.printer.toUpperCase()}_PRINTER_NAME)`)
    await windowsSpoolerPrint(cfg.printerName, escpos(job.lines), `BeeShive ${job.kind} ${job.id}`)
  } else if (cfg.transport === 'bluetooth') {
    // Real Windows Bluetooth path — never falls back to spooler/mock/browser
    // and never to the other role's printer.
    if (!cfg.btPort) throw new Error(`${cfg.label} Bluetooth printer is not configured (set ${job.printer.toUpperCase()}_BLUETOOTH_PORT to the paired PT-210 COM port)`)
    await bluetoothPrint(cfg, escpos(job.lines), `BeeShive ${job.kind} ${job.id}`)
  } else if (cfg.transport === 'tcp') {
    if (!cfg.tcpTarget) throw new Error(`${cfg.label} TCP printer is not configured (set ${job.printer.toUpperCase()}_PRINTER)`)
    await sendRawTcp(cfg.tcpTarget, escpos(job.lines))
  } else if (cfg.transport === 'mock') {
    await new Promise((r) => setTimeout(r, 400))
  } else {
    throw new Error(`${job.printer} printer is not configured on this relay`)
  }
}

async function pump(role) {
  if (pumping[role]) return
  pumping[role] = true
  try {
    for (;;) {
      const job = queues[role][0]
      if (!job) break
      job.status = 'PRINTING'
      job.startedAt = Date.now()
      job.attempts = (job.attempts || 0) + 1
      try {
        await transportPrint(job)
        job.status = 'PRINTED'
        job.printedAt = Date.now()
        job.error = undefined
        const pCfg = printers[role]
        job.via =
          pCfg.transport === 'windows-spooler'
            ? `spooler:${pCfg.printerName}`
            : pCfg.transport === 'bluetooth'
              ? `bluetooth:${pCfg.btPort}`
              : pCfg.transport
      } catch (err) {
        job.error = String((err && err.message) || err)
        if (job.attempts < job.maxAttempts) {
          console.log(`[${role.toUpperCase()}] ${job.id} attempt ${job.attempts} failed (${job.error}) — retrying`)
          await new Promise((r) => setTimeout(r, 1500))
          continue // same job stays at queue head — FIFO preserved, no duplicate id
        }
        job.status = 'FAILED'
      }
      queues[role].shift()
      jobHistory.unshift(job)
      if (jobHistory.length > 300) jobHistory.pop()
      // Evict old terminal jobs from the idempotency ledger so it cannot grow
      // unbounded; a duplicate of an evicted id is legitimately a new submit.
      if (job.status === 'FAILED' || job.status === 'PRINTED') {
        const TERMINAL_TTL_MS = 6 * 60 * 60 * 1000 // 6h duplicate-protection window
        setTimeout(() => {
          const cur = jobLedger.get(job.id)
          if (cur && (cur.status === 'FAILED' || cur.status === 'PRINTED')) jobLedger.delete(job.id)
        }, TERMINAL_TTL_MS + 1000)
      }
      console.log(`[${role.toUpperCase()}] ${job.id} → ${job.status} ${job.error ? '(' + job.error + ')' : job.via}`)
    }
  } finally {
    pumping[role] = false
  }
}

const ROLE_BY_PRINTER = { kitchen: 'kitchen', supervisor_token: 'kitchen', admin: 'admin', counter_bill: 'admin' }
const normalizeRole = (printer, kind) => {
  // Clients may only target the two logical destinations. An explicit unknown
  // printer value (e.g. an arbitrary Windows printer name) is ALWAYS rejected —
  // kind cannot override it.
  if (printer) return ROLE_BY_PRINTER[printer] || null
  if (kind === 'token') return 'kitchen'
  if (kind === 'bill') return 'admin'
  return null
}

const publicJob = (job) => ({
  id: job.id,
  kind: job.kind,
  printer: job.printer,
  transport: job.transport,
  referenceId: job.referenceId,
  status: job.status,
  attempts: job.attempts,
  intent: job.intent,
  error: job.error,
  receivedAt: job.receivedAt,
  printedAt: job.printedAt,
  via: job.via,
})

const submitJob = ({ id, kind, printer, referenceId, lines, attempts, intent }) => {
  const role = normalizeRole(printer, kind)
  if (!role) return { error: 'printer destination must be kitchen (token) or admin (bill)' }
  if (!id || !Array.isArray(lines) || lines.some((l) => typeof l !== 'string') || lines.length === 0) {
    return { error: 'id and lines[] of strings required' }
  }
  if (String(id).length > 120 || lines.length > 300) return { error: 'job too large' }
  const normalizedIntent = intent === 'automatic' ? 'automatic' : 'manual'
  const automaticKey = normalizedIntent === 'automatic' && referenceId
    ? `${role}|${kind}|${String(referenceId)}`
    : ''

  if (automaticKey) {
    const automaticExisting = automaticLedger.get(automaticKey)
    if (automaticExisting) return { duplicate: true, job: publicJob(automaticExisting) }
  }

  const existing = jobLedger.get(id)
  // A job id is immutable. Even a FAILED job cannot be resubmitted with the
  // same id because the physical result may be ambiguous. Manual retry/reprint
  // always creates a fresh job id.
  if (existing) return { duplicate: true, job: publicJob(existing) }
  const job = {
    id: String(id),
    kind: role === 'kitchen' ? 'token' : 'bill',
    printer: role,
    transport: printers[role].transport,
    referenceId: String(referenceId || ''),
    lines,
    status: 'QUEUED',
    receivedAt: Date.now(),
    attempts: 0,
    maxAttempts: 1,
    intent: normalizedIntent,
  }
  jobLedger.set(job.id, job)
  if (automaticKey) automaticLedger.set(automaticKey, job)
  queues[role].push(job)
  return { queued: true, job: publicJob(job) }
}

/* ------------------------------------------------------------------ *
 * HTTP API
 * ------------------------------------------------------------------ */
const withCors = (res) => {
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN)
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Api-Key')
}
const json = (res, code, body) => {
  withCors(res)
  res.writeHead(code, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

/** Physical target of a role's transport (Windows queue name / host:port / COM port). Empty = not configured. */
const printerTarget = (cfg) =>
  cfg.transport === 'windows-spooler' ? cfg.printerName : cfg.transport === 'tcp' ? cfg.tcpTarget : cfg.transport === 'bluetooth' ? cfg.btPort : ''

/** Human-readable transport for test slips, the status page and startup logs. */
const transportLabel = (role) => {
  const cfg = printers[role]
  if (cfg.transport === 'bluetooth') return cfg.btPort ? `bluetooth (${cfg.btPort})` : 'bluetooth (COM port NOT SET)'
  if (cfg.transport === 'windows-spooler') return `windows-spooler (${cfg.printerName || 'NOT SET'})`
  if (cfg.transport === 'tcp') return `tcp (${cfg.tcpTarget || 'NOT SET'})`
  return cfg.transport
}

const describePrinter = (role) => {
  const cfg = printers[role]
  const target = printerTarget(cfg)
  const base = {
    configured: cfg.transport === 'mock' ? true : cfg.transport !== 'none' && !!target,
    transport: cfg.transport,
    target,
    printerName: cfg.printerName || cfg.tcpTarget || '',
    role,
    kind: cfg.kind,
  }
  if (cfg.transport === 'bluetooth') base.btPort = cfg.btPort
  return base
}

const printersStatus = async () => {
  const out = {}
  for (const role of ['kitchen', 'admin']) {
    const cfg = printers[role]
    const base = describePrinter(role)
    if (base.transport === 'windows-spooler' && cfg.printerName) {
      const health = await checkWindowsPrinter(cfg.printerName)
      base.available = health.available
      if (health.error) base.error = health.error
    } else if (base.transport === 'bluetooth' && cfg.btPort) {
      const health = await checkBluetoothPrinter(cfg.btPort)
      base.available = health.available
      if (health.error) base.error = health.error
    } else if ((base.transport === 'tcp' && cfg.tcpTarget) || base.transport === 'mock') {
      base.available = true
    } else {
      base.available = false
      base.error =
        base.transport === 'bluetooth'
          ? `${role.toUpperCase()}_BLUETOOTH_PORT is not set — pair the PT-210 and set its COM port`
          : base.transport === 'none'
            ? 'printer not configured on this relay'
            : `${role.toUpperCase()}_PRINTER_NAME is not set — no Windows printer queue to use`
    }
    out[role] = base
  }
  return out
}

/**
 * Lightweight transport view for /status and /health — NO PowerShell probe on
 * the hot path (this endpoint is polled before every print). `available` is
 * only reported from a probe made in the last 30s; otherwise it is null
 * ("unknown") — never a fabricated true. Run GET /printers for live health.
 */
const statusPrinterView = (role) => {
  const cfg = printers[role]
  const target = printerTarget(cfg)
  const view = {
    configured: cfg.transport === 'mock' ? true : cfg.transport !== 'none' && !!target,
    transport: cfg.transport,
    target,
    available: cfg.transport === 'mock' ? true : null,
  }
  if (target) {
    const cached = printerAvailability.get(`${cfg.transport}|${target}`)
    if (cached && Date.now() - cached.checkedAt < 30_000) {
      view.available = cached.available === true
      if (cached.error) view.error = cached.error
    }
  } else if (cfg.transport === 'bluetooth') {
    view.error = `${role.toUpperCase()}_BLUETOOTH_PORT is not set`
  } else if (cfg.transport === 'none') {
    view.error = 'printer not configured on this relay'
  }
  return view
}

const authorized = (req) => !API_KEY || req.headers['x-api-key'] === API_KEY

const buildTestReceipt = (role) => {
  if (role === 'kitchen') {
    return [
      '==== KITCHEN PRINTER TEST ====',
      `RELAY TIME : ${new Date().toLocaleString()}`,
      `TRANSPORT  : ${transportLabel('kitchen')}`,
      'PT-210 #1 (KITCHEN)',
      'If you can read this on the',
      'KITCHEN printer, routing OK.',
      '------------------------------',
      'SAMPLE TOKEN 001',
      '1 x TEST ITEM',
      '',
    ]
  }
  return [
    '==== ADMIN PRINTER TEST ====',
    `RELAY TIME : ${new Date().toLocaleString()}`,
    `TRANSPORT  : ${transportLabel('admin')}`,
    'PT-210 #2 (ADMIN)',
    'If you can read this on the',
    'ADMIN printer, routing OK.',
    '------------------------------',
    'SAMPLE BILL  B-001',
    '1 x TEST ITEM         10.00',
    'TOTAL                  10.00',
    '',
  ]
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    withCors(res)
    res.writeHead(204)
    res.end()
    return
  }
  if (!authorized(req)) return json(res, 401, { ok: false, error: 'unauthorized' })

  if (req.method === 'POST' && (req.url === '/print' || req.url === '/jobs')) {
    let body = ''
    req.on('data', (c) => {
      body += c
      if (body.length > 512_000) req.destroy()
    })
    req.on('end', () => {
      try {
        const payload = JSON.parse(body)
        const result = submitJob(payload)
        if (result.error) return json(res, 400, { ok: false, error: result.error })
        pump(result.job.printer)
        json(res, 200, { ok: true, duplicate: !!result.duplicate, job: result.job, queued: queues[result.job.printer].length })
      } catch (e) {
        json(res, 400, { ok: false, error: String((e && e.message) || e) })
      }
    })
    return
  }

  if (req.method === 'POST' && req.url.startsWith('/test/')) {
    const role = req.url.slice('/test/'.length)
    if (role !== 'kitchen' && role !== 'admin') return json(res, 400, { ok: false, error: 'role must be kitchen or admin' })
    const result = submitJob({ id: `test_${role}_${Date.now()}`, kind: role === 'kitchen' ? 'token' : 'bill', printer: role, lines: buildTestReceipt(role) })
    if (result.error) return json(res, 400, { ok: false, error: result.error })
    pump(role)
    return json(res, 200, { ok: true, job: result.job })
  }

  if (req.method === 'GET' && req.url.startsWith('/jobs/')) {
    const id = decodeURIComponent(req.url.slice('/jobs/'.length))
    const job = jobLedger.get(id)
    return job ? json(res, 200, { ok: true, job: publicJob(job) }) : json(res, 404, { ok: false, error: 'job not found' })
  }
  if (req.url === '/jobs') {
    return json(res, 200, {
      ok: true,
      kitchenQueue: queues.kitchen.length,
      adminQueue: queues.admin.length,
      jobs: jobHistory.slice(0, 50).map(publicJob),
    })
  }
  if (req.url === '/printers') return printersStatus().then((p) => json(res, 200, { ok: true, printers: p }))
  if (req.url === '/status' || req.url === '/health') {
    return json(res, 200, {
      ok: true,
      kitchenPrinter: statusPrinterView('kitchen'),
      billPrinter: statusPrinterView('admin'),
      kitchenQueue: queues.kitchen.length,
      adminQueue: queues.admin.length,
    })
  }
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    const rows =
      jobHistory
        .slice(0, 25)
        .map((j) => `<details><summary><b>${j.printer.toUpperCase()}</b> ${j.id} — ${j.status} <small>${j.error || j.via || ''}</small></summary><pre>${j.lines.map((l) => String(l).replace(/</g, '&lt;')).join('\n')}</pre></details>`)
        .join('') || '<p>No jobs yet.</p>'
    res.end(`<!doctype html><html><head><meta charset="utf-8"><title>Bee's Hive Print Relay</title><meta http-equiv="refresh" content="5"></head>
<body style="font-family:monospace;max-width:720px;margin:2rem auto">
<h1>🐝 Bee's Hive — Print Relay :${PORT}</h1>
<p>Kitchen: <b>${printerTarget(printers.kitchen) || 'NOT CONFIGURED'}</b> (${transportLabel('kitchen')}) ·
   Admin: <b>${printerTarget(printers.admin) || 'NOT CONFIGURED'}</b> (${transportLabel('admin')})</p>
<p>Kitchen queue: <b>${queues.kitchen.length}</b> · Admin queue: <b>${queues.admin.length}</b></p>
<h2>Recent jobs</h2>${rows}</body></html>`)
    return
  }
  json(res, 404, { ok: false, error: 'not found' })
})

server.listen(PORT, BIND_ADDRESS, () => {
  console.log(`Bee's Hive print relay on http://${BIND_ADDRESS}:${PORT}`)
  for (const role of ['kitchen', 'admin']) {
    const cfg = printers[role]
    let target = printerTarget(cfg)
    if (!target) {
      if (cfg.transport === 'mock') target = 'MOCK (simulated)'
      else if (cfg.transport === 'bluetooth') target = `NOT SET — set ${role.toUpperCase()}_BLUETOOTH_PORT to the paired PT-210 COM port (jobs will fail explicitly)`
      else target = 'NOT CONFIGURED — jobs will fail explicitly'
    }
    console.log(`${role} printer (${cfg.transport}): ${target}`)
  }
})





module.exports = { escpos, submitJob, printers } // exported for tests
