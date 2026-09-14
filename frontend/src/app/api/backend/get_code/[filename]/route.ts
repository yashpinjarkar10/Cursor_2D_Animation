import { buildBackendUrl } from "../../_backend";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ filename: string }> }
): Promise<Response> {
  const { filename } = await ctx.params;
  const upstream = await fetch(buildBackendUrl(`/get_code/${encodeURIComponent(filename)}`), {
    method: "GET",
    headers: {
      accept: "application/json",
    },
  });

  // For JSON, pass through directly.
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") || "application/json",
      "cache-control": "no-store",
    },
  });
}
