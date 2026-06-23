import { redirect } from "next/navigation";

export default function DashboardIndex() {
  // Redirect to the default profile tab
  redirect("/dashboard/profile");
}
