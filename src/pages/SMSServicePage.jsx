import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useToast } from '../contexts/ToastContext'
import { MessageSquare, Search, Send, Users, FileText, CheckCircle, AlertCircle } from 'lucide-react'
import { sendSingleSMS, sendBulkSMS } from '../lib/sms'

// Pre-defined SMS templates
const SMS_TEMPLATES = [
  { name: "Order Confirmation", text: "Hi {customer_name}, your order has been confirmed! Thank you for shopping with Shayan Kids Care!" },
  { name: "Payment Reminder", text: "Hi {customer_name}, just a reminder about your pending payment. Please reach out if you have any questions!" },
  { name: "Thank You", text: "Hi {customer_name}, thank you for your purchase! We hope you love your items!" },
  { name: "Promotion", text: "Hi {customer_name}, we have a special promotion just for you! Visit us in-store for more details!" },
]

export default function SMSServicePage() {
  const [customers, setCustomers] = useState([])
  const [selectedCustomers, setSelectedCustomers] = useState([])
  const [checkAll, setCheckAll] = useState(false)
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')
  const [singleNumber, setSingleNumber] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const toast = useToast()

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('customers').select('*').order('name')
      setCustomers(data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const filteredCustomers = customers.filter(c => 
    (c.name?.toLowerCase().includes(search.toLowerCase())) ||
    (c.phone?.includes(search))
  )

  const toggleCustomer = (id) => {
    setSelectedCustomers(prev => 
      prev.includes(id) 
        ? prev.filter(c => c !== id) 
        : [...prev, id]
    )
  }

  const toggleCheckAll = () => {
    if (checkAll) {
      setSelectedCustomers([])
    } else {
      setSelectedCustomers(filteredCustomers.map(c => c.id))
    }
    setCheckAll(!checkAll)
  }

  const sendBulk = async () => {
    if (selectedCustomers.length === 0) {
      toast.error('Please select at least one customer')
      return
    }
    if (!message) {
      toast.error('Please enter a message')
      return
    }
    
    setSending(true)
    try {
      const recipients = selectedCustomers.map(id => {
        const customer = customers.find(c => c.id === id)
        // Replace {customer_name} with actual name
        const personalizedMessage = message.replace(/{customer_name}/g, customer.name || 'Customer')
        return { number: customer.phone, message: personalizedMessage }
      }).filter(r => r.number)
      
      await sendBulkSMS(recipients)
      toast.success('Bulk SMS sent successfully!')
      setSelectedCustomers([])
      setMessage('')
    } catch (err) {
      toast.error('Failed to send SMS: ' + err.message)
    } finally {
      setSending(false)
    }
  }

  const sendSingle = async () => {
    if (!singleNumber) {
      toast.error('Please enter a phone number')
      return
    }
    if (!message) {
      toast.error('Please enter a message')
      return
    }
    
    setSending(true)
    try {
      await sendSingleSMS(singleNumber, message)
      toast.success('SMS sent successfully!')
      setSingleNumber('')
      setMessage('')
    } catch (err) {
      toast.error('Failed to send SMS: ' + err.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <MessageSquare className="h-6 w-6" />
            SMS Service
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Send single or bulk SMS to your customers
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Panel - Customers */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-100 dark:border-slate-700">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-slate-500 dark:text-slate-400" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Selected: {selectedCustomers.length} customers
                </h3>
              </div>
            </div>
            
            {/* Search Input */}
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search customers by name or phone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              />
            </div>

            {/* Select All Checkbox */}
            <label className="flex items-center gap-2 mt-3 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                checked={checkAll}
                onChange={toggleCheckAll}
                className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-slate-700 dark:text-slate-300">Select all customers</span>
            </label>
          </div>

          {/* Customers List */}
          <div className="flex-1 overflow-y-auto max-h-[600px]">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
              </div>
            ) : filteredCustomers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-500 dark:text-slate-400">
                <Users size={48} className="mb-3 opacity-50" />
                <p>No customers found</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredCustomers.map((customer) => (
                  <div
                    key={customer.id}
                    className={`flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer ${
                      selectedCustomers.includes(customer.id) ? 'bg-emerald-50 dark:bg-emerald-900/20' : ''
                    }`}
                    onClick={() => toggleCustomer(customer.id)}
                  >
                    <input
                      type="checkbox"
                      checked={selectedCustomers.includes(customer.id)}
                      onChange={(e) => {
                        e.stopPropagation()
                        toggleCustomer(customer.id)
                      }}
                      className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                        {customer.name}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {customer.phone}
                      </p>
                    </div>
                    {selectedCustomers.includes(customer.id) && (
                      <CheckCircle size={18} className="text-emerald-600" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - SMS Sender */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-100 dark:border-slate-700">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Compose SMS
                </h3>
                <p className={`text-xs mt-1 ${message.length > 160 ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}>
                  {message.length} characters
                  {message.length > 160 && ` (${Math.ceil(message.length / 160)} SMS parts)`}
                </p>
              </div>
              
              {/* Templates Button */}
              <button
                onClick={() => setShowTemplates(!showTemplates)}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                <FileText size={16} />
                Templates
              </button>
            </div>

            {/* Templates Dropdown */}
            {showTemplates && (
              <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                  Choose a template
                </div>
                <div className="flex flex-wrap gap-2">
                  {SMS_TEMPLATES.map((template, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setMessage(template.text)
                        setShowTemplates(false)
                      }}
                      className="px-3 py-2 text-xs font-medium bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-md border border-slate-200 dark:border-slate-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:text-emerald-700 dark:hover:text-emerald-400 transition-all"
                    >
                      {template.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="p-4 flex-1 flex flex-col gap-4">
            {/* Message Textarea */}
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                Message
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type your SMS here... (use {customer_name} for personalization in bulk SMS)"
                className="w-full h-48 p-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              />
            </div>

            {/* Single Number Input */}
            <div className="border-t border-slate-100 dark:border-slate-700 pt-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle size={14} className="text-slate-400" />
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Send to single number
                </span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={singleNumber}
                  onChange={(e) => setSingleNumber(e.target.value)}
                  placeholder="e.g. 0771234567"
                  className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                />
                <button
                  onClick={sendSingle}
                  disabled={sending || !singleNumber || !message}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                >
                  <Send size={16} />
                  {sending ? 'Sending...' : 'Send'}
                </button>
              </div>
            </div>

            {/* Bulk Send Button */}
            {selectedCustomers.length > 0 && (
              <div className="border-t border-slate-100 dark:border-slate-700 pt-4">
                <button
                  onClick={sendBulk}
                  disabled={sending || !message}
                  className="w-full px-4 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <Send size={18} />
                  {sending ? 'Sending...' : `Send Bulk SMS to ${selectedCustomers.length} Customers`}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
