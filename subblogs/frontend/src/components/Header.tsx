import { serverFetch } from "@/lib/server-fetch";
import HeaderClient from "./HeaderClient";

export default async function Header() {
  // /site includes server credentials. Only the public display name crosses
  // the server/client boundary; never serialize the complete response.
  const data = await serverFetch<{ site?: { name?: string } }>("/site", { cache: "no-store" });
  return <HeaderClient siteName={data?.site?.name || "Nibgate"} />;
}
