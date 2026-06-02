"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import Analytics from "@/components/Analytics";

/* ------------------------------------------------------------------ */
/*  Seed data + helpers                                                */
/* ------------------------------------------------------------------ */

const CATEGORY_DESIGN = {
  Electronics: { gradient: "from-blue-600 to-indigo-800", emoji: "⚡" },
  Medicine: { gradient: "from-emerald-500 to-teal-700", emoji: "💊" },
  Food: { gradient: "from-amber-500 to-orange-700", emoji: "🍎" },
  Cosmetics: { gradient: "from-pink-500 to-purple-700", emoji: "✨" },
};

function getCategoryDesign(category) {
  return CATEGORY_DESIGN[category] || { gradient: "from-slate-600 to-slate-800", emoji: "📦" };
}

function getImages(p) {
  if (Array.isArray(p.images)) return p.images;
  return p.image ? [p.image] : [];
}

const EMPTY_FORM = {
  name: "",
  category: "Electronics",
  sku: "",
  batch: "",
  quantity: "",
  price: "",
  company: "",
  location: "",
  mfg: "",
  exp: "",
  desc: "",
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ManufacturerPortal({
  username = "Operator",
  role = "manufacturer",
  userId = "",
  orgName = "",
  stage = "",
  name: initialName = "",
  email: initialEmail = "",
}) {
  const router = useRouter();

  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [section, setSection] = useState("upload"); // boot on New Upload
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dateBadge, setDateBadge] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  const [form, setForm] = useState(EMPTY_FORM);
  const [pendingImages, setPendingImages] = useState([]); // data URLs for preview
  const [pendingFiles, setPendingFiles] = useState([]); // actual File objects to upload
  const fileInputRef = useRef(null);

  const [toasts, setToasts] = useState([]);
  const [detail, setDetail] = useState(null); // product
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [success, setSuccess] = useState(null); // product

  // Profile section state
  const [displayName, setDisplayName] = useState(initialName);
  const [pName, setPName] = useState(initialName);
  const [pEmail, setPEmail] = useState(initialEmail);
  const [pCurrentPw, setPCurrentPw] = useState("");
  const [pNewPw, setPNewPw] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState(null); // { type, text }

  /* ---- Load products from the backend + date on mount ---- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/products");
        const data = await res.json();
        if (!cancelled && res.ok && Array.isArray(data.products)) {
          setProducts(data.products);
        }
      } catch {
        /* leave empty on failure */
      } finally {
        if (!cancelled) setLoadingProducts(false);
      }
    })();

    const today = new Date();
    setDateBadge(
      today.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    );

    return () => {
      cancelled = true;
    };
  }, []);

  /* ---- Load profile (email is not stored in the auth token) ---- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/profile");
        const data = await res.json();
        if (!cancelled && res.ok && data.user) {
          setDisplayName(data.user.name || "");
          setPName(data.user.name || "");
          setPEmail(data.user.email || "");
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ---- Lock body scroll when a modal/drawer is open ---- */
  useEffect(() => {
    const anyOpen = detail || success || sidebarOpen;
    if (anyOpen) document.body.classList.add("overflow-hidden");
    else document.body.classList.remove("overflow-hidden");
    return () => document.body.classList.remove("overflow-hidden");
  }, [detail, success, sidebarOpen]);

  /* ---- Derived stats ---- */
  const stats = useMemo(() => {
    const total = products.length;
    const successCount = products.filter((p) => p.status === "Success").length;
    const failedCount = products.filter((p) => p.status === "Failed").length;
    const revenue = products
      .filter((p) => p.status === "Success")
      .reduce((sum, p) => sum + p.price * p.quantity, 0);
    return { total, successCount, failedCount, revenue };
  }, [products]);

  const filteredProducts = useMemo(() => {
    const s = search.toLowerCase().trim();
    return products
      .map((p, index) => ({ p, index }))
      .filter(({ p }) => {
        const matchesSearch =
          p.name.toLowerCase().includes(s) || p.sku.toLowerCase().includes(s);
        const matchesCategory = categoryFilter === "" || p.category === categoryFilter;
        return matchesSearch && matchesCategory;
      });
  }, [products, search, categoryFilter]);

  /* ---- Toasts ---- */
  function showToast(message, type = "success") {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }

  /* ---- Navigation ---- */
  function goSection(id) {
    setSection(id);
    setSidebarOpen(false);
  }

  /* ---- Image handling ---- */
  function onFilesSelected(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setPendingFiles((prev) => [...prev, ...files]);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => setPendingImages((imgs) => [...imgs, reader.result]);
      reader.readAsDataURL(file);
    });
    e.target.value = ""; // allow re-selecting same file
  }

  function removePendingImage(i) {
    setPendingImages((imgs) => imgs.filter((_, idx) => idx !== i));
    setPendingFiles((files) => files.filter((_, idx) => idx !== i));
  }

  /* ---- Form ---- */
  function updateField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function resetForm(silent) {
    setForm(EMPTY_FORM);
    setPendingImages([]);
    setPendingFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!silent) showToast("Form fields reset.", "info");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;

    const name = form.name.trim();
    const sku = form.sku.trim();
    const batch = form.batch.trim();
    const quantity = parseInt(form.quantity) || 0;
    const price = parseFloat(form.price) || 0;
    const company = form.company.trim();
    const location = form.location.trim();

    if (!name || !sku || !batch || quantity <= 0 || price < 0 || !company || !location) {
      showToast("Please fill all mandatory configuration fields.", "error");
      return;
    }

    // Build multipart payload (text fields + actual image files).
    const fd = new FormData();
    fd.append("name", name);
    fd.append("category", form.category);
    fd.append("sku", sku);
    fd.append("batch", batch);
    fd.append("quantity", String(quantity));
    fd.append("price", String(price));
    fd.append("company", company);
    fd.append("location", location);
    fd.append("mfg", form.mfg);
    fd.append("exp", form.exp);
    fd.append("desc", form.desc.trim());
    pendingFiles.forEach((file) => fd.append("images", file));

    setSubmitting(true);
    try {
      const res = await fetch("/api/products", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Could not save the product.", "error");
        setSubmitting(false);
        return;
      }

      // Saved to MongoDB — add the returned record (with productId + saved
      // photo URLs) to the top of the catalog and celebrate.
      setProducts((prev) => [data.product, ...prev]);
      resetForm(true);
      setSuccess(data.product);
    } catch {
      showToast("Network error. Is the server running?", "error");
    } finally {
      setSubmitting(false);
    }
  }

  /* ---- Detail modal ---- */
  function openDetails(product) {
    setCarouselIndex(0);
    setDetail(product);
  }

  function carouselNav(dir) {
    if (!detail) return;
    const imgs = getImages(detail);
    if (imgs.length < 2) return;
    setCarouselIndex((i) => (i + dir + imgs.length) % imgs.length);
  }

  /* ---- Success modal ---- */
  function closeSuccess(target) {
    const product = success;
    setSuccess(null);
    if (target === "dashboard") goSection("dashboard");
    else goSection("upload");
    void product;
  }

  /* ---- Copy ---- */
  async function copyTxn(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const tmp = document.createElement("input");
      tmp.value = text;
      document.body.appendChild(tmp);
      tmp.select();
      document.execCommand("copy");
      document.body.removeChild(tmp);
    }
    showToast(`Copied ${text} to clipboard!`, "info");
  }

  /* ---- Sign out ---- */
  async function handleSignOut() {
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  async function handleSaveProfile(e) {
    e.preventDefault();
    setProfileMsg(null);
    if (pNewPw && pNewPw.length < 6) {
      setProfileMsg({ type: "error", text: "New password must be at least 6 characters." });
      return;
    }
    if (pNewPw && !pCurrentPw) {
      setProfileMsg({ type: "error", text: "Enter your current password to set a new one." });
      return;
    }
    setSavingProfile(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: pName,
          email: pEmail,
          currentPassword: pCurrentPw || undefined,
          newPassword: pNewPw || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setProfileMsg({ type: "error", text: data.error || "Could not save profile." });
        setSavingProfile(false);
        return;
      }
      setDisplayName(data.user?.name || pName);
      setPCurrentPw("");
      setPNewPw("");
      setProfileMsg({ type: "success", text: "Profile updated successfully." });
    } catch {
      setProfileMsg({ type: "error", text: "Network error. Is the server running?" });
    } finally {
      setSavingProfile(false);
    }
  }

  const pageTitle =
    section === "upload"
      ? `Welcome, ${displayName || username}`
      : section === "profile"
      ? "My Profile"
      : section === "analytics"
      ? "Analytics"
      : "Dashboard";
  const initials = (displayName || username).slice(0, 2).toUpperCase();

  /* ================================================================ */
  return (
    <div className="bg-slate-50 text-slate-800 antialiased h-screen overflow-hidden">
      {/* Toasts */}
      <div className="fixed top-5 right-5 z-[70] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <Toast key={t.id} message={t.message} type={t.type} />
        ))}
      </div>

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
              <LogoIcon />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold tracking-tight">SmartSeal</h2>
              <p className="text-xs text-slate-400">Operations Control</p>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-900 transition"
              title="Close menu"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          <nav className="flex-1 p-4 space-y-1">
            <NavButton
              active={section === "upload"}
              onClick={() => goSection("upload")}
              label="New Upload"
              icon={<PlusCircleIcon />}
            />
            <NavButton
              active={section === "dashboard"}
              onClick={() => goSection("dashboard")}
              label="Dashboard"
              icon={<GridIcon />}
            />
            <NavButton
              active={section === "analytics"}
              onClick={() => goSection("analytics")}
              label="Analytics"
              icon={<ChartIcon />}
            />
            <NavButton
              active={section === "profile"}
              onClick={() => goSection("profile")}
              label="My Profile"
              icon={<UserIcon />}
            />
          </nav>

          <div className="p-4 border-t border-slate-900 bg-slate-950/50 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-semibold text-blue-400 border border-slate-700 uppercase">
                {initials}
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-semibold text-slate-200 truncate">{displayName || username}</h4>
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
                title="Open menu"
              >
                <MenuIcon className="w-6 h-6" />
              </button>
              <h1 className="text-lg sm:text-xl font-bold text-slate-800 truncate">{pageTitle}</h1>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-slate-600 bg-slate-100 py-1.5 px-3 rounded-lg border border-slate-200 whitespace-nowrap">
                {dateBadge || "—"}
              </span>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 space-y-6">
            {/* DASHBOARD */}
            {section === "dashboard" && (
              <div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                  <StatCard
                    color="blue"
                    label="Total Products"
                    value={stats.total}
                    icon={<BagIcon />}
                  />
                  <StatCard
                    color="emerald"
                    label="Successful"
                    value={stats.successCount}
                    icon={<CheckCircleIcon />}
                  />
                  <StatCard
                    color="rose"
                    label="Failed Trans"
                    value={stats.failedCount}
                    icon={<XCircleIcon />}
                  />
                  <StatCard
                    color="amber"
                    label="Revenue (Success)"
                    value={`₹${stats.revenue.toLocaleString("en-IN")}`}
                    icon={<CashIcon />}
                  />
                </div>

                <div className="mt-6">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-5">
                    <div>
                      <h2 className="text-lg font-bold text-slate-950">Product Catalog</h2>
                      <p className="text-xs text-slate-500 mt-1">
                        Browse and search registered inventory listings.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                      <div className="relative flex-1 sm:flex-none">
                        <input
                          type="text"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder="Search Name or SKU..."
                          className="pl-9 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 w-full sm:w-56 transition"
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

                  {loadingProducts ? (
                    <div className="text-center py-16">
                      <svg className="w-7 h-7 animate-spin text-blue-500 mx-auto" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                      </svg>
                      <p className="text-slate-400 text-sm font-medium mt-3">Loading products…</p>
                    </div>
                  ) : filteredProducts.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                      {filteredProducts.map(({ p }) => (
                        <ProductCard key={p.productId} p={p} onView={() => openDetails(p)} />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-16">
                      <span className="text-4xl">📦</span>
                      <p className="text-slate-400 text-sm font-medium mt-3">
                        {products.length === 0
                          ? 'No registered products yet. Use "New Upload" to catalog items.'
                          : "No products match your search."}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* UPLOAD */}
            {section === "upload" && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm w-full overflow-hidden">
                <div className="p-6 bg-slate-950 text-white flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold">New Inventory Upload</h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Specify cataloging, pricing, warehousing, and tracking variables.
                    </p>
                  </div>
                  <FolderPlusIcon className="w-8 h-8 text-blue-500 opacity-60" />
                </div>

                <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-8">
                  {/* Block 1 */}
                  <FormBlock title="1. Product Core & Category">
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
                      <Field label="Product Name *">
                        <input
                          type="text"
                          required
                          value={form.name}
                          onChange={(e) => updateField("name", e.target.value)}
                          placeholder="e.g. SuperFast GaN Charger"
                          className={inputCls}
                        />
                      </Field>
                      <Field label="Category *">
                        <select
                          value={form.category}
                          onChange={(e) => updateField("category", e.target.value)}
                          className={`${inputCls} bg-white`}
                        >
                          <option>Electronics</option>
                          <option>Medicine</option>
                          <option>Food</option>
                          <option>Cosmetics</option>
                        </select>
                      </Field>
                      <Field label="Universal SKU Code *">
                        <input
                          type="text"
                          required
                          value={form.sku}
                          onChange={(e) => updateField("sku", e.target.value)}
                          placeholder="e.g. ELE-CHG-G44"
                          className={inputCls}
                        />
                      </Field>
                      <Field label="Manufacturing Batch *">
                        <input
                          type="text"
                          required
                          value={form.batch}
                          onChange={(e) => updateField("batch", e.target.value)}
                          placeholder="e.g. B-883901"
                          className={inputCls}
                        />
                      </Field>
                    </div>
                  </FormBlock>

                  {/* Block 2 */}
                  <FormBlock title="2. Quantitative Properties & Pricing">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
                      <Field label="Units in Stock *">
                        <input
                          type="number"
                          required
                          min="1"
                          value={form.quantity}
                          onChange={(e) => updateField("quantity", e.target.value)}
                          placeholder="e.g. 50"
                          className={inputCls}
                        />
                      </Field>
                      <Field label="Unit Cost (INR) *">
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium">
                            ₹
                          </span>
                          <input
                            type="number"
                            required
                            min="0"
                            value={form.price}
                            onChange={(e) => updateField("price", e.target.value)}
                            placeholder="e.g. 1499"
                            className={`${inputCls} pl-8 w-full`}
                          />
                        </div>
                      </Field>
                      <Field label="Manufacturer Corporation *" className="sm:col-span-2 md:col-span-1">
                        <input
                          type="text"
                          required
                          value={form.company}
                          onChange={(e) => updateField("company", e.target.value)}
                          placeholder="e.g. VoltEdge Corp"
                          className={inputCls}
                        />
                      </Field>
                    </div>
                  </FormBlock>

                  {/* Block 3 */}
                  <FormBlock title="3. Warehousing & Expiry Dates">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
                      <Field label="Manufacturing Date">
                        <input
                          type="date"
                          value={form.mfg}
                          onChange={(e) => updateField("mfg", e.target.value)}
                          className={inputCls}
                        />
                      </Field>
                      <Field label="Expiration Date">
                        <input
                          type="date"
                          value={form.exp}
                          onChange={(e) => updateField("exp", e.target.value)}
                          className={inputCls}
                        />
                      </Field>
                      <Field label="Warehouse Storage Location *" className="sm:col-span-2 md:col-span-1">
                        <input
                          type="text"
                          required
                          value={form.location}
                          onChange={(e) => updateField("location", e.target.value)}
                          placeholder="e.g. Bay A4, Cold Room 3"
                          className={inputCls}
                        />
                      </Field>
                    </div>
                  </FormBlock>

                  {/* Block 4 */}
                  <FormBlock title="4. Imagery & Narrative Specifications">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="flex flex-col gap-2 md:col-span-1">
                        <label className="text-xs font-semibold text-slate-600">
                          Product Images <span className="text-slate-400 font-normal">(multiple)</span>
                        </label>
                        <div className="border-2 border-dashed border-slate-200 rounded-2xl p-4 flex flex-col items-center justify-center bg-slate-50/50 hover:bg-slate-50 transition cursor-pointer relative min-h-[110px]">
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={onFilesSelected}
                            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                          />
                          <div className="text-center flex flex-col items-center">
                            <PhotoIcon className="w-8 h-8 text-blue-500 mb-2" />
                            <span className="text-xs font-medium text-slate-700 block">
                              {pendingImages.length
                                ? `${pendingImages.length} image${pendingImages.length > 1 ? "s" : ""} selected`
                                : "Choose files"}
                            </span>
                            <span className="text-[10px] text-slate-400 mt-0.5">
                              PNG, JPG, or WebP · select several
                            </span>
                          </div>
                        </div>
                        {pendingImages.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-1">
                            {pendingImages.map((src, i) => (
                              <div
                                key={i}
                                className="relative w-12 h-12 rounded-lg overflow-hidden border border-slate-200 group"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={src} alt="" className="w-full h-full object-cover" />
                                <button
                                  type="button"
                                  onClick={() => removePendingImage(i)}
                                  className="absolute top-0 right-0 bg-rose-600 text-white w-4 h-4 flex items-center justify-center text-[10px] leading-none rounded-bl-md opacity-0 group-hover:opacity-100 transition"
                                  title="Remove"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-2 md:col-span-2">
                        <label className="text-xs font-semibold text-slate-600">
                          Detailed Description / Instructions
                        </label>
                        <textarea
                          rows={5}
                          value={form.desc}
                          onChange={(e) => updateField("desc", e.target.value)}
                          placeholder="Include any logistical properties, storage criteria, or ingredients list..."
                          className={`${inputCls} h-full`}
                        />
                      </div>
                    </div>
                  </FormBlock>

                  <div className="pt-4 border-t flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => resetForm(false)}
                      disabled={submitting}
                      className="px-5 py-3 rounded-xl border border-slate-200 text-slate-700 font-medium hover:bg-slate-50 transition text-sm disabled:opacity-60"
                    >
                      Reset Inputs
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold transition shadow-lg shadow-blue-500/10 text-sm flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {submitting && (
                        <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                        </svg>
                      )}
                      {submitting ? "Saving…" : "Register & Submit Product"}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* ANALYTICS */}
            {section === "analytics" && <Analytics products={products} />}

            {/* PROFILE */}
            {section === "profile" && (
              <div className="max-w-3xl mx-auto space-y-5">
                {/* Identity + Organization */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col md:flex-row md:items-center gap-6">
                  {/* Person */}
                  <div className="flex items-center gap-5 flex-1 min-w-0">
                    <div className="w-16 h-16 rounded-2xl bg-blue-600/10 text-blue-600 flex items-center justify-center text-xl font-bold uppercase flex-shrink-0">
                      {(displayName || username).slice(0, 2)}
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-2xl font-extrabold text-slate-900 truncate">{displayName || username}</h2>
                      <p className="text-sm text-slate-500 truncate">{pEmail || initialEmail}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-blue-500" /> {stage || role}
                        </span>
                        <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-500">
                          @{username}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Organization — shown large, beside the name */}
                  <div className="flex items-center gap-4 md:border-l md:border-slate-200 md:pl-6">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center text-lg font-extrabold uppercase flex-shrink-0 shadow-lg shadow-blue-500/20">
                      {(orgName || "S").slice(0, 2)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Organization</p>
                      <p className="text-xl md:text-2xl font-extrabold text-slate-900 leading-tight truncate">
                        {orgName || "Your organization"}
                      </p>
                      <p className="text-xs text-slate-400 capitalize">{role} workspace</p>
                    </div>
                  </div>
                </div>

                {/* Edit form */}
                <form
                  onSubmit={handleSaveProfile}
                  className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5"
                >
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Edit profile</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Update your details. Username and organization can&rsquo;t be changed.
                    </p>
                  </div>

                  {profileMsg && (
                    <div
                      className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${
                        profileMsg.type === "success"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-rose-200 bg-rose-50 text-rose-700"
                      }`}
                    >
                      <span>{profileMsg.text}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-slate-600">Full name</label>
                      <input
                        type="text"
                        value={pName}
                        onChange={(e) => setPName(e.target.value)}
                        className={inputCls}
                        required
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-slate-600">Email</label>
                      <input
                        type="email"
                        value={pEmail}
                        onChange={(e) => setPEmail(e.target.value)}
                        className={inputCls}
                        required
                      />
                    </div>
                  </div>

                  <div className="border-t border-slate-100 pt-5">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                      Change password
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-slate-600">Current password</label>
                        <input
                          type="password"
                          value={pCurrentPw}
                          onChange={(e) => setPCurrentPw(e.target.value)}
                          placeholder="Enter current password"
                          autoComplete="current-password"
                          className={inputCls}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-slate-600">New password</label>
                        <input
                          type="password"
                          value={pNewPw}
                          onChange={(e) => setPNewPw(e.target.value)}
                          placeholder="At least 6 characters"
                          autoComplete="new-password"
                          className={inputCls}
                        />
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-2">Leave blank to keep your current password.</p>
                  </div>

                  <div className="flex justify-end gap-3 pt-1">
                    <button
                      type="submit"
                      disabled={savingProfile}
                      className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {savingProfile && (
                        <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                        </svg>
                      )}
                      {savingProfile ? "Saving\u2026" : "Save changes"}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Detail modal */}
      {detail && (
        <DetailModal
          p={detail}
          index={carouselIndex}
          onNav={carouselNav}
          onClose={() => setDetail(null)}
        />
      )}

      {/* Success modal */}
      {success && (
        <SuccessModal
          product={success}
          onCopy={copyTxn}
          onClose={closeSuccess}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

const inputCls =
  "p-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition w-full";

function Field({ label, children, className = "" }) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <label className="text-xs font-semibold text-slate-600">{label}</label>
      {children}
    </div>
  );
}

function FormBlock({ title, children }) {
  return (
    <div>
      <h3 className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-4 border-b pb-1">
        {title}
      </h3>
      {children}
    </div>
  );
}

const STAT_COLORS = {
  blue: { ring: "hover:border-blue-300", bubble: "bg-blue-50", chip: "bg-blue-500/10 text-blue-600" },
  emerald: {
    ring: "hover:border-emerald-300",
    bubble: "bg-emerald-50",
    chip: "bg-emerald-500/10 text-emerald-600",
  },
  rose: { ring: "hover:border-rose-300", bubble: "bg-rose-50", chip: "bg-rose-500/10 text-rose-600" },
  amber: {
    ring: "hover:border-amber-300",
    bubble: "bg-amber-50",
    chip: "bg-amber-500/10 text-amber-600",
  },
};

function StatCard({ color, label, value, icon }) {
  const c = STAT_COLORS[color];
  return (
    <div
      className={`bg-white rounded-2xl p-6 border border-slate-200 shadow-sm relative overflow-hidden group transition duration-300 ${c.ring}`}
    >
      <div
        className={`absolute top-0 right-0 w-24 h-24 ${c.bubble} rounded-full -mr-10 -mt-10 transition duration-300 group-hover:scale-110`}
      />
      <div className="relative z-10 flex flex-col justify-between h-full">
        <div className={`p-3 ${c.chip} rounded-xl w-fit mb-4`}>{icon}</div>
        <div>
          <h4 className="text-sm font-semibold text-slate-400">{label}</h4>
          <p className="text-3xl font-extrabold text-slate-950 mt-1">{value}</p>
        </div>
      </div>
    </div>
  );
}

function ProductCard({ p, onView }) {
  const design = getCategoryDesign(p.category);
  const imgs = getImages(p);
  return (
    <div
      onClick={onView}
      className="product-card group bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-lg hover:border-blue-300 transition cursor-pointer flex flex-col"
    >
      <div className="relative h-44 overflow-hidden bg-slate-100">
        {imgs.length > 0 ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imgs[0]}
            alt={p.name}
            className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
          />
        ) : (
          <div
            className={`w-full h-full bg-gradient-to-tr ${design.gradient} flex items-center justify-center text-5xl`}
          >
            {design.emoji}
          </div>
        )}
        <span className="absolute top-2 left-2 text-[10px] uppercase font-extrabold tracking-wider text-white/95 bg-black/35 backdrop-blur-sm px-2 py-1 rounded-full">
          {p.category}
        </span>
        {imgs.length > 1 && (
          <span className="absolute bottom-2 right-2 flex items-center gap-1 text-[10px] font-bold text-white bg-black/45 backdrop-blur-sm px-2 py-0.5 rounded-full">
            <PhotoIcon className="w-3 h-3" />
            {imgs.length}
          </span>
        )}
      </div>
      <div className="p-4 flex flex-col flex-1">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">
          SKU: {p.sku}
        </span>
        <h4 className="font-bold text-slate-900 text-sm mt-0.5 line-clamp-2 min-h-[2.5rem]">
          {p.name}
        </h4>
        <div className="flex items-end justify-between mt-3 pt-3 border-t border-slate-100">
          <div>
            <p className="text-lg font-extrabold text-slate-950 leading-none">
              ₹{p.price.toLocaleString()}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">{p.quantity.toLocaleString()} in stock</p>
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

function DetailModal({ p, index, onNav, onClose }) {
  const imgs = getImages(p);
  const design = getCategoryDesign(p.category);
  const multi = imgs.length > 1;

  // Generate the QR (encodes only the encrypted transaction token) on the client.
  const [qrUrl, setQrUrl] = useState(null);
  useEffect(() => {
    let on = true;
    setQrUrl(null);
    if (p.qrToken) {
      QRCode.toDataURL(p.qrToken, { margin: 1, width: 256, errorCorrectionLevel: "M" })
        .then((u) => {
          if (on) setQrUrl(u);
        })
        .catch(() => {});
    }
    return () => {
      on = false;
    };
  }, [p.qrToken]);

  const details = [
    ["Manufacturer", p.company],
    ["Product Category", p.category],
    ["Stock Level", `${p.quantity.toLocaleString()} units`],
    ["Unit Value", `₹${p.price.toLocaleString()}`],
    ["SKU Identifier", p.sku],
    ["Transaction Status", p.status],
    ["Warehousing Bay", p.location],
    ["Mfg Date", p.mfg || "Unspecified"],
    ["Expiration Date", p.exp || "Unspecified"],
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

        {/* Details */}
        <div className="flex-1 p-6 md:p-7 space-y-4 overflow-y-auto order-2 md:order-1">
          <div>
            <h3 className="text-2xl font-bold text-slate-900">{p.name}</h3>
            <p className="text-sm text-slate-500 mt-0.5">Logistics Ledger • Batch {p.batch}</p>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {details.map(([k, v]) => (
              <div
                key={k}
                className="bg-slate-50 px-3 py-2 rounded-lg border border-slate-100 flex flex-col"
              >
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  {k}
                </span>
                {k === "Transaction Status" ? (
                  <span className="text-sm font-semibold text-slate-800 mt-0.5 flex items-center gap-1.5">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        v === "Success"
                          ? "bg-emerald-500"
                          : v === "Failed"
                          ? "bg-rose-500"
                          : "bg-amber-500"
                      }`}
                    />
                    {v}
                  </span>
                ) : (
                  <span
                    className={`text-sm font-semibold text-slate-800 mt-0.5 line-clamp-1 ${
                      k === "SKU Identifier" ? "font-mono" : ""
                    }`}
                  >
                    {v}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Specifications + Transaction QR, side by side */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="sm:col-span-2 bg-slate-50 px-3 py-2.5 rounded-lg border border-slate-100">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                Detailed Specifications
              </h4>
              <p className="text-sm text-slate-700 leading-relaxed">
                {p.desc || "No comprehensive specs provided."}
              </p>
            </div>

            <div className="bg-slate-50 px-3 py-2.5 rounded-lg border border-slate-100 flex flex-col items-center text-center">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 self-start">
                Transaction QR
              </h4>
              {p.qrToken ? (
                qrUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={qrUrl}
                    alt="Transaction QR code"
                    className="w-full max-w-[150px] aspect-square rounded-md bg-white p-1.5 border border-slate-200"
                  />
                ) : (
                  <div className="w-full max-w-[150px] aspect-square rounded-md bg-white border border-slate-200 flex items-center justify-center text-[11px] text-slate-300">
                    Generating…
                  </div>
                )
              ) : (
                <div className="w-full max-w-[150px] aspect-square rounded-md bg-white border border-dashed border-slate-200 flex items-center justify-center text-[10px] text-slate-300 px-2">
                  Available for new transactions
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Media */}
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
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5">
                    {imgs.map((_, i) => (
                      <span
                        key={i}
                        className={`w-1.5 h-1.5 rounded-full transition ${
                          i === index ? "bg-white" : "bg-white/40"
                        }`}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <div
              className={`absolute inset-0 bg-gradient-to-tr ${design.gradient} flex flex-col items-center justify-center`}
            >
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

function SuccessModal({ product, onCopy, onClose }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShown(true), 10);
    return () => clearTimeout(t);
  }, []);

  let statusClass = "bg-amber-500/10 text-amber-700 border-amber-200";
  let dotClass = "bg-amber-500";
  if (product.status === "Success") {
    statusClass = "bg-emerald-500/10 text-emerald-700 border-emerald-200";
    dotClass = "bg-emerald-500";
  } else if (product.status === "Failed") {
    statusClass = "bg-rose-500/10 text-rose-700 border-rose-200";
    dotClass = "bg-rose-500";
  }

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        className={`bg-white w-full max-w-md rounded-3xl overflow-hidden shadow-2xl relative transform transition-all duration-300 ${
          shown ? "scale-100 opacity-100" : "scale-95 opacity-0"
        }`}
      >
        <div className="bg-gradient-to-tr from-emerald-500 to-green-600 px-8 pt-10 pb-12 text-center relative">
          <div className="mx-auto w-20 h-20 rounded-full bg-white/15 flex items-center justify-center backdrop-blur-sm">
            <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center shadow-lg">
              <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="3"
                  strokeDasharray="24"
                  strokeDashoffset={shown ? "0" : "24"}
                  style={{ transition: "stroke-dashoffset 0.4s ease 0.15s" }}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
          </div>
          <h3 className="text-white text-xl font-bold mt-5">Product Registered!</h3>
          <p className="text-emerald-50 text-xs mt-1">
            Your item has been securely uploaded to the ledger.
          </p>
        </div>

        <div className="px-8 py-6 space-y-4 -mt-4">
          <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Transaction ID
              </span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-xs font-bold text-slate-800 bg-white border border-slate-200 px-2 py-1 rounded">
                  {product.transactionId}
                </span>
                <button
                  onClick={() => onCopy(product.transactionId)}
                  className="p-1 text-slate-400 hover:text-blue-500 transition"
                  title="Copy ID"
                >
                  <CopyIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <Row label="Product" value={product.name} truncate />
            <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Status
              </span>
              <span
                className={`inline-flex items-center gap-1.5 text-xs font-bold py-1 px-2.5 rounded-lg border ${statusClass}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
                {product.status}
              </span>
            </div>
            <Row label="Est. Pickup" value={product.pickupDate} />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => onClose("upload")}
              className="flex-1 px-4 py-3 rounded-xl border border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-50 transition"
            >
              Add Another
            </button>
            <button
              onClick={() => onClose("dashboard")}
              className="flex-1 px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow-lg shadow-blue-500/10 transition"
            >
              View Dashboard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, truncate }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
      <span className={`text-xs font-semibold text-slate-800 text-right ${truncate ? "line-clamp-1" : ""}`}>
        {value}
      </span>
    </div>
  );
}

function Toast({ message, type }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShown(true), 10);
    return () => clearTimeout(t);
  }, []);

  let colors = "bg-emerald-600 text-white shadow-emerald-500/20";
  let icon = <CheckCircleIcon className="w-5 h-5 flex-shrink-0" />;
  if (type === "error") {
    colors = "bg-rose-600 text-white shadow-rose-500/20";
    icon = <XCircleIcon className="w-5 h-5 flex-shrink-0" />;
  } else if (type === "info") {
    colors = "bg-blue-600 text-white shadow-blue-500/20";
    icon = <InfoIcon className="w-5 h-5 flex-shrink-0" />;
  }

  return (
    <div
      className={`flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-xl transform transition-all duration-300 pointer-events-auto max-w-sm ${colors} ${
        shown ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
      }`}
    >
      {icon}
      <span className="font-semibold text-xs tracking-wide">{message}</span>
    </div>
  );
}

function NavButton({ active, onClick, label, icon }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition duration-200 group ${
        active ? "bg-blue-600 text-white" : "hover:bg-slate-900"
      }`}
    >
      <span className={active ? "text-white" : "text-slate-400 group-hover:text-blue-500 transition"}>
        {icon}
      </span>
      <span
        className={`font-medium text-sm ${
          active ? "text-white" : "text-slate-300 group-hover:text-white"
        }`}
      >
        {label}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Icons                                                              */
/* ------------------------------------------------------------------ */

const ico = (d, props = {}) => (
  <svg
    className={props.className || "w-5 h-5"}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    style={props.style}
  >
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={props.strokeWidth || 2} d={d} />
  </svg>
);

const LogoIcon = (p) =>
  ico(
    "M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z",
    { ...p, className: p.className || "w-6 h-6 text-white" }
  );
const GridIcon = (p) =>
  ico(
    "M4 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4zM14 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2v-4z",
    p
  );
const PlusCircleIcon = (p) =>
  ico("M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z", p);
const XIcon = (p) => ico("M6 18L18 6M6 6l12 12", p);
const MenuIcon = (p) => ico("M4 6h16M4 12h16M4 18h16", p);
const SearchIcon = (p) => ico("M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z", p);
const BagIcon = (p) => ico("M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z", { ...p, className: p.className || "w-6 h-6" });
const CheckCircleIcon = (p) =>
  ico("M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z", { ...p, className: p.className || "w-6 h-6" });
const XCircleIcon = (p) =>
  ico("M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z", {
    ...p,
    className: p.className || "w-6 h-6",
  });
const CashIcon = (p) =>
  ico(
    "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    { ...p, className: p.className || "w-6 h-6" }
  );
const FolderPlusIcon = (p) =>
  ico("M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z", {
    ...p,
    strokeWidth: 1.5,
  });
const PhotoIcon = (p) =>
  ico(
    "M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z",
    p
  );
const ChevronIcon = (p) => ico("M9 5l7 7-7 7", { ...p, strokeWidth: 2.5 });
const CopyIcon = (p) =>
  ico(
    "M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3",
    p
  );
const InfoIcon = (p) => ico("M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z", p);
const LogoutIcon = (p) =>
  ico("M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1", p);
const UserIcon = (p) =>
  ico("M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z", p);
const ChartIcon = (p) =>
  ico("M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z", p);
