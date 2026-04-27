# Shayan Kids Care — Wholesale Management System

A modern admin dashboard for managing products, customers, orders, invoices, purchases, vendors, and journals for **Shayan Kids Care & Toys Store**.

## Features

- **Dashboard** — Personalized welcome, key stats (Today/Total Sales & Purchases, Products, Customers), recent invoices & purchases, date/time display
- **Orders & Invoices** — Create orders, confirm, convert to invoice with stock validation & auto stock deduction; professional print/PDF layout with totals, signatures, and footer
- **Products** — Add/edit/delete products with stock tracking, low-stock badges, and comma-formatted prices
- **Customers** — Full CRUD with foreign-key protection on delete
- **Vendors** — Manage vendor list for purchases
- **Purchases** — Create purchases with vendor selection, multiple items, comma-formatted Qty/Cost/MRP; purchase history with inline editing
- **Employees / Reps** — Manage staff with role field and "Is Rep" toggle for invoice assignment; commission tracking
- **Journals** — Chart of accounts with code, name, type, category, and budget
- **Journal Entries** — Double-entry bookkeeping with multi-line debit/credit entries, balance validation, past entries list with expand/collapse and delete
- **Receivables** — Track credit invoice balances per customer; see who paid and who didn't; add payments (cash/cheque/card/other) with auto balance update
- **Invoice/Order Print** — Professional A4 layout with logo, from/bill-to, items table, subtotal/discount/total, signature section, and PDF download
- **Auth** — Email/password login via Supabase with personalized display name & role (configurable user map)
- **Themes** — Light (blue/teal glass) and dark (emerald) themes with toggle; invoice always prints high-contrast
- **UI/UX** — Lucide icons, toast notifications, responsive sidebar with mobile hamburger, gradient stat cards, modern tables, modal forms with backdrop blur

## Tech Stack

- **React** + **Vite**
- **Tailwind CSS** (dark mode + custom light glass theme)
- **Supabase** (Auth, Database, RLS policies)
- **React Router** (protected routes)
- **Lucide React** (icons)
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

## Supabase Tables

| Table | Description |
|---|---|
| `products` | Product catalog with name, code, price, stock |
| `customers` | Customer list with name, address, phone |
| `employees` | Staff with name, address, phones, email, role, is_rep |
| `vendors` | Vendor list with name, address, phone |
| `orders` | Sales order header with customer_id, rep_id, total, status |
| `order_items` | Order line items with product_id, quantity, price, total |
| `invoices` | Invoice header with customer_id, rep_id, total_amount, payment_type |
| `invoice_items` | Invoice line items with product_id, quantity, price, total |
| `purchases` | Purchase header with vendor_id, date, ref_no, total |
| `purchase_items` | Purchase line items with product_id, quantity, cost, mrp, total |
| `journals` | Chart of accounts with code, name, type, category, budget |
| `journal_categories` | Categories for journal classification |
| `journal_entries` | Journal entry header with date and description |
| `journal_entry_lines` | Entry lines with journal_id, debit, credit, description, status |
| `invoice_payments` | Payments received against credit invoices with amount, paid_at, method, reference, note |

## User Personalization

User display names and roles are configured in `src/layouts/AppLayout.jsx`:

```js
const USER_MAP = {
  'zaidn2848@gmail.com':       { name: 'Zaid',   role: 'IT Developer' },
  'shayankidscare@gmail.com':  { name: 'Niflan', role: 'Owner' },
  // Add more users here
}
```

## Deploy to Vercel

1. Push to GitHub
2. Import repo on [vercel.com](https://vercel.com)
3. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables
4. Deploy — Vercel auto-detects Vite
