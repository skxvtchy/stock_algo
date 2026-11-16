import { NextRequest } from "next/server";
import { guard } from "@/lib/auth";
import { listRuns } from "@/lib/db";

export async function GET(req: NextRequest) {
  const g = await guard("user");
  if (!g.ok) return g.res;
  const mode = req.nextUrl.searchParams.get("mode") === "live" ? "live" : "paper";
  return Response.json(await listRuns(g.db, mode));
}
