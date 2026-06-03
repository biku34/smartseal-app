"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const CATEGORY_DESIGN = {
  Electronics: { gradient: "from-blue-600 to-indigo-800", emoji: "⚡" },
  Medicine: { gradient: "from-emerald-500 to-teal-700", emoji: "💊" },
  Food: { gradient: "from-amber-500 to-orange-700", emoji: "🍎" },
  Cosmetics: { gradient: "from-pink-500 to-purple-700", emoji: "✨" },
};
function getCategoryDesign(c) {
  return CATEGORY_DESIGN[c] || { gradient: "from-slate-600 to-slate-800", emoji: "📦" };
}
function getImages(p) {
  if (Array.isArray(p.images)) return p.images;
  return p.image ? [p.image] : [];
}
const STATUS_STYLE = {
  Planned: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Dispatched: "bg-amber-50 text-amber-700 border-amber-200",
  "In Transit": "bg-blue-50 text-blue-700 border-blue-200",
  Delivered: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const EMPTY_TRUCK = {
  truckNumber: "",
  type: "",
  capacity: "",
  driverName: "",
  driverPhone: "",
  notes: "",
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function LogisticsPartnerPortal({
  username = "Operator",
  role = "logistics",
  userId = "",
  orgName = "",
  name = "",
}) {
  const router = useRouter();

  const [section, setSection] = useState("trucks");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dateBadge, setDateBadge] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const [toasts, setToasts] = useState([]);

  // Trucks
  const [trucks, setTrucks] = useState([]);
  const [loadingTrucks, setLoadingTrucks] = useState(true);
  const [form, setForm] = useState(EMPTY_TRUCK);
  const [saving, setSaving] = useState(false);

  // Assigned logistics
  const [assigned, setAssigned] = useState([]);
  const [loadingAssigned, setLoadingAssigned] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [tRes, aRes] = await Promise.all([
          fetch("/api/trucks"),
          fetch("/api/partner/logistics"),
        ]);
        const tData = await tRes.json().catch(() => ({}));
        if (!cancelled && tRes.ok && Array.isArray(tData.trucks)) setTrucks(tData.trucks);
        const aData = await aRes.json().catch(() => ({}));
        if (!cancelled && aRes.ok && Array.isArray(aData.items)) setAssigned(aData.items);
      } catch {
        /* leave empty */
      } finally {
        if (!cancelled) {
          setLoadingTrucks(false);
          setLoadingAssigned(false);
        }
      }
    })();
    const today = new Date();
    setDateBadge(today.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (sidebarOpen) document.body.classList.add("overflow-hidden");
    else document.body.classList.remove("overflow-hidden");
    return () => document.body.classList.remove("overflow-hidden");
  }, [sidebarOpen]);

  function pushToast(message, tone = "success") {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }

  function goSection(id) {
    setSection(id);
    setSidebarOpen(false);
  }

  const setField = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function handleAddTruck(e) {
    e.preventDefault();
    if (!form.truckNumber.trim()) {
      pushToast("Truck number is required.", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/trucks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        pushToast(data.error || "Could not save the truck.", "error");
        return;
      }
      setTrucks((prev) => [data.truck, ...prev]);
      setForm(EMPTY_TRUCK);
      pushToast(`Truck ${data.truck.truckNumber} added.`);
    } catch {
      pushToast("Network error. Is the server running?", "error");
    } finally {
      setSaving(false);
    }
  }

  async function removeTruck(truck) {
    setTrucks((prev) => prev.filter((t) => t.truckId !== truck.truckId));
    try {
      await fetch(`/api/trucks?id=${encodeURIComponent(truck.truckId)}`, { method: "DELETE" });
    } catch {
      /* optimistic */
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  const initials = (name || username).slice(0, 2).toUpperCase();
  const pageTitle = section === "trucks" ? "My Trucks" : "Assigned Logistics";

  return (
    <div className="bg-slate-50 text-slate-800 antialiased h-screen overflow-hidden">
      <div className="flex h-full">
        {sidebarOpen && (
          <div
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-40 md:hidden"
          />
        )}

        {/* Sidebar */}
        <aside
          className={`fixed md:static inset-y-0 left-0 w-64 max-w-[80vw] bg-slate-950 text-white flex flex-col flex-shrink-0 border-r border-slate-900 shadow-xl z-50 transform transition-transform duration-300 ease-in-out ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          } md:translate-x-0`}
        >
          <div className="p-6 border-b border-slate-900 flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-xl shadow-lg shadow-blue-500/30">
              <LogoIcon className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold tracking-tight">SmartSeal</h2>
              <p className="text-xs text-slate-400">Logistics Hub</p>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-900 transition"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          <nav className="flex-1 p-4 space-y-1">
            <NavButton
              active={section === "trucks"}
              onClick={() => goSection("trucks")}
              label="My Trucks"
              icon={<TruckIcon />}
              badge={trucks.length || null}
            />
            <NavButton
              active={section === "assigned"}
              onClick={() => goSection("assigned")}
              label="Assigned Logistics"
              icon={<BoxIcon />}
              badge={assigned.length || null}
            />
          </nav>

          <div className="p-4 border-t border-slate-900 bg-slate-950/50 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-semibold text-blue-400 border border-slate-700 uppercase">
                {initials}
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-semibold text-slate-200 truncate">{name || username}</h4>
                <p className="text-[10px] text-emerald-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Logistics Partner
                </p>
              </div>
            </div>
            <button
              onClick={handleSignOut}
              disabled={signingOut}
              className="w-full flex items-center justify-center gap-2 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-900 hover:text-white transition disabled:opacity-60"
            >
              <LogoutIcon className="w-4 h-4" />
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <header className="bg-white border-b border-slate-200 py-4 px-4 sm:px-6 md:px-8 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => setSidebarOpen(true)}
                className="md:hidden p-2 -ml-1 rounded-lg text-slate-600 hover:bg-slate-100 transition flex-shrink-0"
              >
                <MenuIcon className="w-6 h-6" />
              </button>
              <h1 className="text-lg sm:text-xl font-bold text-slate-800 truncate">{pageTitle}</h1>
            </div>
            <span className="text-sm font-medium text-slate-600 bg-slate-100 py-1.5 px-3 rounded-lg border border-slate-200 whitespace-nowrap">
              {dateBadge || "—"}
            </span>
          </header>

          <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 space-y-6">
            {section === "trucks" && (
              <TrucksSection
                trucks={trucks}
                loading={loadingTrucks}
                form={form}
                setField={setField}
                onAdd={handleAddTruck}
                onRemove={removeTruck}
                saving={saving}
              />
            )}
            {section === "assigned" && (
              <AssignedSection items={assigned} loading={loadingAssigned} onTrucks={() => goSection("trucks")} />
            )}
          </div>
        </main>
      </div>

      {/* Toasts */}
      <div className="fixed bottom-4 right-4 z-[60] space-y-2 w-72 max-w-[calc(100vw-2rem)]">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-medium shadow-lg border ${
              t.tone === "error" ? "bg-rose-50 border-rose-200 text-rose-700" : "bg-white border-slate-200 text-slate-800"
            }`}
          >
            <span className={t.tone === "error" ? "text-rose-500" : "text-emerald-500"}>
              {t.tone === "error" ? <XIcon className="w-4 h-4 mt-0.5" /> : <CheckIcon className="w-4 h-4 mt-0.5" />}
            </span>
            <span className="flex-1">{t.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Trucks section                                                     */
/* ------------------------------------------------------------------ */

function TrucksSection({ trucks, loading, form, setField, onAdd, onRemove, saving }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-950">Fleet Registration</h2>
        <p className="text-xs text-slate-500 mt-1">Save your trucks and their details. They&apos;re stored to your account.</p>
      </div>

      {/* Add truck form */}
      <form onSubmit={onAdd} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Field label="Truck Number *">
            <input type="text" value={form.truckNumber} onChange={setField("truckNumber")} placeholder="e.g. GJ-01-AB-1234" className={inputCls} />
          </Field>
          <Field label="Type">
            <input type="text" value={form.type} onChange={setField("type")} placeholder="e.g. Container, Refrigerated" className={inputCls} />
          </Field>
          <Field label="Capacity">
            <input type="text" value={form.capacity} onChange={setField("capacity")} placeholder="e.g. 10 tonnes" className={inputCls} />
          </Field>
          <Field label="Driver Name">
            <input type="text" value={form.driverName} onChange={setField("driverName")} placeholder="e.g. Ramesh Kumar" className={inputCls} />
          </Field>
          <Field label="Driver Phone">
            <input type="text" value={form.driverPhone} onChange={setField("driverPhone")} placeholder="e.g. +91 98765 43210" className={inputCls} />
          </Field>
          <Field label="Notes">
            <input type="text" value={form.notes} onChange={setField("notes")} placeholder="Anything else…" className={inputCls} />
          </Field>
        </div>
        <div className="flex justify-end mt-4">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition shadow-sm shadow-blue-500/20 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <Spinner /> Saving…
              </>
            ) : (
              <>
                <PlusIcon className="w-4 h-4" /> Add Truck
              </>
            )}
          </button>
        </div>
      </form>

      {/* Fleet list */}
      <div>
        <h3 className="text-sm font-bold text-slate-900 mb-3">
          Your Fleet {trucks.length > 0 && <span className="text-slate-400 font-semibold">({trucks.length})</span>}
        </h3>
        {loading ? (
          <div className="text-center py-12">
            <Spinner className="w-7 h-7 text-blue-500 mx-auto" />
            <p className="text-slate-400 text-sm font-medium mt-3">Loading trucks…</p>
          </div>
        ) : trucks.length ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {trucks.map((t) => (
              <div key={t.truckId} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-base font-extrabold text-slate-900 font-mono truncate">{t.truckNumber}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{t.type || "—"}{t.capacity ? ` · ${t.capacity}` : ""}</p>
                  </div>
                  <button
                    onClick={() => onRemove(t)}
                    title="Remove truck"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition flex-shrink-0"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
                <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5 text-xs">
                  <Row label="Driver" value={t.driverName || "—"} />
                  <Row label="Phone" value={t.driverPhone || "—"} />
                  {t.notes ? <Row label="Notes" value={t.notes} /> : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400 text-center py-10">No trucks yet. Add your first one above.</p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Assigned logistics section                                         */
/* ------------------------------------------------------------------ */

function AssignedSection({ items, loading, onTrucks }) {
  const totalUnits = useMemo(
    () => items.reduce((s, x) => s + (Number(x.shipQuantity) || 0), 0),
    [items]
  );

  if (loading) {
    return (
      <div className="text-center py-16">
        <Spinner className="w-7 h-7 text-blue-500 mx-auto" />
        <p className="text-slate-400 text-sm font-medium mt-3">Loading assigned shipments…</p>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="max-w-xl mx-auto text-center py-20">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-blue-600/10 text-blue-600 flex items-center justify-center mb-4">
          <BoxIcon className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">No shipments assigned yet</h2>
        <p className="text-sm text-slate-500 mt-1">
          When a distributor assigns a shipment to you, it will appear here with all its details.
        </p>
        <button
          onClick={onTrucks}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition shadow-sm shadow-blue-500/20"
        >
          <TruckIcon className="w-4 h-4" /> Manage My Trucks
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-slate-950">Assigned Shipments</h2>
        <p className="text-xs text-slate-500 mt-1">Shipments distributors have assigned to your account.</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Kpi label="Shipments" value={items.length.toLocaleString()} />
        <Kpi label="Total Units" value={totalUnits.toLocaleString()} />
        <Kpi label="Distributors" value={new Set(items.map((x) => x.distributorUserId)).size.toLocaleString()} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {items.map((it) => (
          <AssignedCard key={it.logisticsId} item={it} />
        ))}
      </div>
    </div>
  );
}

function AssignedCard({ item }) {
  const design = getCategoryDesign(item.category);
  const imgs = getImages(item);
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 p-4 border-b border-slate-100">
        <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-slate-100">
          {imgs.length > 0 ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imgs[0]} alt={item.name} className="w-full h-full object-cover" />
          ) : (
            <div className={`w-full h-full bg-gradient-to-tr ${design.gradient} flex items-center justify-center text-xl`}>
              {design.emoji}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-slate-900 text-sm truncate">{item.name}</h3>
          <p className="text-[11px] text-slate-500 truncate">by {item.manufacturer || "—"} · {item.category}</p>
        </div>
        <span
          className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
            STATUS_STYLE[item.status] || STATUS_STYLE.Planned
          }`}
        >
          {item.status}
        </span>
      </div>

      <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        <Meta label="Tracking" value={item.trackingNo || "—"} mono />
        <Meta label="Units" value={Number(item.shipQuantity || 0).toLocaleString()} />
        <Meta label="Carrier" value={item.carrier || "—"} />
        <Meta label="Origin" value={item.origin || "—"} />
        <Meta label="Destination" value={item.destination || "—"} />
        <Meta label="Assigned By" value={item.distributorUsername || "—"} />
        <Meta label="Dispatch" value={item.dispatchDate || "—"} />
        <Meta label="ETA" value={item.etaDate || "—"} />
        <Meta label="SKU" value={item.sku || "—"} mono />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  UI primitives                                                      */
/* ------------------------------------------------------------------ */

const inputCls =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</span>
      {children}
    </label>
  );
}

function Meta({ label, value, mono }) {
  return (
    <div className="bg-slate-50 px-3 py-2 rounded-lg border border-slate-100 flex flex-col">
      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{label}</span>
      <span className={`text-sm font-semibold text-slate-800 mt-0.5 line-clamp-1 ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-slate-400 font-semibold">{label}</span>
      <span className="text-slate-700 font-medium truncate text-right">{value}</span>
    </div>
  );
}

function Kpi({ label, value }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <p className="text-xs font-semibold text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-extrabold text-slate-950">{value}</p>
    </div>
  );
}

function NavButton({ active, onClick, label, icon, badge }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition duration-200 group ${
        active ? "bg-blue-600 text-white" : "hover:bg-slate-900"
      }`}
    >
      <span className={active ? "text-white" : "text-slate-400 group-hover:text-blue-500 transition"}>{icon}</span>
      <span className={`flex-1 text-left font-medium text-sm ${active ? "text-white" : "text-slate-300 group-hover:text-white"}`}>
        {label}
      </span>
      {badge ? (
        <span
          className={`min-w-[1.25rem] h-5 px-1.5 inline-flex items-center justify-center rounded-full text-[10px] font-bold ${
            active ? "bg-white/20 text-white" : "bg-blue-600/20 text-blue-300"
          }`}
        >
          {badge}
        </span>
      ) : null}
    </button>
  );
}

function Spinner({ className = "w-4 h-4" }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

/* Icons */
const ico = (d, p = {}) => (
  <svg className={p.className || "w-5 h-5"} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={p.strokeWidth || 2} d={d} />
  </svg>
);
const LogoIcon = (p) =>
  ico(
    "M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z",
    { ...p, className: p.className || "w-6 h-6 text-white" }
  );
const TruckIcon = (p) =>
  ico("M9 17a2 2 0 11-4 0 2 2 0 014 0zm10 0a2 2 0 11-4 0 2 2 0 014 0zM3 6h11v11H3zM14 9h4l3 3v5h-7", p);
const BoxIcon = (p) =>
  ico("M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4", p);
const XIcon = (p) => ico("M6 18L18 6M6 6l12 12", p);
const MenuIcon = (p) => ico("M4 6h16M4 12h16M4 18h16", p);
const PlusIcon = (p) => ico("M12 4v16m8-8H4", { ...p, strokeWidth: 2.5 });
const CheckIcon = (p) => ico("M5 13l4 4L19 7", { ...p, strokeWidth: 2.5 });
const TrashIcon = (p) =>
  ico("M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16", p);
const LogoutIcon = (p) =>
  ico("M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1", p);
