import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { loadIntakeInput } from "@/lib/generation/engine";
import { validateIntake } from "@/lib/generation/validateIntake";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const intake = await loadIntakeInput(id);
    return NextResponse.json(validateIntake(intake));
  } catch {
    return jsonError("Initiative not found.", 404);
  }
}
