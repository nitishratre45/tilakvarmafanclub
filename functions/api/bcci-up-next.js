export async function onRequest(context) {
  const upstream = "https://www.bcci.tv/api/bff/cms/videos/s-vice-captain-tilak-varma-packs-a-punch-with-4418-fyxhz5/up-next";
  try {
    const response = await fetch(upstream, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "TilakVarmaFanClub/1.0"
      },
      cf: { cacheTtl: 1800, cacheEverything: true }
    });
    const body = await response.text();
    return new Response(body, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") || "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=1800, s-maxage=1800",
        "Access-Control-Allow-Origin": "*"
      }
    });
  } catch (error) {
    return Response.json({ error: "BCCI up-next feed unavailable" }, { status: 502 });
  }
}
