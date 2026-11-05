"use client";

import * as React from "react";
import Link from "next/link";
import { Dialog as D } from "radix-ui";
import { Bell, CreditCard, LogOut, Menu, Settings, ShieldCheck, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SheetContent } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { initials } from "@/lib/utils/format";
import { signOutAction } from "@/modules/shell/actions";
import { ThemeSwitcher } from "./theme";
import { Brand, SidebarNav } from "./sidebar";
import { WorkspaceSwitcher, type WsItem } from "./workspace-switcher";
import { GlobalSearch } from "./global-search";

export function Header({ userName, email, unread, workspaces, currentWorkspaceId, isAdmin }: {
  userName: string;
  email: string;
  unread: number;
  workspaces: WsItem[];
  currentWorkspaceId: string;
  isAdmin?: boolean;
}) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const wsNames = Object.fromEntries(workspaces.map((w) => [w.id, w.name]));

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-border bg-background/85 px-3 backdrop-blur sm:px-5 no-print">
      <D.Root open={menuOpen} onOpenChange={setMenuOpen}>
        <D.Trigger asChild>
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menu">
            <Menu />
          </Button>
        </D.Trigger>
        <SheetContent title="Menu">
          <div className="flex h-14 items-center border-b border-border px-3">
            <Brand />
          </div>
          <div className="border-b border-border p-3">
            <WorkspaceSwitcher workspaces={workspaces} currentId={currentWorkspaceId} className="w-full" />
          </div>
          <SidebarNav onNavigate={() => setMenuOpen(false)} />
        </SheetContent>
      </D.Root>

      <WorkspaceSwitcher workspaces={workspaces} currentId={currentWorkspaceId} className="hidden max-w-56 sm:flex" />

      <div className="flex flex-1 justify-center px-1">
        <GlobalSearch workspaceNames={wsNames} />
      </div>

      <Button variant="ghost" size="icon" asChild aria-label={`Notificações${unread ? ` (${unread} não lidas)` : ""}`}>
        <Link href="/notificacoes" className="relative">
          <Bell />
          {unread > 0 && (
            <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-4 text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Link>
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger className="flex size-9 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary cursor-pointer" aria-label="Menu do usuário">
          {initials(userName || email)}
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-64">
          <DropdownMenuLabel className="text-foreground">
            <span className="block truncate text-sm">{userName || "Estudante"}</span>
            <span className="block truncate text-xs font-normal text-muted-foreground">{email}</span>
          </DropdownMenuLabel>
          <div className="px-2 py-1.5">
            <ThemeSwitcher className="w-full justify-between" />
          </div>
          <DropdownMenuSeparator />
          {isAdmin && (
            <DropdownMenuItem asChild>
              <Link href="/admin"><ShieldCheck /> Painel do administrador</Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem asChild>
            <Link href="/assinatura"><CreditCard /> Assinatura</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/perfil"><User /> Perfil</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/configuracoes"><Settings /> Configurações</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/seguranca"><ShieldCheck /> Segurança e privacidade</Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void signOutAction()}>
            <LogOut /> Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
