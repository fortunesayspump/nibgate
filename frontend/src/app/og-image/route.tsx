import { ImageResponse } from "next/og";

export const runtime = "edge";
export const dynamic = "force-static";

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          background: "#f4f4f0",
          display: "flex",
          flexDirection: "column",
          padding: "60px",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ width: 1200, height: 4, background: "#7C9A6D" }} />
        <div style={{ marginTop: 40, fontSize: 56, fontWeight: 700, color: "#0a0a0a" }}>Nibgate</div>
        <div style={{ marginTop: 16, fontSize: 28, color: "#6b6862" }}>The open protocol for paid content.</div>
        <div style={{ marginTop: 12, fontSize: 22, color: "#6b6862" }}>Publish, gate, and earn — your content, your rules.</div>
        <div style={{ display: "flex", gap: 16, marginTop: 40 }}>
          <div style={{ background: "#7C9A6D", borderRadius: 25, padding: "14px 32px", color: "#fff", fontSize: 18, fontWeight: 600 }}>nibgate.xyz</div>
          <div style={{ background: "#7C9A6D", borderRadius: 25, padding: "14px 32px", color: "#fff", fontSize: 18, fontWeight: 600 }}>Explore</div>
        </div>
        <div style={{ marginTop: "auto", fontSize: 16, color: "#6b6862" }}>@nibgate · github.com/fortunesayspump/nibgate · docs.nibgate.xyz</div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
