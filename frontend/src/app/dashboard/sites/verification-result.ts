type VerificationResponse = { success?: boolean; error?: string; verification?: { ok?: boolean; reason?: string } };

export function verificationFailure(httpOk: boolean, data: VerificationResponse): string | null {
  if (httpOk && data.success === true && data.verification?.ok === true) return null;
  return data.verification?.reason || data.error || "Verification failed. Check that the widget is installed and try again.";
}
