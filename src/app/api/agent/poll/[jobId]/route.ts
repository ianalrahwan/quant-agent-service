import { NextRequest, NextResponse } from "next/server";
import type { PollEvent, PollResponse } from "@/lib/agent-types";

const BACKEND_URL =
  process.env.AGENT_BACKEND_URL ||
  process.env.NEXT_PUBLIC_AGENT_BACKEND_URL ||
  "http://localhost:8000";

const BUFFER_MS = 20_000;

export const runtime = "nodejs";
export const maxDuration = 30;

interface SSEFrame {
  event: string;
  data: string;
}

function parseSSEChunk(buffer: string): { frames: SSEFrame[]; remainder: string } {
  const frames: SSEFrame[] = [];
  const blocks = buffer.split("\n\n");
  const remainder = blocks.pop() ?? "";

  for (const block of blocks) {
    if (!block.trim()) continue;
    let event = "message";
    let data = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data = line.slice(5).trim();
    }
    if (data) frames.push({ event, data });
  }

  return { frames, remainder };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const cursor = parseInt(request.nextUrl.searchParams.get("cursor") ?? "0", 10);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BUFFER_MS);

  let backendResp: Response;
  try {
    backendResp = await fetch(`${BACKEND_URL}/stream/${jobId}`, {
      headers: { Accept: "text/event-stream" },
      signal: controller.signal,
    });
  } catch {
    clearTimeout(timeout);
    const errorResponse: PollResponse = {
      events: [{ index: cursor, type: "error", data: { error: "Backend connection failed" } }],
      cursor: cursor + 1,
      finished: true,
      checkpoint: false,
    };
    return NextResponse.json(errorResponse);
  }

  if (!backendResp.ok || !backendResp.body) {
    clearTimeout(timeout);
    const errorResponse: PollResponse = {
      events: [{ index: cursor, type: "error", data: { error: `Backend error: ${backendResp.status}` } }],
      cursor: cursor + 1,
      finished: true,
      checkpoint: false,
    };
    return NextResponse.json(errorResponse);
  }

  const events: PollEvent[] = [];
  let eventIndex = 0;
  let finished = false;
  let checkpoint = false;
  let sseBuffer = "";

  try {
    const reader = backendResp.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      sseBuffer += decoder.decode(value, { stream: true });
      const { frames, remainder } = parseSSEChunk(sseBuffer);
      sseBuffer = remainder;

      for (const frame of frames) {
        if (eventIndex >= cursor) {
          let parsed: unknown;
          try {
            parsed = JSON.parse(frame.data);
          } catch {
            continue;
          }

          events.push({
            index: eventIndex,
            type: frame.event as PollEvent["type"],
            data: parsed as PollEvent["data"],
          });

          if (frame.event === "done" || frame.event === "error") {
            finished = true;
          }
          if (frame.event === "checkpoint") {
            checkpoint = true;
          }
        }
        eventIndex++;

        if (finished || checkpoint) break;
      }

      if (finished || checkpoint) break;
    }

    reader.cancel();
  } catch (err) {
    if (!(err instanceof DOMException && err.name === "AbortError")) {
      // Unexpected error — return what we have so far
    }
  }

  clearTimeout(timeout);

  const response: PollResponse = {
    events,
    cursor: eventIndex,
    finished,
    checkpoint,
  };

  return NextResponse.json(response);
}
