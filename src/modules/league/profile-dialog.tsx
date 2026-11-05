"use client";

import * as React from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { LeagueProfileForm } from "./profile-form";

export function LeagueProfileDialog({ initial, label }: { initial: Record<string, string | null>; label: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline"><Pencil /> {label}</Button></DialogTrigger>
      <DialogContent title="Informações da liga" wide><LeagueProfileForm initial={initial} onDone={() => setOpen(false)} /></DialogContent>
    </Dialog>
  );
}
