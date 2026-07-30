import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { generatePrototype, IntakeInvalidError } from "@/lib/generation/engine";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const { prototypeId } = await generatePrototype(id);
    return NextResponse.json({ prototypeId });
  } catch (err) {
    if (err instanceof IntakeInvalidError) {
      return NextResponse.json(
        { error: "Intake has unresolved flags.", validation: err.validation },
        { status: 422 },
      );
    }
    return jsonError(err instanceof Error ? err.message : "Generation failed.", 500);
  }
}
