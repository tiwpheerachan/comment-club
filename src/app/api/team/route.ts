import { NextRequest, NextResponse } from "next/server";
import { getTeam, upsertTeamMember } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getTeam());
}

export async function POST(req: NextRequest) {
  try {
    const { name, role } = await req.json();
    if (!name?.trim()) return NextResponse.json({ error: "ต้องมีชื่อ" }, { status: 400 });
    await upsertTeamMember(name, role);
    return NextResponse.json({ ok: true, team: await getTeam() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
