import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { verifyToken, TOKEN_COOKIE } from "@/lib/auth";

export default async function Home() {
  const token = cookies().get(TOKEN_COOKIE)?.value;

  let valid = false;
  if (token) {
    try {
      await verifyToken(token);
      valid = true;
    } catch {
      valid = false;
    }
  }

  redirect(valid ? "/portal" : "/login");
}
