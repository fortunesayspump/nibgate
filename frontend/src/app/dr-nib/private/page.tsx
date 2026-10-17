import { redirect } from "next/navigation";

// The confidential flow is now the main Research experience. Keep this path as
// a redirect so any existing links keep working.
export default function PrivateResearchRedirect() {
  redirect("/dr-nib/research");
}
