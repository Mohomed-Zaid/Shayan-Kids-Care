import React from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { PermissionsProvider } from './contexts/PermissionsContext'
import { ToastProvider } from './contexts/ToastContext'
import ProtectedRoute from './components/ProtectedRoute'
import PermissionRoute from './components/PermissionRoute'
import PermissionActiveGuard from './components/PermissionActiveGuard'
import AppLayout from './layouts/AppLayout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import ProductsPage from './pages/ProductsPage'
import CustomersPage from './pages/CustomersPage'
import InvoicesPage from './pages/InvoicesPage'
import InvoiceViewPage from './pages/InvoiceViewPage'
import RepsPage from './pages/RepsPage'
import CommissionPage from './pages/CommissionPage'
import RepPaymentsPage from './pages/RepPaymentsPage'
import InvoiceEditPage from './pages/InvoiceEditPage'
import OrdersPage from './pages/OrdersPage'
import OrderCreatePage from './pages/OrderCreatePage'
import OrderViewPage from './pages/OrderViewPage'
import OrderEditPage from './pages/OrderEditPage'
import HomePage from './pages/HomePage'
import PurchasePage from './pages/PurchasePage'
import BeginningStockPage from './pages/BeginningStockPage'
import VendorsPage from './pages/VendorsPage'
import JournalsPage from './pages/JournalsPage'
import JournalEntryPage from './pages/JournalEntryPage'
import ReceivablesPage from './pages/ReceivablesPage'
import ReceivableCustomerPage from './pages/ReceivableCustomerPage'
import PayablesPage from './pages/PayablesPage'
import PayableVendorPage from './pages/PayableVendorPage'
import BanksPage from './pages/BanksPage'
import DeleteReceivablePage from './pages/DeleteReceivablePage'
import DeletePayablePage from './pages/DeletePayablePage'
import ReturnsPage from './pages/ReturnsPage'
import ReturnCreatePage from './pages/ReturnCreatePage'
import ReturnViewPage from './pages/ReturnViewPage'
import BackupPage from './pages/BackupPage'
import AuditLogPage from './pages/AuditLogPage'
import ChequeAdministrationPage from './pages/ChequeAdministrationPage'
import BankReconciliationPage from './pages/BankReconciliationPage'
import UserPrivilegePage from './pages/UserPrivilegePage'
import BackorderReportPage from './pages/BackorderReportPage'

function P({ module, action = 'view', children }) {
  return (
    <PermissionRoute module={module} action={action}>
      {children}
    </PermissionRoute>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<PermissionsProvider />}>
              <Route element={<PermissionActiveGuard />}>
                <Route element={<AppLayout />}>
                  <Route path="/dashboard" element={<P module="dashboard"><DashboardPage /></P>} />
                  <Route path="/products" element={<P module="products"><ProductsPage /></P>} />
                  <Route path="/customers" element={<P module="customers"><CustomersPage /></P>} />
                  <Route path="/reps" element={<P module="employees"><RepsPage /></P>} />
                  <Route path="/master-data/user-privileges" element={<P module="user_privileges"><UserPrivilegePage /></P>} />
                  <Route path="/vendors" element={<P module="vendors"><VendorsPage /></P>} />
                  <Route path="/journals" element={<P module="journals"><JournalsPage /></P>} />
                  <Route path="/invoices" element={<P module="invoices"><InvoicesPage /></P>} />
                  <Route path="/invoices/:id" element={<P module="invoices"><InvoiceViewPage /></P>} />
                  <Route path="/invoices/:id/edit" element={<P module="invoices" action="edit"><InvoiceEditPage /></P>} />
                  <Route path="/commission" element={<P module="commission"><CommissionPage /></P>} />
                  <Route path="/orders" element={<P module="orders"><OrdersPage /></P>} />
                  <Route path="/orders/new" element={<P module="orders" action="create"><OrderCreatePage /></P>} />
                  <Route path="/orders/:id/edit" element={<P module="orders" action="edit"><OrderEditPage /></P>} />
                  <Route path="/orders/:id" element={<P module="orders"><OrderViewPage /></P>} />
                  <Route path="/inventory/purchase" element={<P module="inventory_purchase"><PurchasePage /></P>} />
                  <Route path="/inventory/beginning-stock" element={<P module="inventory_beginning_stock"><BeginningStockPage /></P>} />
                  <Route path="/inventory/backorder-report" element={<P module="products"><BackorderReportPage /></P>} />
                  <Route path="/finance/journal-entry" element={<P module="finance_journal_entry"><JournalEntryPage /></P>} />
                  <Route path="/finance/rep-payments" element={<P module="finance_rep_payments"><RepPaymentsPage /></P>} />
                  <Route path="/finance/receivables" element={<P module="finance_receivables"><ReceivablesPage /></P>} />
                  <Route path="/finance/receivables/:customerId" element={<P module="finance_receivables"><ReceivableCustomerPage /></P>} />
                  <Route path="/finance/payables" element={<P module="finance_payables"><PayablesPage /></P>} />
                  <Route path="/finance/payables/:vendorId" element={<P module="finance_payables"><PayableVendorPage /></P>} />
                  <Route path="/finance/banks" element={<P module="finance_banks"><BanksPage /></P>} />
                  <Route path="/finance/cheques" element={<P module="finance_cheques"><ChequeAdministrationPage /></P>} />
                  <Route path="/finance/bank-reconciliation" element={<P module="finance_bank_reconciliation"><BankReconciliationPage /></P>} />
                  <Route path="/finance/delete-receivable" element={<P module="finance_delete_receivable"><DeleteReceivablePage /></P>} />
                  <Route path="/finance/delete-payable" element={<P module="finance_delete_payable"><DeletePayablePage /></P>} />
                  <Route path="/returns" element={<P module="returns"><ReturnsPage /></P>} />
                  <Route path="/returns/new" element={<P module="returns" action="create"><ReturnCreatePage /></P>} />
                  <Route path="/returns/:id" element={<P module="returns"><ReturnViewPage /></P>} />
                  <Route path="/backup" element={<P module="admin_backup"><BackupPage /></P>} />
                  <Route path="/audit-log" element={<P module="admin_audit_log"><AuditLogPage /></P>} />
                </Route>
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </ToastProvider>
    </AuthProvider>
  )
}
