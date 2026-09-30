<div align="center">

# UNIPAY

### Your Campus. Your Wallet. One Tap.

A closed-loop campus payment system — prepaid student wallets, QR-based
checkout, and centralised merchant settlement.

**⚠️ HACKATHON PROTOTYPE · ALL MONEY IS SIMULATED · NO REAL PAYMENT RAIL IS EVER CONTACTED**

</div>

---

## Quick start

```bash
npm run install:all     # install backend + frontend dependencies
npm run dev             # start backend (:5000) and frontend (:5173) together
```

Open **http://localhost:5173** and log in with the demo accounts below.

| Role | Email | Password |
|---|---|---|
| Student | `devansh@unipay.demo` | `123456` |
| Merchant | `canteen@unipay.demo` | `123456` |
| Admin | `admin@unipay.demo` | `admin123` |

All ten other seeded students and five other merchants use `123456` too.

---

## Table of contents

1. [The problem](#1-the-problem)
2. [The solution](#2-the-solution)
3. [Architecture](#3-architecture)
4. [Tech stack](#4-tech-stack)
5. [Running locally](#5-running-locally)
6. [Connecting Android phones over LAN](#6-connecting-android-phones-over-lan)
7. [The camera and HTTPS — read this before demoing](#7-the-camera-and-https--read-this-before-demoing)
8. [How the QR system works](#8-how-the-qr-system-works)
9. [How the simulated payment gateway works](#9-how-the-simulated-payment-gateway-works)
10. [How merchant settlement works](#10-how-merchant-settlement-works)
11. [How real-time events work](#11-how-real-time-events-work)
12. [How JSON persistence works](#12-how-json-persistence-works)
13. [How the offline demo works](#13-how-the-offline-demo-works)
14. [The 3-device demo script](#14-the-3-device-demo-script)
15. [Resetting demo data](#15-resetting-demo-data)
16. [API reference](#16-api-reference)
17. [Testing](#17-testing)
18. [Deploying to Render](#18-deploying-to-render)
19. [Limitations](#19-limitations)
20. [Production roadmap](#20-production-roadmap)

---

## 1. The problem

A student queues at the campus canteen for a ₹40 samosa. They open a UPI app.
The campus Wi-Fi is congested and the mobile signal inside a concrete academic
block is weak. The payment spins, then fails. They retry. The queue behind them
grows.

The transaction is tiny, but it depends on a round trip to a bank server
somewhere else in the country. **Every ₹40 purchase is being settled across
national payment infrastructure**, and the weakest link is the last 50 metres of
network between the phone and the campus gateway.

## 2. The solution

Take the money movement off the public rails and keep it inside the university —
the same model a metro card uses.

1. A student loads money into a **UniPay campus wallet** (one gateway
   interaction, done in advance, from anywhere with a decent signal).
2. Their **university ID card identifies the wallet**. In this prototype the
   card is represented by its QR code.
3. At the counter the shopkeeper **scans the student's QR** and enters an amount.
4. The student's wallet is debited and the merchant receives a **receivable** —
   a claim on the university, not a bank transfer.
5. The university **settles the merchant's accumulated receivable** later, in one
   batch, over a single connection.

The counter transaction is now a request to a server on the campus network. One
hop, no bank in the loop, and hundreds of small purchases collapse into a handful
of daily settlements.

## 3. Architecture

```
  DEVICE 1                    DEVICE 3 (laptop)                DEVICE 2
  Student phone               CENTRAL UNIVERSITY SERVER        Shopkeeper phone
  -------------               -------------------------        ----------------

  React (mobile)                 +------------------+         React (mobile)
  |- Wallet balance              |  Express + REST  |         |- QR camera scan
  |- ID QR code      --HTTP-->   |                  |   <---- |- Amount entry
  |- Simulated       <-socket-   |  +------------+  |  socket |- Receivables
  |  gateway                     |  |   LEDGER   |  |         |- Offline queue
  |- Transactions                |  |  SERVICE   |  |
                                 |  +-----+------+  |
                                 |        |         |
                                 |  +-----v------+  |
                                 |  | JSON files |  |
                                 |  | server/data|  |
                                 |  +------------+  |
                                 |                  |
                                 |  +------------+  |
                                 |  | Socket.IO  |  |
                                 |  +-----+------+  |
                                 +--------|---------+
                                          |
                                 +--------v---------+
                                 |  ADMIN DASHBOARD |
                                 |  Live activity   |
                                 |  Analytics       |
                                 |  TO BE PAID      |
                                 +------------------+
```

**Every financial decision happens on the server.** The phones render state and
collect input; they never compute a balance. A client-supplied balance is never
trusted, and the amount is re-validated and the balance re-checked inside a lock
before any debit.

### Project layout

```
unipay/
├── server/
│   ├── data/                    ← JSON "database" + seed definition
│   ├── routes/                  ← auth, students, merchants, payments, admin
│   ├── services/
│   │   ├── ledgerService.js     ← ★ every rupee moves through here
│   │   ├── analyticsService.js  ← dashboard numbers, derived on read
│   │   ├── authService.js       ← bcrypt signup/login
│   │   ├── sessionService.js    ← bearer tokens
│   │   ├── eventService.js      ← activity feed persistence
│   │   └── seedService.js       ← seed + demo reset
│   ├── socket/realtime.js       ← Socket.IO rooms and emission
│   ├── utils/                   ← jsonDb, money, ids, qr, validate
│   ├── tests/flow.test.js       ← 25 end-to-end money-path tests
│   └── server.js                ← entry point, prints LAN URLs
├── client/
│   └── src/
│       ├── pages/student/        ← wallet, QR, PaymentGateway
│       ├── pages/merchant/       ← POS, ChargeFlow (camera scan)
│       ├── pages/admin/          ← control centre, LiveActivityFeed, payouts
│       ├── components/           ← QrCode, QrScanner, Modal, charts, brand
│       ├── context/              ← auth, toasts
│       ├── hooks/                ← useConnection, useOfflineQueue
│       └── services/             ← api.js, socket.js
├── render.yaml
└── README.md
```

## 4. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React 18 + Vite | Fast HMR; mobile-first SPA |
| Styling | Tailwind CSS | Custom fintech design tokens, no CRUD look |
| Backend | Node.js + Express | Minimal, no build step |
| Storage | **JSON files** | Explicit requirement; zero external dependency |
| Real-time | **Socket.IO** | Rooms per role, automatic reconnect, polling fallback |
| QR generation | `qrcode` | Canvas rendering on the student's screen |
| QR scanning | `html5-qrcode` | Browser camera, no native app needed |
| Passwords | `bcryptjs` | Hashed at rest — never plaintext |

**Not used, by design:** MongoDB, PostgreSQL, MySQL, Supabase, Firebase, any
cloud database, Razorpay, Stripe, or any real payment or banking API.

## 5. Running locally

### Install

```bash
npm run install:all
```

### Both servers at once (recommended)

```bash
npm run dev
```

### Or separately, in two terminals

```bash
npm run server     # Express + Socket.IO on 0.0.0.0:5000
npm run client     # Vite on 0.0.0.0:5173
```

### Single-origin production mode

Build the client and let Express serve it — one port, no proxy, no CORS:

```bash
npm run build
npm start          # everything on http://localhost:5000
```

### Changing the port

```powershell
$env:PORT=5050; npm run server      # PowerShell
```
```bash
PORT=5050 npm run server            # bash
```

### ⚠️ If the project lives in OneDrive / Dropbox / Google Drive

`writeData` saves to a temp file and renames it over the target, which is what
makes a write atomic. A sync client holds transient handles on files it is
uploading, and Windows then fails that rename with `EPERM` — which surfaced as a
**500 on a payment**, so money never moved and the admin dashboard never showed
the transaction.

[jsonDb.js](server/utils/jsonDb.js) now retries the rename (25→400 ms backoff)
and falls back to an in-place write, so this is handled. But sync clients also
slow every write down and can revert files under you. **If you see
`atomic rename kept failing` in the server log**, do one of:

```powershell
# Option A — keep the data outside the synced folder (recommended)
$env:UNIPAY_DATA_DIR="C:\unipay-data"; npm start
```

Option B — move the whole project somewhere unsynced, e.g. `C:\dev\unipay`.

Option C — pause OneDrive sync for the duration of the demo.

This does not affect Render, where there is no sync client.

## 6. Connecting Android phones over LAN

**Step 1 — put all three devices on the same network.** One Wi-Fi network, or
the laptop's mobile hotspot. Campus Wi-Fi with client isolation enabled will
block phone↔laptop traffic; if the phones cannot reach the laptop, tether from a
phone and connect the laptop to that instead.

**Step 2 — find the laptop's IPv4 address.**

Windows:
```powershell
ipconfig
```
Look for `IPv4 Address` under your active adapter, e.g. `192.168.1.100`.

macOS / Linux:
```bash
ifconfig | grep "inet "        # or: ip addr
```

**You don't actually have to do this** — `npm run server` prints every reachable
URL at boot:

```
  Open on phones (same Wi-Fi):
    http://192.168.1.100:5000   (Wi-Fi)
```

**Step 3 — allow the port through the firewall.** On the first run Windows will
prompt; click **Allow access** (private networks). If you dismissed it:

```powershell
New-NetFirewallRule -DisplayName "UniPay" -Direction Inbound -LocalPort 5000,5173 -Protocol TCP -Action Allow
```

**Step 4 — open UniPay on each phone.**

The simplest setup is production mode, because everything is on one port:

```bash
npm run build && npm start
```

Then on both phones open `http://<LAPTOP_IP>:5000`.

If you prefer the dev server with hot reload, use `http://<LAPTOP_IP>:5173`.
Vite is already configured with `host: '0.0.0.0'` and proxies `/api` and
`/socket.io` through to port 5000, so **no `.env` file is needed**.

Only set `VITE_API_URL` if you want the phone's browser to call the backend at a
different address than the one that served the page:

```bash
# client/.env
VITE_API_URL=http://192.168.1.100:5000
```

**Step 5 — pick a role on each device.** Student phone → Student. Shopkeeper
phone → Merchant. Laptop → Admin.

## 7. The camera — read this before demoing

### Easiest path: use the Render URL

**Deploy to Render and open that `https://…` URL on both phones.** Real TLS means
the camera just works — no flags, no tunnel, nothing to configure. This is the
recommended setup for a presentation; see [§18](#18-deploying-to-render).

### If the camera fails even on HTTPS

The scanner names the specific cause instead of failing generically, and offers
**Try again** for everything recoverable:

| What you see | Cause | Fix |
|---|---|---|
| *Camera permission denied* | You (or an earlier visit) tapped **Block** | Tap the lock / ⓘ icon by the address bar → Permissions → allow Camera → **Try again** |
| *Camera is in use* | Another app or tab holds the camera | Close it → **Try again** |
| *Camera blocked in this frame* | Page is inside an iframe without `allow="camera"` | Open the URL in its own tab |
| *Camera not available* | Opened in an in-app browser (Instagram, LinkedIn, a QR app) | Tap ⋯ → **Open in browser** |
| *No usable camera* | The requested device would not open | Tap the flip-camera button, or use manual entry |

> **The most common cause by far:** tapping **Block** on the permission prompt
> once. Android remembers that choice for the site and never asks again, so it
> looks exactly like a broken camera. Clear it through the lock icon.

### If you are demoing over LAN instead of Render

**Browsers only expose the camera in a secure context.** `https://` and
`localhost` qualify; a plain `http://192.168.1.100:5000` **does not**. That is a
browser rule, not a UniPay limitation — the scanner will say *"Camera needs a
secure connection"* on a raw LAN IP. Pick one:

**Option A — Chrome flag on the shopkeeper's phone (fastest, ~30 seconds)**

1. Open `chrome://flags` on the phone.
2. Search for **"Insecure origins treated as secure"**.
3. Add `http://192.168.1.100:5000` (your laptop's actual address).
4. Set the dropdown to **Enabled** and tap **Relaunch**.

The camera now works on that origin. This only affects that phone.

**Option B — an HTTPS tunnel (works on any device, no flags)**

```bash
npx localtunnel --port 5000
# or
npx cloudflared tunnel --url http://localhost:5000
```

Open the printed `https://…` URL on both phones. Real TLS, camera works
everywhere. Needs an internet connection.

**Option C — manual ID entry (guaranteed fallback)**

Every scanner screen has a *"Camera not working? Enter ID manually"* link. Type
`24SCSE1010531` and the flow continues exactly as if it had been scanned. Keep this
in your back pocket — it means a blocked camera can never end your presentation.

> **Recommendation:** do Option A on the shopkeeper's phone before you present,
> and verify the camera opens once. It takes half a minute and removes the only
> environment-dependent risk in the whole demo.

## 8. How the QR system works

A student's QR contains **an identifier and nothing else**:

```json
{ "type": "UNIPAY_STUDENT", "studentId": "24SCSE1010531", "v": 1 }
```

The compact form `UNIPAY:24SCSE1010531` is also accepted, so a printed card or a
hand-made QR still scans.

**The balance is deliberately not in the QR.** This is the single most important
design decision in the QR layer:

- A QR is static. A balance is not. Anything encoded in the QR is stale the
  moment the student spends money.
- A QR can be photographed and shared. If it asserted a balance, that screenshot
  would be a forgeable claim about money.
- The merchant's terminal must get the balance from the server anyway to know
  the payment can succeed.

So the flow is: **scan → resolve identifier against the server → server returns
the live balance → charge.** `POST /api/payments/resolve-qr` does the lookup, and
the balance the shopkeeper sees is read from storage at that instant.

## 8a. Student PIN authorisation

**Identifying a wallet is not the same as being allowed to debit it.**

Without an approval step, a merchant who simply knows a student's admission
number could type it into manual entry and charge them — no QR, no consent. The
QR proves *which* wallet; it does not prove *the owner agreed*.

So the charge flow requires the student to approve the specific amount:

```
scan → student found → enter amount → confirm → STUDENT PIN → charge
```

The PIN screen restates who is being charged, how much, and by which shop, then
asks for a 4-digit PIN on a large keypad meant to be handed across the counter.
Three wrong attempts decline the payment outright.

**Demo PIN: `2005`**

### What this does and does not prove

| | |
|---|---|
| ✅ Demonstrates the authorisation step in the payment flow | |
| ✅ Blocks the "merchant types an admission number by hand" hole in the UI | |
| ❌ **The PIN is a single shared demo value checked in the browser** | Anyone with devtools can bypass it |
| ❌ The student types their secret on **the merchant's device** | Real PIN-on-glass needs certified hardware |
| ❌ No rate limiting or wallet lockout that survives a page reload | |

A production wallet would verify a **per-student** PIN **server-side** against a
bcrypt/argon2 hash, rate-limit attempts, lock the wallet after repeated
failures, and — better still — have the student approve on **their own device**
via a push prompt or rotating token, so the secret never touches hardware the
merchant controls. That is how UPI actually works.

### Optional server-side enforcement

By default the API accepts a charge without a PIN, because the PIN is a UI step.
To also enforce it at the API level (so a crafted request cannot skip the
student's approval):

```bash
REQUIRE_WALLET_PIN=true npm start
```
```powershell
$env:REQUIRE_WALLET_PIN="true"; npm start    # PowerShell
```

The client already sends the PIN with every charge, so no front-end change is
needed. With the flag on:

| Request | Result |
|---|---|
| No `pin` field | `400 PIN_REQUIRED` — *"Student PIN is required to authorise this payment."* |
| `pin: "1234"` | `400 PIN_INCORRECT` — *"Incorrect wallet PIN."* |
| `pin: "2005"` | `201` — charge proceeds |

Override the value with `DEMO_WALLET_PIN=1234`. This is still one shared PIN, not
a per-student secret — it closes the API hole for the demo without pretending to
be real wallet security.

## 9. How the simulated payment gateway works

When a student adds money, the UI walks a realistic checkout:

```
Enter ₹500 → PROCEED TO PAYMENT → choose UPI / Card / Net Banking → PAY ₹500
   → "Connecting to payment gateway…"
   → "Processing payment…"
   → "Confirming with UniPay…"
   → ✓ PAYMENT SUCCESSFUL   Payment ID: UPI-SIM-829173
```

**Nothing external is contacted.** The staged animation runs on the client while
a single request goes to our own Express server. The credit only becomes real
when `POST /api/payments/topup` writes the ledger row and the new balance.

The payment reference always carries `SIM` (`UPI-SIM-829173`,
`CARD-SIM-104773`) so it is obvious in any screenshot, log line or database row
that no real rail was involved. Every gateway surface also shows a **SIMULATED**
badge, and the whole app carries a persistent **DEMO MODE** chip.

Each attempt generates a fresh idempotency key, so a double-tap on **PAY**
cannot credit the wallet twice — the second request is rejected with
*"Transaction already processed."*

## 10. How merchant settlement works

A payment does **not** pay the merchant. It creates a claim.

```
Student pays ₹150 at Canteen Shop #1
├─ Student wallet:        ₹1,500 → ₹1,350
├─ Merchant receivable:   ₹0     → ₹150      ← a claim, not cash
└─ Transaction:           settlementStatus = PENDING
```

The admin dashboard's **TO BE PAID** section lists every merchant with a non-zero
receivable. Clicking **PAY NOW** opens the settlement confirmation, runs a
*simulated bank transfer*, and then:

```
├─ All that merchant's PENDING transactions → SETTLED (stamped with the settlement id)
├─ Merchant receivable:   ₹150 → ₹0
├─ Settlement record:     STL-00007, PAYOUT-SIM-482913, COMPLETED
└─ Merchant's phone:      "Payout received" arrives live
```

The payout amount is **derived from the pending transactions inside the lock**,
not from the stored counter. A charge landing mid-settlement is either fully
included or left for the next batch — never half-counted. The test suite asserts
the invariant `merchant.pendingReceivable === sum(pending transactions)` holds
after every operation.

## 11. How real-time events work

Socket.IO, with one room per participant:

| Room | Who joins | Receives |
|---|---|---|
| `admin` | Every admin dashboard | **Everything** |
| `student:<id>` | That student's devices | Their wallet + transactions |
| `merchant:<id>` | That merchant's devices | Their payments + receivable + payouts |

Clients send `subscribe` after connecting, and re-send it automatically on every
reconnect — so a phone that loses Wi-Fi rejoins its rooms without a reload.

### Events

| Event | Emitted when | Admin | Student | Merchant |
|---|---|---|---|---|
| `payment:topup` | Wallet top-up succeeds | ✅ | ✅ | |
| `payment:studentCharged` | Merchant charges a student | ✅ | ✅ | ✅ |
| `wallet:updated` | Any balance change | ✅ | ✅ | ✅ |
| `merchant:receivableUpdated` | Receivable rises or is settled | ✅ | | ✅ |
| `merchant:payout` | Settlement completes | ✅ | | ✅ |
| `transaction:new` | Any new ledger row | ✅ | ✅ | ✅ |
| `sync:completed` | Offline queue synced | ✅ | | ✅ |
| `demo:reset` | Admin resets the demo | broadcast to all | | |

The admin dashboard prepends the event to its live feed **immediately** for
instant feedback, then runs a debounced refetch (350 ms) to reconcile every
number against the server. Ten rapid events cause one round trip, not ten — and
because the numbers come from a refetch rather than client-side arithmetic, the
dashboard can never drift from the ledger.

Socket.IO is configured with `['polling', 'websocket']` in that order. Some
campus networks and Android browsers refuse a cold websocket handshake; starting
on polling and upgrading is slower by a few hundred milliseconds and far more
reliable, which is the right trade for a live demo.

## 12. How JSON persistence works

`server/utils/jsonDb.js` is the entire storage layer.

```js
readData(file)                    // cached read
writeData(file, data)             // atomic-ish write
updateData(file, mutator)         // serialised read-modify-write
updateMany([files], mutator)      // one lock across several files
```

**Files**

| File | Contents |
|---|---|
| `students.json` | Wallets, bcrypt hashes, QR identifiers |
| `merchants.json` | Shops, `pendingReceivable`, `lifetimeSettled` |
| `admins.json` | Admin accounts |
| `transactions.json` | Student→merchant payments + settlement status |
| `walletTransactions.json` | Top-ups with simulated payment references |
| `settlements.json` | Completed payout batches |
| `paymentEvents.json` | Activity feed (capped at 300 rows) |
| `counters.json` | Monotonic sequences for TXN/WTX/STL/EVT ids |

**Three things make this safe enough to demo:**

1. **Atomic writes.** Data is written to `<file>.tmp` and then renamed over the
   target. A crash mid-write leaves the previous good file intact.

2. **Per-file mutation locks.** `updateData` chains every write to a file through
   a promise queue, so two concurrent charges against the same student cannot
   interleave their read-modify-write. This is the closest thing to a transaction
   here, and it is what keeps balances honest. The test suite fires ten
   concurrent ₹200 charges at a ₹1,350 balance and asserts the balance never goes
   negative and exactly six succeed.

3. **Combined multi-file locks.** A charge touches students, merchants and
   transactions. `updateMany` takes one lock across all three in a deterministic
   (sorted) order, so the student debit, the merchant credit and the ledger row
   either all land or none do — and two concurrent multi-file writes can never
   deadlock.

A corrupted file is moved aside and rebuilt rather than crashing every request.

**This is not a database.** See [Limitations](#19-limitations).

## 13. How the offline demo works

> **This is a prototype simulation of offline reconciliation. It does not provide
> production-grade offline monetary security.** The specific reasons are below —
> please read them before describing this as an offline payment system.

The merchant POS has an **🟢 ONLINE / 🔴 OFFLINE DEMO** toggle. In offline mode:

1. A charge is written to the phone's `localStorage` with a client-generated key,
   status **PENDING SYNC**. Nothing is sent to the server.
2. The queue is visible on the dashboard with a running total.
3. Tapping **RESTORE CONNECTION** replays the queue to `POST /api/sync`.
4. The server processes each item, re-checking balances, and reports per-item
   results: `SYNCED`, `ALREADY_SYNCED`, or `FAILED`.
5. The admin dashboard shows the synced transactions appear, tagged
   **offline sync**.

**What works well:** the client-generated key makes replay idempotent, so a
sync that fails halfway can be retried safely — the already-applied items come
back `ALREADY_SYNCED` rather than charging twice. A per-item failure does not
discard the rest of the batch.

**What this cannot do, and why it matters:**

- **The terminal cannot verify the balance.** The server re-checks at sync time,
  so a queued payment **can be rejected after the student has walked away with
  the food**. The UI surfaces these rejections honestly rather than hiding them.
- **No double-spend protection across terminals.** Two offline terminals cannot
  see each other, so the same balance could be committed twice.
- **`localStorage` is not tamper-resistant.** The user can read, edit or clear it.

Real offline stored value requires the balance to live on a **signed,
tamper-resistant credential** — the secure element of an NFC card — so the
terminal can cryptographically verify and decrement it without a server. That is
genuinely different infrastructure, not a software change.

## 14. The 3-device demo script

**Before you start:**

1. **Open the Render URL on both phones** (recommended — HTTPS, so the camera
   works with no setup). Demoing over LAN instead? Do
   [Option A in §7](#7-the-camera--read-this-before-demoing) on the shopkeeper's
   phone first.
2. **Test the camera once** on the shopkeeper's phone and tap **Allow** on the
   permission prompt. Do this before you present, not in front of judges.
3. **Open the admin dashboard on the laptop** and leave it visible throughout —
   it is the thing judges should be watching.

| # | Device | Action | What to point at |
|---|---|---|---|
| **1** | Student phone | Log in as `devansh@unipay.demo` | Wallet shows **₹1,000.00**, UniPay ID `24SCSE1010531` |
| **2** | Student phone | **ADD MONEY** → `500` → **PROCEED TO PAYMENT** → **UPI** → **PAY ₹500** | Gateway stages, then ✓ with `UPI-SIM-…`. Balance → **₹1,500** |
| **3** | **Laptop** | *Do not touch it* | **LIVE ACTIVITY** shows *PAYMENT RECEIVED · Devansh · ₹500* the instant the phone confirms. Total Wallet Balance ticks up. **No refresh.** |
| **4** | Student phone | **SHOW MY QR** | Large QR. Say: *this contains only the student ID — never the balance* |
| **5** | Shopkeeper phone | Log in as `canteen@unipay.demo` → **SCAN STUDENT** → scan the QR | *STUDENT FOUND · Devansh Ojha · Balance ₹1,500* — read live from the server |
| **6** | Shopkeeper phone | Enter `150` → **CHARGE STUDENT** → **CONTINUE TO PIN** | Say: *scanning proves which wallet — it does not prove the student agreed. Otherwise any shop that knew an admission number could charge anyone.* |
| **6b** | **Hand the phone to the "student"** | Enter PIN `2005` | ✓ PAYMENT SUCCESSFUL, `TXN-…`, student balance ₹1,350. *(Optional: enter a wrong PIN first — three failures decline the payment outright and no money moves.)* |
| **7** | Student phone + laptop | Look at both | Student wallet → **₹1,350** with no interaction. Laptop live feed shows *Devansh → Canteen #1 · ₹150*. Merchant receivable → **₹150** |
| **8** | **Laptop** | **TO BE PAID** | *Canteen Shop #1 · ₹150 · [PAY NOW]*. Say: *the shop was never paid directly — it holds a claim on the university* |
| **9** | **Laptop** | **PAY NOW** → **CONFIRM PAYOUT** | Simulated bank transfer stages → ✓ PAYOUT SUCCESSFUL. Receivable → **₹0**, status **SETTLED**. Shopkeeper's phone shows *Payout received* |
| **10** | Shopkeeper phone | Tap **🟢 ONLINE** → it becomes **🔴 OFFLINE DEMO** | The network-loss scenario the whole project is about |
| **11** | Shopkeeper phone | **SCAN STUDENT** → scan → enter `60` → **QUEUE PAYMENT** | *PAYMENT QUEUED · PENDING SYNC*. Laptop shows **nothing** — correct, the server has not heard about it |
| **12** | Shopkeeper phone | Tap **🔴 OFFLINE DEMO** → **RESTORE CONNECTION** | *Syncing…* → ✓ **1 synced**. Laptop live feed shows *OFFLINE PAYMENT SYNCED*, tagged **offline** |

**The line that lands:** *"The laptop is the university's payment system. Watch
it — I'm not going to touch it."* Then do the top-up on the phone and let the
dashboard react on its own.

If you need to run the demo again, use **RESET DEMO** (see below).

## 15. Resetting demo data

**From the admin dashboard (during a demo):** sidebar → **Reset demo** → confirm.

**From the command line:**
```bash
npm run reset
```

Either way you get back:

- Devansh's wallet at **₹1,000.00**
- Canteen Shop #1 receivable at **₹0** (so the first live charge is the only one)
- Other merchants holding realistic receivables, so **TO BE PAID** is never empty
- 12 students, 6 merchants, ~68 transactions, 6 settlements
- Accounts created during the demo removed

Reset also **clears all sessions**, so every device must log in again. That is
deliberate: the underlying records are replaced, and a stale token pointing at a
rebuilt account would show inconsistent state.

## 16. API reference

All money endpoints require `Authorization: Bearer <token>` from a login
response. Errors return `{ ok: false, message, code }` with the user-facing
message from the [error states](#error-states) table.

### Auth
```
POST   /api/auth/student/signup      { name, email, studentId, password, course?, year? }
POST   /api/auth/student/login       { email, password }
POST   /api/auth/merchant/signup     { ownerName, shopName, email, merchantId, password, category?, location? }
POST   /api/auth/merchant/login      { email, password }
POST   /api/auth/admin/login         { email, password }
GET    /api/auth/me                  → validates a stored token on app boot
POST   /api/auth/logout
```

### Student
```
GET    /api/students/:id                  wallet + merged ledger        [student|admin]
GET    /api/students/:id/qr               QR payload (no balance in it) [student|admin]
GET    /api/students/:id/transactions                                   [student|admin]
GET    /api/students/:id/wallet           live balance for a scan       [merchant|admin]
```

### Merchant
```
GET    /api/merchants/:id                 summary + receivable          [merchant|admin]
GET    /api/merchants/:id/transactions                                  [merchant|admin]
GET    /api/merchants/:id/settlements                                   [merchant|admin]
```

### Payments
```
POST   /api/payments/topup           { amount, method, idempotencyKey } [student]
POST   /api/wallet/topup             alias of the above                 [student]
POST   /api/payments/resolve-qr      { qr }                             [merchant]
POST   /api/payments/charge          { studentId, amount, note?, idempotencyKey } [merchant]
POST   /api/sync                     { items: [{ studentId, amount, clientKey, occurredAt? }] } [merchant]
```

`merchantId` is always taken from the session, never the request body — a
merchant can only ever charge into their own receivable.

### Admin
```
GET    /api/admin/dashboard          stats + charts + payouts + activity
GET    /api/admin/students
GET    /api/admin/merchants
GET    /api/admin/transactions?limit=100
GET    /api/admin/payouts
GET    /api/admin/activity?limit=50
POST   /api/settlements/:merchantId  { idempotencyKey? }   simulated payout
POST   /api/admin/reset              { confirm: "RESET" }
```

```
GET    /api/health                   no auth — used by the landing page
```

### Error states

| Situation | Message |
|---|---|
| Balance too low | *Insufficient wallet balance.* |
| QR is not a UniPay code | *Invalid UniPay QR code.* |
| Unknown student | *Student wallet not found.* |
| Bad amount | *Enter a valid amount.* |
| Replayed idempotency key | *Transaction already processed.* |
| Backend unreachable | *Central server unavailable.* |
| Offline mode | *Transaction queued for synchronization.* |
| Expired token | *Session expired. Please log in again.* |

## 17. Testing

```bash
npm test
```

25 end-to-end tests run against the real HTTP API in a throwaway data directory.
They cover the money path, not just the happy one:

- ✅ All three roles log in; wrong passwords rejected; hashes never returned
- ✅ Top-up credits the wallet; a replayed key is rejected and does **not** double-credit
- ✅ Invalid amounts (`0`, negative, `NaN`, `Infinity`) rejected
- ✅ QR resolves in both formats; a foreign QR is rejected
- ✅ Charge debits the student and creates a **receivable**, not a payment
- ✅ Overdraft blocked, and a failed charge moves no money
- ✅ **Ten concurrent charges cannot overdraw the wallet** (the race the file lock exists for)
- ✅ `pendingReceivable === sum(pending transactions)` for every merchant
- ✅ A merchant cannot charge into another merchant's account or trigger their own payout
- ✅ A student cannot read another student's wallet; students cannot reach admin routes
- ✅ Settlement zeroes the receivable, stamps the transactions, and refuses an empty second payout
- ✅ Offline sync applies exactly once; a per-item failure does not discard the batch
- ✅ Dashboard totals reconcile against the ledger
- ✅ Reset returns Devansh to ₹1,000 and removes demo-created accounts

## 18. Deploying to Render

`render.yaml` is included. One web service builds the client and Express serves
it, so the API, Socket.IO and UI share a single origin — nothing to configure.

**Blueprint (recommended):** push to GitHub → Render → **New** → **Blueprint** →
select the repo. Render reads `render.yaml`.

**Manual:** New → Web Service, then:
- Build: `npm install && npm install --prefix client && npm run build --prefix client`
- Start: `npm start`
- Health check: `/api/health`

Do **not** set `VITE_API_URL` on Render — same-origin is what you want.

### ⚠️ JSON file persistence on Render

The free tier's filesystem is **ephemeral**:

- It is **wiped on every deploy**.
- The service **spins down after inactivity**, and a cold start restores the
  seeded demo data, discarding anything created since.

**For a hackathon demo this is acceptable** — arguably convenient, since every
judge gets a clean slate. **For anything real it is not.** To survive restarts,
attach a persistent disk (paid) and set `UNIPAY_DATA_DIR` to its mount path;
both are commented out in `render.yaml` ready to uncomment. Even then, a single
mounted disk does not scale past one instance — production needs a real
database.

Also note that **sessions are in-memory**, so a Render restart logs everyone out,
and the app cannot run on more than one instance.

## 19. Limitations

Stated plainly, because a payments prototype that oversells itself is worse than
one that doesn't.

**Storage**
- JSON files are not a database: no real transactions, no query planner, no
  indexes. Every read loads a whole collection into memory.
- Safety relies on in-process locks. **Two server processes writing the same
  files would corrupt them.** Single instance only.
- Everything is read into memory; this does not scale past a few thousand rows.

**Money**
- All of it is simulated. No gateway, bank, UPI, card network or real settlement.
- No reversals, refunds, chargebacks, disputes or partial settlement.
- No double-entry accounting — balances and a transaction log, not a general ledger.

**Auth**
- Bearer tokens in memory: a restart logs everyone out, and multi-instance is impossible.
- Tokens are stored in `localStorage`, which is XSS-readable.
- No rate limiting on login — brute force is not prevented.
- No 2FA, email verification, or password reset.

**Offline**
- Prototype reconciliation only. See [§13](#13-how-the-offline-demo-works) for the
  specific failure modes: unverifiable balances, no cross-terminal double-spend
  protection, tamperable client storage.

**Operations**
- No audit log, no fraud detection, no backups, no encryption at rest, no PII
  handling policy, no compliance controls.
- CORS is wide open (`origin: true`) so LAN demos work from an unknown IP.

## 20. Production roadmap

A real deployment handling real student money would require:

**Regulated payment architecture.** In India, a closed-loop campus wallet is a
Prepaid Payment Instrument and falls under RBI's PPI Master Directions —
licensing or partnering with a licensed issuer, KYC, escrow of float in a
scheduled commercial bank, and the associated reporting.

**Real gateway and banking integration.** A licensed PSP for top-ups, and real
bank transfers (NEFT/IMPS/RTGS) for merchant settlement, with reconciliation
against bank statements and a break-handling process.

**Secure wallet infrastructure.** ACID transactions with proper isolation,
double-entry accounting, an append-only immutable ledger, idempotency enforced
at the database layer, and an automated balance-vs-ledger reconciliation job.

**Cryptographic credentials.** Signed student credentials rather than a plain
identifier in a QR. For genuine offline stored value: NFC cards with a secure
element, so the terminal can cryptographically verify and decrement a balance
without server contact — this is the only real answer to offline double-spend.

**Strong authentication.** Short-lived access tokens with rotating refresh
tokens in httpOnly cookies, 2FA for merchants and admins, device binding,
per-transaction limits, rate limiting, and a full RBAC model.

**Audit trails.** Immutable, append-only, tamper-evident (hash-chained) logs of
every financial action and administrative override, retained per regulation.

**Fraud detection.** Velocity checks, anomaly detection on spending patterns,
merchant collusion detection, and a manual review queue.

**Persistent production database.** PostgreSQL with `SERIALIZABLE` (or
carefully-reasoned `REPEATABLE READ`) transactions, read replicas, PITR backups,
tested restores, and schema migrations.

**Compliance and financial controls.** Segregation of duties (nobody who can
create a merchant can also approve its payout), maker-checker on settlements,
daily reconciliation sign-off, external audit, GST-compliant invoicing, and a
documented incident response plan.

---

<div align="center">

**UNIPAY** · Your Campus. Your Wallet. One Tap.

Hackathon prototype · every rupee simulated · no real payment rail contacted

</div>
