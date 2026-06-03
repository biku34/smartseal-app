"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
const inr = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function DistributorPortal({
  username = "Operator",
  role = "distributor",
  userId = "",
  orgName = "",
  stage = "",
  name = "",
}) {
  const router = useRouter();

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState("marketplace");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dateBadge, setDateBadge] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  const [detail, setDetail] = useState(null);
  const [carouselIndex, setCarouselIndex] = useState(0);

  // Logistics queue (products the distributor has pushed to the Logistics section)
  const [logistics, setLogistics] = useState([]);
  const [partners, setPartners] = useState([]);
  const [pushingId, setPushingId] = useState(null);
  const [submittingId, setSubmittingId] = useState(null);
  const [toasts, setToasts] = useState([]);

  /* Load the full catalog + logistics queue + logistics partners on mount */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [catRes, logRes, partRes] = await Promise.all([
          fetch("/api/catalog"),
          fetch("/api/logistics"),
          fetch("/api/partners"),
        ]);
        const catData = await catRes.json().catch(() => ({}));
        if (!cancelled && catRes.ok && Array.isArray(catData.products)) setProducts(catData.products);
        const logData = await logRes.json().catch(() => ({}));
        if (!cancelled && logRes.ok && Array.isArray(logData.items)) setLogistics(logData.items);
        const partData = await partRes.json().catch(() => ({}));
        if (!cancelled && partRes.ok && Array.isArray(partData.partners)) setPartners(partData.partners);
      } catch {
        /* leave empty */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    const today = new Date();
    setDateBadge(today.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }));
    return () => {
      cancelled = true;
    };
  }, []);

  /* Lock scroll when modal/drawer open */
  useEffect(() => {
    const open = detail || sidebarOpen;
    if (open) document.body.classList.add("overflow-hidden");
    else document.body.classList.remove("overflow-hidden");
    return () => document.body.classList.remove("overflow-hidden");
  }, [detail, sidebarOpen]);

  const filtered = useMemo(() => {
    const s = search.toLowerCase().trim();
    return products.filter((p) => {
      const matchesSearch =
        !s ||
        p.name?.toLowerCase().includes(s) ||
        p.sku?.toLowerCase().includes(s) ||
        p.manufacturer?.toLowerCase().includes(s);
      const matchesCat = !categoryFilter || p.category === categoryFilter;
      return matchesSearch && matchesCat;
    });
  }, [products, search, categoryFilter]);

  function goSection(id) {
    setSection(id);
    setSidebarOpen(false);
  }

  function openDetails(p) {
    setCarouselIndex(0);
    setDetail(p);
  }
  function carouselNav(dir) {
    if (!detail) return;
    const imgs = getImages(detail);
    if (imgs.length < 2) return;
    setCarouselIndex((i) => (i + dir + imgs.length) % imgs.length);
  }

  /* ---- Toasts ---- */
  function pushToast(message, tone = "success") {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }

  /* ---- Push a product into the Logistics section (persists to MongoDB) ---- */
  async function handleManageLogistics(p) {
    if (!p) return;
    setPushingId(p.productId);
    try {
      const res = await fetch("/api/logistics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product: p }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        pushToast(data.error || "Could not add to logistics.", "error");
        return;
      }
      // Upsert into local state by productId.
      setLogistics((prev) => {
        const others = prev.filter((x) => x.productId !== data.item.productId);
        return [data.item, ...others];
      });
      pushToast(`"${p.name}" added to Logistics.`);
      setDetail(null);
      goSection("logistics");
    } catch {
      pushToast("Network error. Is the server running?", "error");
    } finally {
      setPushingId(null);
    }
  }

  /* ---- Frontend-only planning edits (kept in local state for now) ---- */
  function updateLogistics(logisticsId, patch) {
    setLogistics((prev) =>
      prev.map((x) => (x.logisticsId === logisticsId ? { ...x, ...patch } : x))
    );
  }

  /* ---- Submit a shipment plan: persists fields, sets status Planned, gets a tracking no ---- */
  async function submitLogistics(item) {
    if (!item.assignedPartnerId) {
      pushToast("Choose a logistics partner before submitting.", "error");
      return;
    }
    setSubmittingId(item.logisticsId);
    try {
      const res = await fetch("/api/logistics", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          logisticsId: item.logisticsId,
          carrier: item.carrier,
          origin: item.origin,
          destination: item.destination,
          dispatchDate: item.dispatchDate,
          etaDate: item.etaDate,
          assignedPartnerId: item.assignedPartnerId || "",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        pushToast(data.error || "Could not submit the shipment.", "error");
        return;
      }
      setLogistics((prev) =>
        prev.map((x) => (x.logisticsId === data.item.logisticsId ? data.item : x))
      );
      pushToast(`Shipment submitted — tracking ${data.item.trackingNo}.`);
    } catch {
      pushToast("Network error. Is the server running?", "error");
    } finally {
      setSubmittingId(null);
    }
  }

  /* ---- Remove an item from the logistics queue (also deletes from MongoDB) ---- */
  async function removeLogistics(item) {
    setLogistics((prev) => prev.filter((x) => x.logisticsId !== item.logisticsId));
    try {
      await fetch(`/api/logistics?id=${encodeURIComponent(item.logisticsId)}`, {
        method: "DELETE",
      });
    } catch {
      /* optimistic removal; ignore network errors */
    }
  }

  const inLogistics = (productId) => logistics.some((x) => x.productId === productId);

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
  const pageTitle =
    section === "marketplace" ? "Marketplace" : section === "logistics" ? "Logistics" : "Section 3";

  return (
    <div className="bg-slate-50 text-slate-800 antialiased h-screen overflow-hidden">
      <div className="flex h-full">
        {/* Mobile backdrop */}
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
              <p className="text-xs text-slate-400">Distributor Hub</p>
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
              active={section === "marketplace"}
              onClick={() => goSection("marketplace")}
              label="Marketplace"
              icon={<StoreIcon />}
            />
            <NavButton
              active={section === "logistics"}
              onClick={() => goSection("logistics")}
              label="Logistics"
              icon={<TruckIcon />}
              badge={logistics.length || null}
            />
            <NavButton
              active={section === "section3"}
              onClick={() => goSection("section3")}
              label="Section 3"
              icon={<BoxIcon />}
            />
          </nav>

          <div className="p-4 border-t border-slate-900 bg-slate-950/50 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-semibold text-blue-400 border border-slate-700 uppercase">
                {initials}
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-semibold text-slate-200 truncate">{name || username}</h4>
                <p className="text-[10px] text-emerald-400 flex items-center gap-1 capitalize">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> {role}
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
            {/* MARKETPLACE */}
            {section === "marketplace" && (
              <div>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-5">
                  <div>
                    <h2 className="text-lg font-bold text-slate-950">Browse Products</h2>
                    <p className="text-xs text-slate-500 mt-1">
                      Everything listed by manufacturers on SmartSeal.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                    <div className="relative flex-1 sm:flex-none">
                      <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search products or makers..."
                        className="pl-9 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 w-full sm:w-64 transition"
                      />
                      <SearchIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    </div>
                    <select
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      className="py-2 px-3 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                    >
                      <option value="">All Categories</option>
                      <option value="Electronics">Electronics</option>
                      <option value="Medicine">Medicine</option>
                      <option value="Food">Food</option>
                      <option value="Cosmetics">Cosmetics</option>
                    </select>
                  </div>
                </div>

                {loading ? (
                  <div className="text-center py-16">
                    <svg className="w-7 h-7 animate-spin text-blue-500 mx-auto" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    <p className="text-slate-400 text-sm font-medium mt-3">Loading products…</p>
                  </div>
                ) : filtered.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                    {filtered.map((p) => (
                      <ProductCard key={p.productId} p={p} onView={() => openDetails(p)} />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-16">
                    <span className="text-4xl">📦</span>
                    <p className="text-slate-400 text-sm font-medium mt-3">
                      {products.length === 0
                        ? "No products have been listed yet."
                        : "No products match your search."}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* LOGISTICS */}
            {section === "logistics" && (
              <LogisticsSection
                items={logistics}
                partners={partners}
                onUpdate={updateLogistics}
                onRemove={removeLogistics}
                onSubmit={submitLogistics}
                submittingId={submittingId}
                onBrowse={() => goSection("marketplace")}
              />
            )}
            {/* SECTION 3 (placeholder) */}
            {section === "section3" && <Placeholder title="Section 3" />}
          </div>
        </main>
      </div>

      {detail && (
        <DetailModal
          p={detail}
          index={carouselIndex}
          onNav={carouselNav}
          onClose={() => setDetail(null)}
          onManage={() => handleManageLogistics(detail)}
          managing={pushingId === detail.productId}
          alreadyAdded={inLogistics(detail.productId)}
        />
      )}

      {/* Toasts */}
      <div className="fixed bottom-4 right-4 z-[60] space-y-2 w-72 max-w-[calc(100vw-2rem)]">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-medium shadow-lg border ${
              t.tone === "error"
                ? "bg-rose-50 border-rose-200 text-rose-700"
                : "bg-white border-slate-200 text-slate-800"
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
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function Placeholder({ title }) {
  return (
    <div className="max-w-xl mx-auto text-center py-20">
      <div className="mx-auto w-14 h-14 rounded-2xl bg-blue-600/10 text-blue-600 flex items-center justify-center mb-4">
        <BoxIcon className="w-7 h-7" />
      </div>
      <h2 className="text-lg font-bold text-slate-900">{title}</h2>
      <p className="text-sm text-slate-500 mt-1">Coming soon — this section will be defined next.</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Logistics section                                                  */
/* ------------------------------------------------------------------ */

const STATUS_STYLE = {
  Planned: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Dispatched: "bg-amber-50 text-amber-700 border-amber-200",
  "In Transit": "bg-blue-50 text-blue-700 border-blue-200",
  Delivered: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

function LogisticsSection({ items, partners = [], onUpdate, onRemove, onSubmit, submittingId, onBrowse }) {
  const [filter, setFilter] = useState("all"); // all | pending | placed

  if (!items.length) {
    return (
      <div className="max-w-xl mx-auto text-center py-20">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-blue-600/10 text-blue-600 flex items-center justify-center mb-4">
          <TruckIcon className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">No shipments planned yet</h2>
        <p className="text-sm text-slate-500 mt-1">
          Open a product in the Marketplace and hit <span className="font-semibold">Manage Logistics</span> to plan its shipment here.
        </p>
        <button
          onClick={onBrowse}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition shadow-sm shadow-blue-500/20"
        >
          <StoreIcon className="w-4 h-4" /> Browse Marketplace
        </button>
      </div>
    );
  }

  const sumUnits = (arr) => arr.reduce((s, x) => s + (Number(x.shipQuantity) || 0), 0);
  const placedCount = items.filter((x) => x.submitted).length;
  const pendingCount = items.length - placedCount;
  // Units awaiting shipment on already-planned shipments vs. products with no plan yet.
  const plannedUnits = sumUnits(items.filter((x) => x.submitted));
  const unassignedUnits = sumUnits(items.filter((x) => !x.submitted));

  const visible = items.filter((x) =>
    filter === "pending" ? !x.submitted : filter === "placed" ? x.submitted : true
  );

  const FILTERS = [
    ["all", "All", items.length],
    ["pending", "Pending", pendingCount],
    ["placed", "Placed", placedCount],
  ];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-slate-950">Logistics Planning</h2>
        <p className="text-xs text-slate-500 mt-1">
          Plan and track shipments for products you&apos;ve pushed from the Marketplace.
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <LogiKpi label="Shipments" value={items.length.toLocaleString()} />
        <LogiKpi label="Placed" value={`${placedCount} / ${items.length}`} />
        <LogiKpi label="Assigned Shipments" sub="tracking generated" value={plannedUnits.toLocaleString()} />
        <LogiKpi label="Unassigned Units" sub="no shipment yet" value={unassignedUnits.toLocaleString()} />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl p-1 w-fit">
        {FILTERS.map(([val, label, count]) => {
          const active = filter === val;
          return (
            <button
              key={val}
              onClick={() => setFilter(val)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                active ? "bg-blue-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
              }`}
            >
              {label}
              <span
                className={`min-w-[1.25rem] inline-flex items-center justify-center rounded-full px-1 text-[10px] ${
                  active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Shipment cards */}
      {visible.length ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
          {visible.map((it) => (
            <LogisticsCard
              key={it.logisticsId}
              item={it}
              partners={partners}
              onUpdate={onUpdate}
              onRemove={onRemove}
              onSubmit={onSubmit}
              submitting={submittingId === it.logisticsId}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-400 text-center py-12">
          {filter === "pending" ? "No pending shipments." : "No placed shipments yet."}
        </p>
      )}
    </div>
  );
}

function LogiKpi({ label, value, sub }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <p className="text-xs font-semibold text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-extrabold text-slate-950">{value}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function LogisticsCard({ item, partners = [], onUpdate, onRemove, onSubmit, submitting }) {
  const [open, setOpen] = useState(false);
  const design = getCategoryDesign(item.category);
  const imgs = getImages(item);
  const set = (patch) => onUpdate(item.logisticsId, patch);
  const setStr = (key) => (e) => set({ [key]: e.target.value });

  // Trucks belonging to the currently-selected logistics partner.
  const [partnerTrucks, setPartnerTrucks] = useState([]);
  const [loadingTrucks, setLoadingTrucks] = useState(false);

  useEffect(() => {
    const partnerId = item.assignedPartnerId;
    if (!partnerId) {
      setPartnerTrucks([]);
      return;
    }
    let cancelled = false;
    setLoadingTrucks(true);
    (async () => {
      try {
        const res = await fetch(`/api/partners/trucks?partnerId=${encodeURIComponent(partnerId)}`);
        const data = await res.json().catch(() => ({}));
        if (!cancelled && res.ok && Array.isArray(data.trucks)) setPartnerTrucks(data.trucks);
        else if (!cancelled) setPartnerTrucks([]);
      } catch {
        if (!cancelled) setPartnerTrucks([]);
      } finally {
        if (!cancelled) setLoadingTrucks(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [item.assignedPartnerId]);

  // Changing the partner resets the chosen truck (carrier).
  const onPartnerChange = (e) => set({ assignedPartnerId: e.target.value, carrier: "" });

  return (
    <div
      className={`bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden ${
        open ? "md:col-span-2 xl:col-span-3" : ""
      }`}
    >
      {/* Header: compact box — click to expand the logistics form */}
      <div
        onClick={() => setOpen((o) => !o)}
        className={`p-4 cursor-pointer hover:bg-slate-50/60 transition ${open ? "border-b border-slate-100" : ""}`}
      >
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl overflow-hidden flex-shrink-0 bg-slate-100">
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
            <p className="text-[11px] text-slate-500 truncate">
              by {item.manufacturer || item.company || "—"} · {item.category}
            </p>
          </div>
          <ChevronIcon className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
        </div>

        <div className="flex items-center gap-2 mt-3">
          {item.trackingNo ? (
            <span
              title="Tracking number"
              className="px-2.5 py-1 rounded-full text-[11px] font-semibold font-mono border bg-emerald-50 text-emerald-700 border-emerald-200 truncate"
            >
              {item.trackingNo}
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold border bg-amber-50 text-amber-700 border-amber-200">
              Pending
            </span>
          )}
          <span className="flex-1" />
          <span className="text-[10px] font-mono text-slate-400">{item.logisticsId}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove(item);
            }}
            title="Remove from logistics"
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition flex-shrink-0"
          >
            <TrashIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {open && (
      <>
      {/* Product metadata snapshot */}
      <div className="px-4 pt-3 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5">
        <Meta label="SKU" value={item.sku || "—"} mono />
        <Meta label="Batch" value={item.batch || "—"} />
        <Meta label="Available" value={`${Number(item.quantity || 0).toLocaleString()}`} />
        <Meta label="Unit Price" value={inr(item.price)} />
        <Meta label="Origin Whse" value={item.location || "—"} />
        <Meta label="Expiry" value={item.exp || "—"} />
      </div>

      {/* Status — shown once the plan has been submitted */}
      {item.submitted && (
        <div className="px-4 pt-4 flex items-center gap-2">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</span>
          <span
            className={`px-3 py-1 rounded-full text-xs font-semibold border ${
              STATUS_STYLE[item.status] || STATUS_STYLE.Planned
            }`}
          >
            {item.status}
          </span>
        </div>
      )}

      {/* Planning fields */}
      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <LField label="Logistics Partner *">
          <select value={item.assignedPartnerId || ""} onChange={onPartnerChange} className={inputCls}>
            <option value="">Select a partner…</option>
            {partners.map((p) => (
              <option key={p.userId} value={p.userId}>
                {p.orgName} ({p.username})
              </option>
            ))}
          </select>
        </LField>
        <LField label="Truck">
          <select
            value={item.carrier || ""}
            onChange={setStr("carrier")}
            disabled={!item.assignedPartnerId || loadingTrucks}
            className={`${inputCls} disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed`}
          >
            {!item.assignedPartnerId ? (
              <option value="">Select a partner first…</option>
            ) : loadingTrucks ? (
              <option value="">Loading trucks…</option>
            ) : partnerTrucks.length === 0 ? (
              <option value="">No trucks registered by this partner</option>
            ) : (
              <>
                <option value="">Select a truck…</option>
                {partnerTrucks.map((t) => (
                  <option key={t.truckId} value={t.truckNumber}>
                    {t.truckNumber}
                    {t.type ? ` · ${t.type}` : ""}
                    {t.capacity ? ` · ${t.capacity}` : ""}
                  </option>
                ))}
              </>
            )}
          </select>
        </LField>
        <LField label="Tracking No.">
          <div
            className={`${inputCls} flex items-center select-none ${
              item.trackingNo ? "bg-slate-50 font-mono text-slate-800" : "bg-slate-50 text-slate-400"
            }`}
          >
            {item.trackingNo || "Auto-generated on submit"}
          </div>
        </LField>
        <LField label="Destination">
          <input type="text" value={item.destination} onChange={setStr("destination")} placeholder="e.g. Delhi, DL" className={inputCls} />
        </LField>
        <LField label="Dispatch Date">
          <input type="date" value={item.dispatchDate} onChange={setStr("dispatchDate")} className={inputCls} />
        </LField>
        <LField label="ETA">
          <input type="date" value={item.etaDate} onChange={setStr("etaDate")} className={inputCls} />
        </LField>
        <LField label="Units to Ship">
          <div className={`${inputCls} bg-slate-50 text-slate-700 flex items-center cursor-not-allowed select-none`}>
            {Number(item.shipQuantity || item.quantity || 0).toLocaleString()}
          </div>
        </LField>
      </div>

      {/* Submit */}
      <div className="px-4 pb-4 flex justify-end">
        <button
          onClick={() => onSubmit(item)}
          disabled={submitting}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition shadow-sm shadow-blue-500/20 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {submitting ? (
            <>
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              Submitting…
            </>
          ) : item.submitted ? (
            <>
              <CheckIcon className="w-4 h-4" /> Update Plan
            </>
          ) : (
            "Submit Plan"
          )}
        </button>
      </div>
      </>
      )}
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

function LField({ label, children }) {
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

function ProductCard({ p, onView }) {
  const design = getCategoryDesign(p.category);
  const imgs = getImages(p);
  return (
    <div
      onClick={onView}
      className="group bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-lg hover:border-blue-300 transition cursor-pointer flex flex-col"
    >
      <div className="relative h-44 overflow-hidden bg-slate-100">
        {imgs.length > 0 ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imgs[0]} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
        ) : (
          <div className={`w-full h-full bg-gradient-to-tr ${design.gradient} flex items-center justify-center text-5xl`}>
            {design.emoji}
          </div>
        )}
        <span className="absolute top-2 left-2 text-[10px] uppercase font-extrabold tracking-wider text-white/95 bg-black/35 backdrop-blur-sm px-2 py-1 rounded-full">
          {p.category}
        </span>
      </div>
      <div className="p-4 flex flex-col flex-1">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">SKU: {p.sku}</span>
        <h4 className="font-bold text-slate-900 text-sm mt-0.5 line-clamp-2 min-h-[2.5rem]">{p.name}</h4>
        <p className="text-[11px] text-slate-500 mt-1 line-clamp-1">by {p.manufacturer}</p>
        <div className="flex items-end justify-between mt-3 pt-3 border-t border-slate-100">
          <div>
            <p className="text-lg font-extrabold text-slate-950 leading-none">{inr(p.price)}</p>
            <p className="text-[11px] text-slate-400 mt-1">{Number(p.quantity || 0).toLocaleString()} available</p>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onView();
            }}
            className="px-3 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition shadow-sm shadow-blue-500/20"
          >
            View
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailModal({ p, index, onNav, onClose, onManage, managing, alreadyAdded }) {
  const imgs = getImages(p);
  const design = getCategoryDesign(p.category);
  const multi = imgs.length > 1;
  const details = [
    ["Manufacturer", p.manufacturer],
    ["Category", p.category],
    ["Available", `${Number(p.quantity || 0).toLocaleString()} units`],
    ["Unit Price", inr(p.price)],
    ["SKU", p.sku],
    ["Batch", p.batch || "—"],
    ["Mfg Date", p.mfg || "—"],
    ["Expiry", p.exp || "—"],
  ];

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 flex items-center justify-center p-4"
    >
      <div className="bg-white w-full max-w-4xl rounded-2xl overflow-hidden shadow-2xl relative flex flex-col md:flex-row max-h-[90vh]">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 bg-white/80 hover:bg-white text-slate-900 rounded-full p-2 hover:shadow-lg transition z-20"
        >
          <XIcon className="w-5 h-5" strokeWidth={2.5} />
        </button>

        <div className="flex-1 p-6 md:p-7 space-y-4 overflow-y-auto order-2 md:order-1">
          <div>
            <h3 className="text-2xl font-bold text-slate-900">{p.name}</h3>
            <p className="text-sm text-slate-500 mt-0.5">by {p.manufacturer}</p>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {details.map(([k, v]) => (
              <div key={k} className="bg-slate-50 px-3 py-2 rounded-lg border border-slate-100 flex flex-col">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{k}</span>
                <span className={`text-sm font-semibold text-slate-800 mt-0.5 line-clamp-1 ${k === "SKU" ? "font-mono" : ""}`}>
                  {v}
                </span>
              </div>
            ))}
          </div>
          <div className="bg-slate-50 px-3 py-2.5 rounded-lg border border-slate-100">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Description</h4>
            <p className="text-sm text-slate-700 leading-relaxed">{p.desc || "No description provided."}</p>
          </div>

          {/* Actions */}
          <div className="pt-1">
            <button
              onClick={onManage}
              disabled={managing}
              className={`w-full flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition shadow-sm disabled:opacity-60 disabled:cursor-not-allowed ${
                alreadyAdded
                  ? "bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-500/20"
                  : "bg-blue-600 text-white hover:bg-blue-700 shadow-blue-500/20"
              }`}
            >
              {managing ? (
                <>
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Adding…
                </>
              ) : (
                <>
                  <TruckIcon className="w-4 h-4" />
                  {alreadyAdded ? "In Logistics — Update & Open" : "Manage Logistics"}
                </>
              )}
            </button>
            {alreadyAdded && (
              <p className="text-[11px] text-slate-400 text-center mt-1.5">
                Already in your Logistics queue.
              </p>
            )}
          </div>
        </div>

        <div className="w-full md:w-80 flex-shrink-0 relative flex items-center justify-center order-1 md:order-2 min-h-[260px] md:min-h-full overflow-hidden bg-slate-100">
          {imgs.length > 0 ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imgs[index]} alt={p.name} className="w-full h-full object-cover" />
              {multi && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onNav(-1);
                    }}
                    className="absolute left-3 top-1/2 -translate-y-1/2 z-10 bg-white/85 hover:bg-white text-slate-900 rounded-full p-2 shadow-lg transition"
                  >
                    <ChevronIcon className="w-4 h-4 rotate-180" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onNav(1);
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 z-10 bg-white/85 hover:bg-white text-slate-900 rounded-full p-2 shadow-lg transition"
                  >
                    <ChevronIcon className="w-4 h-4" />
                  </button>
                  <span className="absolute top-3 left-3 z-10 text-[10px] font-bold text-white bg-black/40 backdrop-blur-sm px-2 py-1 rounded-full">
                    {index + 1} / {imgs.length}
                  </span>
                </>
              )}
            </>
          ) : (
            <div className={`absolute inset-0 bg-gradient-to-tr ${design.gradient} flex flex-col items-center justify-center`}>
              <span className="text-6xl mb-2 drop-shadow">{design.emoji}</span>
              <span className="text-xs uppercase font-extrabold tracking-widest text-white/90 bg-black/20 px-3 py-1 rounded-full backdrop-blur-sm">
                {p.category}
              </span>
            </div>
          )}
        </div>
      </div>
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
const StoreIcon = (p) =>
  ico("M3 9l1-5h16l1 5M5 9v10a1 1 0 001 1h12a1 1 0 001-1V9M3 9h18M9 13h6", p);
const BoxIcon = (p) =>
  ico("M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4", p);
const TruckIcon = (p) =>
  ico("M9 17a2 2 0 11-4 0 2 2 0 014 0zm10 0a2 2 0 11-4 0 2 2 0 014 0zM3 6h11v11H3zM14 9h4l3 3v5h-7", p);
const XIcon = (p) => ico("M6 18L18 6M6 6l12 12", p);
const MenuIcon = (p) => ico("M4 6h16M4 12h16M4 18h16", p);
const SearchIcon = (p) => ico("M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z", p);
const ChevronIcon = (p) => ico("M9 5l7 7-7 7", { ...p, strokeWidth: 2.5 });
const LogoutIcon = (p) =>
  ico("M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1", p);
const CheckIcon = (p) => ico("M5 13l4 4L19 7", { ...p, strokeWidth: 2.5 });
const TrashIcon = (p) =>
  ico("M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16", p);

/* end of DistributorPortal */
