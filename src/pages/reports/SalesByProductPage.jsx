import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { ReportHeader, SummaryCards, ReportActions, ReportPagination, LoadingSkeleton, EmptyState, exportToExcel, exportToPDF } from '../../components/reports';
import { Search } from 'lucide-react';

function SalesByProductPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState([]);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('this-month');
  const [customStartDate, setCustomStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [customEndDate, setCustomEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState('quantity');
  const [sortOrder, setSortOrder] = useState('desc');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('invoice_items')
        .select(`
          id,
          quantity,
          unit_price,
          total,
          products ( id, name, sku ),
          invoices ( created_at, invoice_number )
        `);

      if (filterType === 'this-month') {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
        query = query.gte('invoices.created_at', start).lt('invoices.created_at', end);
      } else if (filterType === 'last-month') {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
        const end = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        query = query.gte('invoices.created_at', start).lt('invoices.created_at', end);
      } else if (filterType === 'this-year') {
        const now = new Date();
        const start = new Date(now.getFullYear(), 0, 1).toISOString();
        const end = new Date(now.getFullYear() + 1, 0, 1).toISOString();
        query = query.gte('invoices.created_at', start).lt('invoices.created_at', end);
      } else if (filterType === 'custom') {
        const start = new Date(customStartDate + 'T00:00:00.000Z').toISOString();
        const end = new Date(customEndDate + 'T23:59:59.999Z').toISOString();
        query = query.gte('invoices.created_at', start).lte('invoices.created_at', end);
      }

      const { data: items, error } = await query.order('invoices.created_at', { ascending: false });

      if (error) throw error;

      const aggregatedData = items.reduce((acc, item) => {
        const productId = item.products?.id;
        if (!productId) return acc;

        if (!acc[productId]) {
          acc[productId] = {
            productId,
            name: item.products?.name || 'Unknown',
            sku: item.products?.sku || 'N/A',
            totalQuantity: 0,
            totalRevenue: 0,
            transactionCount: 0,
          };
        }

        acc[productId].totalQuantity += item.quantity || 0;
        acc[productId].totalRevenue += item.total || 0;
        acc[productId].transactionCount += 1;

        return acc;
      }, {});

      setData(Object.values(aggregatedData));
    } catch (e) {
      console.error('Error loading data:', e);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => window.print();

  const handleExportPDF = () => {
    exportToPDF('report-container', 'sales-by-product-report.pdf');
  };

  const handleExportExcel = () => {
    const excelData = filteredAndSortedData.map(item => ({
      'Product Name': item.name,
      SKU: item.sku,
      'Total Quantity Sold': item.totalQuantity,
      'Total Revenue': item.totalRevenue,
      'Transaction Count': item.transactionCount,
      'Avg Revenue per Transaction': item.transactionCount > 0 ? item.totalRevenue / item.transactionCount : 0,
    }));
    exportToExcel(excelData, 'sales-by-product-report.xlsx', 'Sales by Product');
  };

  const filteredAndSortedData = useMemo(() => {
    let filtered = data;

    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(item =>
        (item.name || '').toLowerCase().includes(searchLower) ||
        (item.sku || '').toLowerCase().includes(searchLower)
      );
    }

    filtered = [...filtered].sort((a, b) => {
      let aVal, bVal;
      if (sortBy === 'name') {
        aVal = a.name?.toLowerCase() || '';
        bVal = b.name?.toLowerCase() || '';
      } else if (sortBy === 'quantity') {
        aVal = a.totalQuantity || 0;
        bVal = b.totalQuantity || 0;
      } else if (sortBy === 'revenue') {
        aVal = a.totalRevenue || 0;
        bVal = b.totalRevenue || 0;
      }

      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      }
      return aVal < bVal ? 1 : -1;
    });

    return filtered;
  }, [data, search, sortBy, sortOrder]);

  const totalPages = Math.ceil(filteredAndSortedData.length / pageSize);
  const paginatedData = filteredAndSortedData.slice((page - 1) * pageSize, page * pageSize);

  const summaryCards = useMemo(() => {
    const totalProducts = filteredAndSortedData.length;
    const totalQuantity = filteredAndSortedData.reduce((sum, item) => sum + (item.totalQuantity || 0), 0);
    const totalRevenue = filteredAndSortedData.reduce((sum, item) => sum + (item.totalRevenue || 0), 0);
    const avgRevenuePerProduct = totalProducts > 0 ? totalRevenue / totalProducts : 0;

    const topProduct = filteredAndSortedData[0]?.name || 'N/A';

    return [
      { label: 'Total Products', value: totalProducts.toLocaleString() },
      { label: 'Total Quantity Sold', value: totalQuantity.toLocaleString() },
      { label: 'Total Revenue', value: `Rs. ${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}` },
      { label: 'Avg Revenue/Product', value: `Rs. ${avgRevenuePerProduct.toLocaleString(undefined, { minimumFractionDigits: 2 })}` },
      { label: 'Top Product', value: topProduct.length > 20 ? topProduct.substring(0, 17) + '...' : topProduct },
    ];
  }, [filteredAndSortedData]);

  const totalQuantityAll = useMemo(() => filteredAndSortedData.reduce((sum, item) => sum + (item.totalQuantity || 0), 0), [filteredAndSortedData]);
  const grandTotalRevenue = useMemo(() => filteredAndSortedData.reduce((sum, item) => sum + (item.totalRevenue || 0), 0), [filteredAndSortedData]);

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
        title="Sales by Product Report"
        generatedBy={generatedBy}
        generatedDate={generatedDate}
      />

      <div className="bg-white dark:bg-emerald-950/25 border border-slate-200 dark:border-emerald-400/20 rounded-xl p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-700 dark:text-emerald-50">Filter:</label>
            <select
              value={filterType}
              onChange={(e) => {
                setFilterType(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-slate-300 dark:border-emerald-400/20 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="this-month">This Month</option>
              <option value="last-month">Last Month</option>
              <option value="this-year">This Year</option>
              <option value="custom">Custom Date Range</option>
            </select>
          </div>

          {filterType === 'custom' && (
            <>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-slate-700 dark:text-emerald-50">From:</label>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="rounded-lg border border-slate-300 dark:border-emerald-400/20 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-slate-700 dark:text-emerald-50">To:</label>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="rounded-lg border border-slate-300 dark:border-emerald-400/20 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
            </>
          )}

          <div className="relative flex-1 min-w-[200px] ml-auto">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-emerald-100/70" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products..."
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
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Product Sales Details</h2>
          <div className="flex items-center gap-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-emerald-400/20 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm text-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="name">Product Name</option>
              <option value="quantity">Quantity Sold</option>
              <option value="revenue">Revenue</option>
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
          <EmptyState message="No product sales data for this period" />
        ) : (
          <>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-emerald-900/30 text-slate-500 dark:text-emerald-100/70 border-b border-slate-200 dark:border-emerald-400/20">
                <tr>
                  <th className="text-left px-5 py-3 font-semibold text-xs uppercase tracking-wider">Product Name</th>
                  <th className="text-left px-5 py-3 font-semibold text-xs uppercase tracking-wider">SKU</th>
                  <th className="text-left px-5 py-3 font-semibold text-xs uppercase tracking-wider">Total Quantity</th>
                  <th className="text-left px-5 py-3 font-semibold text-xs uppercase tracking-wider">Total Revenue</th>
                  <th className="text-left px-5 py-3 font-semibold text-xs uppercase tracking-wider">Transactions</th>
                  <th className="text-left px-5 py-3 font-semibold text-xs uppercase tracking-wider">Avg per Transaction</th>
                </tr>
              </thead>
              <tbody>
                {paginatedData.map((item) => (
                  <tr key={item.productId} className="border-b border-slate-100 dark:border-emerald-400/10 hover:bg-slate-50 dark:hover:bg-emerald-500/5 transition-colors">
                    <td className="px-5 py-3.5 font-medium text-slate-900 dark:text-white">
                      {item.name}
                    </td>
                    <td className="px-5 py-3.5 text-slate-600 dark:text-emerald-100/70">
                      {item.sku}
                    </td>
                    <td className="px-5 py-3.5 font-semibold text-slate-900 dark:text-white">
                      {item.totalQuantity.toLocaleString()}
                    </td>
                    <td className="px-5 py-3.5 font-semibold text-emerald-600 dark:text-emerald-400">
                      Rs. {Number(item.totalRevenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-5 py-3.5 text-slate-600 dark:text-emerald-100/70">
                      {item.transactionCount}
                    </td>
                    <td className="px-5 py-3.5 text-slate-600 dark:text-emerald-100/70">
                      Rs. {item.transactionCount > 0 ? (item.totalRevenue / item.transactionCount).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '0.00'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="p-5 border-t border-slate-200 dark:border-emerald-400/20 bg-slate-50 dark:bg-emerald-900/20">
              <div className="flex justify-end gap-8">
                <div className="text-right">
                  <p className="text-sm text-slate-500 dark:text-emerald-100/60">Total Quantity</p>
                  <p className="text-lg font-bold text-slate-900 dark:text-white">{totalQuantityAll.toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-slate-500 dark:text-emerald-100/60">Grand Total</p>
                  <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                    Rs. {grandTotalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            </div>
          </>
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

export default SalesByProductPage;
