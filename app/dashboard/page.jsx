import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import { verifyToken, TOKEN_COOKIE } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";

export const dynamic = "force-dynamic";

async function getCurrentUser() {
  const token = cookies().get(TOKEN_COOKIE)?.value;
  if (!token) return null;
  try {
    const payload = await verifyToken(token);
    await dbConnect();
    const user = await User.findById(payload.sub).select("username role createdAt");
    return user;
  } catch {
    return null;
  }
}

const ROLE_LABEL = {
  manufacturer: "Manufacturer",
  distributor: "Distributor",
  retailer: "Retailer",
  admin: "Admin",
};

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const roleLabel = ROLE_LABEL[user.role] || user.role;

  return (
    <main className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-xl shadow-lg shadow-blue-500/30">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900">SmartSeal</h1>
              <p className="text-[11px] text-slate-400">Operations Control</p>
            </div>
          </div>
          <LogoutButton />
        </div>
      </header>

      {/* Content */}
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600/10 text-xl font-bold text-blue-600">
              {user.username.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-slate-900">
                Welcome, {user.username}
              </h2>
              <span className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                {roleLabel}
              </span>
            </div>
          </div>

          <p className="mt-6 text-sm leading-relaxed text-slate-500">
            You are signed in. Your account role determines what you can access across the
            supply chain. Roles can be updated by an admin at any time.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href="/portal"
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-700"
            >
              Open Manufacturer Portal
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </a>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-slate-400">
          The full manufacturer portal is built into this app at{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5">/portal</code>.
        </p>
      </div>
    </main>
  );
}
