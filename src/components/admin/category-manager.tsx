"use client";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { archiveCategoryAction, saveCategoryAction } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import type { FieldErrors } from "@/lib/errors";
import { useAction } from "@/lib/use-action";

type Cat = {
  id: string;
  slug: string;
  nameUz: string;
  nameEn: string;
  description: string | null;
  parentId: string | null;
  sortOrder: number;
  deletedAt: Date | null;
  count: number;
};
const empty = { slug: "", nameUz: "", nameEn: "", description: "", parentId: "", sortOrder: "0" };

export function CategoryManager({ categories }: { categories: Cat[] }) {
  const t = useTranslations();
  const { pending, exec } = useAction();
  const [editing, setEditing] = useState<string | null>(null);
  const [v, setV] = useState(empty);
  const [errors, setErrors] = useState<FieldErrors>({});
  const set = (k: keyof typeof v, val: string) => setV((s) => ({ ...s, [k]: val }));
  const byId = new Map(categories.map((c) => [c.id, c]));
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <ul className="card divide-border divide-y">
        {categories.map((c) => (
          <li
            key={c.id}
            className={`flex items-center gap-3 px-4 py-3 ${c.deletedAt ? "opacity-50" : ""}`}
          >
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">
                {c.parentId && (
                  <span className="text-muted">{byId.get(c.parentId)?.nameUz} / </span>
                )}
                {c.nameUz} <span className="text-muted">· {c.nameEn}</span>
              </div>
              <div className="text-muted font-mono text-xs">
                {c.slug} · {c.count}
              </div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(c.id);
                setV({
                  slug: c.slug,
                  nameUz: c.nameUz,
                  nameEn: c.nameEn,
                  description: c.description ?? "",
                  parentId: c.parentId ?? "",
                  sortOrder: String(c.sortOrder),
                });
              }}
            >
              {t("common.edit")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => exec(() => archiveCategoryAction(c.id, !c.deletedAt))}
            >
              {c.deletedAt ? t("common.restore") : t("common.archive")}
            </Button>
          </li>
        ))}
        {categories.length === 0 && (
          <li className="text-muted px-4 py-6 text-sm">{t("empty.nothingHere")}</li>
        )}
      </ul>
      <form
        className="card flex h-fit flex-col gap-3 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          setErrors({});
          exec(() => saveCategoryAction({ ...v, parentId: v.parentId || null }, editing), {
            success: t("admin.categorySaved"),
            onSuccess: () => {
              setEditing(null);
              setV(empty);
            },
            onError: (r) => {
              if (r.fieldErrors) setErrors(r.fieldErrors);
            },
          });
        }}
      >
        <h2 className="text-sm font-semibold">
          {editing ? t("common.edit") : t("admin.newCategory")}
        </h2>
        <Field label={t("admin.nameUz")} error={errors.nameUz}>
          {(p) => (
            <Input
              {...p}
              required
              value={v.nameUz}
              onChange={(e) => set("nameUz", e.target.value)}
            />
          )}
        </Field>
        <Field label={t("admin.nameEn")} error={errors.nameEn}>
          {(p) => (
            <Input
              {...p}
              required
              value={v.nameEn}
              onChange={(e) => set("nameEn", e.target.value)}
            />
          )}
        </Field>
        <Field label={t("admin.slug")} error={errors.slug}>
          {(p) => (
            <Input
              {...p}
              required
              value={v.slug}
              onChange={(e) => set("slug", e.target.value)}
              placeholder="history"
            />
          )}
        </Field>
        <Field label={t("admin.parent")} error={errors.parentId}>
          {(p) => (
            <Select {...p} value={v.parentId} onChange={(e) => set("parentId", e.target.value)}>
              <option value="">{t("admin.noParent")}</option>
              {categories
                .filter((c) => c.id !== editing && !c.deletedAt)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nameUz}
                  </option>
                ))}
            </Select>
          )}
        </Field>
        <Field label={t("admin.sortOrder")}>
          {(p) => (
            <Input
              {...p}
              type="number"
              min={0}
              value={v.sortOrder}
              onChange={(e) => set("sortOrder", e.target.value)}
            />
          )}
        </Field>
        <div className="flex gap-2">
          <Button type="submit" loading={pending}>
            {t("common.save")}
          </Button>
          {editing && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setEditing(null);
                setV(empty);
              }}
            >
              {t("common.cancel")}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
