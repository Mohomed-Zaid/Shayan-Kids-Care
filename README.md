# Shayan's Kids — Wholesale Management System

A modern admin dashboard for managing products, customers, orders, invoices, purchases, vendors, returns, commissions, journals, SMS notifications, and backorders for **Shayan's Kids & Toys Store**.

## Features

- **Dashboard** — Personalized welcome, key stats (Today/Total Sales & Purchases, Products, Customers), Sales vs Profit chart with historical cost-at-time-of-sale, donut receivable chart, recent invoices & purchases, date/time display
- **Orders & Invoices** — Create orders, confirm, convert to invoice with stock tracking (allows negative stock for backorders); customer account summary panel shows customer details, outstanding due, cheques in hand/returned, and last bill on order create page; credit limit validation blocks order creation if customer's outstanding due exceeds their limit (with audit logging of blocked orders); professional print/PDF layout with totals, signatures, and footer
- **Backorders & Negative Stock** — Orders can be created even if stock is insufficient; stock can go negative (tracked as "backorder needed"); backorder badge with warning icon shows on products; purchasing stock automatically reduces negative stock first
- **Backorder Report** — Shows all products with negative stock, total backordered units, and status; CSV export available
- **SMS Service** — Send single or bulk SMS to customers; use templates (Order Confirmation, Payment Reminder, Thank You, Promotion); personalize messages with `{customer_name}`; all bulk SMS logged to `bsms_bulk_log`
- **Delivery Tracking** — Mark invoiced orders as delivered with one click; delivery date recorded automatically; delivered orders separated into their own tab with "Delivered On" column
- **Backup & Safety** — Full JSON backup export of all tables; restore from backup file with double confirmation; per-table CSV export; database overview with record counts and row preview; activity log showing recent orders, invoices, purchases, payments, returns & journal entries
- **Products** — Add/edit/delete products with stock tracking, low-stock badges, and comma-formatted prices; edit/delete restricted to admin user (Zaid)
- **Customers** — Full CRUD with foreign-key protection on delete; configurable credit limit per customer (default: Rs. 20,000)
- **Vendors** — Manage vendor list with auto-generated codes (V-001, V-002…) for purchases
- **Purchases** — Create purchases with vendor selection, payment type (cash/credit/bank), multiple items, comma-formatted Qty/Cost/MRP; purchase history with inline editing and detail view; auto stock update on existing products (reduces negative stock first)
- **Employees / Reps** — Manage staff with role field and "Is Rep" toggle for invoice assignment; commission tracking
- **Rep Payments** — Record and track payments made to employees/reps
- **Commission** — Calculate and view rep commissions based on invoiced sales
- **Returns** — Create return notes, view return details, track returned items
- **Banks** — Manage bank accounts with name, code, account number, and balance
- **Beginning Stock** — Record initial stock balances for products with date, reference number, items with quantity, cost, MRP, and total; print/PDF professional beginning stock sheet
- **User Privileges** — Full role-based access control (RBAC); create users with email, display name, username, user type (User/Admin/Manager); assign permissions per module (view/create/edit/delete); customize dashboard widget visibility per user; set passwords with validation; only super admins can manage other super admins
- **Permissions** — Per-module permissions (Dashboard, Products, Customers, Employees, Vendors, Journals, Invoices, Orders, SMS Service, Inventory Purchase, Beginning Stock, Backorder Report, Finance Journal Entry, Finance Rep Payments, Finance Receivables, Finance Payables, Finance Banks, Finance Cheques, Finance Bank Reconciliation, Finance Delete Receivable, Finance Delete Payable, Returns, Admin Backup, Admin Audit Log) with view/create/edit/delete actions; permissions enforced at route and component level
- **Journals** — Chart of accounts with code, name, type, category, and budget
- **Journal Entries** — Double-entry bookkeeping with multi-line debit/credit entries, balance validation, past entries list with expand/collapse and delete
- **Receivables** — Track credit invoice balances per customer; add payments (cash/cheque/card/other) with auto balance update; cheque payments include bank code with auto-populated bank name; on **Save Payment**, the payment modal auto-closes and an **80mm receipt PDF auto-downloads**
- **Payables** — Track purchase balances owed to vendors; view outstanding per vendor with aging (0-30/31-60/60+ days); make payments (cash/bank/cheque/other) with auto balance update; edit/delete vendor payments; cheque payments include bank code with auto-populated bank name; on **Save Payment** an **80mm receipt PDF auto-downloads**
- **Delete Receivable** — Search and delete receivable payments with date filtering, confirmation, and audit logging
- **Delete Payable** — Search and delete payable payments with date filtering, confirmation, and audit logging
- **Cheque Administration** — View all customer and vendor cheques in one place with status tracking; when a **receivable cheque** is moved from **Cheques In Hand** to **Deposited**, a popup asks **which bank** you are depositing into; confirming deposits the cheques and adds matching rows to **Bank Reconciliation** for that bank; when status is **Deposited**, the **days** indicator shows **0**
- **Bank Reconciliation** — Load incoming/outgoing bank lines per bank and date range; mark lines as reconciled (Yes/No); lines created automatically when receivable cheques are deposited to a selected bank (`bank_reconciliation_items`)
- **Invoice/Order/Return Print** — Professional A4 layout with logo, from/bill-to, items table, bank details (left-aligned above totals), subtotal/discount/total, signature section, and PDF download; optimized to fit single page with tight margins
- **Audit Log** — Date-grouped timeline view with category badges (Order, Invoice, Purchase, Payment, Bank, etc.); search & filter by action, user; auto-cleanup of logs older than 90 days; tracks bank CRUD, payment deletions, and all entity changes
- **Auth** — Email/password login via Supabase with personalized display name & role (configurable user map). Home page **Admin Login** forces the login screen even if you’re already signed in (`/login?force=1`).
- **Themes** — Light (blue/teal glass) and dark (emerald) themes with toggle; invoice always prints high-contrast
- **UI/UX** — Lucide icons, toast notifications, responsive sidebar with mobile hamburger, gradient stat cards, modern tables, modal forms with backdrop blur

## Tech Stack 

- **React** + **Vite**
- **Tailwind CSS** (dark mode + custom light glass theme)
- **Supabase** (Auth, Database, RLS policies)
- **React Router** (protected routes)
- **Lucide React** (icons)
- **ApexCharts** (dashboard charts)
- **html2pdf.js** (PDF export)

## Setup

1. Install dependencies

```bash
npm install
```

2. Create `.env` in the project root:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

3. Run dev server

```bash
npm run dev
```

## Supabase Setup (SMS & Backorders)

### 1. Run Database Migrations
Execute these SQL scripts in your Supabase SQL Editor (found in `supabase/` directory):
- `bsms_token_cache.sql` — Creates table to cache BSMS API tokens
- `bsms_bulk_log.sql` — Creates table to log bulk SMS campaigns

### 2. Set Edge Function Secrets
In your Supabase Dashboard → Project Settings → Edge Functions → Secrets:
- `PROJECT_URL` — Your Supabase project URL
- `PROJECT_SERVICE_KEY` — Your Supabase service role key (found in Project Settings → API)
- `BSMS_USERNAME` — Your Hutch BSMS username (e.g., `Niflan.sha0622@gmail.com`)
- `BSMS_PASSWORD` — Your Hutch BSMS password

### 3. Deploy Edge Function
```bash
cd "C:\Users\user\Desktop\Shayan Kids Care"
supabase functions deploy send-sms
```


## Supabase Tables

| Table | Description |
|---|---|
| `products` | Product catalog with name, code, price, stock |
| `customers` | Customer list with name, address, phone, and credit limit (default: Rs. 20,000) |
| `employees` | Staff with name, address, phones, email, role, is_rep |
| `vendors` | Vendor list with code, name, address, phone, status |
| `orders` | Sales order header with customer_id, rep_id, total, status (pending/confirmed/invoiced/converted/cancelled/delivered), delivered_at |
| `order_items` | Order line items with product_id, quantity, price, total |
| `invoices` | Invoice header with customer_id, rep_id, total_amount, payment_type |
| `invoice_items` | Invoice line items with product_id, quantity, price, total |
| `purchases` | Purchase header with vendor_id, date, ref_no, payment_type, total |
| `purchase_items` | Purchase line items with product_id, quantity, cost, mrp, total |
| `purchase_payments` | Payments made to vendors against purchases with amount, paid_at, method, bank_name, reference, note |
| `journals` | Chart of accounts with code, name, type, category, budget |
| `journal_categories` | Categories for journal classification |
| `journal_entries` | Journal entry header with date and description |
| `journal_entry_lines` | Entry lines with journal_id, debit, credit, description, status |
| `invoice_payments` | Payments received against credit invoices with amount, paid_at, method, bank_name, bank_code, reference, note |
| `returns` | Return note header with customer_id, rep_id, total, status |
| `return_items` | Return line items with product_id, quantity, price, total |
| `banks` | Bank accounts with name, code, account number, balance |
| `customer_cheques` | Cheque payments from customers with cheque_date, cheque_number, bank_code, bank_name, amount, status |
| `bank_reconciliation_items` | Bank reconciliation lines per `bank_id`: trx_date, ref_no, post_date, description, due_date, cheque_number, amount, reconciled |
| `commissions` | Commission records linked to reps and invoices |
| `audit_logs` | Audit trail with action, user_name, target_type, target_id, target_label, details; auto-cleaned after 90 days |
| `user_privileges` | User accounts with email, display name, username, user type, employee link, active status, super admin status, permissions JSON, dashboard widgets JSON |
| `rep_payments` | Payments made to employees/reps with date, amount, notes |
| `beginning_stock` | Beginning stock records with date, ref_no, items, totals |
| `bsms_token_cache` | Caches BSMS API access token and refresh token with expiry (single row, id=1) |
| `bsms_bulk_log` | Logs all bulk SMS campaigns with campaign name, mask, recipients, message, server refs, and status |

## User Personalization

User display names and roles are configured in `src/layouts/AppLayout.jsx`:

```js
const USER_MAP = {
  'zaidn2848@gmail.com':       { name: 'Zaid',   role: 'IT Developer' },
  'shayankidscare@gmail.com':  { name: 'Niflan', role: 'Owner' },
  // Add more users here
}
```

## Permissions

### Module List
- `dashboard`
- `products`
- `customers`
- `employees`
- `user_privileges`
- `vendors`
- `journals`
- `invoices`
- `orders`
- `inventory_purchase`
- `inventory_beginning_stock`
- `products` (Backorder Report)
- `finance_journal_entry`
- `finance_rep_payments`
- `finance_receivables`
- `finance_payables`
- `finance_banks`
- `finance_cheques`
- `finance_bank_reconciliation`
- `finance_delete_receivable`
- `finance_delete_payable`
- `returns`
- `admin_backup`
- `admin_audit_log`

### Permission Actions
- `view` — Can view the page/module
- `create` — Can create new records
- `edit` — Can edit existing records
- `delete` — Can delete records

### Notes
- Only **Super Admins** can manage other super admins
- Permissions are enforced at both route and component level
- Dashboard widget visibility can be customized per user

## Deploy to Vercel

1. Push to GitHub
2. Import repo on [vercel.com](https://vercel.com)
3. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables
4. Deploy — Vercel auto-detects Vite

If deploys fail with “not a member of the team”, invite the GitHub user as a **Vercel team member** (or connect their GitHub under Vercel account settings), or deploy from an account that owns the Vercel project.
