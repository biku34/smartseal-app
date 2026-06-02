"use client";

import { useMemo, useState } from "react";

/* ------------------------------------------------------------------ */
/*  Palette + helpers                                                  */
/* ------------------------------------------------------------------ */

const CATEGORY_COLORS = {
  Electronics: "#2563eb",
  Medicine: "#10b981",
  Food: "#f59e0b",
  Cosmetics: "#db2777",
};
const FALLBACK_COLOR = "#64748b";
const STATUS_COLORS = { Success: "#10b981", Pending: "#f59e0b", Failed: "#f43f5e" };

const inr = (n) => "₹" + Math.round(n || 0).toLocaleString("en-IN");
const num = (n) => (n || 0).toLocaleString("en-IN");
const catColor = (c) => CATEGORY_COLORS[c] || FALLBACK_COLOR;

function productDate(p) {
  if (p.createdAt) {
    const d = new Date(p.createdAt);
    if (!isNaN(d)) return d;
  }
  if (p.mfg) {
    const d = new Date(p.mfg);
    if (!isNaN(d)) return d;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function Analytics({ products = [] }) {
  const [catMetric, setCatMetric] = useState("count"); // count | value | units

  const a = useMemo(() => computeAnalytics(products), [products]);

  if (!products.length) {
    return (
      <div className="text-center py-20">
        <span className="text-4xl">📊</span>
        <p className="text-slate-400 text-sm font-medium mt-3">
          No data yet. Register a few products to unlock analytics.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Total Products" value={num(a.total)} tone="blue" />
        <Kpi label="Inventory Units" value={num(a.units)} tone="indigo" />
        <Kpi label="Inventory Value" value={inr(a.value)} tone="emerald" />
        <Kpi label="Success Rate" value={`${a.successRate}%`} tone="amber" />
      </div>

      {/* Status donut + Category bars */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Transaction Status" subtitle="Share of outcomes">
          <StatusDonut data={a.statusData} total={a.total} />
        </Card>

        <div className="lg:col-span-2">
          <Card
            title="By Category"
            subtitle="Compare your catalog across categories"
            action={
              <Toggle
                value={catMetric}
                onChange={setCatMetric}
                options={[
                  ["count", "Products"],
                  ["units", "Units"],
                  ["value", "Value"],
                ]}
              />
            }
          >
            <CategoryBars data={a.categories} metric={catMetric} />
          </Card>
        </div>
      </div>

      {/* Trend */}
      <Card title="Uploads Over Time" subtitle="Products registered in the last 6 months">
        <TrendChart points={a.trend} />
      </Card>

      {/* Top products + Expiry */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Top Products by Value" subtitle="Units × unit price">
          <TopProducts items={a.topProducts} />
        </Card>
        <Card title="Expiry Insights" subtitle="Stay ahead of perishable stock">
          <ExpiryPanel buckets={a.expiry} soon={a.expirySoon} />
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Aggregation                                                        */
/* ------------------------------------------------------------------ */

function computeAnalytics(products) {
  const total = products.length;
  let units = 0;
  let value = 0;
  const statusCount = { Success: 0, Pending: 0, Failed: 0 };
  const catMap = {};

  products.forEach((p) => {
    const q = Number(p.quantity) || 0;
    const pr = Number(p.price) || 0;
    units += q;
    value += q * pr;
    if (statusCount[p.status] !== undefined) statusCount[p.status] += 1;
    const c = p.category || "Other";
    if (!catMap[c]) catMap[c] = { name: c, count: 0, units: 0, value: 0 };
    catMap[c].count += 1;
    catMap[c].units += q;
    catMap[c].value += q * pr;
  });

  const successRate = total ? Math.round((statusCount.Success / total) * 100) : 0;

  const statusData = ["Success", "Pending", "Failed"]
    .map((k) => ({ name: k, value: statusCount[k], color: STATUS_COLORS[k] }))
    .filter((s) => s.value > 0);

  const categories = Object.values(catMap)
    .map((c) => ({ ...c, color: catColor(c.name) }))
    .sort((x, y) => y.count - x.count);

  // 6-month trend
  const now = new Date();
  const trend = [];
  const idx = {};
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    idx[key] = trend.length;
    trend.push({ label: d.toLocaleString("en-US", { month: "short" }), value: 0 });
  }
  products.forEach((p) => {
    const d = productDate(p);
    if (!d) return;
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (idx[key] !== undefined) trend[idx[key]].value += 1;
  });

  const topProducts = products
    .map((p) => ({
      name: p.name,
      category: p.category,
      value: (Number(p.quantity) || 0) * (Number(p.price) || 0),
    }))
    .sort((x, y) => y.value - x.value)
    .slice(0, 5);

  // Expiry
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = { expired: 0, soon: 0, later: 0, ok: 0 };
  const expiryList = [];
  products.forEach((p) => {
    if (!p.exp) return;
    const d = new Date(p.exp);
    if (isNaN(d)) return;
    const days = Math.ceil((d - today) / 86400000);
    if (days < 0) expiry.expired += 1;
    else if (days <= 30) expiry.soon += 1;
    else if (days <= 90) expiry.later += 1;
    else expiry.ok += 1;
    expiryList.push({ name: p.name, days, exp: p.exp });
  });
  const expirySoon = expiryList
    .filter((e) => e.days <= 90)
    .sort((x, y) => x.days - y.days)
    .slice(0, 5);

  return { total, units, value, successRate, statusData, categories, trend, topProducts, expiry, expirySoon };
}

/* ------------------------------------------------------------------ */
/*  UI primitives                                                      */
/* ------------------------------------------------------------------ */

const KPI_TONES = {
  blue: "from-blue-500/10 text-blue-600",
  indigo: "from-indigo-500/10 text-indigo-600",
  emerald: "from-emerald-500/10 text-emerald-600",
  amber: "from-amber-500/10 text-amber-600",
};

function Kpi({ label, value, tone }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <p className="text-xs font-semibold text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-extrabold text-slate-950">{value}</p>
      <div className={`mt-3 h-1 w-12 rounded-full bg-gradient-to-r ${KPI_TONES[tone]} bg-current opacity-70`} />
    </div>
  );
}

function Card({ title, subtitle, action, children }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 h-full">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Toggle({ value, onChange, options }) {
  return (
    <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
      {options.map(([val, label]) => (
        <button
          key={val}
          onClick={() => onChange(val)}
          className={`px-2.5 py-1 text-xs font-semibold rounded-md transition ${
            value === val ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Charts                                                             */
/* ------------------------------------------------------------------ */

function StatusDonut({ data, total }) {
  const [hover, setHover] = useState(null);
  const sum = data.reduce((s, d) => s + d.value, 0) || 1;
  const R = 54;
  const C = 2 * Math.PI * R;
  let offset = 0;
  const segs = data.map((d) => {
    const len = (d.value / sum) * C;
    const seg = { ...d, len, offset };
    offset += len;
    return seg;
  });
  const active = hover != null ? data[hover] : null;

  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <svg width="150" height="150" viewBox="0 0 140 140">
          <circle cx="70" cy="70" r={R} fill="none" stroke="#f1f5f9" strokeWidth="16" />
          {segs.map((s, i) => (
            <circle
              key={s.name}
              cx="70"
              cy="70"
              r={R}
              fill="none"
              stroke={s.color}
              strokeWidth={hover === i ? 20 : 16}
              strokeDasharray={`${s.len} ${C - s.len}`}
              strokeDashoffset={-s.offset}
              strokeLinecap="butt"
              transform="rotate(-90 70 70)"
              className="transition-all duration-150 cursor-pointer"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl font-extrabold text-slate-900">
            {active ? active.value : total}
          </span>
          <span className="text-[11px] font-semibold text-slate-400">
            {active ? active.name : "Total"}
          </span>
        </div>
      </div>
      <div className="mt-4 w-full space-y-1.5">
        {data.map((d, i) => (
          <div
            key={d.name}
            className={`flex items-center justify-between text-xs rounded-lg px-2 py-1 cursor-pointer transition ${
              hover === i ? "bg-slate-50" : ""
            }`}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <span className="flex items-center gap-2 font-medium text-slate-600">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
              {d.name}
            </span>
            <span className="font-bold text-slate-800">
              {d.value} · {Math.round((d.value / sum) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CategoryBars({ data, metric }) {
  const [hover, setHover] = useState(null);
  const valueOf = (c) => (metric === "value" ? c.value : metric === "units" ? c.units : c.count);
  const max = Math.max(1, ...data.map(valueOf));
  const fmt = (v) => (metric === "value" ? inr(v) : num(v));

  return (
    <div>
      <div className="flex items-end gap-3 h-48 px-1">
        {data.map((c, i) => {
          const v = valueOf(c);
          const h = Math.max(3, (v / max) * 100);
          return (
            <div
              key={c.name}
              className="flex-1 flex flex-col items-center justify-end h-full relative"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              {hover === i && (
                <div className="absolute -top-1 z-10 whitespace-nowrap rounded-lg bg-slate-900 text-white text-[11px] font-semibold px-2 py-1 shadow-lg">
                  {fmt(v)}
                </div>
              )}
              <div
                className="w-full max-w-[54px] rounded-t-lg transition-all duration-200"
                style={{
                  height: `${h}%`,
                  background: c.color,
                  opacity: hover == null || hover === i ? 1 : 0.5,
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-3 px-1 mt-2">
        {data.map((c) => (
          <div key={c.name} className="flex-1 text-center">
            <p className="text-[11px] font-semibold text-slate-600 truncate">{c.name}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function TrendChart({ points }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...points.map((p) => p.value));
  const n = points.length;
  const coords = points.map((p, i) => ({
    ...p,
    x: n <= 1 ? 50 : (i / (n - 1)) * 100,
    y: 100 - (p.value / max) * 80 - 8,
  }));
  const line = coords.map((c) => `${c.x},${c.y}`).join(" ");
  const area = `${coords[0].x},100 ${line} ${coords[n - 1].x},100`;

  return (
    <div>
      <div className="relative h-44">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full"
        >
          <defs>
            <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={area} fill="url(#trendFill)" />
          <polyline
            points={line}
            fill="none"
            stroke="#3b82f6"
            strokeWidth="2.5"
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>

        {/* dots */}
        {coords.map((c, i) => (
          <div
            key={i}
            className="absolute -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border-2 border-white bg-blue-500 shadow"
            style={{ left: `${c.x}%`, top: `${c.y}%`, opacity: hover === i ? 1 : 0.85 }}
          />
        ))}

        {/* hover zones + tooltip */}
        <div className="absolute inset-0 flex">
          {coords.map((c, i) => (
            <div
              key={i}
              className="flex-1 h-full"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              {hover === i && (
                <div
                  className="absolute -translate-x-1/2 -translate-y-full z-10 whitespace-nowrap rounded-lg bg-slate-900 text-white text-[11px] font-semibold px-2 py-1 shadow-lg"
                  style={{ left: `${c.x}%`, top: `${c.y}%` }}
                >
                  {c.value} in {c.label}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="flex mt-2">
        {points.map((p, i) => (
          <div key={i} className="flex-1 text-center text-[11px] font-semibold text-slate-500">
            {p.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function TopProducts({ items }) {
  if (!items.length) return <Empty>No products yet.</Empty>;
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="space-y-3">
      {items.map((it, i) => (
        <div key={i}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="font-semibold text-slate-700 truncate pr-2">
              {i + 1}. {it.name}
            </span>
            <span className="font-bold text-slate-900 flex-shrink-0">{inr(it.value)}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${(it.value / max) * 100}%`, background: catColor(it.category) }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function ExpiryPanel({ buckets, soon }) {
  const stat = [
    ["Expired", buckets.expired, "text-rose-600 bg-rose-50 border-rose-200"],
    ["≤ 30 days", buckets.soon, "text-amber-600 bg-amber-50 border-amber-200"],
    ["≤ 90 days", buckets.later, "text-blue-600 bg-blue-50 border-blue-200"],
  ];
  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {stat.map(([label, v, cls]) => (
          <div key={label} className={`rounded-xl border px-2 py-3 text-center ${cls}`}>
            <p className="text-xl font-extrabold">{v}</p>
            <p className="text-[10px] font-bold uppercase tracking-wider mt-0.5">{label}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 space-y-2">
        {soon.length ? (
          soon.map((e, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-600 truncate pr-2">{e.name}</span>
              <span
                className={`font-bold flex-shrink-0 ${
                  e.days < 0 ? "text-rose-600" : e.days <= 30 ? "text-amber-600" : "text-slate-500"
                }`}
              >
                {e.days < 0 ? `Expired ${-e.days}d ago` : `${e.days}d left`}
              </span>
            </div>
          ))
        ) : (
          <Empty>No items expiring within 90 days.</Empty>
        )}
      </div>
    </div>
  );
}

function Empty({ children }) {
  return <p className="text-xs text-slate-400 text-center py-6">{children}</p>;
}
