import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifySignatureAndLogin } from "nibgate/src/core/auth.js";

export async function POST(request: Request) {
  try {
    const { walletAddress, signature } = await request.json();
    const cookieStore = await cookies();
    const expectedNonce = cookieStore.get("auth_nonce")?.value;

    if (!expectedNonce) {
      return NextResponse.json(
        { error: "Session expired. Please request a new nonce." },
        { status: 400 }
      );
    }

    const { user, sessionToken } = await verifySignatureAndLogin(
      walletAddress,
      signature,
      expectedNonce
    );

    // Clear the nonce cookie
    cookieStore.delete("auth_nonce");

    // Set the secure session cookie
    cookieStore.set("auth_session", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30, // 30 days in seconds
    });

    return NextResponse.json({ success: true, user });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Authentication failed", details: error.message },
      { status: 401 }
    );
  }
}
