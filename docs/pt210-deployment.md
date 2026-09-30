# PT-210 Thermal Printer Deployment Guide (Bee's Hive)

This guide is for the **non-technical restaurant operator**. It sets up the two
DIVYE PT-210 58mm thermal printers with the Bee's Hive central print relay on
the Windows computer.

| Printer | Role | Transport | Prints |
|---|---|---|---|
| PT-210 **#1** | KITCHEN | Bluetooth (production target) — or USB | Tokens / KOT / parcel tokens only |
| PT-210 **#2** | ADMIN | USB (USB-A → USB-C) | Customer bills / paid receipts only |

Production hybrid target: **Kitchen PT-210 over Bluetooth + Admin PT-210 over
USB, both on the SAME Windows laptop** — see **§13**. The classic two-USB
setup (§1–§12) keeps working unchanged.

The Windows computer is the **central print relay**. Waiter phones never talk
to a printer directly — they send jobs over Wi-Fi to this computer, which
prints them one-by-one in order. Waiter phones **never** pair with the
Kitchen Bluetooth printer; the laptop owns the single connection.

---

## 1. Windows requirements

- Windows 10 or 11 (64-bit).
- [Node.js](https://nodejs.org) LTS installed (comes with the Bee's Hive app package).
- Two free USB ports (or a powered USB hub).
- Printer and waiter phones on the **same Wi-Fi network**.

## 2. Connect the PT-210 printers

1. Load 58mm thermal paper into both printers (paper rolls **out from the top**).
2. Connect PT-210 **#2** (admin) to a USB port with the USB-A → USB-C cable.
   For the Kitchen printer either connect PT-210 **#1** to a different USB
   port (classic setup) **or** pair it with the laptop over Bluetooth
   (production hybrid target — full steps in **§13**). Note which physical
   printer is which.
3. Power both printers ON. The power LED should be solid.

## 3. Driver installation

1. Plug in the first PT-210 → Windows shows *"Setting up a device…"*.
2. If the PT-210 came with a driver CD/USB, run the installer. Most PT-210
   units are detected by Windows as a generic **58mm/POS-80/ESC-POS thermal
   printer** with no extra driver.
3. Repeat for the second printer.

## 4. Identify each PT-210 in Windows

1. Press **Start**, type **Printers & scanners**, open it.
2. You should see two new printer entries, e.g.
   `58mm Thermal Printer` / `58mm Thermal Printer (Copy 1)` or `POS-58`.
3. **Do a physical check:** click each entry → **Printing preferences** →
   **Print Test Page** — the paper comes out of the printer you are checking.
4. Note the exact name of the entry that belongs to the KITCHEN printer and
   the exact name for the ADMIN printer.

## 5. Rename the Windows printer queues (recommended)

Clear names prevent mix-ups:

1. In **Printers & scanners**, click the kitchen printer → **Remove** is NOT
   needed — instead click **Manage** → **Printer properties**.
2. On the **General** tab change the name to:

   ```
   BeeShive Kitchen PT210
   ```

3. Repeat for the admin printer → `BeeShive Admin PT210`.
4. Renaming requires administrator rights if prompted.

> The relay does **not** require these exact names — any Windows printer name
> works as long as it matches the environment variables in step 6.

## 6. Environment variables

Create the file `.env.print-relay` **in the beeshive folder** (next to
`package.json`) with these lines (adjust names to step 4/5):

```
PRINT_PORT=8787
BIND_ADDRESS=0.0.0.0
KITCHEN_PRINTER_NAME=BeeShive Kitchen PT210
ADMIN_PRINTER_NAME=BeeShive Admin PT210
PRINT_RETRY_ATTEMPTS=3
CORS_ORIGIN=*
```

| Variable | Meaning |
|---|---|
| `PRINT_PORT` | Relay web port (use the same number everywhere). |
| `BIND_ADDRESS` | `0.0.0.0` = accept jobs from waiter phones on the LAN. |
| `KITCHEN_PRINTER_NAME` | Exact Windows name of the kitchen PT-210. |
| `ADMIN_PRINTER_NAME` | Exact Windows name of the admin PT-210. |
| `PRINT_RETRY_ATTEMPTS` | Total physical attempts per job before it is FAILED (default 3; the Admin app sends its Print Retry Count setting, range 1–10). |
| `SPOOL_DRAIN_SECONDS` | After writing bytes, wait up to N seconds for the print job to leave the spool queue (proof it reached the printer). Default 20, `0` disables. |
| `API_KEY` | Optional shared secret; if set, callers must send header `X-Api-Key`. |
| `CORS_ORIGIN` | Browser origin allowed to submit jobs (`*` for a closed LAN). |

> **Hybrid Bluetooth setup** (Kitchen PT-210 over Bluetooth, Admin over USB)
> adds `KITCHEN_PRINTER_TRANSPORT`, `KITCHEN_BLUETOOTH_PORT` and
> `KITCHEN_BLUETOOTH_BAUD` — see **§13**. Existing USB-only values keep
> working unchanged; nothing here needs to be removed.

## 7. Start the relay (normal daily use)

Double-click **`start-print-relay.cmd`** (in the beeshive folder). A black
window opens showing:

```
Bee's Hive print relay on http://0.0.0.0:8787
kitchen printer (windows-spooler): BeeShive Kitchen PT210
admin printer (windows-spooler): BeeShive Admin PT210
```

Leave this window open while the restaurant is open. In the Bee's Hive admin
settings, set:

- Kitchen relay URL → `http://<this-computer-ip>:8787`
- Admin relay URL → `http://<this-computer-ip>:8787`

(Find the computer IP with `ipconfig` — e.g. `192.168.1.20`.)

## 8. Test the kitchen printer

Open a browser on the Windows computer and, with the relay window open, run in
a new terminal:

```
curl.exe -X POST http://127.0.0.1:8787/test/kitchen
```

**Paper must come out of PT-210 #1** with:

```
==== KITCHEN PRINTER TEST ====
PT-210 #1 (KITCHEN) ...
```

If nothing prints or the error says *printer not found*, re-check step 4-6
(exact name match, USB cable, power).

## 9. Test the admin printer

```
curl.exe -X POST http://127.0.0.1:8787/test/admin
```

**Paper must come out of PT-210 #2** with `==== ADMIN PRINTER TEST ====`.
Nothing may print on the kitchen printer.

## 10. Diagnosing a printer that looks offline

| Symptom | Fix |
|---|---|
| Relay says `printer not found: …` | Printer name in env file ≠ Windows name (step 4). USB cable unplugged. Printer powered off. |
| Job shows `spooler write failed` | Paper out / cover open — load paper, close cover, then press **Retry Print** in the app. |
| Jobs stuck at `PRINTING` | Close the relay window, unplug-replug the printer USB, start the relay again. |
| Waiter phones say *relay unavailable* | Relay window closed or computer asleep — restart the relay (step 11), check Wi-Fi. |
| Windows Print Queue shows stuck jobs | Open **Printers & scanners** → printer → **Open print queue** → right-click each job → **Cancel**, then retry. |
| Test page prints garbage or blank | The installed driver is a GDI/render driver, not ESC-POS raw. Install the vendor PT-210 driver in ESC/POS mode, or add the printer again on the same USB port with the **Generic / Text Only** driver and point `*_PRINTER_NAME` at that queue. |

Check relay health any time: open `http://127.0.0.1:8787/printers` in a browser
on the relay computer. `available: true` = printer visible to Windows.

## 11. Restart the relay after a Windows reboot

The relay does **not** auto-start. After every reboot:

1. Double-click **`start-print-relay.cmd`**.
2. Confirm both printer lines show your Windows printer names (not
   "NOT CONFIGURED").
3. Send one test print per printer (steps 8-9).

To make this automatic, press **Start**, type **Task Scheduler**, create a
basic task: trigger *At log on*, action *Start a program*:

```
Program:  cmd.exe
Arguments: /c start-print-relay.cmd
Start in:  <the beeshive folder path>
```

## 12. Operator quick reference

- **Token not printed?** → kitchen printer paper/Bluetooth → press **Retry Print**.
  (Bluetooth kitchen: printer ON, laptop Bluetooth ON, in range —
  `http://127.0.0.1:8787/printers` must show Kitchen `available: true`.)
- **Bill not printed?** → admin printer paper/USB → press **Retry Print**.
- **Need an extra copy?** → use **Reprint** (this intentionally prints again).
- Never point the kitchen relay URL at the admin computer or vice versa.
- Never swap the two printers to "make it work" — a Kitchen failure is
  reported honestly; fix the Kitchen link (**§13.5**), never reroute bills
  to the Admin printer (the relay never silently redirects).

## 13. Hybrid setup — Kitchen PT-210 over Bluetooth + Admin PT-210 over USB

Target physical layout — **ONE** Windows laptop is the print server for BOTH
printers:

```
                SAME WINDOWS LAPTOP
             ┌────────────────────────────┐
             │  BeeShive Print Relay      │
             │  Kitchen → Bluetooth       │
             │  Admin   → USB             │
             └──────────┬─────────────────┘
                        │
          ┌─────────────┴─────────────┐
       Bluetooth                      USB
          │                            │
          ▼                            ▼
   PT-210 #1 KITCHEN            PT-210 #2 ADMIN/BILL
```

5+ waiter phones → Wi-Fi → that same laptop. Waiter phones **never** pair
with the Kitchen printer; the laptop owns the single Bluetooth connection
and the relay serializes every Kitchen job through one queue, so concurrent
waiters can never interleave thermal output or fight over the link.

### 13.1 The two real Windows Bluetooth paths (use the one Windows gives you)

**Path A — Windows exposes the paired PT-210 as a normal printer queue.**
Pair the PT-210, confirm the queue appears in *Printers & scanners*, keep
`KITCHEN_PRINTER_NAME`. The relay writes raw ESC/POS through the Windows
spooler exactly as the USB setup does (transport stays `windows-spooler`) —
Windows itself rides that queue over Bluetooth. Nothing else changes.

**Path B — Windows exposes the PT-210 only as a Bluetooth COM port**
(Serial Port Profile; Device Manager → Ports (COM & LPT) → *Standard Serial
over Bluetooth link (COMx)*). Set in `.env.print-relay`:

```
KITCHEN_PRINTER_TRANSPORT=bluetooth
KITCHEN_BLUETOOTH_PORT=COM5
```

The relay opens that COM port with .NET `System.IO.Ports.SerialPort`
(PowerShell helper) and writes the **same** raw ESC/POS bytes — same 58mm
token/KOT/parcel/bill formatting, no changes to receipt content. Transport
shows as `bluetooth`. There is no browser printing, no simulation, no mock
and no fallback to the Admin printer: if the Bluetooth PT-210 cannot be
reached, the Kitchen job fails with a real error and the SAME job (token
number already persisted in Firebase) can be retried.

The Admin PT-210 keeps its USB-A → USB-C connection and the existing
`ADMIN_PRINTER_NAME` windows-spooler path — completely unchanged.

### 13.2 One-time pairing of the Kitchen PT-210

1. Windows → **Settings → Bluetooth & devices → Add device → Bluetooth** →
   select the PT-210 → pair (PIN `0000` or `1234` if asked).
2. Check **Device Manager → Ports (COM & LPT)** for *Standard Serial over
   Bluetooth link (COMx)* (or the device → Properties → COM Port) and note
   the COM number.
   - If instead Windows created a **printer queue** (Printers & scanners),
     use Path A (§13.1) — skip step 3 and keep `KITCHEN_PRINTER_NAME`.
3. In `.env.print-relay` add (leave the Admin lines unchanged):

   ```
   KITCHEN_PRINTER_TRANSPORT=bluetooth
   KITCHEN_BLUETOOTH_PORT=COM5
   ```

4. Restart **start-print-relay.cmd**. The console must show:

   ```
   Bee's Hive print relay on http://0.0.0.0:8787
   kitchen printer (bluetooth): COM5
   admin printer (windows-spooler): BeeShive Admin PT210
   ```

5. Health check — open `http://127.0.0.1:8787/printers`:

   ```
   kitchen: {"configured": true, "transport": "bluetooth", "available": true, ...}
   admin:   {"configured": true, "transport": "windows-spooler", "available": true, ...}
   ```

   `available: false` on Kitchen means Windows cannot reach the Bluetooth
   printer right now (not paired / powered off / laptop Bluetooth off /
   out of range / port busy) — the `error` field says which. The relay
   NEVER reports `available: true` just because it is running: it probes
   the real COM port (present + device status + openable), cached 10 s.

### 13.3 New environment variables (additive — old installs unaffected)

| Variable | Meaning |
|---|---|
| `KITCHEN_PRINTER_TRANSPORT` | Optional override: `bluetooth` / `windows-spooler` / `tcp`. Unset = auto: `KITCHEN_PRINTER_NAME` wins (original behaviour), else Bluetooth if only `KITCHEN_BLUETOOTH_PORT` is set, else legacy TCP. |
| `KITCHEN_BLUETOOTH_PORT` | Paired Bluetooth SPP COM port of the Kitchen PT-210 (e.g. `COM5`). |
| `KITCHEN_BLUETOOTH_BAUD` | Optional serial baud (default `9600`). |
| `ADMIN_PRINTER_TRANSPORT` | Same override for Admin (Bluetooth supported if ever needed; production target keeps Admin on USB). |
| `ADMIN_BLUETOOTH_PORT` / `ADMIN_BLUETOOTH_BAUD` | Same, for an Admin Bluetooth printer. |

Existing `KITCHEN_PRINTER_NAME` / `ADMIN_PRINTER_NAME` keep working exactly as
before: a **Kitchen USB + Admin USB** installation is unaffected. No old
variable was removed.

### 13.4 Failure behaviour (honest failures — never faked)

| Situation | What happens |
|---|---|
| Laptop Bluetooth off / printer off / out of range / unpaired | Kitchen job → `FAILED` with a Bluetooth-specific reason (`Kitchen Bluetooth (COM5): …`). Visible on the app's **Retry Print** error, at `http://127.0.0.1:8787/jobs`, and in the Firestore `printJobs` record. |
| Retry | The SAME job id is retried (`PRINT_RETRY_ATTEMPTS`). A retry never creates a second token — the printed token always uses the already-persisted `order.tokenNumber`. |
| Kitchen Bluetooth down, Admin USB fine | Only Kitchen jobs fail; Admin bills keep printing (independent queues, independent transports). |
| Admin USB down, Kitchen Bluetooth fine | Only Admin jobs fail, with a spooler-specific error (never mentions Bluetooth). |
| Never happens | Kitchen token silently printed on the Admin printer; browser-print fallback; fake `PRINTED`; payment marked successful because a receipt printed. |

Billing, payments, GST, bill numbers, token sequencing and Firebase
persistence are untouched by this transport change — the relay only receives
already-formatted 58mm lines and writes them to the configured physical
transport. Firebase remains the production source of truth; the Bluetooth
COM connection is operational runtime state only, never a business database.

### 13.5 Bluetooth troubleshooting

| Symptom | Fix |
|---|---|
| `Bluetooth printer not connected: port COMx is not present` | Re-pair the PT-210, keep laptop Bluetooth ON, and make `KITCHEN_BLUETOOTH_PORT` match Device Manager. |
| `reports status … (powered off, out of range, or laptop Bluetooth disabled)` | Power the printer on / move it closer, then press **Retry Print**. |
| `/printers` kitchen shows `available: false` | The `error` field names the cause — fix it and re-check (results refresh every 10 s). |
| Prints once, then fails | Another app opened the COM port (vendor utility, second relay instance) — close it. |
| Windows reassigned the COM port after re-pairing | Update `KITCHEN_BLUETOOTH_PORT` and restart the relay. |
| Kitchen jobs fail but `/test/admin` works | Expected: transports are independent — fix the Kitchen Bluetooth link (§13.2); never repoint Kitchen at the Admin printer. |

The full physical acceptance procedure (both printers, FIFO, disconnect /
reconnect, multi-waiter) is **Appendix C** — Bluetooth must not be signed
off until it passes on real hardware.

---

## Appendix — developer test commands

```bash
# automated relay tests (no physical printers needed)
set PRINT_MOCK=1 & set PRINT_PORT=8787
node scripts/print-server.cjs
node scripts/relay-concurrency-test.cjs

# hybrid transport test — Kitchen bluetooth + Admin windows-spooler honesty,
# duplicate/FIFO/same-id-retry, backward-compat USB env (no hardware touched)
node scripts/relay-transport-test.cjs

# health / printer status
curl http://127.0.0.1:8787/health
curl http://127.0.0.1:8787/printers
```

---

## Appendix B — DEPLOYMENT-DAY HARDWARE TEST PROCEDURE (mandatory)

The software side is fully verified in mock mode and against the Windows
spooler error paths. The ONLY unverified link is the physical PT-210
hardware. Perform this on deployment day, in order, and do not open the
restaurant until every check passes.

**Setup (one-time, ~15 minutes)**

1. Connect PT-210 #1 (kitchen) and PT-210 #2 (admin) by USB, power both on,
   load 58mm thermal paper (roll feeds from the top).
2. `Start → Printers & scanners` — confirm two new printer entries appear.
3. Identify which entry is which: click each printer → `Print Test Page` →
   note which physical printer produced the page.
4. Rename the queues: `BeeShive Kitchen PT210` and `BeeShive Admin PT210`
   (printer properties → General tab).
5. Create `.env.print-relay` in the beeshive folder:
   ```
   PRINT_PORT=8787
   KITCHEN_PRINTER_NAME=BeeShive Kitchen PT210
   ADMIN_PRINTER_NAME=BeeShive Admin PT210
   ```
6. Start `start-print-relay.cmd` — both lines must show the printer names in
   parentheses as `windows-spooler` (never `NOT CONFIGURED`).
7. Health check — in a browser on the relay PC open:
   `http://127.0.0.1:8787/printers`
   → both roles must show `"configured": true, "available": true, "transport": "windows-spooler"`.

**Check 1 — kitchen physical print (PT-210 #1)**

```
curl.exe -X POST http://127.0.0.1:8787/test/kitchen
```
→ Paper MUST come out of PT-210 #1 with `==== KITCHEN PRINTER TEST ====`.
→ PT-210 #2 must print NOTHING.
→ If garbage/blank: fix the driver (see §10) and repeat.
→ If FAILED: `curl.exe http://127.0.0.1:8787/jobs` shows the exact reason.

**Check 2 — admin physical print (PT-210 #2)**

```
curl.exe -X POST http://127.0.0.1:8787/test/admin
```
→ Paper MUST come out of PT-210 #2 only.

**Check 3 — FIFO serialization under load (kitchen)**

Run three rapid kitchen jobs from three different waiter phones (or repeat
the curl command three times quickly):
```
curl.exe -X POST http://127.0.0.1:8787/test/kitchen
curl.exe -X POST http://127.0.0.1:8787/test/kitchen
curl.exe -X POST http://127.0.0.1:8787/test/kitchen
```
→ PT-210 #1 must print three receipts, top to bottom, strictly in submit
order (compare the RELAY TIME line on each). One at a time, never interleaved.

**Check 4 — routing isolation**

Create one real order from a waiter phone AND one real bill from Admin.
→ The token prints on PT-210 #1 only; the bill prints on PT-210 #2 only.

**Check 5 — duplicate protection**

```
curl.exe -X POST http://127.0.0.1:8787/print -H "Content-Type: application/json" -d "{\"id\":\"dupe_check_1\",\"kind\":\"token\",\"printer\":\"kitchen\",\"lines\":[\"DUPLICATE CHECK\"]}"
curl.exe -X POST http://127.0.0.1:8787/print -H "Content-Type: application/json" -d "{\"id\":\"dupe_check_1\",\"kind\":\"token\",\"printer\":\"kitchen\",\"lines\":[\"DUPLICATE CHECK\"]}"
```
→ The FIRST call queues and prints one receipt. The SECOND call (same job id)
must respond `"duplicate": true` and NO second receipt may come out.
Then use the app's **Reprint** button on a printed bill — exactly one extra
receipt MUST print (an explicit reprint is an intentional new job).

**Check 6 — disconnect failure (honest failure semantics)**

With Check 1 passing, unplug PT-210 #1's USB cable, then run the kitchen
test curl again.
→ The job must report FAILED (status visible at `http://127.0.0.1:8787/jobs`)
with a printer-offline/not-found reason — never PRINTED.
→ Reconnect the USB, wait 5 seconds, retry — it must print again.
Note: some drivers keep accepting spool jobs even when the device is gone.
The relay's post-write drain check (`SPOOL_DRAIN_SECONDS`, default 20) detects
this for any driver that exposes spool jobs. If the real PT-210 driver still
reports PRINTED while disconnected, switch that queue to the
**Generic / Text Only** driver (same USB port) — it exposes jobs, letting the
drain check catch the disconnect — and record the result here.

**Check 7 — end-of-test state**

```
curl.exe -X POST http://127.0.0.1:8787/test/kitchen
curl.exe -X POST http://127.0.0.1:8787/test/admin
```
→ Both printers produce their test receipts one final time. Restaurant may open.

---

## Appendix C — HYBRID USB + BLUETOOTH PHYSICAL TEST (mandatory before sign-off)

Software/build/TypeScript tests alone do **NOT** prove Bluetooth works. Run
this on the deployment laptop with both real PT-210s. **Do not mark
Bluetooth verification complete until every step passes on hardware.**

1. Pair Kitchen PT-210 with the Windows laptop (§13.2 steps 1–2).
2. Verify Windows recognises the Bluetooth connection (Device Manager COM
   port exists, or a Windows printer queue exists — Path A).
3. Start the relay → `http://127.0.0.1:8787/printers` shows Kitchen
   `transport: "bluetooth"` (`"windows-spooler"` on Path A) and
   `available: true`.
4. Connect Admin PT-210 to the SAME laptop using USB-A → USB-C; power on.
5. Verify `/printers` shows BOTH roles `configured: true, available: true`
   with their own transports (Kitchen bluetooth / Admin windows-spooler).
6. `curl.exe -X POST http://127.0.0.1:8787/test/kitchen`
   → ONLY PT-210 #1 prints; the slip's `TRANSPORT` line shows the real path.
7. `curl.exe -X POST http://127.0.0.1:8787/test/admin`
   → ONLY PT-210 #2 prints; PT-210 #1 prints NOTHING.
8. Send 3+ Kitchen jobs rapidly (three test curls back-to-back).
   → They print strictly in submit order, one at a time, never interleaved.
9. Send Kitchen and Admin jobs close together.
   → Each reaches the correct physical printer (routing isolation).
10. Real order from a waiter phone + real bill from Admin → token only on
    PT-210 #1, bill only on PT-210 #2.
11. Disable laptop Bluetooth (or power off the Kitchen printer).
12. Send a Kitchen job → it must report FAILED/retryable with a Bluetooth
    reason at `http://127.0.0.1:8787/jobs` — never PRINTED, never on the
    Admin printer, never a browser print dialog.
13. Re-enable Bluetooth / power the printer back on.
14. Retry the SAME job from the app → it prints; the token number is
    IDENTICAL (no second token — Firestore `printJobs` shows one job id).
15. Kill and restart the relay → both transports recover; `/printers`
    healthy again; no duplicate jobs replayed.
16. Restart Windows → start the relay → repeat checks 6 and 7.
17. Run the automated suites:
    ```
    node scripts/relay-transport-test.cjs      (hybrid transport honesty)
    node scripts/relay-concurrency-test.cjs    (FIFO/duplicates, PRINT_MOCK=1 relay)
    ```
18. Multi-waiter load: 5 phones place orders rapidly → all Kitchen tokens
    print in order, none lost, none interleaved; Admin bills unaffected.
19. Paper-out / cover-open on Kitchen → FAILED with a real reason; **Retry
    Print** after reloading paper reprints the SAME token.
20. Record results here: ______________ (date / initials)

Physical Bluetooth verification status: **NOT YET PERFORMED** — must be
completed on the deployment laptop with the real PT-210 hardware before the
hybrid setup is considered done.



