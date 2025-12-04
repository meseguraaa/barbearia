import { prisma } from "@/lib/prisma";

export async function GET() {
  const barbers = await prisma.barber.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });

  return Response.json(barbers);
}
