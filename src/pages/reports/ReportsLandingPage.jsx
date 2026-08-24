import React from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, Database, Users, FileText, TrendingUp, Package, Wallet } from 'lucide-react';

const reportCategories = [
  {
    key: 'sales',
    title: 'Sales Reports',
    icon: TrendingUp,
    reports: [
      { name: 'Daily Sales Report', path: '/reports/sales/daily' },
      { name: 'Monthly Sales Report', path: '/reports/sales/monthly' },
      { name: 'Sales by Customer', path: '/reports/sales/by-customer' },
      { name: 'Sales by Product', path: '/reports/sales/by-product' },
      { name: 'Sales by Sales Rep', path: '/reports/sales/by-sales-rep' },
    ],
  },
  {
    key: 'inventory',
    title: 'Inventory Reports',
    icon: Package,
    reports: [
      { name: 'Detailed Inventory Report', path: '/reports/inventory/detailed' },
      { name: 'Current Stock Report', path: '/reports/inventory/current-stock' },
      { name: 'Low Stock Report', path: '/reports/inventory/low-stock' },
      { name: 'Backorder Report', path: '/reports/inventory/backorder' },
    ],
  },
  {
    key: 'purchase',
    title: 'Purchase Reports',
    icon: Database,
    reports: [
      { name: 'Purchase Reports Suite', path: '/reports/purchases' },
    ],
  },
  {
    key: 'finance',
    title: 'Finance Reports',
    icon: Wallet,
    reports: [
      { name: 'Complete Finance Reports Suite', path: '/reports/finance' },
    ],
  },
  {
    key: 'vendor',
    title: 'Vendor Reports',
    icon: Database,
    reports: [
      { name: 'Complete Vendor Reports Suite', path: '/reports/vendors' },
    ],
  },
  {
    key: 'reps',
    title: 'Rep & Commission Reports',
    icon: TrendingUp,
    reports: [
      { name: 'Complete Rep & Commission Reports Suite', path: '/reports/reps' },
    ],
  },
  {
    key: 'returns-delivery',
    title: 'Returns & Delivery Reports',
    icon: Package,
    reports: [
      { name: 'Complete Returns & Delivery Reports Suite', path: '/reports/returns-delivery' },
    ],
  },
  {
    key: 'admin-system',
    title: 'Admin, Audit & System Reports',
    icon: BarChart3,
    reports: [
      { name: 'Administrative Control & Audit Reports', path: '/reports/admin-system' },
    ],
  },
  {
    key: 'customer',
    title: 'Customer Reports',
    icon: Users,
    reports: [
      { name: 'Detailed Customer Reports', path: '/reports/customers' },
      { name: 'Outstanding Receivables', path: '/reports/customer/outstanding-receivables' },
      { name: 'Customer Statement', path: '/reports/customer/statement' },
      { name: 'Customer Ledger', path: '/reports/customer/ledger' },
    ],
  },
];

export default function ReportsLandingPage() {
  return (
    <div className="space-y-8">
      <div className="bg-white dark:bg-emerald-950/25 border border-slate-200 dark:border-emerald-400/20 rounded-xl p-8 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="bg-emerald-500/10 p-4 rounded-xl">
            <BarChart3 size={40} className="text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Reports</h1>
            <p className="text-slate-600 dark:text-emerald-100/70 mt-1">
              Access all sales, inventory, and customer reports
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {reportCategories.map((category) => {
          const Icon = category.icon;
          return (
            <div
              key={category.key}
              className="bg-white dark:bg-emerald-950/25 border border-slate-200 dark:border-emerald-400/20 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-slate-50 dark:bg-emerald-900/30 p-3 rounded-lg">
                  <Icon size={24} className="text-slate-700 dark:text-emerald-400" />
                </div>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white">{category.title}</h2>
              </div>
              <ul className="space-y-2">
                {category.reports.map((report) => (
                  <li key={report.path}>
                    <Link
                      to={report.path}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-700 dark:text-emerald-100/80 hover:bg-slate-50 dark:hover:bg-emerald-500/10 transition-colors"
                    >
                      <FileText size={16} />
                      {report.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
