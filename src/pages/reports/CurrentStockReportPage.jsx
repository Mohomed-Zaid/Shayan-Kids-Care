import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { ReportHeader, SummaryCards, ReportActions, ReportPagination, LoadingSkeleton, EmptyState, exportToExcel, exportToPDF } from '../../components/reports';
import { Search } from 'lucide-react';

function CurrentStockReportPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState([]);
  const [search, setSearch] = useState('');
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
      const [{ data: products, error }, { data: purchases }] = await Promise.all([
        supabase.from('products').select('*').order('name'),
        supabase.from('purchase_items').select('product_id, cost, purchases(date, created_at)'),
      ]);
      if (error) throw error;

      const latestCostByProduct = new Map();
      for (const purchase of purchases ?? []) {
        const productId = purchase.product_id;
        if (!productId) continue;
        const dateValue = purchase.purchases?.date || purchase.purchases?.created_at || '';
        const existing = latestCostByProduct.get(productId);
        if (!existing || new Date(dateValue || 0) >= existing.date) {
          latestCostByProduct.set(productId, { date: new Date(dateValue || 0), cost: Number(purchase.cost || 0) });
        }
      }

      setData((products ?? []).map((product) => ({ ...product, cost: latestCostByProduct.get(product.id)?.cost ?? 0 })));
    } catch (e) {
      console.error('Error loading data:', e);
    } finally {
      setLoading(false);
    }
  };
  
  const handlePrint = () => window.print();
  const handleExportPDF = () => exportToPDF('report-container', 'current-stock-report.pdf');
  const handleExportExcel = () => {
    const excelData = filteredAndSortedData.map(item => ({
      'Product Name': item.name || 'N/A',
      Code: item.code || 'N/A',
      'Current Stock': item.stock || 0,
      'Cost Price': item.cost || 0,
      'Selling Price': item.price || 0,
      'Stock Value': (item.stock || 0) * (item.cost || 0),
      Status: getItemStatus(item),
    }));
    exportToExcel(excelData, 'current-stock-report.xlsx', 'Current Stock');
  };
  
  const getItemStatus = (item) => {
    if ((item.stock || 0) < 0) return 'Backorder';
    if ((item.stock || 0) === 0) return 'Out of Stock';
    if ((item.stock || 0) <= 5) return 'Low Stock';
    return 'In Stock';
  };
  
  const filteredAndSortedData = useMemo(() => {
    let filtered = data;
    
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(item =>
        (item.name || '').toLowerCase().includes(searchLower) ||
        (item.code || '').toLowerCase().includes(searchLower)
      );
    }
    
    filtered = [...filtered].sort((a, b) => {
      let aVal, bVal;
      if (sortBy === 'name') {
        aVal = (a.name || '').toLowerCase();
        bVal = (b.name || '').toLowerCase();
      } else if (sortBy === 'code') {
        aVal = (a.code || '').toLowerCase();
        bVal = (b.code || '').toLowerCase();
      } else if (sortBy === 'stock') {
        aVal = a.stock || 0;
        bVal = b.stock || 0;
      } else if (sortBy === 'value') {
        aVal = (a.stock || 0) * (a.cost || 0);
        bVal = (b.stock || 0) * (b.cost || 0);
      }
      
      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      }
      return aVal < bVal ? 1 : -1;
    });
    
    return filtered;
  }, [data, search, sortBy, sortOrder]);
  
  const summaryCards = useMemo(() => {
    const totalProducts = filteredAndSortedData.length;
    const totalStockUnits = filteredAndSortedData.reduce((sum, item) => sum + (item.stock || 0), 0);
    const totalStockValue = filteredAndSortedData.reduce((sum, item) => sum + ((item.stock || 0) * (item.cost || 0)), 0);
    const outOfStockCount = filteredAndSortedData.filter(item => (item.stock || 0) <= 0).length;
    
    return [
      { label: 'Total Products', value: totalProducts.toString() },
      { label: 'Total Stock Units', value: totalStockUnits.toLocaleString() },
      { label: 'Total Stock Value', value: `Rs. ${totalStockValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}` },
      { label: 'Out of Stock', value: outOfStockCount.toString() },
    ];
  }, [filteredAndSortedData]);
  
  const totalPages = Math.ceil(filteredAndSortedData.length / pageSize);
  const paginatedData = filteredAndSortedData.slice((page - 1) * pageSize, page * pageSize);
  
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
        title="Current Stock Report"
        generatedBy={generatedBy}
        generatedDate={generatedDate}
      />
      
      <div className="bg-white dark:bg-emerald-950/25 border border-slate-200 dark:border-emerald-400/20 rounded-xl p-5 shadow-sm">
        <div className="relative flex-1 min-w-[200px]">
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
      
      <SummaryCards cards={summaryCards} />
      
      <ReportActions
        onPrint={handlePrint}
        onExportPDF={handleExportPDF}
        onExportExcel={handleExportExcel}
      />
      
      <div className="bg-white dark:bg-emerald-950/25 border border-slate-200 dark:border-emerald-400/20 rounded-xl overflow-hidden shadow-sm">
        <div className="p-5 border-b border-slate-200 dark:border-emerald-400/20 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Stock Details</h2>
          <div className="flex items-center gap-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-emerald-400/20 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm text-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="name">Name</option>
              <option value="code">Code</option>
              <option value="stock">Stock</option>
              <option value="value">Stock Value</option>
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
          <EmptyState message="No stock data" />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-emerald-900/30 text-slate-500 dark:text-emerald-100/70 border-b border-slate-200 dark:border-emerald-400/20">
              <tr>
                <th className="text-left px-5 py-3 font-semibold text-xs uppercase tracking-wider">Product</th>
                <th className="text-left px-5 py-3 font-semibold text-xs uppercase tracking-wider">Code</th>
                <th className="text-left px-5 py-3 font-semibold text-xs uppercase tracking-wider">Current Stock</th>
                <th className="text-left px-5 py-3 font-semibold text-xs uppercase tracking-wider">Cost Price</th>
                <th className="text-left px-5 py-3 font-semibold text-xs uppercase tracking-wider">Selling Price</th>
                <th className="text-left px-5 py-3 font-semibold text-xs uppercase tracking-wider">Stock Value</th>
                <th className="text-left px-5 py-3 font-semibold text-xs uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody>
              {paginatedData.map((item) => {
                const status = getItemStatus(item);
                const stockValue = (item.stock || 0) * (item.cost || 0);
                
                return (
                  <tr key={item.id} className="border-b border-slate-100 dark:border-emerald-400/10 hover:bg-slate-50 dark:hover:bg-emerald-500/5 transition-colors">
                    <td className="px-5 py-3.5 font-medium text-slate-900 dark:text-white">
                      {item.name}
                    </td>
                    <td className="px-5 py-3.5 text-slate-600 dark:text-emerald-100/70">
                      {item.code}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`font-semibold ${
                        (item.stock || 0) < 0
                          ? 'text-red-600 dark:text-red-400'
                          : (item.stock || 0) <= 0
                            ? 'text-red-600 dark:text-red-400'
                            : (item.stock || 0) <= 5
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-slate-900 dark:text-white'
                      }`}
                      >
                        {item.stock || 0}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600 dark:text-emerald-100/70">
                      Rs. {Number(item.cost || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-5 py-3.5 text-slate-600 dark:text-emerald-100/70">
                      Rs. {Number(item.price || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-5 py-3.5 font-semibold text-slate-900 dark:text-white">
                      Rs. {stockValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                        status === 'Backorder'
                          ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                          : status === 'Out of Stock'
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                            : status === 'Low Stock'
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                              : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                      }`}
                      >
                        {status}
                      </span>
                    </td>
                  </tr>
                );
              })}
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

export default CurrentStockReportPage;
