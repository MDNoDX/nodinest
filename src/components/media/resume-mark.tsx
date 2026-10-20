"use client";
import { useEffect } from "react";
import { postResume } from "@/lib/resume-client";

/** Marks this resource page as the last place the user was. */
export function ResumeMark({ resourceId }: { resourceId: string }) {
  useEffect(() => {
    postResume({ resourceId, place: "resource" });
  }, [resourceId]);
  return null;
}
