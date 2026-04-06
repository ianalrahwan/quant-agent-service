import { NextRequest } from "next/server";

const BACKEND_URL =
  process.env.AGENT_BACKEND_URL ||
  process.env.NEXT_PUBLIC_AGENT_BACKEND_URL ||
  "http://localhost:8000";

export const runtime = "edge";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  const backendResp = await fetch(`${BACKEND_URL}/stream/${jobId}`, {
    headers: { Accept: "text/event-stream" },
  });

  if (!backendResp.ok || !backendResp.body) {
    return new Response(`Backend error: ${backendResp.status}`, {
      status: 502,
    });
  }

  // Pipe the SSE stream through on the edge runtime
  return new Response(backendResp.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
