# SmartSeal — Auth (Next.js + MongoDB)

A startup-grade login / sign-up flow for the SmartSeal operations portal, built with
the Next.js App Router and a local MongoDB. Users authenticate with **username + password**;
every new account is created with the role **`manufacturer`** by default (an admin can change
roles later).

## What's inside

```
smartseal-app/
├─ app/
│  ├─ page.jsx                 # redirects to /dashboard or /login
│  ├─ login/page.jsx           # sign-in screen
│  ├─ register/page.jsx        # sign-up screen (role defaults to manufacturer)
│  ├─ dashboard/page.jsx       # protected landing (shows username + role)
│  └─ api/auth/
│     ├─ register/route.js     # POST – create user, hash password, set JWT cookie
│     ├─ login/route.js        # POST – verify credentials, set JWT cookie
│     ├─ logout/route.js       # POST – clear cookie
│     └─ me/route.js           # GET  – current user from cookie
├─ lib/
│  ├─ mongodb.js               # cached mongoose connection
│  └─ auth.js                  # JWT (jose) sign/verify + cookie options
├─ models/User.js              # { username, password, role } schema
├─ components/                 # BrandPanel, LogoutButton
├─ middleware.js               # protects /dashboard, guards /login & /register
└─ .env.local                  # MONGODB_URI + JWT_SECRET
```

## Data model

Each user document in MongoDB (`smartseal` database, `users` collection):

```json
{
  "userId": "USR-MFG-001",
  "orgId": "ORG-MFG-01",
  "name": "Arjun Mehta",
  "email": "arjun.mehta@veritex-mfg.com",
  "username": "arjun",
  "orgName": "VeriteX Manufacturing Pvt. Ltd.",
  "password": "$2a$10$...(bcrypt hash)...",
  "role": "manufacturer",
  "stage": "Manufacturer",
  "active": true,
  "createdAt": "2025-06-01T09:00:00Z"
}
```

At sign-up the user provides **name, email, username, organization name, and password**. The
server assigns everything else automatically: a unique sequential `userId` (`USR-MFG-001`,
`USR-MFG-002`, …) and `orgId` (`ORG-MFG-01`, reused when the same `orgName` already exists),
plus `role` (defaults to `manufacturer`), `stage` (`Manufacturer`), `active` (`true`) and
`createdAt`. The password is **never** stored in plain text — it is hashed with bcrypt, and
`role`/`stage`/`active` cannot be set by the client.

## Prerequisites

- **Node.js 18.18+** (or 20+)
- **MongoDB running locally** at `mongodb://localhost:27017`
  - Start it with `mongod` (or via MongoDB Compass / a local service).

## Setup

1. Open a terminal in this folder:

   ```bash
   cd smartseal-app
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Set a real secret in `.env.local` (already created):

   ```bash
   # generate one:
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```

   Paste the output as `JWT_SECRET=...`. Confirm `MONGODB_URI` points at your local MongoDB.

4. Run the dev server:

   ```bash
   npm run dev
   ```

5. Open <http://localhost:3000>. You'll be redirected to **/login**. Use **Create an account**
   to register your first user — it lands you on the protected **/dashboard**.

## How auth works

- On register/login the server signs a **JWT** and stores it in an **httpOnly cookie**
  (`token`), so it isn't readable by JavaScript.
- `middleware.js` verifies that cookie (via `jose`, which runs in the Edge runtime) and:
  - redirects anonymous users away from `/dashboard` → `/login`
  - redirects signed-in users away from `/login` and `/register` → `/dashboard`
- Password hashing (`bcryptjs`) and DB access (`mongoose`) run only inside Node.js route
  handlers (`export const runtime = "nodejs"`).

## Changing a user's role (admin, for now)

Until an admin UI exists, update a role directly in MongoDB:

```js
// mongosh
use smartseal
db.users.updateOne({ username: "voltedge" }, { $set: { role: "admin" } })
```

Allowed roles: `manufacturer` (default), `distributor`, `retailer`, `admin`.

## The manufacturer portal (`/portal`)

The full manufacturer portal from `manufacturer_portal.html` is now built natively into the
app as a React page at **`/portal`** (`app/portal/page.jsx` + `components/ManufacturerPortal.jsx`).
It is route-protected, so only signed-in users can reach it.

After a successful **register** or **login**, the user is taken straight to `/portal`. The page
includes everything the original HTML had: the New Upload form (default view), dashboard stat
cards, searchable/filterable product catalog, image-carousel detail modal, animated success
modal, and toasts. Products are persisted in **MongoDB** via the products API (see below).

## Product uploads (backend)

The **New Upload** form saves to the backend (not the browser):

- `POST /api/products` (multipart) — validates the fields, generates a unique **`productId`**
  (e.g. `PRD-1A2B3C4D`), saves the record to MongoDB (`products` collection), and writes each
  uploaded photo to disk.
- `GET /api/products` — returns the signed-in user's products (newest first); the dashboard
  catalog loads from here on page load.

Photos are uploaded to **Cloudinary** (folder `CLOUDINARY_FOLDER`, default
`smartseal/products`), with the public id set to the product id: the first photo is `PRD-XXXX`,
extra photos are `PRD-XXXX_2`, `PRD-XXXX_3`, etc. MongoDB stores the returned Cloudinary
`secure_url`s in the product's `images` array so the catalog can display them. If Cloudinary is
not configured, the app falls back to saving photos locally under `public/uploads/products/`.
Each product is owned by the user who created it (derived from the auth cookie, not the
client). `status`, `transactionId`, `pickupDate` and `productId` are all assigned server-side.

### Cloudinary setup

Set these in `.env.local` (from your Cloudinary dashboard):

```
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
CLOUDINARY_FOLDER=smartseal/products
```

Uploads are **signed** server-side (SHA-1 of the sorted params + API secret), so the secret
never reaches the browser. Restart `npm run dev` after editing `.env.local`.

> **Security:** `.env.local` is git-ignored. Never commit the API secret. Rotate it in the
> Cloudinary console if it has been shared.

## Troubleshooting: "registration isn't working"

If clicking **Create account** seems to do nothing, it's almost always because **MongoDB
isn't running**. The app fails fast (~8s) and shows: *"Cannot reach the database. Make sure
MongoDB is running, then try again."* Start `mongod` (reachable at
`mongodb://localhost:27017`), confirm `MONGODB_URI` in `.env.local`, restart `npm run dev`,
and watch that terminal for any `[register] error:` / `[products POST] error:` lines.

## Notes

- For production, serve over HTTPS (the auth cookie is marked `secure` when
  `NODE_ENV=production`) and use a strong, unique `JWT_SECRET`.
- Uploaded photos are served publicly from `/uploads/...`; add auth/signed URLs before
  shipping if product images are sensitive.
