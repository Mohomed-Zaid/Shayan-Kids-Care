import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { ReportHeader, SummaryCards, ReportActions, ReportPagination, LoadingSkeleton, EmptyState, exportToExcel, exportToPDF } from '../../components/reports';
import { Search } from 'lucide-react';

const fmt = (val) => `Rs. ${Number(val ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

function CustomerStatementPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [fromDate, setFromDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: customersData, error } = await supabase.from('customers').select('id, name, phone').order('name');
      if (error) throw error;
      setCustomers(customersData ?? []);
      if (customersData?.length > 0) {
        setSelectedCustomerId(customersData[0].id);
      }
    } catch (e) {
      console.error('Error loading data:', e);
    } finally {
      setLoading(false);
    }
  };

  const { data, summary, totalPages, paginatedData } = useMemo(() => {
    if (!selectedCustomerId) {
      return { data: [], summary: {}, totalPages: 0, paginatedData: [] };
    }

    const startDate = new Date(fromDate);
    const endDate = new Date(toDate);
    endDate.setHours(23, 59, 59, 999);

    const allTransactions = [];

    // Get invoices for customer
    const invoices = customers.length > 0 ? [] : []; // Will get via another approach

    // For now, let's just create a placeholder structure
    return {
      data: [],
      summary: {
        openingBalance: 0,
        totalDebits: 0,
        totalCredits: 0,
        closingBalance: 0,
      },
      totalPages: 0,
      paginatedData: [],
    };
  }, [selectedCustomerId, fromDate, toDate, customers, page, pageSize]);

  const handlePrint = () => window.print();
  const handleExportPDF = () => exportToPDF('report-container', 'customer-statement.pdf');
  const handleExportExcel = () => {
    const excelData = paginatedData.map(t => ({
      'Date': t.date,
      'Reference': t.reference,
      'Description': t.description,
      'Debit': t.debit,
      'Credit': t.credit,
      'Balance': t.balance,
    }));
    exportToExcel(excelData, 'customer-statement.xlsx', 'Customer Statement');
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
        title="Customer Statement"
        generatedBy={generatedBy}
        generatedDate={generatedDate}
      />

      <div className="bg-white dark:bg-emerald-950/25 border border-slate-200 dark:border-emerald-400/20 rounded-xl p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-700 dark:text-emerald-50">Customer:</label>
            <select
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
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
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-emerald-400/20 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-700 dark:text-emerald-50">To:</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
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
          { label: 'Opening Balance', value: fmt(summary.openingBalance) },
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
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Statement Details</h2>
        </div>

        {paginatedData.length === 0 ? (
          <EmptyState message="No transactions found for this period" />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-emerald-900/30 text-slate-500 dark:text-emerald-100/80 border-b border-slate-200 dark:border-emerald-400/20">
              <tr>
                <th className="text-left px-5 py-3 font-semibold text-xs uppercase tracking-wider">Date</th>
                <th className="text-left px-5 py-3 font-semibold text-xs uppercase tracking-wider">Reference</th>
                <th className="text-left px-5 py-3 font-semibold text-xs uppercase tracking-wider">Description</th>
                <th className="text-right px-5 py-3 font-semibold text-xs uppercase tracking-wider">Debit</th>
                <th className="text-right px-5 py-3 font-semibold text-xs uppercase tracking-wider">Credit</th>
                <th className="text-right px-5 py-3 font-semibold text-xs uppercase tracking-wider">Balance</th>
              </tr>
            </thead>
            <tbody>
              {paginatedData.map((txn, idx) => (
                <tr key={idx} className="border-b border-slate-50 dark:border-emerald-400/10 hover:bg-slate-50 dark:hover:bg-emerald-500/5 transition-colors">
                  <td className="px-5 py-3.5 text-slate-600 dark:text-emerald-100/70">{txn.date}</td>
                  <td className="px-5 py-3.5 font-medium text-slate-900 dark:text-white">{txn.reference}</td>
                  <td className="px-5 py-3.5 text-slate-600 dark:text-emerald-100/70">{txn.description}</td>
                  <td className="px-5 py-3.5 text-right text-slate-600 dark:text-emerald-100/70">{txn.debit > 0 ? fmt(txn.debit) : '-'}</td>
                  <td className="px-5 py-3.5 text-right text-slate-600 dark:text-emerald-100/70">{txn.credit > 0 ? fmt(txn.credit) : '-'}</td>
                  <td className="px-5 py-3.5 text-right font-bold text-slate-900 dark:text-white">{fmt(txn.balance)}</td>
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
          total={data.length}
        />
      )}
    </div>
  );
}

export default CustomerStatementPage;
