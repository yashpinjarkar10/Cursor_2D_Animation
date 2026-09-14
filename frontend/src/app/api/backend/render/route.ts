import { buildBackendUrl, passthroughHeaders } from "../_backend";

function isRetryableResolutionError(error: unknown): boolean {
  const err = error as { cause?: { code?: unknown } } | undefined;
  const code = err?.cause && "code" in err.cause ? String(err.cause.code) : "";
  return code === "ENOTFOUND" || code === "EAI_AGAIN";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(req: Request): Promise<Response> {
  const url = buildBackendUrl("/render");

  try {
    const body = await req.arrayBuffer();
    const init: RequestInit = {
      method: "POST",
      headers: {
        "content-type": req.headers.get("content-type") || "application/json",
        accept: req.headers.get("accept") || "*/*",
      },
      body,
    };

    let upstream: Response;
    try {
      upstream = await fetch(url, init);
    } catch (error: unknown) {
      if (isRetryableResolutionError(error)) {
        await delay(250);
        upstream = await fetch(url, init);
      } else {
        throw error;
      }
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: passthroughHeaders(upstream.headers),
    });
  } catch (error: unknown) {
    const err = error as { message?: string; cause?: unknown };
    const message = (err?.message || (error instanceof Error ? error.message : String(error))).trim();
    const cause = err?.cause as { code?: unknown; errno?: unknown; syscall?: unknown; hostname?: unknown } | undefined;
    const causeParts = [
      cause?.code ? `code=${String(cause.code)}` : undefined,
      cause?.errno ? `errno=${String(cause.errno)}` : undefined,
      cause?.syscall ? `syscall=${String(cause.syscall)}` : undefined,
      cause?.hostname ? `host=${String(cause.hostname)}` : undefined,
    ].filter(Boolean);

    const detail = causeParts.length ? `${message} (${causeParts.join(", ")})` : message;
    return Response.json(
      { detail, upstream: url },
      { status: 502 }
    );
  }
}
