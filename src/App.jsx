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
import PurchaseListPage from './pages/PurchaseListPage'
import PurchaseViewPage from './pages/PurchaseViewPage'
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
import SMSServicePage from './pages/SMSServicePage'
import SalesReportsPage from './pages/reports/SalesReportsPage'
import CurrentStockReportPage from './pages/reports/CurrentStockReportPage'
import LowStockReportPage from './pages/reports/LowStockReportPage'
import OutstandingReceivablesReportPage from './pages/reports/OutstandingReceivablesReportPage'
import CustomerStatementPage from './pages/reports/CustomerStatementPage'
import CustomerLedgerPage from './pages/reports/CustomerLedgerPage'
import CustomerReportsPage from './pages/reports/CustomerReportsPage'
import ReportsLandingPage from './pages/reports/ReportsLandingPage'
import ReportDirectoryPage from './pages/reports/ReportDirectoryPage'
import ReportRoutePage from './pages/reports/ReportRoutePage'
import PurchaseReportsPage from './pages/reports/PurchaseReportsPage'
import InventoryReportsPage from './pages/reports/InventoryReportsPage'
import FinanceReportsPage from './pages/reports/FinanceReportsPage'
import VendorReportsPage from './pages/reports/VendorReportsPage'
import RepCommissionReportsPage from './pages/reports/RepCommissionReportsPage'
import ReturnsDeliveryReportsPage from './pages/reports/ReturnsDeliveryReportsPage'
import AdminSystemReportsPage from './pages/reports/AdminSystemReportsPage'
import ChequeReportsPage from './pages/reports/ChequeReportsPage'
import DayBookReportPage from './pages/reports/DayBookReportPage'
import ExpenseReportsPage from './pages/reports/ExpenseReportsPage'
import ProfitLossReportPage from './pages/reports/ProfitLossReportPage'
import BalanceSheetReportPage from './pages/reports/BalanceSheetReportPage'
import SalaryTransferRequestPage from './pages/SalaryTransferRequestPage'

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
                  <Route path="/sms-service" element={<P module="sms"><SMSServicePage /></P>} />
                  <Route path="/inventory/purchase" element={<P module="inventory_purchase"><PurchasePage /></P>} />
                  <Route path="/inventory/purchases" element={<P module="inventory_purchase"><PurchaseListPage /></P>} />
                  <Route path="/inventory/purchases/:id" element={<P module="inventory_purchase"><PurchaseViewPage /></P>} />
                  <Route path="/inventory/beginning-stock" element={<P module="inventory_beginning_stock"><BeginningStockPage /></P>} />
                  
                  {/* Reports */}
                  <Route path="/reports" element={<ReportsLandingPage />} />
                  <Route path="/reports/customer/outstanding-receivables" element={<Navigate to="/reports/customers/outstanding-receivables" replace />} />
                  <Route path="/reports/customer/statement" element={<Navigate to="/reports/customers/statement" replace />} />
                  <Route path="/reports/customer/ledger" element={<Navigate to="/reports/customers/ledger" replace />} />
                  <Route path="/reports/day-book" element={<P module="reports_day_book"><DayBookReportPage /></P>} />
                  <Route path="/reports/expenses" element={<Navigate to="/reports/finance/expense-summary" replace />} />
                  <Route path="/reports/profit-loss" element={<Navigate to="/reports/finance/profit-loss" replace />} />
                  <Route path="/reports/balance-sheet" element={<Navigate to="/reports/finance/balance-sheet" replace />} />
                  <Route path="/reports/returns-delivery" element={<Navigate to="/reports/returns" replace />} />
                  <Route path="/reports/admin-system" element={<Navigate to="/reports/admin" replace />} />
                  <Route path="/reports/:categoryKey/:reportSlug" element={<ReportRoutePage />} />
                  <Route path="/reports/:categoryKey" element={<ReportDirectoryPage />} />
                  <Route path="/finance/journal-entry" element={<P module="finance_journal_entry"><JournalEntryPage /></P>} />
                  <Route path="/finance/rep-payments" element={<P module="finance_rep_payments"><RepPaymentsPage /></P>} />
                  <Route path="/finance/receivables" element={<P module="finance_receivables"><ReceivablesPage /></P>} />
                  <Route path="/finance/receivables/:customerId" element={<P module="finance_receivables"><ReceivableCustomerPage /></P>} />
                  <Route path="/finance/payables" element={<P module="finance_payables"><PayablesPage /></P>} />
                  <Route path="/finance/payables/:vendorId" element={<P module="finance_payables"><PayableVendorPage /></P>} />
                  <Route path="/finance/banks" element={<P module="finance_banks"><BanksPage /></P>} />
                  <Route path="/finance/cheques" element={<P module="finance_cheques"><ChequeAdministrationPage /></P>} />
                  <Route path="/finance/bank-reconciliation" element={<P module="finance_bank_reconciliation"><BankReconciliationPage /></P>} />
                  <Route path="/finance/bank-letters/salary-transfer" element={<P module="finance_bank_letters"><SalaryTransferRequestPage /></P>} />
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
