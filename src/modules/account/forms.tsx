"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, Loader2, LogOut, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox, Input, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { ThemeSwitcher } from "@/components/layout/theme";
import { changePasswordAction, deleteAccountAction, removeAvatarAction, signOutEverywhereAction, updatePreferencesAction, updateProfileAction, uploadAvatarAction } from "./actions";

const PROFILE_FIELDS = [
  { name: "full_name", label: "Nome completo" },
  { name: "institution", label: "Instituição de ensino" },
  { name: "course", label: "Curso" },
  { name: "current_period", label: "Período atual" },
  { name: "city", label: "Cidade" },
  { name: "lattes_url", label: "Link do Lattes" },
  { name: "linkedin_url", label: "LinkedIn" },
] as const;

export function ProfileForm({ initial }: { initial: Record<string, string | null> }) {
  const router = useRouter();
  const [v, setV] = React.useState<Record<string, string>>(Object.fromEntries([...PROFILE_FIELDS.map((f) => f.name), "bio"].map((k) => [k, initial[k] ?? ""])));
  const [busy, setBusy] = React.useState(false);
  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true);
      const r = await updateProfileAction(v);
      setBusy(false);
      if (!r.ok) return void toast.error(r.error);
      toast.success("Perfil atualizado.");
      router.refresh();
    }}>
      {PROFILE_FIELDS.map((f) => (
        <div key={f.name} className="space-y-1.5"><Label htmlFor={`p-${f.name}`}>{f.label}</Label><Input id={`p-${f.name}`} value={v[f.name]} type={f.name.endsWith("url") ? "url" : "text"} onChange={(e) => setV({ ...v, [f.name]: e.target.value })} /></div>
      ))}
      <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="p-bio">Apresentação (usada no currículo)</Label><Textarea id="p-bio" maxLength={2000} value={v.bio} onChange={(e) => setV({ ...v, bio: e.target.value })} /></div>
      <div className="sm:col-span-2"><Button type="submit" disabled={busy}>{busy && <Loader2 className="animate-spin" />} Salvar perfil</Button></div>
    </form>
  );
}

export function AvatarForm({ url }: { url: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  return (
    <div className="flex items-center gap-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img src={url} alt="Foto de perfil" className="size-16 rounded-full object-cover" /> : <div className="flex size-16 items-center justify-center rounded-full bg-surface-muted text-xs text-muted-foreground">Sem foto</div>}
      <form action={async (fd) => { setBusy(true); const r = await uploadAvatarAction(fd); setBusy(false); if (!r.ok) toast.error(r.error); else { toast.success("Foto atualizada."); router.refresh(); } }} className="flex flex-wrap items-center gap-2">
        <input type="file" name="avatar" accept="image/png,image/jpeg" className="text-sm" aria-label="Selecionar foto" />
        <Button type="submit" variant="outline" size="sm" disabled={busy}>{busy && <Loader2 className="animate-spin" />} Enviar</Button>
        {url && <Button variant="ghost" size="sm" onClick={async () => { await removeAvatarAction(); router.refresh(); }}>Remover</Button>}
      </form>
    </div>
  );
}

type Prefs = {
  theme: "light" | "dark" | "system";
  notification_prefs: Record<string, boolean>;
  calendar_prefs: { week_starts_on: 0 | 1; default_view: "month" | "week" | "day" };
  srs_settings: { initial_ease: number; min_ease: number; easy_bonus: number; hard_interval_factor: number; max_interval_days: number; first_intervals: [number, number] };
};

const NOTIF_LABELS: Record<string, string> = { prazos: "Prazos próximos", provas: "Provas", tarefas_atrasadas: "Tarefas atrasadas", convites: "Convites recebidos", liga: "Atividades da liga", projetos: "Atualizações em projetos", revisoes: "Lembretes de revisão", metas: "Metas" };

export function PreferencesForm({ initial }: { initial: Prefs }) {
  const router = useRouter();
  const [v, setV] = React.useState<Prefs>(initial);
  const [busy, setBusy] = React.useState(false);
  const srs = v.srs_settings;
  const setSrs = (patch: Partial<Prefs["srs_settings"]>) => setV({ ...v, srs_settings: { ...srs, ...patch } });
  return (
    <form className="space-y-8" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true);
      const r = await updatePreferencesAction(v);
      setBusy(false);
      if (!r.ok) return void toast.error(r.error);
      toast.success("Preferências salvas e sincronizadas entre dispositivos.");
      router.refresh();
    }}>
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Aparência</h2>
        <p className="text-xs text-muted-foreground">O tema é salvo no seu perfil e aplicado em todos os seus dispositivos.</p>
        <ThemeSwitcher />
      </section>
      <section id="notificacoes" className="space-y-2">
        <h2 className="text-sm font-semibold">Notificações</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {Object.entries(NOTIF_LABELS).map(([k, l]) => (
            <label key={k} className="flex items-center gap-2 text-sm"><Checkbox checked={v.notification_prefs[k] !== false} onChange={(e) => setV({ ...v, notification_prefs: { ...v.notification_prefs, [k]: e.target.checked } })} /> {l}</label>
          ))}
        </div>
      </section>
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Calendário</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="cal-week">Semana começa em</Label><NativeSelect id="cal-week" value={v.calendar_prefs.week_starts_on} onChange={(e) => setV({ ...v, calendar_prefs: { ...v.calendar_prefs, week_starts_on: Number(e.target.value) as 0 | 1 } })}><option value={0}>Domingo</option><option value={1}>Segunda-feira</option></NativeSelect></div>
          <div className="space-y-1.5"><Label htmlFor="cal-view">Visualização padrão</Label><NativeSelect id="cal-view" value={v.calendar_prefs.default_view} onChange={(e) => setV({ ...v, calendar_prefs: { ...v.calendar_prefs, default_view: e.target.value as "month" } })}><option value="month">Mês</option><option value="week">Semana</option><option value="day">Dia</option></NativeSelect></div>
        </div>
      </section>
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Estudos — revisão espaçada</h2>
        <p className="text-xs text-muted-foreground">Parâmetros do algoritmo (variação do SM-2). Valores fora dos limites são ajustados automaticamente.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5"><Label htmlFor="srs-1">1º intervalo (dias)</Label><Input id="srs-1" type="number" min={1} max={30} value={srs.first_intervals[0]} onChange={(e) => setSrs({ first_intervals: [Number(e.target.value) || 1, srs.first_intervals[1]] })} /></div>
          <div className="space-y-1.5"><Label htmlFor="srs-2">2º intervalo (dias)</Label><Input id="srs-2" type="number" min={1} max={90} value={srs.first_intervals[1]} onChange={(e) => setSrs({ first_intervals: [srs.first_intervals[0], Number(e.target.value) || 6] })} /></div>
          <div className="space-y-1.5"><Label htmlFor="srs-max">Intervalo máximo (dias)</Label><Input id="srs-max" type="number" min={7} max={3650} value={srs.max_interval_days} onChange={(e) => setSrs({ max_interval_days: Number(e.target.value) || 365 })} /></div>
          <div className="space-y-1.5"><Label htmlFor="srs-min">Facilidade mínima</Label><Input id="srs-min" type="number" step="0.05" min={1.1} max={2.5} value={srs.min_ease} onChange={(e) => setSrs({ min_ease: Number(e.target.value) || 1.3 })} /></div>
          <div className="space-y-1.5"><Label htmlFor="srs-easy">Bônus “Fácil”</Label><Input id="srs-easy" type="number" step="0.05" min={1} max={3} value={srs.easy_bonus} onChange={(e) => setSrs({ easy_bonus: Number(e.target.value) || 1.3 })} /></div>
          <div className="space-y-1.5"><Label htmlFor="srs-hard">Fator “Difícil”</Label><Input id="srs-hard" type="number" step="0.05" min={1} max={2} value={srs.hard_interval_factor} onChange={(e) => setSrs({ hard_interval_factor: Number(e.target.value) || 1.2 })} /></div>
        </div>
      </section>
      <Button type="submit" disabled={busy}>{busy && <Loader2 className="animate-spin" />} Salvar preferências</Button>
    </form>
  );
}

export function PasswordForm() {
  const [p, setP] = React.useState("");
  const [c, setC] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  return (
    <form className="grid gap-3 sm:grid-cols-3 sm:items-end" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true);
      const r = await changePasswordAction(p, c);
      setBusy(false);
      if (!r.ok) return void toast.error(r.error);
      toast.success("Senha alterada.");
      setP(""); setC("");
    }}>
      <div className="space-y-1.5"><Label htmlFor="np">Nova senha</Label><Input id="np" type="password" autoComplete="new-password" value={p} onChange={(e) => setP(e.target.value)} /></div>
      <div className="space-y-1.5"><Label htmlFor="cp">Confirmar</Label><Input id="cp" type="password" autoComplete="new-password" value={c} onChange={(e) => setC(e.target.value)} /></div>
      <Button type="submit" disabled={busy || !p}>{busy && <Loader2 className="animate-spin" />} Alterar senha</Button>
    </form>
  );
}

export function SessionActions() {
  const router = useRouter();
  return (
    <div className="flex flex-wrap gap-2">
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- download de arquivo (rota de API), não navegação */}
      <a href="/api/export" className={buttonVariants({ variant: "outline" })}><Download /> Exportar meus dados (JSON)</a>
      <Button variant="outline" onClick={async () => { await signOutEverywhereAction(); router.push("/login"); }}><LogOut /> Sair de todos os dispositivos</Button>
    </div>
  );
}

export function DeleteAccount({ email }: { email: string }) {
  const router = useRouter();
  const [v, setV] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  return (
    <Dialog>
      <DialogTrigger asChild><Button variant="danger"><Trash2 /> Excluir minha conta</Button></DialogTrigger>
      <DialogContent title="Excluir conta" description="Seu perfil, workspace pessoal, workspaces de que você é proprietário, arquivos e conversas serão excluídos permanentemente. Exporte seus dados antes, se desejar.">
        <div className="space-y-3">
          <Label htmlFor="del-email">Digite seu e-mail (<strong>{email}</strong>) para confirmar</Label>
          <Input id="del-email" value={v} onChange={(e) => setV(e.target.value)} />
          <div className="flex justify-end gap-2">
            <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
            <Button variant="danger" disabled={busy || v.trim().toLowerCase() !== email.toLowerCase()} onClick={async () => {
              setBusy(true);
              const r = await deleteAccountAction(v);
              setBusy(false);
              if (!r.ok) return void toast.error(r.error);
              router.push("/login");
            }}>{busy && <Loader2 className="animate-spin" />} Excluir definitivamente</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
