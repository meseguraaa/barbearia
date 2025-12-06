// src/app/api/admin/check-client-email/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email");

  if (!email) {
    return NextResponse.json({ exists: false });
  }

  try {
    const existing = await prisma.user.findUnique({
      where: { email },
    });

    return NextResponse.json({ exists: !!existing });
  } catch (error) {
    console.error("Erro na rota check-client-email:", error);
    return NextResponse.json({ exists: false }, { status: 500 });
  }
}
