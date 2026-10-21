"use server";
import { z } from "zod";
import { deleteFile, registerUpload, storageUsage, USER_QUOTA_BYTES } from "@/server/storage";
import { run } from "./_run";

export async function registerUploadAction(input: {
  pathname: string;
  purpose: "cover" | "portrait" | "attachment" | "media";
  originalName: string;
  resourceId?: string | null;
}) {
  return run(async ({ ctx }) => {
    const p = z
      .object({
        pathname: z.string().min(1).max(500),
        purpose: z.enum(["cover", "portrait", "attachment", "media"]),
        originalName: z.string().min(1).max(300),
        resourceId: z.string().uuid().nullish(),
      })
      .parse(input);
    return registerUpload(ctx, p);
  });
}

export async function deleteFileAction(fileId: string) {
  return run(async ({ ctx }) => deleteFile(ctx, z.string().uuid().parse(fileId)));
}

/** How much of the upload quota is used (for the "space is full" hint). */
export async function storageStatusAction() {
  return run(async ({ ctx }) => ({ used: await storageUsage(ctx), quota: USER_QUOTA_BYTES }));
}
