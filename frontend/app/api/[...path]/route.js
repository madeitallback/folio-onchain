import service from "../../../../backend/service.cjs";
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
export async function GET(request, { params }) {
  const { path } = await params;
  try {
    return Response.json(
      await service.handle(path.join("/"), new URL(request.url).searchParams),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { error: error.message || "Provider unavailable." },
      { status: error.status || 502 },
    );
  }
}
