import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyToken, TOKEN_COOKIE } from "@/lib/auth";
import ManufacturerPortal from "@/components/ManufacturerPortal";

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

  return (
    <ManufacturerPortal
      username={payload.username || "Operator"}
      role={payload.role || "manufacturer"}
      userId={payload.userId || ""}
      name={payload.name || ""}
      email={payload.email || ""}
      orgName={payload.orgName || ""}
      stage={payload.stage || ""}
    />
  );
}
