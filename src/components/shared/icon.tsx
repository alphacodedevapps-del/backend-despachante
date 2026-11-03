import {
  Activity, Award, Bell, Bone, BookA, BookMarked, BookOpen, Briefcase, BriefcaseBusiness, Calculator, CalendarCheck,
  CalendarDays, CalendarRange, CircleHelp, ClipboardCheck, ClipboardList, ClipboardPlus, Clock, Dumbbell, FileText,
  Files, Flag, FlaskConical, Folder, FolderKanban, GraduationCap, HandHeart, HeartPulse, Hospital, IdCard, KanbanSquare,
  Layers, LayoutDashboard, Library, ListChecks, Microscope, Network, NotebookPen, NotebookTabs, Pill, Presentation,
  Quote, Rocket, ScrollText, Search, Settings, ShieldCheck, Sparkles, Stethoscope, Target, Ticket, Timer, TrendingUp,
  User, UserRound, Users, Brain, Mail, FileUser, ChartLine, type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  Activity, Award, Bell, Bone, BookA, BookMarked, BookOpen, Briefcase, BriefcaseBusiness, Calculator, CalendarCheck,
  CalendarDays, CalendarRange, CircleHelp, ClipboardCheck, ClipboardList, ClipboardPlus, Clock, Dumbbell, FileText,
  Files, Flag, FlaskConical, Folder, FolderKanban, GraduationCap, HandHeart, HeartPulse, Hospital, IdCard, KanbanSquare,
  Layers, LayoutDashboard, Library, ListChecks, Microscope, Network, NotebookPen, NotebookTabs, Pill, Presentation,
  Quote, Rocket, ScrollText, Search, Settings, ShieldCheck, Sparkles, Stethoscope, Target, Ticket, Timer, TrendingUp,
  User, UserRound, Users, Brain, Mail, FileUser, ChartLine,
};

export function Icon({ name, className }: { name: string; className?: string }) {
  const C = ICONS[name] ?? FileText;
  return <C className={className} aria-hidden />;
}
