import service from "../../../../backend/service.cjs";
import infra from "../../../../backend/infrastructure.cjs";
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
export async function GET(request, { params }) {
  const { path } = await params;
  const route = path.join("/"),
    id = crypto.randomUUID(),
    start = Date.now();
  const headers = { "Cache-Control": "no-store", "X-Request-Id": id };
  try {
    const url = new URL(request.url);
    if (url.search.length > 2000) throw infra.fault("Request too large.", 400);
    if (request.headers.get("sec-fetch-site") === "cross-site")
      throw infra.fault("Cross-site API requests are not supported.", 403);
    const ip =
      request.headers.get("x-vercel-forwarded-for")?.split(",")[0] ||
      request.headers.get("x-forwarded-for")?.split(",")[0] ||
      "local";
    infra.limit(ip, 120);
    if (["browse", "quote"].includes(route)) infra.limit(ip + ":quotes", 30);
    const result = await service.handle(route, url.searchParams);
    if (route === "catalog")
      headers["Cache-Control"] =
        "public, s-maxage=60, stale-while-revalidate=120";
    if (
      ["market", "history"].includes(route) ||
      (route === "browse" && !url.searchParams.has("tickers"))
    )
      headers["Cache-Control"] = "public, s-maxage=10";
    console.info(
      JSON.stringify({
        event: "api_request",
        requestId: id,
        route,
        status: 200,
        durationMs: Date.now() - start,
      }),
    );
    return Response.json(result, { headers });
  } catch (error) {
    const status = error.status || 503;
    console.warn(
      JSON.stringify({
        event: "api_error",
        requestId: id,
        route,
        status,
        durationMs: Date.now() - start,
      }),
    );
    if (status === 429 || status === 503) headers["Retry-After"] = "10";
    return Response.json(
      {
        error: error.status
          ? error.message
          : "Data temporarily unavailable. Please retry.",
        requestId: id,
      },
      { status, headers },
    );
  }
}
