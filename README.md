# FighTea — Milk Tea Shop Ordering System

**Version 5 · Production-Ready · Full-Stack Guide**

Complete Point-of-Sale and online ordering system for a milk tea shop.
Customers order and pay online. Staff manage orders in a live dashboard.
Admin controls the full menu, promos, users, and analytics.

---

## Quick Reference

| Thing | Value |
|-------|-------|
| Default admin email | `admin@fightea.com` |
| Default admin password | Set by you in Step 1-E |
| Backend port (local) | `4000` |
| Frontend port (local) | Opened directly as a file |
| API base URL (local) | `http://localhost:4000/api` |
| Health check URL | `http://localhost:4000/api/health` |

---

## Project Structure

```
FighTea_v5/
├── frontend/
│   ├── html/index.html         Complete single-page application
│   ├── css/style.css           Beige design system, fully responsive
│   ├── js/
│   │   ├── data.js             API layer, state, session management
│   │   ├── app.js              Auth, menu, cart, checkout, GCash
│   │   ├── admin.js            Dashboard: queue, menu CRUD, promos, users
│   │   └── notifications.js    Customer order-ready popup (SSE + polling)
│   ├── assets/logo.png         Shop logo
│   ├── vercel.json             Vercel routing config
│   └── package.json
│
├── backend/
│   ├── server.js               Express entry point
│   ├── package.json
│   ├── .env.example            Template — copy to .env and fill in
│   ├── vercel.json             Vercel serverless config
│   ├── config/db.js            MySQL connection pool
│   ├── middleware/auth.js      JWT authentication middleware
│   ├── routes/                 auth, menu, orders, users, analytics, notifications
│   ├── controllers/            authController, menuController, orderController,
│   │                           userController, analyticsController, notificationController
│   └── database/
│       ├── schema.sql          All 15 tables — run this first
│       ├── inventory.sql       Default sizes and ice options
│       └── users.sql           Default admin account only
│
└── README.md
```

---

# PART 1 — DATABASE SETUP (MySQL)

## Prerequisites

- MySQL 5.7 or 8.x installed on your machine
- MySQL running as a service
- The `mysql` command available in your terminal or Command Prompt

Check MySQL is installed:
```
mysql --version
```

If MySQL is not installed:
- **Windows**: Download from https://dev.mysql.com/downloads/installer/ — choose "MySQL Installer"
- **Mac**: Run `brew install mysql` in Terminal, then `brew services start mysql`

---

## Step 1-A — Open a terminal in your project folder

Windows:
```
cd C:\Projects\FighTea_v5
```

Mac / Linux:
```
cd ~/Projects/FighTea_v5
```

---

## Step 1-B — Create all database tables

```
mysql -u root -p < backend/database/schema.sql
```

Enter your MySQL root password when asked.

**What this does:**
- Creates the database `fightea_db` if it does not exist
- Creates all 15 tables using `CREATE TABLE IF NOT EXISTS`
- Safe to run multiple times — will not duplicate or error

Expected result: No output means success. A blank prompt means it worked.

---

## Step 1-C — Load default size and ice options

```
mysql -u root -p < backend/database/inventory.sql
```

This inserts Small, Medium, Large sizes and Normal, Less Ice, No Ice, Warm ice options.
Uses `INSERT IGNORE` — safe to run multiple times.

---

## Step 1-D — Generate a bcrypt hash for your admin password

You must create a real bcrypt hash for your admin password.
Do this **before** importing the admin account.

First install Node.js dependencies (we need the bcrypt package):
```
cd backend
npm install
cd ..
```

Then generate the hash. Replace `YourChosenPassword` with the password
you want for the admin account:
```
cd backend
node -e "require('bcrypt').hash('admin123',12).then(h=>console.log(h))"
```

You will see one line of output like:
```
$2b$12$AbCdEfGhIjKlMnOpQrStUuVwXyZ012345678901234567890123456789
```

Copy that entire line including the `$2b$12$` at the start.

---

## Step 1-E — Put your hash into users.sql

Open `backend/database/users.sql` in any text editor.

Find this line:
```sql
'$2b$12$REPLACE_THIS_WITH_YOUR_REAL_BCRYPT_HASH',
```

Replace it with your copied hash. Example:
```sql
'$2b$12$AbCdEfGhIjKlMnOpQrStUuVwXyZ012345678901234567890123456789',
```

Save the file.

---

## Step 1-F — Import the admin account

```
mysql -u root -p < backend/database/users.sql
```

---

## Step 1-G — Verify the database is correct

Connect to MySQL:
```
mysql -u root -p fightea_db
```

Run these two commands inside MySQL:
```sql
SHOW TABLES;
SELECT id, full_name, email, role FROM users;
```

`SHOW TABLES` should list 15 tables.
The SELECT should show one row: the admin account.

Type `EXIT;` to leave MySQL.

---

## Troubleshooting — Database

**ERROR 1064: SQL syntax error near 'IF NOT EXISTS' in ALTER TABLE**

This was a bug in an older version. The current `schema.sql` does not use
`ALTER TABLE`. All columns are defined inside `CREATE TABLE` statements.

Fix — delete the database and re-import from scratch:
```
mysql -u root -p -e "DROP DATABASE IF EXISTS fightea_db;"
mysql -u root -p < backend/database/schema.sql
mysql -u root -p < backend/database/inventory.sql
mysql -u root -p < backend/database/users.sql
```

---

**ERROR 1062: Duplicate entry for key 'email'**

The admin account already exists. This is fine — `INSERT IGNORE` skips
the duplicate silently. You do not need to do anything.

---

**ERROR 1045: Access denied for user 'root'**

Your MySQL root password is wrong. Try connecting manually:
```
mysql -u root -p
```
If that fails, you need to reset your MySQL root password. Follow the
official MySQL guide for your operating system.

---

**ERROR 1292: Incorrect date value 'CURRENT_DATE'**

This was a bug in an older schema using `DEFAULT (CURRENT_DATE)`.
The current `schema.sql` does not use that syntax. If you see this error,
re-run the schema from scratch using the DROP command above.

---

**MySQL service not running on Windows**

Open Services: press `Windows + R`, type `services.msc`, press Enter.
Find `MySQL80` (or `MySQL57`). Right-click → Start.

Or from an Administrator Command Prompt:
```
net start MySQL80
```

---

**MySQL service not running on Mac**

```
brew services start mysql
```

---

# PART 2 — BACKEND SETUP (Node.js)

## Prerequisites

- Node.js version 18 or newer
- Download from: https://nodejs.org — choose the LTS version

Check you have it:
```
node --version
npm --version
```

Both should show a version number.

---

## Step 2-A — Install backend dependencies

```
cd backend
npm install
```

This installs: `express`, `mysql2`, `bcrypt`, `jsonwebtoken`, `cors`, `dotenv`
Dev tool: `nodemon` (auto-restarts server on file changes)

---

## Step 2-B — Create your environment file

**Windows:**
```
copy .env.example .env
```

**Mac / Linux:**
```
cp .env.example .env
```

---

## Step 2-C — Fill in the .env file

Open `backend/.env` in any text editor. Fill in every value:

```env
PORT=4000
NODE_ENV=development

DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASS=your_mysql_root_password_here
DB_NAME=fightea_db

JWT_SECRET=replace_this_with_a_long_random_string
FRONTEND_URL=http://localhost:3000
```

**Generating a secure JWT_SECRET:**

Run this command and paste the output as your `JWT_SECRET`:
```
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

It produces 96 random hex characters, for example:
```
a1b2c3d4e5f6...long random string...
```

The `.env` file should look like this when filled in:
```env
PORT=4000
NODE_ENV=development
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASS=mysql_password_here
DB_NAME=fightea_db
JWT_SECRET=a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2
FRONTEND_URL=http://localhost:3000
```

Save the file.

---

## Step 2-D — Start the backend server

Make sure you are in the `backend` folder:
```
cd backend
npm run dev
```

You should see:
```
✅ MySQL connected to fightea_db
🧋 FighTea API  →  http://localhost:4000
   Mode        :  development
   Allowed origins: http://localhost:3000, http://localhost:4000, ...
```

If you see a MySQL connection error, double-check your `.env` file.
The `DB_PASS` must exactly match your MySQL root password.

Leave this terminal window open. The server must keep running.

---

## Step 2-E — Test the backend

Open a new terminal window and run:

```
curl http://localhost:4000/api/health
```

Expected response:
```json
{"status":"ok","timestamp":"2024-01-01T00:00:00.000Z"}
```

Test login with the admin account:
```
curl -X POST http://localhost:4000/api/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"admin@fightea.com\",\"password\":\"admin123\"}"
```

(On Mac/Linux use single quotes around the -d value instead of ^ line continuation)

Expected response:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": { "id": 1, "name": "FighTea Admin", "role": "admin" }
}
```

If you get `"Invalid email or password"`, the bcrypt hash in `users.sql`
was generated for a different password. Repeat Steps 1-D through 1-F
using the correct password.

---

## Troubleshooting — Backend

**Error: connect ECONNREFUSED 127.0.0.1:3306**

MySQL is not running. Start it (see database troubleshooting above).

---

**Error: Cannot find module 'express'**

Run `npm install` inside the `backend` folder.

---

**Error: secretOrPrivateKey must have a value**

Your `JWT_SECRET` is empty in `.env`. Add a value.

---

**Port 4000 already in use**

Change `PORT=4001` in `.env`. Then use port 4001 everywhere.

Or kill the process using port 4000:

Windows:
```
netstat -ano | findstr :4000
taskkill /PID <number shown> /F
```

Mac / Linux:
```
lsof -ti:4000 | xargs kill
```

---

**CORS error in browser console**

The `FRONTEND_URL` in `.env` does not match the URL you opened the
frontend from. For local development, the backend allows all common
localhost origins automatically, including requests from files opened
directly in the browser.

If you still see CORS errors locally, open your `.env` and add the
exact URL you see in your browser's address bar as `FRONTEND_URL`.

---

# PART 3 — FRONTEND SETUP

## Step 3-A — Confirm the backend URL is set

Open `frontend/html/index.html` in a text editor.

Search for `FIGHTEA_API_BASE`. You will find this line near the bottom:
```js
window.FIGHTEA_API_BASE = 'http://localhost:4000/api';
```

For local development, leave it exactly as shown.
For production, you will change this to your live backend URL (covered in Part 4).

---

## Step 3-B — Open the frontend

Double-click `frontend/html/index.html` to open it in your browser.

Or in VS Code, right-click the file → Open with Live Server.

---

## Step 3-C — Log in as admin

1. Click **Sign In** in the navigation bar
2. Enter your email: `admin@fightea.com`
3. Enter the password you chose in Step 1-D
4. Click **Sign In**

You should be redirected to the Admin Dashboard.

**If login fails:**
- Open your browser's developer tools (F12) → Console tab
- Look for any red error messages
- The most common cause is the backend is not running — check that
  the terminal from Step 2-D is still open and showing no errors
- Second most common cause: wrong password — repeat Steps 1-D, 1-E, 1-F

---

## Step 3-D — First-time admin setup

After logging in as admin, complete this setup in order:

**1. Add Categories** (Menu Manager → Categories → + Add Category)

Examples: Milk Tea, Fruit Tea, Specialty, Coffee, Food, Snacks
Add as many as your shop needs.

**2. Add Sizes** (Menu Manager → Sizes → + Add Size)

Examples:
- Small (12oz) — Price add: 0
- Medium (16oz) — Price add: 0
- Large (22oz) — Price add: 20

Sizes only appear for items where you check "Enable Sizes".
Do not enable sizes for food items like rice meals or fries.

**3. Add Toppings** (Menu Manager → Toppings → + Add Topping)

Examples: Tapioca Pearls (₱15), Pudding (₱15), Popping Boba (₱15)

**4. Add Menu Items** (Menu Manager → + Add Item)

For each drink:
- Fill in name, category, base price, description
- Check "Enable Sizes" for drinks
- Upload a photo or paste an image URL
- Check "Mark as Best Seller" for featured drinks

For food items (rice meals, fries, etc.):
- Do NOT check "Enable Sizes"
- Use "Varieties" for options like Regular / Cheesy / Overload

**5. Update GCash Number** (Settings → GCash Number)

Enter your real GCash number.

**6. Add Staff Accounts** (Users → + Add User → Role: Staff)

Staff can view and update the order queue.
Staff cannot manage the menu, promos, or users.

---

## Step 3-E — Test the full ordering flow

1. Click Sign Out to log out of the admin account
2. Click Get Started to create a new customer account
3. Browse the menu and add a drink to your cart
4. Go to cart → Checkout → select Cash → Place Order
5. Log back in as admin → Order Queue
6. You should see the new order as Pending
7. Click Start Prep → Mark Ready
8. If the customer tab is still open, they should see the order-ready popup

---

## Troubleshooting — Frontend

**The login form does nothing when submitted**

Open browser console (F12). Look for network errors.
Most likely the backend is not running — check your terminal.

---

**"Invalid email or password" even though I just set up the account**

The password you typed into the login form does not match the password
you used when generating the bcrypt hash in Step 1-D.

Regenerate the hash with exactly the password you want to use:
```
node -e "require('bcrypt').hash('EXACT_PASSWORD_HERE',12).then(h=>console.log(h))"
```

Update `users.sql`, then:
```
mysql -u root -p fightea_db -e "DELETE FROM users WHERE email='admin@fightea.com';"
mysql -u root -p fightea_db < backend/database/users.sql
```

---

**CORS error: "blocked by CORS policy"**

The backend CORS configuration allows requests from files opened directly
in the browser (no Origin header). If you are still seeing this:

1. Make sure the backend is running on port 4000
2. Check that `window.FIGHTEA_API_BASE` in `index.html` points to `http://localhost:4000/api`
3. Restart the backend after any `.env` changes

---

**Menu shows "Menu coming soon" even after adding items**

After adding items in the Admin Dashboard, click the Menu link in
the navbar. The page fetches live data from the API each time you visit.

---

# PART 4 — DEPLOYMENT

## Overview

```
[Browser]
    │  HTTPS requests
    ▼
[Vercel — Frontend]          (static HTML/CSS/JS)
    │  fetch() API calls
    ▼
[Vercel — Backend API]       (Node.js serverless)
    │  mysql2 connection
    ▼
[PlanetScale or Railway]     (hosted MySQL database)
    │  DNS pointing
    ▼
[Hostinger domain]           (yourdomain.com)
```

---

## Step 4-A — Set up a hosted MySQL database

You cannot use your local MySQL in production. Choose one of these:

### Option 1: PlanetScale (recommended — generous free tier)

1. Go to https://planetscale.com and sign up
2. Click **Create a new database** → name it `fightea_db` → select a region close to you
3. Click **Connect** → choose **General** → copy the connection details
   (Host, Username, Password)
4. Click the **Branches** tab → click `main` → click **Console**
5. Paste the contents of `backend/database/schema.sql` into the console and run it
6. Paste the contents of `backend/database/inventory.sql` and run it
7. Paste the contents of `backend/database/users.sql` (with your real hash) and run it

> **PlanetScale note:** PlanetScale uses `vitess` which does not enforce foreign key
> constraints. The schema will import without errors. The application still works
> correctly because data integrity is maintained by the application code.

### Option 2: Railway (supports foreign keys, very easy setup)

1. Go to https://railway.app and sign up with GitHub
2. Click **New Project** → **Provision MySQL**
3. Click the MySQL service → click **Variables** tab → copy these values:
   `MYSQL_HOST`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQLPASSWORD`
4. Click the **Data** tab → use the query console to run your SQL files

### Option 3: Clever Cloud (European, free hobby plan)

1. Go to https://console.clever-cloud.com
2. Create an add-on → MySQL 8 → copy the connection details

---

## Step 4-B — Install the Vercel CLI

Run this once on your computer:
```
npm install -g vercel
```

Verify it works:
```
vercel --version
```

---

## Step 4-C — Log in to Vercel

```
vercel login
```

A browser window opens. Sign up or log in with your GitHub or email account.
Return to the terminal when done.

---

## Step 4-D — Deploy the backend

Navigate to the backend folder:
```
cd C:\Projects\FighTea_v5\backend
```

Deploy:
```
vercel
```

Answer the prompts exactly like this:
- **Set up and deploy?** → press Enter (Yes)
- **Which scope?** → select your account, press Enter
- **Link to existing project?** → type `n`, press Enter
- **What's your project's name?** → type `fightea-api`, press Enter
- **In which directory is your code located?** → press Enter (current folder)
- **Want to modify these settings?** → type `n`, press Enter

Vercel will deploy and give you a URL like:
```
https://fightea-api.vercel.app
```

Write this URL down — you need it in later steps.

---

## Step 4-E — Set environment variables on Vercel (backend)

Go to https://vercel.com → Dashboard → click `fightea-api` → click
**Settings** → click **Environment Variables**.

Add each variable one at a time. Click **Add** after each one:

| Name | Value |
|------|-------|
| `NODE_ENV` | `production` |
| `DB_HOST` | your hosted database host |
| `DB_PORT` | `3306` (or the port your DB provider shows) |
| `DB_USER` | your hosted database username |
| `DB_PASS` | your hosted database password |
| `DB_NAME` | `fightea_db` |
| `JWT_SECRET` | the same 96-char hex string from your local `.env` |
| `FRONTEND_URL` | `https://fightea.vercel.app` (update this after Step 4-G) |

After adding all variables, deploy to production:
```
vercel --prod
```

Test the live API:
```
curl https://fightea-api.vercel.app/api/health
```

Expected: `{"status":"ok","timestamp":"..."}`

---

## Step 4-F — Update the frontend API URL

Open `frontend/html/index.html` in your text editor.

Find this line near the bottom of the file:
```js
window.FIGHTEA_API_BASE = 'http://localhost:4000/api';
```

Change it to your live backend URL:
```js
window.FIGHTEA_API_BASE = 'https://fightea-api.vercel.app/api';
```

Save the file.

---

## Step 4-G — Deploy the frontend

Navigate to the frontend folder:
```
cd C:\Projects\FighTea_v5\frontend
```

Deploy:
```
vercel
```

Answer the prompts:
- **Project name?** → type `fightea`, press Enter
- **Directory?** → press Enter (current folder)
- **Modify settings?** → type `n`, press Enter

Vercel gives you a URL like:
```
https://fightea.vercel.app
```

---

## Step 4-H — Update CORS on the backend

Now that you have the frontend URL, update the backend environment variable.

Go to Vercel Dashboard → `fightea-api` → Settings → Environment Variables.

Update `FRONTEND_URL` to: `https://fightea.vercel.app`

Then redeploy the backend:
```
cd C:\Projects\FighTea_v5\backend
vercel --prod
```

---

## Step 4-I — Test the live deployment

1. Open `https://fightea.vercel.app` in your browser
2. Click Sign In → enter `admin@fightea.com` and your password
3. You should land on the Admin Dashboard
4. Go to Menu Manager → add a Category → add a Drink
5. Click Back to Shop → click Menu
6. Your drink should appear in the menu

---

# PART 5 — CONNECT HOSTINGER DOMAIN

## Step 5-A — Add your domain to Vercel (frontend)

1. Go to https://vercel.com → Dashboard → click the `fightea` project
2. Click **Settings** → click **Domains**
3. In the input field, type `yourdomain.com` → click **Add**
4. Also add `www.yourdomain.com` → click **Add**

Vercel shows you DNS records you need to add. Keep this tab open.

---

## Step 5-B — Update DNS on Hostinger

1. Log in to https://hpanel.hostinger.com
2. Click **Domains** → click your domain name
3. Click **DNS / Nameservers** → click **Manage DNS Records**

Delete any existing `A` record for `@` (the root domain) if one exists.

Add these two records exactly as shown:

| Type | Name | Points To | TTL |
|------|------|-----------|-----|
| `A` | `@` | `76.76.21.21` | 3600 |
| `CNAME` | `www` | `cname.vercel-dns.com.` | 3600 |

Click **Save Changes**.

---

## Step 5-C — Wait for DNS propagation

DNS changes take between 15 minutes and 48 hours to work worldwide.

Check the current status at: https://dnschecker.org
Enter your domain name and check the `A` record.
When it shows `76.76.21.21` from most locations, it has propagated.

---

## Step 5-D — SSL certificate

Vercel automatically issues a free SSL certificate once it detects your
DNS is correctly configured. No action required. The padlock icon in the
browser appears automatically within a few minutes of DNS propagation.

---

## Step 5-E — Update CORS and API URL for your custom domain

**Update the backend FRONTEND_URL:**

Go to Vercel → `fightea-api` → Settings → Environment Variables.
Update `FRONTEND_URL` to `https://www.yourdomain.com`

Redeploy:
```
cd C:\Projects\FighTea_v5\backend
vercel --prod
```

**Update the frontend API_BASE (optional — only if you also use a custom API domain):**

If you want `api.yourdomain.com` to point to your backend:

Add a CNAME record on Hostinger:
| Type | Name | Points To | TTL |
|------|------|-----------|-----|
| `CNAME` | `api` | `cname.vercel-dns.com.` | 3600 |

Add the domain in Vercel → `fightea-api` → Settings → Domains → add `api.yourdomain.com`.

Then update `frontend/html/index.html`:
```js
window.FIGHTEA_API_BASE = 'https://api.yourdomain.com/api';
```

Redeploy the frontend:
```
cd C:\Projects\FighTea_v5\frontend
vercel --prod
```

---

## Troubleshooting — Deployment

**Vercel build fails: "Cannot find module 'express'"**

`package.json` or `package-lock.json` is not committed to Git.
Make sure both files exist in the `backend` folder.
Do not add `node_modules/` to Git.

---

**API returns 500 on Vercel but works locally**

An environment variable is missing or wrong on Vercel.

Check: Vercel Dashboard → your project → Settings → Environment Variables.
Make sure every variable from your `.env` is added there.
After adding or changing variables, run `vercel --prod` to redeploy.

---

**"ERR_CONNECTION_REFUSED" from Vercel to database**

Your hosted database may block connections from Vercel's IP addresses.

For PlanetScale: all connections are allowed by default. No action needed.

For Railway: go to your MySQL service settings. Connections from external
IPs should be enabled by default.

For Clever Cloud or Hostinger MySQL: look for "Allowed IP addresses" or
"Remote MySQL" in the database settings. Add `0.0.0.0/0` to allow all IPs.
(Vercel uses dynamic IPs so you cannot whitelist specific ones.)

---

**CORS error in production**

The `FRONTEND_URL` environment variable on Vercel does not match
the origin your frontend is served from.

Rules:
- No trailing slash: `https://fightea.vercel.app` ✓  not  `https://fightea.vercel.app/` ✗
- Include `https://`
- Must be the exact URL users see in their browser

After changing, redeploy the backend: `vercel --prod`

---

**Domain not working after adding DNS records**

DNS propagation takes up to 48 hours. Check progress at https://dnschecker.org.
If the `A` record shows your old IP, wait and check again later.

---

**Vercel function timeout (504 error)**

The Vercel free plan limits serverless functions to 10 seconds.
If a database query takes too long, it will timeout.

Options:
1. The `schema.sql` already adds indexes to commonly queried columns
2. For busier shops, upgrade to Vercel Pro (60-second limit)
3. Move the backend to Railway which runs as a persistent server (no timeout)

---

# PART 6 — UPDATING YOUR SYSTEM

## When you make code changes

**To update the backend on Vercel:**
```
cd C:\Projects\FighTea_v5\backend
vercel --prod
```

**To update the frontend on Vercel:**
```
cd C:\Projects\FighTea_v5\frontend
vercel --prod
```

---

## When you add a new admin or staff account

Use the Admin Dashboard → Users → + Add User.
Set the role to Staff or Admin as needed.

You do not need to touch the database directly.

---

## Security checklist before going live

- [ ] The admin password has been changed from the default
- [ ] `users.sql` has a real bcrypt hash, not the placeholder
- [ ] `JWT_SECRET` is at least 64 characters long and kept secret
- [ ] `NODE_ENV` is set to `production` in Vercel environment variables
- [ ] `FRONTEND_URL` is set to your exact live domain in Vercel
- [ ] The `.env` file is in `.gitignore` and has never been pushed to Git
- [ ] HTTPS is enabled on your domain (automatic with Vercel)

---

# PART 7 — API REFERENCE

All API requests use JSON. Protected endpoints require an `Authorization` header:
```
Authorization: Bearer YOUR_JWT_TOKEN
```

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/health | None | Server health check |
| POST | /api/auth/login | None | Login, returns JWT token |
| POST | /api/auth/register | None | Register a new customer |
| GET | /api/auth/me | Any | Get the current logged-in user |
| GET | /api/menu/categories | None | List all categories |
| POST | /api/menu/categories | Admin | Create a category |
| PUT | /api/menu/categories/:id | Admin | Rename a category |
| DELETE | /api/menu/categories/:id | Admin | Remove a category |
| GET | /api/menu/products | None | Get all menu items with varieties |
| POST | /api/menu/products | Admin | Add a new product |
| PUT | /api/menu/products/:id | Admin | Update a product |
| DELETE | /api/menu/products/:id | Admin | Remove a product |
| GET | /api/menu/sizes | None | Get all size options |
| POST | /api/menu/sizes | Admin | Add a size |
| PUT | /api/menu/sizes/:id | Admin | Edit a size |
| DELETE | /api/menu/sizes/:id | Admin | Remove a size |
| GET | /api/menu/toppings | None | Get all toppings |
| POST | /api/menu/toppings | Admin | Add a topping |
| PUT | /api/menu/toppings/:id | Admin | Edit a topping |
| DELETE | /api/menu/toppings/:id | Admin | Remove a topping |
| GET | /api/menu/promos | None | Get all promos |
| POST | /api/menu/promos | Admin | Create a promo |
| PUT | /api/menu/promos/:id | Admin | Update a promo |
| DELETE | /api/menu/promos/:id | Admin | Remove a promo |
| POST | /api/orders | Customer | Place an order |
| GET | /api/orders?status= | Staff/Admin | Get orders (filter by status) |
| PATCH | /api/orders/:id/status | Staff/Admin | Update order status |
| PUT | /api/orders/:id | Staff/Admin | Edit order details |
| GET | /api/users | Admin | List all users |
| POST | /api/users | Admin | Create a staff or admin user |
| PUT | /api/users/:id | Admin | Update a user |
| DELETE | /api/users/:id | Admin | Remove a user |
| GET | /api/analytics/summary | Admin | Revenue, top sellers, stats |
| GET | /api/notifications/stream | Any | SSE stream for live updates |
| GET | /api/notifications/poll | Any | Polling fallback for live updates |
