import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-static";

const COLORS = {
  bg: "#171813",
  ink: "#f3efe7",
  olive: "#a9c69a",
  oliveDeep: "#7c9a6d",
  muted: "#b9b2a6",
  faint: "#8f8879",
  footer: "#10110e",
};

async function readAsset(file: string): Promise<string> {
  const buf = await readFile(path.join(process.cwd(), file));
  return `data:image/png;base64,${buf.toString("base64")}`;
}

async function loadFont(file: string): Promise<ArrayBuffer> {
  const buf = await readFile(path.join(process.cwd(), file));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

export async function GET() {
  const [mark, flower, kumbhBold, kumbhMedium, favorit] = await Promise.all([
    readAsset("public/brand/nibgate-mark.png"),
    readAsset("public/images/og-flower.png"),
    loadFont("public/fonts/kumbh/KumbhSans-Bold.ttf"),
    loadFont("public/fonts/kumbh/KumbhSans-SemiBold.ttf"),
    loadFont("public/fonts/ABCFavorit-Regular.ttf"),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          background: COLORS.bg,
          color: COLORS.ink,
          display: "flex",
          flexDirection: "column",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* top bar */}
        <div style={{ width: 1200, height: 4, background: COLORS.olive }} />

        {/* content */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "0 64px",
            position: "relative",
          }}
        >
          {/* flower */}
          <img
            src={flower}
            width={620}
            height={443}
            style={{ position: "absolute", right: -90, bottom: -40, opacity: 0.9 }}
          />

          {/* brand lockup */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
            <img src={mark} width={36} height={28} />
            <span style={{ fontSize: 26, fontWeight: 500, color: COLORS.olive }}>nibgate</span>
          </div>

          <h1
            style={{
              fontSize: 88,
              fontWeight: 700,
              letterSpacing: "-0.055em",
              lineHeight: 0.92,
              margin: 0,
              maxWidth: 800,
            }}
          >
            Nibgate Docs
          </h1>

          <p
            style={{
              marginTop: 24,
              fontSize: 27,
              lineHeight: 1.2,
              color: COLORS.muted,
              maxWidth: 700,
            }}
          >
            Developer guides, API reference, and integration docs.
          </p>
          <p style={{ marginTop: 10, fontSize: 22, color: COLORS.faint, maxWidth: 700 }}>
            Install the SDK, create a Subblog, configure payments.
          </p>

          <div style={{ display: "flex", gap: 14, marginTop: 36 }}>
            <div style={{ background: COLORS.olive, color: "#10110e", borderRadius: 999, padding: "10px 22px", fontSize: 17, fontWeight: 600 }}>
              docs.nibgate.xyz
            </div>
            <div style={{ border: "1px solid rgba(169,198,154,0.42)", color: COLORS.olive, borderRadius: 999, padding: "10px 22px", fontSize: 17, fontWeight: 600 }}>
              @nibgate
            </div>
          </div>
        </div>

        {/* footer */}
        <div
          style={{
            height: 56,
            background: COLORS.footer,
            borderTop: "1px solid rgba(243,239,231,0.06)",
            display: "flex",
            alignItems: "center",
            padding: "0 64px",
            fontSize: 16,
            color: COLORS.faint,
          }}
        >
          <span style={{ color: COLORS.olive }}>@nibgate</span>
          <span style={{ margin: "0 8px" }}>·</span>
          <span>nibgate.xyz</span>
          <span style={{ margin: "0 8px" }}>·</span>
          <span>docs.nibgate.xyz</span>
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts: [
      { name: "Kumbh Sans", data: kumbhBold, weight: 700, style: "normal" },
      { name: "Kumbh Sans", data: kumbhMedium, weight: 600, style: "normal" },
      { name: "ABC Favorit", data: favorit, weight: 400, style: "normal" },
    ] }
  );
}