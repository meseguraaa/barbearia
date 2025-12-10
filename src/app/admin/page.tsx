import { redirect } from "next/navigation";
import {
  requireAdminWithPermissions,
  getAdminDefaultPath,
} from "@/lib/admin-permissions";

export default async function AdminRootPage() {
  const admin = await requireAdminWithPermissions();
  const target = getAdminDefaultPath(admin);
  redirect(target);
}
