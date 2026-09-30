# Bee's Hive - Restaurant Management System

A modern restaurant management application built with React, TypeScript, and Tailwind CSS. Supports three roles: Admin, Waiter, and Supervisor.

## Roles

| Role | Description |
|------|-------------|
| **Admin** | Full restaurant management - tables, menu, staff, orders, inventory, payments, analytics |
| **Waiter** | Table allocation, session management, order creation, tokens/KOT, order status tracking |
| **Supervisor** | Menu management, order preparation, inventory, purchase requests |

## Features

### Admin
- Dashboard with real-time analytics
- Table management grouped area-wise (Indoor, Garden, Terrace, ...) — add, edit, deactivate
- Menu management (create categories, dishes with images)
- Staff management (create/administer admins, waiters and supervisors)
- Order monitoring
- Bill generation and payment processing (CASH, UPI, PHONE UPI, DEBIT CARD, CREDIT CARD, QR CODE, WALLET)
- Receipt printing (DIVYE PT-210 #2 — Admin printer)
- Reprint bills
- Inventory management
- Purchase request approval
- Payment history
- Analytics (revenue, orders, averages)

### Waiter
- Table floor view grouped area-wise (Indoor, Garden, ...) with real-time status
- Dining session management
- Order creation with menu browsing
- Today's Specials highlighting
- Token/KOT printing for kitchen
- Order status tracking

### Supervisor
- Menu management (create categories, dishes with images)
- Dish image upload
- Today's Specials management
- Order board (New → Preparing → Ready)
- Inventory tracking
- Purchase request creation

## Development Setup

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

```bash
npm install
```

### Environment Configuration

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

For local development without Firebase:
```
VITE_DATA_MODE=mock
```

### Run Development Server

```bash
npm run dev
```

### Build for Production

```bash
npm run build
```

### Run Linter

```bash
npm run lint
```

### Run Verification Suites

End-to-end suites live in `scripts/` (Puppeteer, mock mode — they drive the real UI and assert on the DOM and mock-only local state).

| Suite | Covers |
|-------|--------|
| `notification-routing-test.cjs` | Admin → Waiter bell (menu/tables), no waiter → supervisor link, inventory admin ⇄ supervisor |
| `waiter-token-flow-test.cjs` | Cart → KOT → token printed → Admin → Payments → Token History |
| `bill-settlement-test.cjs` | Bill → payment → order auto-completes → LIVE board clears |
| `bill-empty-test.cjs` | Bill cannot be generated on an order-less session |
| `order-lifecycle-test.cjs` | Dine-in + parcel live orders, separate token series, settlement |
| `order-confirm-test.cjs` | Session popup → Menu / Order → confirmed order with token |
| `print-receipt-check.cjs` | Digest previews print only the paper, never the app UI |
| `table-area-grouping-test.cjs` | Area-wise grouping on admin + waiter views |
| `runtime-crud-test.cjs` / `fresh-crud-test.cjs` | Table + inventory CRUD, persistence, reset |
| `runtime-dataflow-test.cjs` | Dashboard stats react to data changes |
| `relay-concurrency-test.cjs` | Print relay concurrency, duplicate protection, routing isolation |

## Mock Mode (DEVELOPMENT/TESTING ONLY)

Mock mode (`VITE_DATA_MODE=mock`) is for local development and automated UI
tests ONLY. It uses in-memory state managed by React Context, allowing full
frontend development without Firebase. **Mock mode must never be used in
production** — nothing would persist.

### Mock Users
- `admin@beeshive.local` - Admin access
- `waiter@beeshive.local` - Waiter access
- `supervisor@beeshive.local` - Supervisor access

## Firebase Mode (PRODUCTION)

**Production runs with `VITE_DATA_MODE=firebase`.** All authoritative
restaurant/business data (users, tables, menu, sessions, orders, tokens,
bills, payments, inventory, purchase requests, notifications, audit logs,
settings, analytics snapshots and the durable `printJobs` history) is
persisted in Firebase Auth + Cloud Firestore + Cloud Storage. Browser
local/session storage is used ONLY for non-business UI preferences (e.g. a
waiter's table-filter choice) and is actively cleaned of mock keys in
Firebase mode.

To enable Firebase (production):

1. Create a Firebase project at https://console.firebase.google.com
2. Enable Authentication (Email/Password)
3. Create a Cloud Firestore database and deploy `firestore.rules`
4. Enable Cloud Storage and deploy `storage.rules`
5. Copy Firebase config values to `.env`:
   ```
   VITE_DATA_MODE=firebase
   VITE_FIREBASE_API_KEY=your-api-key
   VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your-project-id
   VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
   VITE_FIREBASE_APP_ID=your-app-id
   ```
6. Deploy Firestore security rules from `firestore.rules`
7. Deploy Storage security rules from `storage.rules`

## Firestore Collections

| Collection | Description |
|------------|-------------|
| `users` | Staff profiles with roles |
| `tables` | Restaurant table configurations |
| `menuCategories` | Menu category definitions |
| `menu` | Individual dish items with images |
| `diningSessions` | Active dining sessions per table |
| `orders` | Orders linked to sessions |
| `bills` | Generated bills |
| `inventory` | Restaurant inventory |
| `purchaseRequests` | Restocking requests |
| `notifications` | Role-based notifications |
| `activityLog` | Audit trail |
| `paymentRecords` | Payment records |
| `settings` | Restaurant configuration |

## Firestore Security Rules

See `firestore.rules` for the complete security configuration:

- **Admin**: Full read/write access to all collections
- **Waiter**: Read tables/menu/sessions/orders, write sessions/orders (billing/payments are admin-only)
- **Supervisor**: Read orders/menu/inventory, write menu availability/images/inventory/purchase requests

## Image Storage

Dish images are stored in Firebase Cloud Storage:
- Path: `restaurants/{restaurantId}/menu/{menuItemId}/original`
- Only `imageUrl` and `imagePath` are stored in Firestore
- Supported formats: JPEG, PNG, WEBP
- Max file size: 5MB

## Staff Account Creation

When Firebase is connected, staff accounts are created directly by the web application using Firebase Authentication + Firestore:

1. Admin fills in staff details in the app (name, username, email, phone, password, role, photo)
2. The app creates a Firebase Authentication account for the staff member
3. The app creates a `users/{uid}` Firestore profile document
4. Username, email, and phone mappings are reserved transactionally for uniqueness
5. Profile image is uploaded to Firebase Storage (Firestore stores only the URL)
6. Returns success to the admin

Username, email, and phone must be unique across ALL users (admins, supervisors, waiters).

**Important**: Never put Firebase Admin SDK credentials in frontend code.

## Architecture

```
src/
├── components/     # Reusable UI components
├── context/        # React Context providers (auth, restaurant state, sidebar)
├── pages/          # Role-based dashboard pages
├── services/
│   ├── firebase/   # Firebase service layer (auth, firestore, storage)
│   └── print/      # Print queue + DIVYE PT-210 print service
└── App.tsx         # Main application with routing
```

## Printing (DIVYE PT-210)

The application supports two DIVYE PT-210 thermal printers:

- **PT-210 #1 (Kitchen)**: Prints tokens, KOTs, and parcel tokens only
- **PT-210 #2 (Admin)**: Prints customer bills, paid receipts, and reprints only

See `docs/pt210-deployment.md` for setup instructions.

### Print Routing Isolation

- Waiter tokens → Kitchen PT-210 #1 only
- Admin bills → Admin PT-210 #2 only
- Bill reprints → Admin PT-210 #2 only (explicit new print job)

The Windows Print Relay (`scripts/print-server.cjs`) handles job routing and concurrency.

## Build Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run lint` | Run ESLint |

## Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS
- **Routing**: React Router v6
- **Icons**: Lucide React
- **Build**: Vite
- **Backend** (optional): Firebase (Auth, Firestore, Storage, Functions)

## License

Private - Vir Technologies