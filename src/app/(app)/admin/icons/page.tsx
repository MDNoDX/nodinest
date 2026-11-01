import { IconsAdmin } from "@/components/admin/icons-admin";
import { pageContext } from "@/lib/page";
import { getCustomIcons } from "@/server/custom-icons";

export default async function AdminIcons() {
  await pageContext({ admin: true });
  const list = await getCustomIcons();
  return <IconsAdmin initial={list.map(({ id, name, words }) => ({ id, name, words }))} />;
}
