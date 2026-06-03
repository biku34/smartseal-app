export default function BrandPanel() {
  return (
    <div className="relative hidden lg:flex lg:sticky lg:top-0 lg:h-screen flex-col justify-between w-1/2 bg-slate-950 text-white p-12 overflow-hidden">
      {/* Decorative glows */}
      <div className="pointer-events-none absolute -top-24 -left-24 w-96 h-96 rounded-full bg-blue-600/20 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-0 w-96 h-96 rounded-full bg-indigo-600/20 blur-3xl" />

      {/* Logo */}
      <div className="relative z-10 flex items-center gap-3">
        <div className="p-2 bg-blue-600 rounded-xl shadow-lg shadow-blue-500/30">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
            />
          </svg>
        </div>
        <div>
          <h2 className="text-lg font-bold tracking-tight">SmartSeal</h2>
          <p className="text-xs text-slate-400">Operations Control</p>
        </div>
      </div>

      {/* Headline */}
      <div className="relative z-10 max-w-md">
        <h1 className="text-4xl font-extrabold leading-tight tracking-tight">
          Run your factory floor like a flagship.
        </h1>
        <p className="mt-4 text-slate-300 leading-relaxed">
          One control plane for inventory, dispatch and logistics — built for
          manufacturers, distributors and retailers.
        </p>

        <ul className="mt-8 space-y-3 text-sm text-slate-300">
          {[
            "Real-time product & ledger tracking",
            "Role-based access across your supply chain",
            "Secure, auditable transactions",
          ].map((item) => (
            <li key={item} className="flex items-center gap-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                </svg>
              </span>
              {item}
            </li>
          ))}
        </ul>
      </div>

      {/* Footer */}
      <div className="relative z-10 flex items-center gap-1.5 text-xs text-slate-500">
        Made with
        <svg className="w-3.5 h-3.5 text-rose-500" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
        NFSU SSIP 2.0
      </div>
    </div>
  );
}
