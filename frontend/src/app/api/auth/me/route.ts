import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getUserBySession } from "nibgate/src/core/auth.js";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("auth_session")?.value;
    
    if (!sessionToken) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    const user = await getUserBySession(sessionToken);
    
    if (!user) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }
    
    return NextResponse.json({ authenticated: true, user });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch user" }, { status: 500 });
  }
}
