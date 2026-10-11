import { CategoryManager } from "@/components/admin/category-manager";
import { pageContext } from "@/lib/page";
import { listCategories } from "@/server/catalog";

export default async function AdminCategories() {
  const { ctx, db } = await pageContext({ admin: true });
  return <CategoryManager categories={await listCategories(db, ctx, true)} />;
}
