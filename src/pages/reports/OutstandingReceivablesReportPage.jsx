import React, { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabaseClient'
import { ReportHeader, SummaryCards, ReportActions, ReportPagination, LoadingSkeleton, EmptyState, exportToExcel, exportToPDF } from '../../components/reports'
import { Search } from 'lucide-react'
import { calculateAgingDays, getAgingBucket, getAgingColorClasses, calculateAgingSummary } from '../../lib/agingCalculations'

const fmt = (val) => `Rs. ${Number(val ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

function OutstandingReceivablesReportPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState('balance');
  const [sortOrder, setSortOrder] = useState('desc');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [invRes, payRes, retRes, custRes] = await Promise.all([
        supabase
          .from('invoices')
          .select('id, invoice_number, customer_id, total_amount, created_at, payment_type, customers(name, phone, credit_limit)')
          .order('created_at', { ascending: false }),
        supabase.from('invoice_payments').select('id, invoice_id, amount, paid_at, method'),
        supabase.from('returns').select('id, customer_id, total_amount'),
        supabase.from('customers').select('id, name, phone, credit_limit').order('name'),
      ]);

      if (invRes.error) throw invRes.error;
      if (payRes.error) throw payRes.error;
      if (retRes.error) throw retRes.error;
      if (custRes.error) throw custRes.error;

      const invoices = invRes.data ?? [];
      const payments = payRes.data ?? [];
      const returns = retRes.data ?? [];
      const custList = custRes.data ?? [];

      const paymentSumByInvoice = payments.reduce((map, p) => {
        map.set(p.invoice_id, (map.get(p.invoice_id) ?? 0) + Number(p.amount ?? 0));
        return map;
      }, new Map());

      const returnsByCustomer = returns.reduce((map, r) => {
        if (r.customer_id) {
          map.set(r.customer_id, (map.get(r.customer_id) ?? 0) + Number(r.total_amount ?? 0));
        }
        return map;
      }, new Map());

      const lastPaymentByCustomer = payments.reduce((map, p) => {
        const inv = invoices.find(i => i.id === p.invoice_id);
        if (inv) {
          const existing = map.get(inv.customer_id);
          if (!existing || new Date(p.paid_at) > new Date(existing.paid_at)) {
            map.set(inv.customer_id, p.paid_at);
          }
        }
        return map;
      }, new Map());

      const customerBalances = new Map();

      for (const inv of invoices) {
        const customerId = inv.customer_id;
        if (!customerId) continue;

        const paid = paymentSumByInvoice.get(inv.id) ?? 0;
        const total = Number(inv.total_amount ?? 0);
        const retAmt = returnsByCustomer.get(customerId) ?? 0;
        const balance = total - paid - retAmt;

        if (!customerBalances.has(customerId)) {
          const customer = inv.customers ?? custList.find(c => c.id === customerId) ?? {};
          customerBalances.set(customerId, {
            customerId,
            name: customer.name ?? 'Unknown',
            phone: customer.phone ?? '',
            creditLimit: Number(customer.credit_limit ?? 0),
            invoiced: total,
            returned: retAmt,
            paid,
            balance,
            invoicesCount: 1,
            lastPaymentDate: lastPaymentByCustomer.get(customerId),
            invoices: [inv], // Store invoices for aging calculation
          });
        } else {
          const existing = customerBalances.get(customerId);
          existing.invoiced += total;
          existing.returned = retAmt;
          existing.paid += paid;
          existing.balance = existing.invoiced - existing.paid - existing.returned;
          existing.invoicesCount += 1;
          existing.invoices.push(inv);
        }
      }

      const customersWithBalances = Array.from(customerBalances.values()).map(customer => {
        // Calculate aging for this customer
        const customerInvoices = invoices.filter(inv => inv.customer_id === customer.customerId);
        const aging = calculateAgingSummary(customerInvoices, paymentSumByInvoice);
        
        // Find latest invoice
        const outstandingInvoices = customerInvoices.filter(inv => {
          const paid = paymentSumByInvoice.get(inv.id) ?? 0;
          const total = Number(inv.total_amount ?? 0);
          return (total - paid) > 0;
        });
        
        let latestInvoiceDate = null;
        let latestAgingDays = 0;
        
        if (outstandingInvoices.length > 0) {
          const latest = outstandingInvoices.reduce((latest, inv) => {
            const days = calculateAgingDays(inv.created_at);
            return days < latest.days ? { inv, days } : latest;
          }, { inv: null, days: Infinity });
          latestInvoiceDate = latest.inv.created_at;
          latestAgingDays = latest.days;
        }

        return {
          ...customer,
          aging,
          latestInvoiceDate,
          latestAgingDays,
        };
      });
      setData(customersWithBalances);
      setCustomers(custList);
    } catch (e) {
      console.error('Error loading data:', e);
    } finally {
      setLoading(false);
    }
  };

  // Overall aging summary
  const overallAgingSummary = useMemo(() => {
    // We need all invoices with payment sums
    const allInvoices = [];
    const paymentSumByInvoice = new Map();
    // Reconstruct paymentSumByInvoice from data (but we don't have payments stored, so let's just calculate from invoices in data)
    // Alternatively, let's calculate overall aging by summing each customer's aging
    const summary = {
      total: 0,
      current: 0,
      '31-60': 0,
      '61-90': 0,
      '91-120': 0,
      'over-120': 0,
    };
    data.forEach(customer => {
      if (customer.aging) {
        summary.total += customer.aging.total;
        summary.current += customer.aging.current;
        summary['31-60'] += customer.aging['31-60'];
        summary['61-90'] += customer.aging['61-90'];
        summary['91-120'] += customer.aging['91-120'];
        summary['over-120'] += customer.aging['over-120'];
      }
    });
    return summary;
  }, [data]);

  const handlePrint = () => window.print();

  const handleExportPDF = () => {
    exportToPDF('report-container', 'outstanding-receivables-report.pdf');
  };

  const handleExportExcel = () => {
    const excelData = filteredAndSortedData.map(c => ({
      'Customer Name': c.name,
      'Phone': c.phone,
      'Outstanding Amount': c.balance,
      'Credit Limit': c.creditLimit,
      'Available Credit': c.creditLimit - c.balance,
      'Last Payment Date': c.lastPaymentDate ? new Date(c.lastPaymentDate).toLocaleDateString() : '-',
      'Status': getCustomerStatus(c),
    }));
    exportToExcel(excelData, 'outstanding-receivables-report.xlsx', 'Outstanding Receivables');
  };

  const getCustomerStatus = (customer) => {
    if (customer.balance <= 0) return 'Good Standing';
    if (customer.creditLimit > 0) {
      const utilization = customer.balance / customer.creditLimit;
      if (utilization > 1) return 'Credit Limit Exceeded';
      if (utilization >= 0.8) return 'Near Limit';
    }
    return 'Good Standing';
  };

  const filteredAndSortedData = useMemo(() => {
    let filtered = [...data];

    if (statusFilter === 'with-due') {
      filtered = filtered.filter(c => c.balance > 0);
    } else if (statusFilter === 'over-limit') {
      filtered = filtered.filter(c => {
        const status = getCustomerStatus(c);
        return status === 'Credit Limit Exceeded';
      });
    }

    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(c =>
        c.name.toLowerCase().includes(searchLower) ||
        (c.phone && c.phone.toLowerCase().includes(searchLower))
      );
    }

    filtered.sort((a, b) => {
      let aVal, bVal;
      if (sortBy === 'name') {
        aVal = a.name.toLowerCase();
        bVal = b.name.toLowerCase();
      } else if (sortBy === 'balance') {
        aVal = a.balance;
        bVal = b.balance;
      } else if (sortBy === 'invoices') {
        aVal = a.invoicesCount;
        bVal = b.invoicesCount;
      }

      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      }
      return aVal < bVal ? 1 : -1;
    });

    return filtered;
  }, [data, search, sortBy, sortOrder, statusFilter]);

  const summaryCards = useMemo(() => {
    const totalOutstanding = filteredAndSortedData.reduce((sum, c) => sum + c.balance, 0);
    const customersWithDue = filteredAndSortedData.filter(c => c.balance > 0).length;
    const customersOverLimit = filteredAndSortedData.filter(c => getCustomerStatus(c) === 'Credit Limit Exceeded').length;
    const totalCustomers = filteredAndSortedData.length;

    return [
      { label: 'Total Outstanding', value: fmt(totalOutstanding) },
      { label: 'Current (0-30)', value: fmt(overallAgingSummary.current) },
      { label: '31-60', value: fmt(overallAgingSummary['31-60']) },
      { label: '61-90', value: fmt(overallAgingSummary['61-90']) },
      { label: '91-120', value: fmt(overallAgingSummary['91-120']) },
      { label: 'Over 120', value: fmt(overallAgingSummary['over-120']) },
      { label: 'Customers with Due', value: customersWithDue },
      { label: 'Over Credit Limit', value: customersOverLimit },
      { label: 'Total Customers', value: totalCustomers },
    ];
  }, [filteredAndSortedData, overallAgingSummary]);

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
        title="Outstanding Receivables Report"
        generatedBy={generatedBy}
        generatedDate={generatedDate}
      />

      <div className="bg-white dark:bg-emerald-950/25 border border-slate-200 dark:border-emerald-400/20 rounded-xl p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-700 dark:text-emerald-50">Filter:</label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-slate-300 dark:border-emerald-400/20 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="all">All Customers</option>
              <option value="with-due">With Due</option>
              <option value="over-limit">Over Credit Limit</option>
            </select>
          </div>

          <div className="relative flex-1 min-w-[200px] ml-auto">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-emerald-100/70" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customers..."
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
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Outstanding Receivables</h2>
          <div className="flex items-center gap-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-emerald-400/20 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm text-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="name">Customer Name</option>
              <option value="balance">Outstanding Amount</option>
              <option value="invoices">Invoices Count</option>
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
          <EmptyState message="No outstanding receivables found" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-emerald-900/30 text-slate-500 dark:text-emerald-100/80 border-b border-slate-200 dark:border-emerald-400/20">
                <tr>
                  <th className="text-left px-5 py-3 font-semibold text-xs uppercase tracking-wider">Customer</th>
                  <th className="text-left px-5 py-3 font-semibold text-xs uppercase tracking-wider">Phone</th>
                  <th className="text-right px-5 py-3 font-semibold text-xs uppercase tracking-wider">Outstanding Amount</th>
                  <th className="text-right px-5 py-3 font-semibold text-xs uppercase tracking-wider">Current (0-30)</th>
                  <th className="text-right px-5 py-3 font-semibold text-xs uppercase tracking-wider">31-60</th>
                  <th className="text-right px-5 py-3 font-semibold text-xs uppercase tracking-wider">61-90</th>
                  <th className="text-right px-5 py-3 font-semibold text-xs uppercase tracking-wider">91-120</th>
                  <th className="text-right px-5 py-3 font-semibold text-xs uppercase tracking-wider">Over 120</th>
                  <th className="text-left px-5 py-3 font-semibold text-xs uppercase tracking-wider">Latest Aging (Days)</th>
                  <th className="text-right px-5 py-3 font-semibold text-xs uppercase tracking-wider">Credit Limit</th>
                  <th className="text-right px-5 py-3 font-semibold text-xs uppercase tracking-wider">Available Credit</th>
                  <th className="text-left px-5 py-3 font-semibold text-xs uppercase tracking-wider">Last Payment Date</th>
                  <th className="text-left px-5 py-3 font-semibold text-xs uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody>
                {paginatedData.map((customer) => {
                  const status = getCustomerStatus(customer);
                  const availableCredit = customer.creditLimit - customer.balance;

                  return (
                    <tr key={customer.customerId} className="border-b border-slate-50 dark:border-emerald-400/10 hover:bg-slate-50 dark:hover:bg-emerald-500/5 transition-colors">
                      <td className="px-5 py-3.5 font-medium text-slate-900 dark:text-white">
                        {customer.name}
                      </td>
                      <td className="px-5 py-3.5 text-slate-600 dark:text-emerald-100/70">
                        {customer.phone || '-'}
                      </td>
                      <td className="px-5 py-3.5 text-right font-bold text-slate-900 dark:text-white">
                        {fmt(customer.balance)}
                      </td>
                      <td className="px-5 py-3.5 text-right text-emerald-600 dark:text-emerald-400 font-medium">
                        {fmt(customer.aging?.current ?? 0)}
                      </td>
                      <td className="px-5 py-3.5 text-right text-amber-600 dark:text-amber-400 font-medium">
                        {fmt(customer.aging?.['31-60'] ?? 0)}
                      </td>
                      <td className="px-5 py-3.5 text-right text-orange-600 dark:text-orange-400 font-medium">
                        {fmt(customer.aging?.['61-90'] ?? 0)}
                      </td>
                      <td className="px-5 py-3.5 text-right text-red-600 dark:text-red-400 font-medium">
                        {fmt(customer.aging?.['91-120'] ?? 0)}
                      </td>
                      <td className="px-5 py-3.5 text-right text-red-800 dark:text-red-600 font-medium">
                        {fmt(customer.aging?.['over-120'] ?? 0)}
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        {customer.latestAgingDays > 0 ? `${customer.latestAgingDays}d` : '-'}
                      </td>
                      <td className="px-5 py-3.5 text-right text-slate-600 dark:text-emerald-100/70">
                        {customer.creditLimit > 0 ? fmt(customer.creditLimit) : '-'}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {customer.creditLimit > 0 ? (
                          <span className={`font-medium ${availableCredit < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-600 dark:text-emerald-100/70'}`}>
                            {fmt(availableCredit)}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="px-5 py-3.5 text-slate-600 dark:text-emerald-100/70">
                        {customer.lastPaymentDate ? new Date(customer.lastPaymentDate).toLocaleDateString() : '-'}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                          status === 'Credit Limit Exceeded' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' :
                          status === 'Near Limit' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' :
                          'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                        }`}>
                          {status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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

export default OutstandingReceivablesReportPage;
