export interface NavItem {
  label: string;
  href: string;
  icon: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    label: "Visão geral",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: "LayoutDashboard" },
      { label: "Minha semana", href: "/semana", icon: "CalendarCheck" },
      { label: "Notificações", href: "/notificacoes", icon: "Bell" },
      { label: "Assistente acadêmico", href: "/assistente", icon: "Sparkles" },
    ],
  },
  {
    label: "Organização acadêmica",
    items: [
      { label: "Biblioteca acadêmica", href: "/biblioteca", icon: "Library" },
      { label: "Disciplinas", href: "/disciplinas", icon: "BookOpen" },
      { label: "Caderno de estudos", href: "/caderno", icon: "NotebookPen" },
      { label: "Flashcards", href: "/flashcards", icon: "Layers" },
      { label: "Banco de questões", href: "/questoes", icon: "CircleHelp" },
      { label: "Simulados", href: "/simulados", icon: "Timer" },
      { label: "Agenda acadêmica", href: "/agenda", icon: "CalendarDays" },
      { label: "Tarefas", href: "/tarefas", icon: "ListChecks" },
      { label: "Avaliações e provas", href: "/provas", icon: "ClipboardCheck" },
      { label: "Trabalhos e projetos", href: "/projetos", icon: "KanbanSquare" },
      { label: "Metas acadêmicas", href: "/metas-academicas", icon: "Flag" },
      { label: "Desempenho acadêmico", href: "/desempenho", icon: "ChartLine" },
      { label: "Semestres", href: "/semestres", icon: "CalendarRange" },
      { label: "Professores", href: "/professores", icon: "UserRound" },
    ],
  },
  {
    label: "Pesquisa científica",
    items: [
      { label: "Central de pesquisa", href: "/pesquisa", icon: "Microscope" },
      { label: "Artigos científicos", href: "/artigos", icon: "FileText" },
      { label: "Fichamentos", href: "/fichamentos", icon: "ScrollText" },
      { label: "Coleções de artigos", href: "/colecoes", icon: "Library" },
      { label: "Projetos de pesquisa", href: "/projetos-pesquisa", icon: "FlaskConical" },
      { label: "Referências bibliográficas", href: "/referencias", icon: "Quote" },
    ],
  },
  {
    label: "Conhecimento em Fisioterapia",
    items: [
      { label: "Banco de patologias", href: "/patologias", icon: "Activity" },
      { label: "Atlas anatômico", href: "/atlas", icon: "Bone" },
      { label: "Banco de exercícios", href: "/exercicios", icon: "Dumbbell" },
      { label: "Testes especiais", href: "/testes", icon: "Stethoscope" },
      { label: "Avaliação fisioterapêutica", href: "/avaliacao-fisioterapeutica", icon: "ClipboardList" },
      { label: "Farmacologia", href: "/farmacologia", icon: "Pill" },
      { label: "Protocolos clínicos", href: "/protocolos", icon: "ClipboardCheck" },
      { label: "Glossário técnico", href: "/glossario", icon: "BookA" },
      { label: "Calculadoras", href: "/calculadoras", icon: "Calculator" },
    ],
  },
  {
    label: "Prática clínica",
    items: [
      { label: "Casos clínicos", href: "/casos-clinicos", icon: "HeartPulse" },
      { label: "Avaliações", href: "/avaliacoes-clinicas", icon: "ClipboardPlus" },
      { label: "Planejamento terapêutico", href: "/planejamento-terapeutico", icon: "Target" },
      { label: "Intervenções", href: "/intervencoes", icon: "HandHeart" },
      { label: "Evoluções", href: "/evolucoes", icon: "TrendingUp" },
      { label: "Biblioteca de condutas", href: "/condutas", icon: "BookMarked" },
    ],
  },
  {
    label: "Liga acadêmica",
    items: [
      { label: "Painel da liga", href: "/liga", icon: "Network" },
      { label: "Traumatologia", href: "/liga/regioes?foco=traumatologia", icon: "Bone" },
      { label: "Ortopedia", href: "/liga/regioes?foco=ortopedia", icon: "Activity" },
      { label: "Membros", href: "/liga-membros", icon: "Users" },
      { label: "Reuniões", href: "/liga-reunioes", icon: "Users" },
      { label: "Aulas e palestras", href: "/liga-aulas", icon: "Presentation" },
      { label: "Eventos e congressos", href: "/liga-eventos", icon: "Ticket" },
      { label: "Projetos e atividades", href: "/liga-projetos", icon: "FolderKanban" },
      { label: "Certificados", href: "/liga-certificados", icon: "Award" },
    ],
  },
  {
    label: "Desenvolvimento profissional",
    items: [
      { label: "Estágios", href: "/estagios", icon: "Hospital" },
      { label: "Experiências", href: "/experiencias", icon: "Briefcase" },
      { label: "Horas complementares", href: "/horas-complementares", icon: "Clock" },
      { label: "Certificados e cursos", href: "/certificados", icon: "Award" },
      { label: "Currículo", href: "/curriculo", icon: "FileUser" },
      { label: "Lattes", href: "/lattes", icon: "IdCard" },
      { label: "Portfólio", href: "/portfolio", icon: "BriefcaseBusiness" },
      { label: "Metas profissionais", href: "/metas-profissionais", icon: "Rocket" },
    ],
  },
  {
    label: "Sistema",
    items: [
      { label: "Workspaces", href: "/workspaces", icon: "Users" },
      { label: "Configurações", href: "/configuracoes", icon: "Settings" },
      { label: "Perfil", href: "/perfil", icon: "User" },
      { label: "Gerenciamento de arquivos", href: "/arquivos", icon: "Files" },
      { label: "Segurança e privacidade", href: "/seguranca", icon: "ShieldCheck" },
    ],
  },
];

export const MOBILE_NAV: NavItem[] = [
  { label: "Início", href: "/dashboard", icon: "LayoutDashboard" },
  { label: "Agenda", href: "/agenda", icon: "CalendarDays" },
  { label: "Buscar", href: "/busca", icon: "Search" },
  { label: "IA", href: "/assistente", icon: "Sparkles" },
];
