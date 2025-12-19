// src/app/api/mobile/me/avatar/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAppJwt } from "@/lib/app-jwt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getBearerToken(req: Request): string | null {
  const auth =
    req.headers.get("authorization") || req.headers.get("Authorization");
  if (!auth) return null;

  const [type, token] = auth.split(" ");
  if (type?.toLowerCase() !== "bearer" || !token) return null;

  return token.trim();
}

function selectUser() {
  return {
    id: true,
    name: true,
    email: true,
    role: true,
    image: true,
    phone: true,
    birthday: true,
    isOwner: true,
    isActive: true,
    adminAccess: true,
    createdAt: true,
    updatedAt: true,
  } as const;
}

const MAX_BYTES = 2 * 1024 * 1024; // 2MB
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

function normalizeMime(mime: string) {
  const m = (mime || "").toLowerCase().trim();
  if (m === "image/jpg") return "image/jpeg";
  return m;
}

export async function POST(req: Request) {
  /* ===========================
   * 1) Token
   * ===========================*/
  const bearer = getBearerToken(req);
  if (!bearer) {
    return NextResponse.json({ error: "missing_token" }, { status: 401 });
  }

  let userId: string;
  try {
    const payload = await verifyAppJwt(bearer);
    userId = payload.sub;
  } catch (err) {
    console.error("[avatar] verifyAppJwt error:", err);
    return NextResponse.json({ error: "invalid_token" }, { status: 401 });
  }

  /* ===========================
   * 2) User
   * ===========================*/
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isActive: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "user_not_found" }, { status: 401 });
  }

  if (!existing.isActive) {
    return NextResponse.json({ error: "user_inactive" }, { status: 403 });
  }

  /* ===========================
   * 3) FormData
   * ===========================*/
  let rawForm: unknown;
  try {
    rawForm = await req.formData();
  } catch (err) {
    console.error("[avatar] formData parse error:", err);
    return NextResponse.json({ error: "invalid_form" }, { status: 400 });
  }

  // 👉 CAST explícito (resolve erro do TS)
  const form = rawForm as any;

  const file = form.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "missing_file" }, { status: 400 });
  }

  const mime = normalizeMime((file as any).type || "");
  if (!ALLOWED_MIME.has(mime)) {
    return NextResponse.json({ error: "invalid_file_type" }, { status: 400 });
  }

  /* ===========================
   * 4) Buffer
   * ===========================*/
  let buf: Buffer;
  try {
    const arrayBuffer = await file.arrayBuffer();
    buf = Buffer.from(arrayBuffer);
  } catch (err) {
    console.error("[avatar] file read error:", err);
    return NextResponse.json({ error: "file_read_error" }, { status: 400 });
  }

  if (!buf.length) {
    return NextResponse.json({ error: "empty_file" }, { status: 400 });
  }

  if (buf.length > MAX_BYTES) {
    return NextResponse.json({ error: "file_too_large" }, { status: 400 });
  }

  /* ===========================
   * 5) Persist (Data URL – MVP)
   * ===========================*/
  const base64 = buf.toString("base64");
  const dataUrl = `data:${mime};base64,${base64}`;

  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { image: dataUrl },
      select: selectUser(),
    });

    return NextResponse.json({
      user,
      imageUrl: user.image,
      image: user.image,
    });
  } catch (err) {
    console.error("[avatar] prisma update error:", err);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }
}
