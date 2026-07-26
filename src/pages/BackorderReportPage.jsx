import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { ReportHeader, SummaryCards, ReportActions, ReportPagination, LoadingSkeleton, EmptyState, exportToExcel, exportToPDF } from '../components/reports';
import { Search } from 'lucide-react';

const fmt = (val) => `${Number(val ?? 0).toLocaleString()}`;

export default function BackorderReportPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState('stock');
  const [sortOrder, setSortOrder] = useState('asc');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: products, error } = await supabase
        .from('products')
        .select('id, name, code, stock, category, status')
        .order('stock', { ascending: true });

      if (error) throw error;
      const backorderProducts = products.filter(p => Number(p.stock ?? 0) < 0) ?? [];
      setData(backorderProducts);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => window.print();
  const handleExportPDF = () => exportToPDF('report-container', 'backorder-report.pdf');
  const handleExportExcel = () => {
    const excelData = filteredAndSortedData.map(p => ({
      'Product Name': p.name,
      'Product Code': p.code,
      'Category': p.category,
      'Current Stock': p.stock,
      'Required Quantity': Math.abs(p.stock),
    }));
    exportToExcel(excelData, 'backorder-report.xlsx', 'Backorder Report');
  };

  const filteredAndSortedData = useMemo(() => {
    let filtered = [...data];

    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(p =>
        (p.name && p.name.toLowerCase().includes(searchLower)) ||
        (p.code && p.code.toLowerCase().includes(searchLower))
      );
    }

    filtered.sort((a, b) => {
      let aVal, bVal;
      if (sortBy === 'name') {
        aVal = (a.name || '').toLowerCase();
        bVal = (b.name || '').toLowerCase();
      } else if (sortBy === 'stock') {
        aVal = a.stock;
        bVal = b.stock;
      } else if (sortBy === 'code') {
        aVal = (a.code || '').toLowerCase();
        bVal = (b.code || '').toLowerCase();
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
    const totalUnitsNeeded = filteredAndSortedData.reduce((sum, p) => sum + Math.abs(p.stock), 0);

    return [
      { label: 'Products on Backorder', value: totalProducts },
      { label: 'Total Units Needed', value: fmt(totalUnitsNeeded) },
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
        title="Backorder Report"
        generatedBy={generatedBy}
        generatedDate={generatedDate}
      />

      <div className="bg-white dark:bg-emerald-950/25 border border-slate-200 dark:border-emerald-400/20 rounded-xl p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-emerald-100/70" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 dark:border-emerald-400/20 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
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
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Backordered Products</h2>
          <div className="flex items-center gap-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-emerald-400/20 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm text-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="name">Product Name</option>
              <option value="code">Product Code</option>
              <option value="stock">Current Stock</option>
            </select>
            <button
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-emerald-400/20 bg-white dark:bg-slate-800 text-slate-700 dark:text-white text-sm font-medium hover:bg-slate-50 dark:hover:bg-emerald-500/10 transition-colors"
            >
              {sortOrder === 'asc' ? '↑' : '↓'}
            </button>
          </div>
        </div>

        {paginatedData.length === 0 ? (
          <EmptyState message="No products on backorder!" />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-200 border-b border-slate-200 dark:border-emerald-400/20">
              <tr>
                <th className="text-left px-5 py-3 font-semibold text-xs uppercase tracking-wider">Product</th>
                <th className="text-left px-5 py-3 font-semibold text-xs uppercase tracking-wider">Code</th>
                <th className="text-left px-5 py-3 font-semibold text-xs uppercase tracking-wider">Category</th>
                <th className="text-left px-5 py-3 font-semibold text-xs uppercase tracking-wider">Current Stock</th>
                <th className="text-left px-5 py-3 font-semibold text-xs uppercase tracking-wider">Required Quantity</th>
              </tr>
            </thead>
            <tbody>
              {paginatedData.map((product) => (
                <tr key={product.id} className="border-b border-slate-50 dark:border-emerald-400/10 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors">
                  <td className="px-5 py-3.5 font-medium text-slate-900 dark:text-white">{product.name}</td>
                  <td className="px-5 py-3.5 text-slate-600 dark:text-emerald-100/70">{product.code}</td>
                  <td className="px-5 py-3.5">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      {product.category ?? 'General'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 font-bold text-red-600 dark:text-red-400">{product.stock}</td>
                  <td className="px-5 py-3.5 font-bold text-red-700 dark:text-red-300">{Math.abs(product.stock)} units</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-red-700 text-white">
                <td colSpan={3} className="px-5 py-3 font-bold text-sm uppercase tracking-wider">Total Needed</td>
                <td></td>
                <td className="px-5 py-3 font-extrabold">{fmt(filteredAndSortedData.reduce((sum, p) => sum + Math.abs(p.stock), 0))} units</td>
              </tr>
            </tfoot>
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
