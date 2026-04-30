import React from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ToastProvider } from './contexts/ToastContext'
import ProtectedRoute from './components/ProtectedRoute'
import AppLayout from './layouts/AppLayout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import ProductsPage from './pages/ProductsPage'
import CustomersPage from './pages/CustomersPage'
import InvoicesPage from './pages/InvoicesPage'
import InvoiceViewPage from './pages/InvoiceViewPage'
import RepsPage from './pages/RepsPage'
import CommissionPage from './pages/CommissionPage'
import InvoiceEditPage from './pages/InvoiceEditPage'
import OrdersPage from './pages/OrdersPage'
import OrderCreatePage from './pages/OrderCreatePage'
import OrderViewPage from './pages/OrderViewPage'
import OrderEditPage from './pages/OrderEditPage'
import HomePage from './pages/HomePage'
import PurchasePage from './pages/PurchasePage'
import VendorsPage from './pages/VendorsPage'
import JournalsPage from './pages/JournalsPage'
import JournalEntryPage from './pages/JournalEntryPage'
import ReceivablesPage from './pages/ReceivablesPage'
import ReceivableCustomerPage from './pages/ReceivableCustomerPage'
import PayablesPage from './pages/PayablesPage'
import PayableVendorPage from './pages/PayableVendorPage'
import BanksPage from './pages/BanksPage'
import ReturnsPage from './pages/ReturnsPage'
import ReturnCreatePage from './pages/ReturnCreatePage'
import ReturnViewPage from './pages/ReturnViewPage'
import BackupPage from './pages/BackupPage'
import AuditLogPage from './pages/AuditLogPage'

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/products" element={<ProductsPage />} />
            <Route path="/customers" element={<CustomersPage />} />
            <Route path="/reps" element={<RepsPage />} />
            <Route path="/invoices" element={<InvoicesPage />} />
            <Route path="/invoices/:id" element={<InvoiceViewPage />} />
            <Route path="/invoices/:id/edit" element={<InvoiceEditPage />} />
            <Route path="/commission" element={<CommissionPage />} />
            <Route path="/orders" element={<OrdersPage />} />
            <Route path="/orders/new" element={<OrderCreatePage />} />
            <Route path="/orders/:id/edit" element={<OrderEditPage />} />
            <Route path="/orders/:id" element={<OrderViewPage />} />
            <Route path="/inventory/purchase" element={<PurchasePage />} />
            <Route path="/vendors" element={<VendorsPage />} />
            <Route path="/journals" element={<JournalsPage />} />
            <Route path="/finance/journal-entry" element={<JournalEntryPage />} />
            <Route path="/finance/receivables" element={<ReceivablesPage />} />
            <Route path="/finance/receivables/:customerId" element={<ReceivableCustomerPage />} />
            <Route path="/finance/payables" element={<PayablesPage />} />
            <Route path="/finance/payables/:vendorId" element={<PayableVendorPage />} />
            <Route path="/finance/banks" element={<BanksPage />} />
            <Route path="/returns" element={<ReturnsPage />} />
            <Route path="/returns/new" element={<ReturnCreatePage />} />
            <Route path="/returns/:id" element={<ReturnViewPage />} />
            <Route path="/backup" element={<BackupPage />} />
            <Route path="/audit-log" element={<AuditLogPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      </ToastProvider>
    </AuthProvider>
  )
}
