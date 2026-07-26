import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { ReportHeader, SummaryCards, ReportActions, ReportPagination, LoadingSkeleton, EmptyState, exportToExcel, exportToPDF } from '../../components/reports';

function MonthlySalesReportPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState([]);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [sortBy, setSortBy] = useState('date');
  const [sortOrder, setSortOrder] = useState('desc');

  useEffect(() => {
    loadData();
  }, []);
  
  const loadData = async () => {
    setLoading(true);
    try {
      const { data: invoices, error } = await supabase
        .from('invoices')
        .select(`
          id,
          invoice_number,
          created_at,
          total_amount
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      const aggregated = {};
      for (const inv of invoices) {
        const date = new Date(inv.created_at);
        const m = date.getMonth() + 1;
        const y = date.getFullYear();
        const key = `${y}-${m}`;
        
        if (!aggregated[key]) {
          aggregated[key] = {
            year: y,
            month: m,
            invoices: 0,
            sales: 0,
            discounts: 0,
            netSales: 0,
          };
        }
        
        aggregated[key].invoices += 1;
        aggregated[key].sales += (inv.total_amount || 0);
        aggregated[key].netSales += (inv.total_amount || 0); // discount not tracked yet
      }
      
      const months = [];
      for (let y = year - 5; y <= year + 1; y++) {
        for (let m = 1; m <= 12; m++) {
          const key = `${y}-${m}`;
          if (aggregated[key]) {
            months.push(aggregated[key]);
          }
        }
      }
      
      setData(months);
    } catch (e) {
      console.error('Error loading data:', e);
    } finally {
      setLoading(false);
    }
  };
  
  const handlePrint = () => window.print();
  const handleExportPDF = () => {
    exportToPDF('report-container', 'monthly-sales-report.pdf');
  };
  const handleExportExcel = () => {
    const excelData = filteredAndSortedData.map(item => ({
      Month: `${getMonthName(item.month)} ${item.year}`,
      Invoices: item.invoices,
      Sales: item.sales,
      'Net Sales': item.netSales,
      'Avg Invoice': item.invoices > 0 ? item.sales / item.invoices : 0,
    }));
    exportToExcel(excelData, 'monthly-sales-report.xlsx', 'Monthly Sales Report');
  };
  
  const getMonthName = (m) => {
    const months = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return months[m];
  };
  
  const filteredAndSortedData = useMemo(() => {
    let filtered = data.filter(item => item.year === year);
    
    if (month !== 'all') {
      filtered = filtered.filter(item => item.month === month);
    }
    
    filtered = [...filtered].sort((a, b) => {
      let aVal, bVal;
      if (sortBy === 'date') {
        aVal = a.year * 100 + a.month;
        bVal = b.year * 100 + b.month;
      } else if (sortBy === 'invoices') {
        aVal = a.invoices;
        bVal = b.invoices;
      } else if (sortBy === 'sales') {
        aVal = a.sales;
        bVal = b.sales;
      }
      
      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      }
      return aVal < bVal ? 1 : -1;
    });
    
    return filtered;
  }, [data, month, year, sortBy, sortOrder]);
  
  const totalPages = Math.ceil(filteredAndSortedData.length / pageSize);
  const paginatedData = filteredAndSortedData.slice((page -1)*pageSize, page*pageSize);
  
  const summaryCards = useMemo(() => {
    const filtered = filteredAndSortedData;
    const totalInvoices = filtered.reduce((sum, item) => sum + item.invoices, 0);
    const totalSales = filtered.reduce((sum, item) => sum + item.sales, 0);
    const avgInvoice = totalInvoices > 0 ? totalSales / totalInvoices : 0;
    
    return [
      { label: 'Total Invoices', value: totalInvoices.toLocaleString() },
      { label: 'Total Sales', value: `Rs. ${totalSales.toLocaleString(undefined, { minimumFractionDigits: 2 })}` },
      { label: 'Avg Invoice Value', value: `Rs. ${avgInvoice.toLocaleString(undefined, { minimumFractionDigits: 2 })}` },
    ];
  }, [filteredAndSortedData]);
  
  const generatedBy = (() => {
    const email = user?.email || 'unknown';
    if (email === 'zaidn2848@gmail.com') return 'Zaid';
    if (email === 'shayankidscare@gmail.com') return 'Niflan';
    return email.split('@')[0];
  })();
  const generatedDate = new Date().toLocaleString();
  
  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear();
    return Array.from({ length: 10 }, (_, i) => current - 5 + i);
  }, []);
  
  if (loading) {
    return <LoadingSkeleton />;
  }
  
  return (
    <div id="report-container" className="space-y-6">
      <ReportHeader
        title="Monthly Sales Report"
        generatedBy={generatedBy}
        generatedDate={generatedDate}
      />
      
      <div className="bg-white dark:bg-emerald-950/25 border border-slate-200 dark:border-emerald-400/20 rounded-xl p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-700 dark:text-emerald-50">Year:</label>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="rounded-lg border border-slate-300 dark:border-emerald-400/20 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-700 dark:text-emerald-50">Month:</label>
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="rounded-lg border border-slate-300 dark:border-emerald-400/20 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="all">All Months</option>
              {[
                { value: 1, label: 'January' },
                { value: 2, label: 'February' },
                { value: 3, label: 'March' },
                { value: 4, label: 'April' },
                { value: 5, label: 'May' },
                { value: 6, label: 'June' },
                { value: 7, label: 'July' },
                { value: 8, label: 'August' },
                { value: 9, label: 'September' },
                { value: 10, label: 'October' },
                { value: 11, label: 'November' },
                { value: 12, label: 'December' },
              ].map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          
          <div className="flex items-center gap-2 ml-auto">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-emerald-400/20 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm text-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="date">Date</option>
              <option value="invoices">Invoices</option>
              <option value="sales">Sales</option>
            </select>
            <button
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-emerald-400/20 bg-white dark:bg-slate-900 text-slate-700 dark:text-white text-sm font-medium hover:bg-slate-50 dark:hover:bg-emerald-500/10 transition-colors"
            >
              {sortOrder === 'asc' ? '↑' : '↓'}
            </button>
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
        <div className="p-5 border-b border-slate-200 dark:border-emerald-400/20">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Monthly Sales</h2>
        </div>
        
        {paginatedData.length === 0 ? (
          <EmptyState message="No sales data for this period" />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-emerald-900/30 text-slate-500 dark:text-emerald-100/70 border-b border-slate-200 dark:border-emerald-400/20">
              <tr>
                <th className="text-left px-5 py-3 font-semibold text-xs uppercase tracking-wider">Month</th>
                <th className="text-left px-5 py-3 font-semibold text-xs uppercase tracking-wider">Invoices</th>
                <th className="text-left px-5 py-3 font-semibold text-xs uppercase tracking-wider">Sales</th>
                <th className="text-left px-5 py-3 font-semibold text-xs uppercase tracking-wider">Net Sales</th>
                <th className="text-left px-5 py-3 font-semibold text-xs uppercase tracking-wider">Avg Invoice</th>
              </tr>
            </thead>
            <tbody>
              {paginatedData.map((item, index) => (
                <tr key={`${item.year}-${item.month}`} className="border-b border-slate-100 dark:border-emerald-400/10 hover:bg-slate-50 dark:hover:bg-emerald-500/5 transition-colors">
                  <td className="px-5 py-3.5 font-medium text-slate-900 dark:text-white">
                    {getMonthName(item.month)} {item.year}
                  </td>
                  <td className="px-5 py-3.5 text-slate-600 dark:text-emerald-100/70">
                    {item.invoices}
                  </td>
                  <td className="px-5 py-3.5 font-semibold text-slate-900 dark:text-white">
                    Rs. {Number(item.sales || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-5 py-3.5 font-semibold text-slate-900 dark:text-white">
                    Rs. {Number(item.netSales || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-5 py-3.5 text-slate-600 dark:text-emerald-100/70">
                    Rs. {item.invoices > 0 ? (item.sales / item.invoices).toLocaleString(undefined, { minimumFractionDigits: 2 }) : 0}
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

export default MonthlySalesReportPage;
