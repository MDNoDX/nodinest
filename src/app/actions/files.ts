"use server";
import { z } from "zod";
import { confirmUpload, createUpload, deleteFile } from "@/server/storage";
import { run } from "./_run";

export async function createUploadAction(input: {
  purpose: "cover" | "portrait" | "attachment";
  filename: string;
  mime: string;
  size: number;
  resourceId?: string | null;
}) {
  return run(async ({ ctx }) => {
    const p = z
      .object({
        purpose: z.enum(["cover", "portrait", "attachment"]),
        filename: z.string().min(1).max(300),
        mime: z.string().max(100),
        size: z.number().int().positive(),
        resourceId: z.string().uuid().nullish(),
      })
      .parse(input);
    return createUpload(ctx, p);
  });
}

export async function confirmUploadAction(fileId: string) {
  return run(async ({ ctx }) => confirmUpload(ctx, z.string().uuid().parse(fileId)));
}

export async function deleteFileAction(fileId: string) {
  return run(async ({ ctx }) => deleteFile(ctx, z.string().uuid().parse(fileId)));
}
