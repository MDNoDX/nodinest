"use client";
import { Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { sendFeedbackAction, setFeedbackStatusAction } from "@/app/actions/feedback";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { useAction } from "@/lib/use-action";

export function FeedbackForm() {
  const t = useTranslations("feedback");
  const { pending, exec } = useAction();
  const [v, setV] = useState({ title: "", body: "", contact: "" });
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        exec(() => sendFeedbackAction(v), {
          success: t("sent"),
          onSuccess: () => setV({ title: "", body: "", contact: "" }),
        });
      }}
    >
      <Field label={t("titleLabel")}>
        {(p) => (
          <Input
            {...p}
            required
            maxLength={200}
            value={v.title}
            onChange={(e) => setV({ ...v, title: e.target.value })}
            placeholder={t("titlePlaceholder")}
          />
        )}
      </Field>
      <Field label={t("bodyLabel")}>
        {(p) => (
          <Textarea
            {...p}
            required
            rows={5}
            maxLength={5000}
            value={v.body}
            onChange={(e) => setV({ ...v, body: e.target.value })}
            placeholder={t("bodyPlaceholder")}
          />
        )}
      </Field>
      <Field label={t("contactLabel")} optional>
        {(p) => (
          <Input
            {...p}
            maxLength={200}
            value={v.contact}
            onChange={(e) => setV({ ...v, contact: e.target.value })}
            placeholder={t("contactPlaceholder")}
          />
        )}
      </Field>
      <Button type="submit" loading={pending} className="self-start">
        <Send /> {t("send")}
      </Button>
    </form>
  );
}

export function FeedbackStatusButtons({ id, status }: { id: string; status: string }) {
  const t = useTranslations("feedback");
  const { pending, exec } = useAction();
  return (
    <div className="flex gap-1">
      {(["read", "done"] as const)
        .filter((s) => s !== status)
        .map((s) => (
          <Button
            key={s}
            size="sm"
            variant="ghost"
            loading={pending}
            onClick={() => exec(() => setFeedbackStatusAction(id, s))}
          >
            {t(`mark.${s}`)}
          </Button>
        ))}
    </div>
  );
}
