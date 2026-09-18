import { NextResponse } from "next/server";
import type { ZodError } from "zod";

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: status >= 500 ? "Request failed. Please try again." : message }, { status });
}

export function zodMessage(err: ZodError): string {
  return err.issues.map((i) => i.message).join(" ");
}
