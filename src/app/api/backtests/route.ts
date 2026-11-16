import { guard } from "@/lib/auth";
import { listBacktests } from "@/lib/db";

export async function GET() {
  const g = await guard("user");
  if (!g.ok) return g.res;
  return Response.json(await listBacktests(g.db));
}
