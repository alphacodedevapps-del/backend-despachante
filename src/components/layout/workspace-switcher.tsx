"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ChevronsUpDown, Plus, Settings2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ROLE_LABELS, WORKSPACE_TYPES, type WorkspaceRole, type WorkspaceType } from "@/lib/permissions";
import { switchWorkspaceAction } from "@/modules/shell/actions";
import { cn } from "@/lib/utils/cn";

export interface WsItem {
  id: string;
  name: string;
  workspace_type: WorkspaceType;
  is_personal: boolean;
  role: WorkspaceRole;
}

export function WorkspaceSwitcher({ workspaces, currentId, className }: { workspaces: WsItem[]; currentId: string; className?: string }) {
  const router = useRouter();
  const current = workspaces.find((w) => w.id === currentId);
  const [pending, startTransition] = React.useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex h-9 min-w-0 items-center gap-2 rounded-md border border-border bg-surface px-2.5 text-left text-sm hover:bg-surface-muted cursor-pointer",
          pending && "opacity-60",
          className,
        )}
        aria-label="Selecionar workspace"
      >
        <span className="flex size-5 shrink-0 items-center justify-center rounded bg-primary-soft text-[10px] font-bold text-primary">
          {current?.name.slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1 truncate font-medium">{current?.name}</span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
        {workspaces.map((w) => (
          <DropdownMenuItem
            key={w.id}
            onSelect={() =>
              startTransition(async () => {
                if (w.id === currentId) return;
                const res = await switchWorkspaceAction(w.id);
                if (!res.ok) toast.error(res.error);
                else {
                  toast.success(`Workspace: ${w.name}`);
                  router.refresh();
                }
              })
            }
          >
            <span className="flex size-6 shrink-0 items-center justify-center rounded bg-surface-muted text-xs font-semibold">{w.name.slice(0, 1).toUpperCase()}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate">{w.name}</span>
              <span className="block text-xs text-muted-foreground">
                {WORKSPACE_TYPES[w.workspace_type]} · {ROLE_LABELS[w.role]}
              </span>
            </span>
            {w.id === currentId && <Check className="!text-primary" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/workspaces?novo=1">
            <Plus /> Criar workspace
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/workspaces/${currentId}`}>
            <Settings2 /> Gerenciar workspace atual
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
