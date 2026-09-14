import { getBackendBaseUrl } from "../_backend";

function isRetryableResolutionError(error: unknown): boolean {
  const err = error as { cause?: { code?: unknown } } | undefined;
  const code = err?.cause && "code" in err.cause ? String(err.cause.code) : "";
  return code === "ENOTFOUND" || code === "EAI_AGAIN";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function GET(): Promise<Response> {
  try {
    let res: Response;
    try {
      res = await fetch(getBackendBaseUrl(), { method: "GET" });
    } catch (error: unknown) {
      if (isRetryableResolutionError(error)) {
        await delay(250);
        res = await fetch(getBackendBaseUrl(), { method: "GET" });
      } else {
        throw error;
      }
    }
    const ok = res.ok;
    return Response.json({ ok }, { status: ok ? 200 : 502 });
  } catch {
    return Response.json({ ok: false }, { status: 502 });
  }
}
