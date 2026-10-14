"use client";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RetryButton({ label }: { label: string }) {
  return (
    <div className="mt-6 flex justify-center gap-2">
      <Button onClick={() => location.reload()}>
        <RotateCw /> {label}
      </Button>
      <Button variant="outline" onClick={() => history.back()}>
        ←
      </Button>
    </div>
  );
}
