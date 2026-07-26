import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { ReportHeader, SummaryCards, ReportActions, ReportPagination, LoadingSkeleton, EmptyState, exportToExcel, exportToPDF } from '../../components/reports';
import { Search } from 'lucide-react';

function SalesByCustomerPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [customers, setCustomers] = useState([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');

  useEffect(() => {
    loadData();
  }, []);
  
  const loadData = async () => {
    setLoading(true);
    try {
      const [customersResult, invoicesResult] = await Promise.all([
        supabase.from('customers').select('*').order('name'),
        supabase
          .from('invoices')
          .select(`
            id,
            customer_id,
            total_amount,
            invoice_payments ( amount )
          `),
      ]);
      
      setCustomers(customersResult.data || []);
      
      const customerSales = {};
      for (const inv of invoicesResult.data || []) {
        const cId = inv.customer_id;
        if (!customerSales[cId]) {
          customerSales[cId] = {
            customerId: cId,
            customer: customersResult.data?.find(c => c.id === cId),
            invoices: 0,
            totalSales: 0,
            amountPaid: 0,
            outstandingBalance: 0,
            lastPurchaseDate: null,
          };
        }
        
        customerSales[cId].invoices += 1;
        customerSales[cId].totalSales += (inv.total_amount || 0);
        
        for (const payment of inv.invoice_payments || []) {
          customerSales[cId].amountPaid += (payment.amount || 0);
        }
        
        if (!customerSales[cId].lastPurchaseDate || new Date(inv.created_at) > new Date(customerSales[cId].lastPurchaseDate)) {
          customerSales[cId].lastPurchaseDate = inv.created_at;
        }
      }
      
      for (const cId in customerSales) {
        customerSales[cId].outstandingBalance = customerSales[cId].totalSales - customerSales[cId].amountPaid;
      }
      
      setData(Object.values(customerSales));
    } catch (e) {
      console.error('Error loading data:', e);
    } finally {
      setLoading(false);
    }
  };
  
  const handlePrint = () => window.print();
  const handleExportPDF = () => exportToPDF('report-container', 'sales-by-customer.pdf');
  const handleExportExcel = () => {
    const excelData = filteredAndSortedData.map(item => ({
      'Customer Name': item.customer?.name || 'N/A',
      Phone: item.customer?.phone || 'N/A',
      'Number of Invoices': item.invoices,
      'Total Sales': item.totalSales,
      'Amount Paid': item.amountPaid,
      'Outstanding Balance': item.outstandingBalance,
      'Last Purchase Date': item.lastPurchaseDate ? new Date(item.lastPurchaseDate).toLocaleDateString() : 'N/A',
    }));
    exportToExcel(excelData, 'sales-by-customer.xlsx', 'Sales by Customer');
  };
  
  const filteredAndSortedData = useMemo(() => {
    let filtered = data;
    
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(item =>
        (item.customer?.name || '').toLowerCase().includes(searchLower) ||
        (item.customer?.phone || '').toLowerCase().includes(searchLower)
      );
    }
    
    if (selectedCustomer) {
      filtered = filtered.filter(item => item.customerId === selectedCustomer);
    }
    
    if (dateFrom || dateTo) {
      filtered = filtered.filter(item => {
        if (!item.lastPurchaseDate) return false;
        
        const purchaseDate = new Date(item.lastPurchaseDate);
        if (dateFrom) {
          const from = new Date(dateFrom + 'T00:00:00.000Z');
          if (purchaseDate < from) return false;
        }
        
        if (dateTo) {
          const to = new Date(dateTo + 'T23:59:59.999Z');
          if (purchaseDate > to) return false;
        }
        
        return true;
      });
    }
    
    filtered = [...filtered].sort((a, b) => {
      let aVal, bVal;
      if (sortBy === 'name') {
        aVal = (a.customer?.name || '').toLowerCase();
        bVal = (b.customer?.name || '').toLowerCase();
      } else if (sortBy === 'invoices') {
        aVal = a.invoices;
        bVal = b.invoices;
      } else if (sortBy === 'sales') {
        aVal = a.totalSales;
        bVal = b.totalSales;
      } else if (sortBy === 'outstanding') {
        aVal = a.outstandingBalance;
        bVal = b.outstandingBalance;
      }
      
      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      }
      return aVal < bVal ? 1 : -1;
    });
    
    return filtered;
  }, [data, search, selectedCustomer, dateFrom, dateTo, sortBy, sortOrder]);
  
  const summaryCards = useMemo(() => {
    const topCustomer = filteredAndSortedData.reduce((prev, curr) => (prev.totalSales > curr.totalSales ? prev : curr), { totalSales: -Infinity });
    const totalCustomers = filteredAndSortedData.length;
    const totalSales = filteredAndSortedData.reduce((sum, item) => sum + item.totalSales, 0);
    
    return [
      { label: 'Top Customer', value: topCustomer?.customer?.name || 'N/A' },
      { label: 'Highest Purchase', value: topCustomer?.totalSales ? `Rs. ${topCustomer.totalSales.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : 'N/A' },
      { label: 'Total Customers', value: totalCustomers.toString() },
      { label: 'Total Sales', value: `Rs. ${totalSales.toLocaleString(undefined, { minimumFractionDigits: 2 })}` },
    ];
  }, [filteredAndSortedData]);
  
  const totalPages = Math.ceil(filteredAndSortedData.length / pageSize);
  const paginatedData = filteredAndSortedData.slice((page -1)*pageSize, page*pageSize);
  
  const generatedBy = (() => {
    const email = user?.email || 'unknown';
    if (email === 'zaidn2848@gmail.com') return 'Zaid';
    if (email === 'shayankidscare@gmail.com') return 'Niflan';
    return email.split('@')[0];
  })();
  const generatedDate = new Date().toLocaleString();
  
  if (loading) {
    return <LoadingSkeleton />;
  }
  
  return (
    <div id="report-container" className="space-y-6">
      <ReportHeader
        title="Sales by Customer"
        generatedBy={generatedBy}
        generatedDate={generatedDate}
      />
      
      <div className="bg-white dark:bg-emerald-950/25 border border-slate-200 dark:border-emerald-400/20 rounded-xl p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-700 dark:text-emerald-50">Customer:</label>
            <select
              value={selectedCustomer}
              onChange={(e) => setSelectedCustomer(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-emerald-400/20 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="">All Customers</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-700 dark:text-emerald-50">From:</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-emerald-400/20 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-700 dark:text-emerald-50">To:</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-emerald-400/20 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
          
          <div className="relative flex-1 min-w-[200px] ml-auto">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-emerald-100/70" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customers..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 dark:border-emerald-400/20 bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
        </div>
      </div>
      
      <SummaryCards cards={summaryCards} />
      
      <ReportActions
        onPrint={handlePrint}
        onExportPDF={handleExportPDF}
        onExportExcel={handleExportExcel}
      />
      
      <div className="bg-white dark:bg-emerald-950/25 border border-slate-200 dark:border-emerald-400/20 rounded-xl overflow-hidden shadow-sm">
        <div className="p-5 border-b border-slate-200 dark:border-emerald-400/20 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Customer Sales</h2>
          <div className="flex items-center gap-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-emerald-400/20 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm text-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="name">Name</option>
              <option value="invoices">Invoices</option>
              <option value="sales">Sales</option>
              <option value="outstanding">Outstanding</option>
            </select>
            <button
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-emerald-400/20 bg-white dark:bg-slate-900 text-slate-700 dark:text-white text-sm font-medium hover:bg-slate-50 dark:hover:bg-emerald-500/10 transition-colors"
            >
              {sortOrder === 'asc' ? '↑' : '↓'}
            </button>
          </div>
        </div>
        
        {paginatedData.length === 0 ? (
          <EmptyState message="No customer sales data" />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-emerald-900/30 text-slate-500 dark:text-emerald-100/70 border-b border-slate-200 dark:border-emerald-400/20">
              <tr>
                <th className="text-left px-5 py-3 font-semibold text-xs uppercase tracking-wider">Customer Name</th>
                <th className="text-left px-5 py-3 font-semibold text-xs uppercase tracking-wider">Phone</th>
                <th className="text-left px-5 py-3 font-semibold text-xs uppercase tracking-wider">Number of Invoices</th>
                <th className="text-left px-5 py-3 font-semibold text-xs uppercase tracking-wider">Total Sales</th>
                <th className="text-left px-5 py-3 font-semibold text-xs uppercase tracking-wider">Amount Paid</th>
                <th className="text-left px-5 py-3 font-semibold text-xs uppercase tracking-wider">Outstanding Balance</th>
                <th className="text-left px-5 py-3 font-semibold text-xs uppercase tracking-wider">Last Purchase Date</th>
              </tr>
            </thead>
            <tbody>
              {paginatedData.map((item) => (
                <tr key={item.customerId} className="border-b border-slate-100 dark:border-emerald-400/10 hover:bg-slate-50 dark:hover:bg-emerald-500/5 transition-colors">
                  <td className="px-5 py-3.5 font-medium text-slate-900 dark:text-white">
                    {item.customer?.name || 'N/A'}
                  </td>
                  <td className="px-5 py-3.5 text-slate-600 dark:text-emerald-100/70">
                    {item.customer?.phone || 'N/A'}
                  </td>
                  <td className="px-5 py-3.5 text-slate-600 dark:text-emerald-100/70">
                    {item.invoices}
                  </td>
                  <td className="px-5 py-3.5 font-semibold text-slate-900 dark:text-white">
                    Rs. {Number(item.totalSales || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-5 py-3.5 text-slate-600 dark:text-emerald-100/70">
                    Rs. {Number(item.amountPaid || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`font-semibold ${
                      item.outstandingBalance > 0
                        ? 'text-red-600 dark:text-red-400'
                        : item.outstandingBalance < 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-slate-900 dark:text-white'
                    }`}
                    >
                      Rs. {Number(item.outstandingBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-slate-600 dark:text-emerald-100/70">
                    {item.lastPurchaseDate ? new Date(item.lastPurchaseDate).toLocaleDateString() : 'N/A'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      
      <ReportPagination
        page={page}
        setPage={setPage}
        totalPages={totalPages}
        pageSize={pageSize}
        setPageSize={setPageSize}
        total={filteredAndSortedData.length}
      />
    </div>
  );
}

export default SalesByCustomerPage;
