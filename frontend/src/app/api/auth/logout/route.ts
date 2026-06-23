import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { logoutSession } from "nibgate/src/core/auth.js";

export async function POST() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("auth_session")?.value;
  
  if (sessionToken) {
    await logoutSession(sessionToken);
  }
  
  cookieStore.delete("auth_session");
  return NextResponse.json({ success: true });
}
