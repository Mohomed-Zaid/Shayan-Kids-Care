import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { ReportHeader, SummaryCards, ReportActions, ReportPagination, LoadingSkeleton, EmptyState, exportToExcel, exportToPDF } from '../../components/reports';
import { Search } from 'lucide-react';

const fmt = (val) => `Rs. ${Number(val ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

function CustomerLedgerPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [fromDate, setFromDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString().split('T')[0]);
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [returns, setReturns] = useState([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [custRes, invRes, payRes, retRes] = await Promise.all([
        supabase.from('customers').select('id, name, phone').order('name'),
        supabase.from('invoices').select('id, invoice_number, customer_id, total_amount, created_at, customers(name)'),
        supabase.from('invoice_payments').select('id, invoice_id, amount, paid_at, method').order('paid_at', { ascending: true }),
        supabase.from('returns').select('id, customer_id, total_amount, created_at'),
      ]);

      if (custRes.error) throw custRes.error;
      if (invRes.error) throw invRes.error;
      if (payRes.error) throw payRes.error;
      if (retRes.error) throw retRes.error;

      setCustomers(custRes.data ?? []);
      setInvoices(invRes.data ?? []);
      setPayments(payRes.data ?? []);
      setReturns(retRes.data ?? []);

      if (custRes.data?.length > 0) {
        setSelectedCustomerId(custRes.data[0].id);
      }
    } catch (e) {
      console.error('Error loading data:', e);
    } finally {
      setLoading(false);
    }
  };

  const { ledgerData, summary, totalPages, paginatedData } = useMemo(() => {
    if (!selectedCustomerId) {
      return { ledgerData: [], summary: {}, totalPages: 0, paginatedData: [] };
    }

    const startDate = new Date(fromDate);
    const endDate = new Date(toDate);
    endDate.setHours(23, 59, 59, 999);

    const transactions = [];

    // Add invoices
    const customerInvoices = invoices.filter(inv => inv.customer_id === selectedCustomerId);
    for (const inv of customerInvoices) {
      const invDate = new Date(inv.created_at);
      if (invDate >= startDate && invDate <= endDate) {
        transactions.push({
          date: inv.created_at.split('T')[0],
          reference: `INV-${String(inv.invoice_number ?? inv.id).padStart(4, '0')}`,
          type: 'Invoice',
          debit: Number(inv.total_amount ?? 0),
          credit: 0,
          description: 'Sales Invoice',
        });
      }
    }

    // Add returns
    const customerReturns = returns.filter(ret => ret.customer_id === selectedCustomerId);
    for (const ret of customerReturns) {
      const retDate = new Date(ret.created_at);
      if (retDate >= startDate && retDate <= endDate) {
        transactions.push({
          date: ret.created_at.split('T')[0],
          reference: `RET-${String(ret.id).slice(0, 4)}`,
          type: 'Return',
          debit: 0,
          credit: Number(ret.total_amount ?? 0),
          description: 'Sales Return',
        });
      }
    }

    // Add payments
    const customerInvoiceIds = customerInvoices.map(inv => inv.id);
    const customerPayments = payments.filter(pay => customerInvoiceIds.includes(pay.invoice_id));
    for (const pay of customerPayments) {
      const payDate = new Date(pay.paid_at);
      if (payDate >= startDate && payDate <= endDate) {
        transactions.push({
          date: pay.paid_at.split('T')[0],
          reference: `PAY-${String(pay.id).slice(0, 4)}`,
          type: 'Payment',
          debit: 0,
          credit: Number(pay.amount ?? 0),
          description: `Payment (${pay.method})`,
        });
      }
    }

    // Sort transactions by date
    transactions.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Calculate running balance
    let runningBalance = 0;
    const ledgerWithBalance = transactions.map(t => {
      runningBalance += t.debit - t.credit;
      return { ...t, balance: runningBalance };
    });

    // Calculate summary
    const totalDebits = transactions.reduce((sum, t) => sum + t.debit, 0);
    const totalCredits = transactions.reduce((sum, t) => sum + t.credit, 0);
    const summary = {
      openingBalance: 0,
      totalDebits,
      totalCredits,
      closingBalance: totalDebits - totalCredits,
    };

    // Pagination
    const totalPages = Math.ceil(ledgerWithBalance.length / pageSize);
    const paginatedData = ledgerWithBalance.slice((page - 1) * pageSize, page * pageSize);

    return { ledgerData: ledgerWithBalance, summary, totalPages, paginatedData };
  }, [selectedCustomerId, fromDate, toDate, invoices, payments, returns, page, pageSize]);

  const handlePrint = () => window.print();
  const handleExportPDF = () => exportToPDF('report-container', 'customer-ledger.pdf');
  const handleExportExcel = () => {
    const excelData = paginatedData.map(t => ({
      'Date': t.date,
      'Reference': t.reference,
      'Transaction Type': t.type,
      'Debit': t.debit,
      'Credit': t.credit,
      'Running Balance': t.balance,
      'Description': t.description,
    }));
    exportToExcel(excelData, 'customer-ledger.xlsx', 'Customer Ledger');
  };

  const generatedBy = (() => {
    const email = user?.email || 'unknown';
    if (email === 'zaidn2848@gmail.com') return 'Zaid';
    if (email === 'shayankidscare@gmail.com') return 'Niflan';
    return email.split('@')[0];
  })();
  const generatedDate = new Date().toLocaleString();

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId);

  if (loading) {
    return <LoadingSkeleton />;
  }

  return (
    <div id="report-container" className="space-y-6">
      <ReportHeader
        title="Customer Ledger"
        generatedBy={generatedBy}
        generatedDate={generatedDate}
      />

      <div className="bg-white dark:bg-emerald-950/25 border border-slate-200 dark:border-emerald-400/20 rounded-xl p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-700 dark:text-emerald-50">Customer:</label>
            <select
              value={selectedCustomerId}
              onChange={(e) => {
                setSelectedCustomerId(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-slate-300 dark:border-emerald-400/20 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 min-w-[200px]"
            >
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-700 dark:text-emerald-50">From:</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-slate-300 dark:border-emerald-400/20 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-700 dark:text-emerald-50">To:</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-slate-300 dark:border-emerald-400/20 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
        </div>
      </div>

      {selectedCustomer && (
        <div className="bg-white dark:bg-emerald-950/25 border border-slate-200 dark:border-emerald-400/20 rounded-xl p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">{selectedCustomer.name}</h3>
          <p className="text-sm text-slate-600 dark:text-emerald-100/70">Phone: {selectedCustomer.phone || '-'}</p>
        </div>
      )}

      {selectedCustomer && (
        <SummaryCards cards={[
          { label: 'Total Debits', value: fmt(summary.totalDebits) },
          { label: 'Total Credits', value: fmt(summary.totalCredits) },
          { label: 'Closing Balance', value: fmt(summary.closingBalance) },
        ]} />
      )}

      <ReportActions
        onPrint={handlePrint}
        onExportPDF={handleExportPDF}
        onExportExcel={handleExportExcel}
      />

      <div className="bg-white dark:bg-emerald-950/25 border border-slate-200 dark:border-emerald-400/20 rounded-xl overflow-hidden shadow-sm">
        <div className="p-5 border-b border-slate-200 dark:border-emerald-400/20">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Ledger Transactions</h2>
        </div>

        {paginatedData.length === 0 ? (
          <EmptyState message="No transactions found for this period" />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-emerald-900/30 text-slate-500 dark:text-emerald-100/80 border-b border-slate-200 dark:border-emerald-400/20">
              <tr>
                <th className="text-left px-5 py-3 font-semibold text-xs uppercase tracking-wider">Date</th>
                <th className="text-left px-5 py-3 font-semibold text-xs uppercase tracking-wider">Reference</th>
                <th className="text-left px-5 py-3 font-semibold text-xs uppercase tracking-wider">Transaction Type</th>
                <th className="text-right px-5 py-3 font-semibold text-xs uppercase tracking-wider">Debit</th>
                <th className="text-right px-5 py-3 font-semibold text-xs uppercase tracking-wider">Credit</th>
                <th className="text-right px-5 py-3 font-semibold text-xs uppercase tracking-wider">Running Balance</th>
                <th className="text-left px-5 py-3 font-semibold text-xs uppercase tracking-wider">Description</th>
              </tr>
            </thead>
            <tbody>
              {paginatedData.map((txn, idx) => (
                <tr key={idx} className="border-b border-slate-50 dark:border-emerald-400/10 hover:bg-slate-50 dark:hover:bg-emerald-500/5 transition-colors">
                  <td className="px-5 py-3.5 text-slate-600 dark:text-emerald-100/70">{txn.date}</td>
                  <td className="px-5 py-3.5 font-medium text-slate-900 dark:text-white">{txn.reference}</td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                      txn.type === 'Invoice' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' :
                      txn.type === 'Payment' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' :
                      'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                    }`}>
                      {txn.type}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    {txn.debit > 0 ? (
                      <span className="font-semibold text-slate-900 dark:text-white">{fmt(txn.debit)}</span>
                    ) : '-'}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    {txn.credit > 0 ? (
                      <span className="font-semibold text-slate-900 dark:text-white">{fmt(txn.credit)}</span>
                    ) : '-'}
                  </td>
                  <td className="px-5 py-3.5 text-right font-bold text-slate-900 dark:text-white">{fmt(txn.balance)}</td>
                  <td className="px-5 py-3.5 text-slate-600 dark:text-emerald-100/70">{txn.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selectedCustomer && (
        <ReportPagination
          page={page}
          setPage={setPage}
          totalPages={totalPages}
          pageSize={pageSize}
          setPageSize={setPageSize}
          total={ledgerData.length}
        />
      )}
    </div>
  );
}

export default CustomerLedgerPage;
