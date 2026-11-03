"use client";
import * as React from "react";
import { Tabs as T } from "radix-ui";
import { cn } from "@/lib/utils/cn";

export const Tabs = T.Root;

export function TabsList({ className, ...props }: React.ComponentProps<typeof T.List>) {
  return <T.List className={cn("inline-flex max-w-full overflow-x-auto scrollbar-thin rounded-lg bg-surface-muted p-1 gap-1", className)} {...props} />;
}
export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof T.Trigger>) {
  return (
    <T.Trigger
      className={cn(
        "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground whitespace-nowrap transition-colors data-[state=active]:bg-surface data-[state=active]:text-foreground data-[state=active]:shadow-card cursor-pointer",
        className,
      )}
      {...props}
    />
  );
}
export function TabsContent({ className, ...props }: React.ComponentProps<typeof T.Content>) {
  return <T.Content className={cn("mt-4 outline-none", className)} {...props} />;
}
