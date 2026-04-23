# Shayan Kids Care — Wholesale Management System

A modern admin dashboard for managing products, customers, employees, and invoices for **Shayan Kids Care & Toys Store**.

## Features

- **Dashboard** — Overview stats (products, customers, employees, invoices) with recent invoices
- **Products** — Add/edit/delete products with stock tracking and low-stock badges
- **Customers** — Full CRUD with foreign-key protection on delete
- **Employees** — Manage staff with role field and "Is Rep" toggle for invoice assignment
- **Invoices** — Create invoices with product lines, rep selection, stock validation, and auto stock deduction
- **Invoice View** — Professional invoice layout with PDF download and print support
- **Auth** — Email/password login via Supabase; auto sign-out on tab close
- **UI/UX** — Lucide icons, toast notifications, responsive sidebar with mobile hamburger, colored stat cards, modern tables, modal forms with backdrop blur

## Tech Stack

- **React** + **Vite**
- **Tailwind CSS**
- **Supabase** (Auth, Database)
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
| `invoices` | Invoice header with customer_id, rep_id, total_amount, invoice_number |
| `invoice_items` | Line items with product_id, quantity, price, total |

## Deploy to Vercel

1. Push to GitHub
2. Import repo on [vercel.com](https://vercel.com)
3. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables
4. Deploy — Vercel auto-detects Vite
