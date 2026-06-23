import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createNonce, constructSignMessage } from "nibgate/src/core/auth.js";

export async function GET() {
  const nonce = createNonce();
  const cookieStore = await cookies();
  
  cookieStore.set("auth_nonce", nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 10, // 10 minutes in seconds
  });
  
  return NextResponse.json({ nonce, messageTemplate: constructSignMessage(nonce) });
}
