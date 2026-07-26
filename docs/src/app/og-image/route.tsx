import { ImageResponse } from "next/og";
export const runtime = "edge";
export const dynamic = "force-static";
export async function GET() {
  return new ImageResponse(
    <div style={{ width: 1200, height: 630, background: "#1a1a2e", display: "flex", flexDirection: "column", padding: "60px" }}>
      <div style={{ width: 1200, height: 4, background: "#7C9A6D" }} />
      <div style={{ marginTop: 40, fontSize: 56, fontWeight: 700, color: "#fff" }}>Nibgate Docs</div>
      <div style={{ marginTop: 16, fontSize: 28, color: "#aaa" }}>Developer guides, API reference, and integration docs.</div>
      <div style={{ marginTop: 12, fontSize: 22, color: "#888" }}>Install the SDK, create a Subblog, configure payments.</div>
      <div style={{ marginTop: 40, background: "#7C9A6D", borderRadius: 25, padding: "14px 32px", color: "#fff", fontSize: 18, fontWeight: 600, width: 220 }}>docs.nibgate.xyz</div>
      <div style={{ marginTop: "auto", fontSize: 16, color: "#666" }}>@nibgate · github.com/fortunesayspump/nibgate</div>
    </div>,
    { width: 1200, height: 630 }
  );
}
