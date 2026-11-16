import { guard } from "@/lib/auth";
import { STRATEGIES } from "@/lib/strategies";

export async function GET() {
  const g = await guard("user");
  if (!g.ok) return g.res;
  return Response.json(STRATEGIES.map(({ id, name, kind, description }) => ({ id, name, kind, description })));
}
