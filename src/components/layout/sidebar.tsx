"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, GraduationCap, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Icon } from "@/components/shared/icon";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils/cn";
import { setSidebarCollapsedAction } from "@/modules/shell/actions";
import { NAV, type NavItem } from "./nav";

function isActive(pathname: string, href: string) {
  const base = href.split("?")[0];
  if (base === "/dashboard") return pathname === "/dashboard";
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function SidebarNav({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const [closed, setClosed] = React.useState<Record<string, boolean>>({});

  const renderItem = (item: NavItem) => {
    const active = isActive(pathname, item.href);
    const link = (
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground",
          active && "bg-primary-soft text-primary hover:bg-primary-soft hover:text-primary",
          collapsed && "justify-center px-0",
        )}
      >
        <Icon name={item.icon} className="size-4 shrink-0" />
        {!collapsed && <span className="truncate">{item.label}</span>}
      </Link>
    );
    return (
      <li key={item.href}>
        {collapsed ? (
          <Tooltip content={item.label} side="right">
            {link}
          </Tooltip>
        ) : (
          link
        )}
      </li>
    );
  };

  return (
    <nav aria-label="Navegação principal" className="flex-1 overflow-y-auto scrollbar-thin px-2 pb-6">
      {NAV.map((group) => {
        const isClosed = closed[group.label];
        return (
          <div key={group.label} className="mt-4 first:mt-2">
            {!collapsed ? (
              <button
                type="button"
                onClick={() => setClosed((c) => ({ ...c, [group.label]: !c[group.label] }))}
                className="mb-1 flex w-full items-center justify-between px-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80 hover:text-foreground cursor-pointer"
                aria-expanded={!isClosed}
              >
                {group.label}
                <ChevronDown className={cn("size-3 transition-transform", isClosed && "-rotate-90")} />
              </button>
            ) : (
              <div className="mx-auto mb-2 h-px w-6 bg-border" />
            )}
            {!isClosed && <ul className="space-y-0.5">{group.items.map(renderItem)}</ul>}
          </div>
        );
      })}
    </nav>
  );
}

export function Brand({ collapsed }: { collapsed?: boolean }) {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5 px-1">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <GraduationCap className="size-4.5" />
      </span>
      {!collapsed && (
        <span className="leading-tight">
          <span className="block text-sm font-semibold">Central Acadêmica</span>
          <span className="block text-[11px] text-muted-foreground">Fisioterapia</span>
        </span>
      )}
    </Link>
  );
}

export function Sidebar({ initialCollapsed }: { initialCollapsed: boolean }) {
  const [collapsed, setCollapsed] = React.useState(initialCollapsed);
  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-border bg-sidebar transition-[width] duration-200 lg:flex",
        collapsed ? "w-16" : "w-64",
      )}
    >
      <div className={cn("flex h-14 items-center border-b border-border px-3", collapsed ? "justify-center" : "justify-between")}>
        <Brand collapsed={collapsed} />
        {!collapsed && (
          <button
            type="button"
            aria-label="Recolher menu"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-muted cursor-pointer"
            onClick={() => {
              setCollapsed(true);
              void setSidebarCollapsedAction(true);
            }}
          >
            <PanelLeftClose className="size-4" />
          </button>
        )}
      </div>
      {collapsed && (
        <button
          type="button"
          aria-label="Expandir menu"
          className="mx-auto mt-2 rounded-md p-1.5 text-muted-foreground hover:bg-surface-muted cursor-pointer"
          onClick={() => {
            setCollapsed(false);
            void setSidebarCollapsedAction(false);
          }}
        >
          <PanelLeftOpen className="size-4" />
        </button>
      )}
      <SidebarNav collapsed={collapsed} />
    </aside>
  );
}
