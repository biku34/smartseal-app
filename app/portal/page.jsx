import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyToken, TOKEN_COOKIE } from "@/lib/auth";
import ManufacturerPortal from "@/components/ManufacturerPortal";
import DistributorPortal from "@/components/DistributorPortal";
import LogisticsPartnerPortal from "@/components/LogisticsPartnerPortal";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "SmartSeal — Portal",
};

export default async function PortalPage() {
  // Auth guard (middleware also protects this route; this is a safety net
  // that gives us the user's identity for the UI).
  const token = cookies().get(TOKEN_COOKIE)?.value;
  if (!token) redirect("/login");

  let payload;
  try {
    payload = await verifyToken(token);
  } catch {
    redirect("/login");
  }

  const shared = {
    username: payload.username || "Operator",
    role: payload.role || "manufacturer",
    userId: payload.userId || "",
    name: payload.name || "",
    email: payload.email || "",
    orgName: payload.orgName || "",
    stage: payload.stage || "",
  };

  // Route to the right portal based on the user's role.
  if (payload.role === "distributor") {
    return <DistributorPortal {...shared} />;
  }
  if (payload.role === "logistics") {
    return <LogisticsPartnerPortal {...shared} />;
  }
  return <ManufacturerPortal {...shared} />;
}
