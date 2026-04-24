import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { Baby, HeartHandshake, Sparkles, PhoneCall, MapPin, Mail, Moon, Sun } from 'lucide-react'
import logo from '../pictures/logo.jpeg'
import { useTheme } from '../contexts/ThemeContext'

function SectionTitle({ eyebrow, title, subtitle }) {
  return (
    <div className="max-w-2xl">
      {eyebrow ? <div className="text-xs font-semibold tracking-widest text-rose-600 uppercase">{eyebrow}</div> : null}
      <h2 className="mt-2 text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">{title}</h2>
      {subtitle ? <p className="mt-2 text-sm md:text-base text-slate-600 dark:text-slate-300">{subtitle}</p> : null}
    </div>
  )
}

function FeatureCard({ icon: Icon, title, desc }) {
  return (
    <div className="rounded-2xl border border-slate-200/70 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="h-11 w-11 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
        <Icon size={20} />
      </div>
      <div className="mt-4 font-bold text-slate-900 dark:text-white">{title}</div>
      <div className="mt-1 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{desc}</div>
    </div>
  )
}

export default function HomePage() {
  const { theme, toggleTheme } = useTheme()
  const [shopName, setShopName] = useState('')
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')

  const onSendEmail = () => {
    const subject = `Wholesale Inquiry${shopName ? ` - ${shopName}` : ''}`
    const body = [
      `Shop Name: ${shopName || '-'}`,
      `Phone: ${phone || '-'}`,
      '',
      message || '',
    ].join('\n')
    const mailto = `mailto:shayankidscare@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    window.location.href = mailto
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-slate-950/70 backdrop-blur border-b border-slate-200/60 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4">
          <div className="h-16 flex items-center justify-between">
            <a href="#top" className="flex items-center gap-3">
              <img src={logo} alt="Shayan Kids Care" className="h-10 w-10 rounded-xl object-cover shadow-sm" />
              <div>
                <div className="text-sm font-extrabold text-slate-900 dark:text-white">Shayan Kids Care</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 -mt-0.5">Wholesale Supply for Retail Shops</div>
              </div>
            </a>

            <nav className="hidden md:flex items-center gap-6 text-sm font-semibold text-slate-700 dark:text-slate-200">
              <a href="#services" className="hover:text-slate-900 dark:hover:text-white transition-colors">Services</a>
              <a href="#about" className="hover:text-slate-900 dark:hover:text-white transition-colors">About</a>
              <a href="#contact" className="hover:text-slate-900 dark:hover:text-white transition-colors">Contact</a>
            </nav>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleTheme}
                className="inline-flex items-center justify-center rounded-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                title="Toggle theme"
              >
                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              <Link to="/login" className="inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition-colors shadow-sm">
                Admin Login
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main id="top">
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-rose-50 via-white to-sky-50 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900" />
          <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-rose-200/40 blur-3xl" />
          <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-sky-200/40 blur-3xl" />

          <div className="relative max-w-6xl mx-auto px-4 py-14 md:py-20">
            <div className="grid md:grid-cols-2 gap-10 items-center">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-rose-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1 text-xs font-semibold text-rose-700 dark:text-rose-300 shadow-sm">
                  <Sparkles size={14} />
                  Trusted wholesale partner
                </div>
                <h1 className="mt-5 text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-tight">
                  Wholesale baby & kids essentials for retail shops
                </h1>
                <p className="mt-4 text-base md:text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
                  We supply retail shops with quality baby and kids products, consistent stock availability, and smooth order processing.
                </p>

                <div className="mt-7 flex flex-col sm:flex-row gap-3">
                  <a href="#services" className="inline-flex items-center justify-center rounded-xl bg-rose-600 px-5 py-3 text-sm font-semibold text-white hover:bg-rose-700 transition-colors shadow-sm">
                    Wholesale Services
                  </a>
                  <a href="#contact" className="inline-flex items-center justify-center rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-3 text-sm font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                    Become a Partner
                  </a>
                </div>

                <div className="mt-8 grid grid-cols-3 gap-3 max-w-md">
                  <div className="rounded-xl bg-white/80 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700 p-3">
                    <div className="text-lg font-extrabold text-slate-900 dark:text-white">Bulk</div>
                    <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Wholesale supply</div>
                  </div>
                  <div className="rounded-xl bg-white/80 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700 p-3">
                    <div className="text-lg font-extrabold text-slate-900 dark:text-white">Stock</div>
                    <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Reliable availability</div>
                  </div>
                  <div className="rounded-xl bg-white/80 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700 p-3">
                    <div className="text-lg font-extrabold text-slate-900 dark:text-white">Support</div>
                    <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">For retailers</div>
                  </div>
                </div>
              </div>

              <div className="md:justify-self-end">
                <div className="rounded-3xl border border-slate-200/70 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl overflow-hidden">
                  <div className="p-6">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
                        <Baby size={22} />
                      </div>
                      <div>
                        <div className="text-sm font-extrabold text-slate-900 dark:text-white">Shayan Kids Care</div>
                        <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Wholesale Supply</div>
                      </div>
                    </div>

                    <div className="mt-6 grid grid-cols-2 gap-3">
                      <div className="rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 p-4">
                        <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Popular</div>
                        <div className="mt-2 text-sm font-bold text-slate-900 dark:text-white">Baby Care</div>
                        <div className="text-xs text-slate-600 dark:text-slate-300 mt-1">Essentials & hygiene</div>
                      </div>
                      <div className="rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 p-4">
                        <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">New</div>
                        <div className="mt-2 text-sm font-bold text-slate-900 dark:text-white">Kids Wear</div>
                        <div className="text-xs text-slate-600 dark:text-slate-300 mt-1">Comfortable styles</div>
                      </div>
                      <div className="rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 p-4">
                        <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Stock</div>
                        <div className="mt-2 text-sm font-bold text-slate-900 dark:text-white">Ready</div>
                        <div className="text-xs text-slate-600 dark:text-slate-300 mt-1">Reliable availability</div>
                      </div>
                      <div className="rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 p-4">
                        <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Support</div>
                        <div className="mt-2 text-sm font-bold text-slate-900 dark:text-white">Quick</div>
                        <div className="text-xs text-slate-600 dark:text-slate-300 mt-1">Friendly assistance</div>
                      </div>
                    </div>

                    <div className="mt-6 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 text-white p-5">
                      <div className="font-extrabold">Need wholesale rates?</div>
                      <div className="text-sm text-white/80 mt-1">Contact us to request a price list and availability.</div>
                      <a href="#contact" className="mt-4 inline-flex items-center justify-center rounded-xl bg-white text-slate-900 px-4 py-2 text-sm font-bold hover:bg-slate-100 transition-colors">
                        Request Price List
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="services" className="max-w-6xl mx-auto px-4 py-14">
          <SectionTitle
            eyebrow="Services"
            title="Wholesale services for retailers"
            subtitle="Consistent stock, smooth ordering, and dependable support for retail shops."
          />

          <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <FeatureCard icon={HeartHandshake} title="Retail Partnership" desc="We support shops with dependable service and repeat ordering." />
            <FeatureCard icon={Sparkles} title="New Stock Updates" desc="Regular restocks and new arrivals to keep your shelves fresh." />
            <FeatureCard icon={Baby} title="Wholesale Essentials" desc="Core baby and kids categories ready for bulk supply." />
          </div>
        </section>

        <section id="about" className="bg-white dark:bg-slate-900 border-y border-slate-200/60 dark:border-slate-800">
          <div className="max-w-6xl mx-auto px-4 py-14">
            <div className="grid md:grid-cols-2 gap-10 items-center">
              <div>
                <SectionTitle
                  eyebrow="About"
                  title="Built for retailers"
                  subtitle="We help retail shops grow with consistent wholesale supply and helpful support."
                />
                <div className="mt-5 space-y-3 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  <div>We support retail shops with dependable stock availability, new arrivals, and smooth ordering.</div>
                  <div>Our goal is to make wholesale purchasing simple, fast, and stress-free for your store.</div>
                </div>
                <div className="mt-6">
                  <a href="#contact" className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 transition-colors shadow-sm">
                    Partner With Us
                  </a>
                </div>
              </div>
              <div className="rounded-3xl bg-gradient-to-br from-slate-50 to-white dark:from-slate-800 dark:to-slate-900 border border-slate-200/70 dark:border-slate-700 p-7 shadow-sm">
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 p-5">
                    <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Focus</div>
                    <div className="mt-2 text-lg font-extrabold text-slate-900 dark:text-white">Quality</div>
                    <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">Safe & reliable items</div>
                  </div>
                  <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 p-5">
                    <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Experience</div>
                    <div className="mt-2 text-lg font-extrabold text-slate-900 dark:text-white">Care</div>
                    <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">Friendly customer service</div>
                  </div>
                  <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 p-5">
                    <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Supply</div>
                    <div className="mt-2 text-lg font-extrabold text-slate-900 dark:text-white">Stock</div>
                    <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">Regular availability</div>
                  </div>
                  <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 p-5">
                    <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Ordering</div>
                    <div className="mt-2 text-lg font-extrabold text-slate-900 dark:text-white">Simple</div>
                    <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">Smooth process</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="contact" className="max-w-6xl mx-auto px-4 py-14">
          <SectionTitle
            eyebrow="Contact"
            title="Let’s supply your shop"
            subtitle="Tell us what categories you need and we’ll share wholesale rates & availability."
          />

          <div className="mt-8 grid lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 rounded-3xl border border-slate-200/70 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">Shop Name</label>
                  <input value={shopName} onChange={(e) => setShopName(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 transition-shadow" placeholder="Your shop name" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">Phone</label>
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 transition-shadow" placeholder="+94 ..." />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">Message</label>
                  <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} className="mt-1.5 w-full rounded-xl border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 transition-shadow" placeholder="Tell us what categories you need, your area, and expected quantities..." />
                </div>
              </div>
              <div className="mt-5 flex items-center justify-between gap-3 flex-wrap">
                <div className="text-xs text-slate-500 dark:text-slate-400">Clicking send will open your email app and draft a message to shayankidscare@gmail.com.</div>
                <button type="button" onClick={onSendEmail} className="inline-flex items-center justify-center rounded-xl bg-rose-600 px-5 py-3 text-sm font-semibold text-white hover:bg-rose-700 transition-colors shadow-sm">
                  Request Wholesale Info
                </button>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200/70 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm">
              <div className="text-sm font-extrabold text-slate-900 dark:text-white">Shayan Kids Care</div>
              <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">We're happy to help.</div>

              <div className="mt-5 space-y-3 text-sm">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 text-rose-600"><PhoneCall size={16} /></div>
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-white">Phone</div>
                    <div className="text-slate-600 dark:text-slate-300">+94 75 384 1599</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 text-rose-600"><Mail size={16} /></div>
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-white">Email</div>
                    <div className="text-slate-600 dark:text-slate-300">shayankidscare@gmail.com</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 text-rose-600"><MapPin size={16} /></div>
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-white">Address</div>
                    <div className="text-slate-600 dark:text-slate-300">10/3 B, Attidiya Road, Kawdana, Dehiwala</div>
                  </div>
                </div>
              </div>

              <div className="mt-6 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 p-4">
                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Admin</div>
                <div className="mt-2 text-sm text-slate-700 dark:text-slate-300">Manage products, customers, orders, and invoices.</div>
                <Link to="/login" className="mt-3 inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition-colors w-full">
                  Go to Login
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-500 dark:text-slate-400">© {new Date().getFullYear()} Shayan Kids Care. All rights reserved.</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">Built with care.</div>
        </div>
      </footer>
    </div>
  )
}
