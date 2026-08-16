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
  bandDark: "#2f3d29",
  bandBlack: "#0b0d0a",
};

async function readAsset(file: string): Promise<string> {
  const buf = await readFile(path.join(process.cwd(), file));
  return `data:image/png;base64,${buf.toString("base64")}`;
}

async function loadFont(file: string): Promise<ArrayBuffer> {
  const buf = await readFile(path.join(process.cwd(), file));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

const BAND_W = 74;
const GAP = 4;

export async function GET() {
  const [wordmark, favorit] = await Promise.all([
    readAsset("public/brand/nibgate-wordmark-hi.png"),
    loadFont("public/fonts/ABCFavorit-Regular.ttf"),
  ]);

  const bands = [
    { x: 1200 - 3 * BAND_W - 2 * GAP, color: COLORS.olive },
    { x: 1200 - 2 * BAND_W - GAP, color: COLORS.bandDark },
    { x: 1200 - BAND_W, color: COLORS.bandBlack },
  ];

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
        {/* right bands */}
        {bands.map((b, i) => (
          <div key={i} style={{ position: "absolute", top: 0, bottom: 0, left: b.x, width: BAND_W, background: b.color }} />
        ))}

        {/* content, aligned to left gutter */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "0 64px",
            maxWidth: 900,
          }}
        >
          <img src={wordmark} width={420} height={123} style={{ display: "block" }} />

          <div style={{ marginLeft: 12, display: "flex", flexDirection: "column" }}>
            <h1
              style={{
                marginTop: 40,
                fontSize: 96,
                fontWeight: 400,
                letterSpacing: "-0.055em",
                lineHeight: 0.92,
                marginBottom: 0,
              }}
            >
              Create it, gate it.
            </h1>

            <p
              style={{
                marginTop: 28,
                fontSize: 32,
                lineHeight: 1.2,
                color: COLORS.muted,
                fontWeight: 400,
              }}
            >
              The open protocol for paid content.
            </p>
            <p
              style={{
                marginTop: 12,
                fontSize: 26,
                color: COLORS.faint,
                fontWeight: 400,
              }}
            >
              Publish, gate, and earn — your content, your rules.
            </p>
          </div>

          <div style={{ display: "flex", gap: 14, marginTop: 40, marginLeft: 12 }}>
            <div style={{ background: COLORS.olive, color: "#10110e", borderRadius: 999, padding: "13px 26px", fontSize: 20, fontWeight: 400 }}>
              nibgate.xyz
            </div>
            <div style={{ border: "1px solid rgba(169,198,154,0.42)", color: COLORS.olive, borderRadius: 999, padding: "13px 26px", fontSize: 20, fontWeight: 400 }}>
              Explore
            </div>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts: [
      { name: "ABC Favorit", data: favorit, weight: 400, style: "normal" },
    ] }
  );
}