const c = (label, key, type = 'text') => ({ label, key, type })

export const REP_REPORTS = [
  ['sales', 'Rep Sales Report'],
  ['monthly', 'Monthly Commission Report'],
  ['payments', 'Rep Payment Report'],
  ['advances', 'Advance Commission Report'],
  ['settlement', 'Rep Settlement Report'],
  ['customers', 'Rep Customer Report'],
  ['collections', 'Rep Collection Report'],
  ['performance', 'Rep Performance Report'],
  ['transactions', 'Rep Transaction History'],
]

export const REP_COLUMNS = {
  sales: [c('Rep Name','rep'),c('Order Number','orderNumber'),c('Invoice Number','invoiceNumber'),c('Invoice Date','date','date'),c('Customer','customer'),c('Product','product'),c('Product Code','productCode'),c('Quantity','quantity','number'),c('Selling Price','sellingPrice','money'),c('Sales Value','salesValue','money'),c('Historical Cost','cost','money'),c('Gross Profit','grossProfit','money'),c('Commission Rate','commissionRate','percent'),c('Commission Earned','commissionEarned','money')],
  monthly: [c('Rep','rep'),c('Month','month'),c('Invoice Count','invoiceCount','number'),c('Total Sales','totalSales','money'),c('Returns','totalReturns','money'),c('Net Sales','netSales','money'),c('Commission Rate','commissionRate','percent'),c('Commission Earned','commissionEarned','money'),c('Advance Applied','advanceApplied','money'),c('Amount Paid','amountPaid','money'),c('Remaining Due','remainingDue','money'),c('Status','status')],
  payments: [c('Payment Date','date','date'),c('Rep','rep'),c('Commission Period','commissionPeriod'),c('Commission Due','commissionDue','money'),c('Amount Paid','amountPaid','money'),c('Commission Settled','commissionSettled','money'),c('Advance Created','advanceCreated','money'),c('Advance Applied','advanceApplied','money'),c('Remaining Due','remainingDue','money'),c('Payment Method','method'),c('Note','note'),c('SMS Status','smsStatus'),c('Recorded By','recordedBy'),c('Created Date / Time','createdAt','datetime')],
  advances: [c('Rep','rep'),c('Current Commission Due','currentCommissionDue','money'),c('Current Advance Balance','currentAdvanceBalance','money'),c('Advance Created','advanceCreated','money'),c('Advance Applied','advanceApplied','money'),c('Remaining Advance','remainingAdvance','money'),c('Net Amount Payable','netAmountPayable','money'),c('Last Payment Date','lastPaymentDate','date'),c('Status','status')],
  settlement: [c('Rep Name','rep'),c('Period','month'),c('Total Orders','orderCount','number'),c('Total Invoices','invoiceCount','number'),c('Total Sales','totalSales','money'),c('Returns','totalReturns','money'),c('Net Sales','netSales','money'),c('Commission Rate','commissionRate','percent'),c('Commission Earned','commissionEarned','money'),c('Previous Advance','previousAdvance','money'),c('Advance Applied','advanceApplied','money'),c('Commission Payable','commissionPayable','money'),c('Payments Made','amountPaid','money'),c('New Advance Created','advanceCreated','money'),c('Outstanding Commission','remainingDue','money'),c('Final Balance','finalBalance','money'),c('Settlement Status','status')],
  customers: [c('Rep','rep'),c('Customer','customer'),c('Customer Phone','phone'),c('Total Orders','totalOrders','number'),c('Total Invoices','totalInvoices','number'),c('Total Sales','totalSales','money'),c('Payments Received','paymentsReceived','money'),c('Outstanding','outstanding','money'),c('Credit Limit','creditLimit','money'),c('Last Order','lastOrder','date'),c('Last Invoice','lastInvoice','date'),c('Credit Status','creditStatus')],
  collections: [c('Payment Date','date','date'),c('Rep','rep'),c('Customer','customer'),c('Invoice Number','invoiceNumber'),c('Invoice Date','invoiceDate','date'),c('Invoice Total','invoiceTotal','money'),c('Amount Collected','amountCollected','money'),c('Payment Method','method'),c('Remaining Balance','remainingBalance','money'),c('Days Outstanding Before Payment','daysOutstanding','number'),c('Recorded By','recordedBy')],
  performance: [c('Rep','rep'),c('Customers','customers','number'),c('Orders','orders','number'),c('Confirmed Orders','confirmedOrders','number'),c('Invoices','invoices','number'),c('Quantity Sold','quantitySold','number'),c('Sales','sales','money'),c('Gross Profit','grossProfit','money'),c('Average Invoice','averageInvoice','money'),c('Collections','collections','money'),c('Outstanding','outstanding','money'),c('Commission Earned','commissionEarned','money'),c('Commission Paid','commissionPaid','money'),c('Conversion Rate','conversionRate','percent'),c('Returns','returns','money'),c('Last Sale Date','lastSaleDate','date'),c('Status','status')],
  transactions: [c('Date / Time','date','datetime'),c('Rep','rep'),c('Transaction Type','type'),c('Reference','reference'),c('Customer','customer'),c('Amount','amount','money'),c('User','user'),c('Description','description')],
}

export const reportTitle = (mode) => REP_REPORTS.find(([key]) => key === mode)?.[1] || 'Rep & Commission Report'
