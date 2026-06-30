export const dynamic = "force-static";

export function GET() {
  return Response.json({
    ok: true,
    service: "nibgate-frontend",
    status: "online",
    version: "0.1.0",
  });
}
