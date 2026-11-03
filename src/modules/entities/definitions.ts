/**
 * Registro central das entidades da Central Acadêmica.
 *
 * Este arquivo é a FONTE ÚNICA de verdade para:
 *  - colunas das tabelas de conteúdo (o SQL em supabase/migrations/0002_entities.sql
 *    é gerado a partir daqui por scripts/generate-entity-sql.ts);
 *  - schemas de validação Zod (cliente e servidor);
 *  - formulários, listas, filtros e páginas de detalhe genéricas.
 *
 * Mantenha este arquivo livre de imports para que possa ser executado
 * diretamente pelo Node (type stripping) no script gerador.
 */

export type FieldType =
  | "text"
  | "textarea"
  | "longtext"
  | "number"
  | "integer"
  | "date"
  | "datetime"
  | "boolean"
  | "select"
  | "tags"
  | "url"
  | "email"
  | "reference"
  | "checklist"
  | "options";

export interface Option {
  value: string;
  label: string;
}

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: readonly Option[];
  /** Para type=reference: chave (tabela) da entidade referenciada. */
  reference?: string;
  /** Regra de exclusão da FK (padrão: set null). */
  onDelete?: "cascade" | "set null";
  min?: number;
  max?: number;
  maxLength?: number;
  placeholder?: string;
  help?: string;
  section?: string;
  default?: string | number | boolean;
  /** Exibir como coluna na listagem. */
  list?: boolean;
  /** Disponível como filtro na listagem. */
  filter?: boolean;
  /** Ocupa a largura total no formulário. */
  wide?: boolean;
}

export interface EntityDef {
  /** Nome da tabela no PostgreSQL. */
  key: string;
  /** Segmento de rota (português). */
  slug: string;
  singular: string;
  plural: string;
  /** Nome do ícone lucide (resolvido na camada de UI). */
  icon: string;
  description: string;
  titleField: string;
  subtitleField?: string;
  /** Campos indexados na busca global (além do título). */
  searchFields: string[];
  fields: FieldDef[];
  favorites?: boolean;
  /** Campo de data usado para ordenação/agenda. */
  dateField?: string;
  statusField?: string;
  defaultSort?: { field: string; ascending: boolean };
  /** Aviso exibido no topo de formulário/detalhe. */
  notice?: { title: string; body: string; tone: "info" | "warning" };
  /** Entidade "filha": exibida dentro do registro pai. */
  parent?: { field: string; entity: string };
  /** Restrições SQL adicionais (CHECK) – nome => expressão. */
  checks?: Record<string, string>;
  /** Colunas SQL adicionais gerenciadas pelo sistema (não editáveis no formulário). */
  systemColumns?: string[];
  /** Regras extras de validação: campos condicionalmente obrigatórios. */
  requires?: { when: string; equals?: unknown; notEmpty?: boolean; then: string; message: string }[];
}

/* ------------------------------------------------------------------ */
/* Opções compartilhadas                                                */
/* ------------------------------------------------------------------ */

const o = (value: string, label: string): Option => ({ value, label });

export const STUDY_STATUS = [
  o("nao_estudado", "Não estudado"),
  o("em_andamento", "Em andamento"),
  o("estudado", "Estudado"),
  o("revisar", "Revisar"),
] as const;

export const READING_STATUS = [
  o("nao_lido", "Não lido"),
  o("em_leitura", "Em leitura"),
  o("lido", "Lido"),
  o("revisar", "Revisar"),
] as const;

export const SPECIALTIES = [
  o("traumato_ortopedia", "Traumato-ortopedia"),
  o("neurofuncional", "Neurofuncional"),
  o("cardiovascular", "Cardiovascular"),
  o("respiratoria", "Respiratória"),
  o("esportiva", "Esportiva"),
  o("pediatrica", "Pediátrica"),
  o("gerontologia", "Gerontologia"),
  o("saude_mulher", "Saúde da mulher"),
  o("outra", "Outra"),
] as const;

export const BODY_REGIONS = [
  o("ombro", "Ombro"),
  o("cotovelo", "Cotovelo"),
  o("punho_mao", "Punho e mão"),
  o("coluna_cervical", "Coluna cervical"),
  o("coluna_toracica", "Coluna torácica"),
  o("coluna_lombar", "Coluna lombar"),
  o("quadril", "Quadril"),
  o("joelho", "Joelho"),
  o("tornozelo_pe", "Tornozelo e pé"),
  o("cabeca_pescoco", "Cabeça e pescoço"),
  o("torax", "Tórax"),
  o("sistemica", "Sistêmica / geral"),
] as const;

export const MASTERY = [
  o("iniciante", "Iniciante"),
  o("basico", "Básico"),
  o("intermediario", "Intermediário"),
  o("avancado", "Avançado"),
] as const;

export const PRIORITY = [
  o("baixa", "Baixa"),
  o("media", "Média"),
  o("alta", "Alta"),
  o("urgente", "Urgente"),
] as const;

export const AGENDA_CATEGORIES = [
  o("aula", "Aula"),
  o("prova", "Prova"),
  o("trabalho", "Trabalho"),
  o("pesquisa", "Pesquisa"),
  o("liga", "Liga"),
  o("estagio", "Estágio"),
  o("pessoal", "Pessoal"),
] as const;

export const PROJECT_STATUS = [
  o("nao_iniciado", "Não iniciado"),
  o("em_andamento", "Em andamento"),
  o("em_revisao", "Em revisão"),
  o("concluido", "Concluído"),
] as const;

export const DIFFICULTY = [o("facil", "Fácil"), o("medio", "Médio"), o("dificil", "Difícil")] as const;

const REFS = "Referências (cite fontes verificáveis)";

/* ------------------------------------------------------------------ */
/* Helpers de campo                                                     */
/* ------------------------------------------------------------------ */

type Extra = Partial<FieldDef>;
const text = (name: string, label: string, extra: Extra = {}): FieldDef => ({ name, label, type: "text", ...extra });
const area = (name: string, label: string, extra: Extra = {}): FieldDef => ({ name, label, type: "textarea", wide: true, ...extra });
const long = (name: string, label: string, extra: Extra = {}): FieldDef => ({ name, label, type: "longtext", wide: true, ...extra });
const sel = (name: string, label: string, options: readonly Option[], extra: Extra = {}): FieldDef => ({ name, label, type: "select", options, ...extra });
const ref = (name: string, label: string, reference: string, extra: Extra = {}): FieldDef => ({ name, label, type: "reference", reference, ...extra });
const date = (name: string, label: string, extra: Extra = {}): FieldDef => ({ name, label, type: "date", ...extra });
const dt = (name: string, label: string, extra: Extra = {}): FieldDef => ({ name, label, type: "datetime", ...extra });
const int = (name: string, label: string, extra: Extra = {}): FieldDef => ({ name, label, type: "integer", ...extra });
const num = (name: string, label: string, extra: Extra = {}): FieldDef => ({ name, label, type: "number", ...extra });
const bool = (name: string, label: string, extra: Extra = {}): FieldDef => ({ name, label, type: "boolean", ...extra });
const url = (name: string, label: string, extra: Extra = {}): FieldDef => ({ name, label, type: "url", ...extra });
const tags = (name = "tags", label = "Tags"): FieldDef => ({ name, label, type: "tags", wide: true });

/* ------------------------------------------------------------------ */
/* Entidades                                                            */
/* ------------------------------------------------------------------ */

export const ENTITIES: EntityDef[] = [
  /* ---------------- Organização acadêmica ---------------- */
  {
    key: "semesters",
    slug: "semestres",
    singular: "Semestre",
    plural: "Semestres",
    icon: "CalendarRange",
    description: "Períodos letivos do curso.",
    titleField: "name",
    subtitleField: "period",
    searchFields: ["notes"],
    defaultSort: { field: "start_date", ascending: false },
    fields: [
      text("name", "Nome", { required: true, placeholder: "Ex.: 5º semestre", list: true, maxLength: 120 }),
      int("year", "Ano", { min: 1990, max: 2100, list: true }),
      text("period", "Período", { placeholder: "Ex.: 2026.1", list: true }),
      date("start_date", "Início", { list: true }),
      date("end_date", "Término"),
      bool("is_current", "Semestre atual", { list: true }),
      area("notes", "Observações"),
    ],
    checks: { semesters_dates: "end_date is null or start_date is null or end_date >= start_date" },
  },
  {
    key: "professors",
    slug: "professores",
    singular: "Professor",
    plural: "Professores",
    icon: "UserRound",
    description: "Docentes das disciplinas.",
    titleField: "name",
    subtitleField: "department",
    searchFields: ["department", "notes"],
    defaultSort: { field: "name", ascending: true },
    fields: [
      text("name", "Nome", { required: true, list: true, maxLength: 160 }),
      { name: "email", label: "E-mail institucional", type: "email", list: true },
      text("department", "Departamento / área", { list: true }),
      area("notes", "Observações"),
    ],
  },
  {
    key: "subjects",
    slug: "disciplinas",
    singular: "Disciplina",
    plural: "Disciplinas",
    icon: "BookOpen",
    description: "Disciplinas, ementas, materiais e progresso de aprendizagem.",
    titleField: "name",
    subtitleField: "code",
    searchFields: ["code", "syllabus", "bibliography", "notes"],
    favorites: true,
    statusField: "study_status",
    defaultSort: { field: "name", ascending: true },
    fields: [
      text("name", "Nome", { required: true, list: true, maxLength: 200 }),
      text("code", "Código", { list: true }),
      ref("semester_id", "Semestre", "semesters", { list: true, filter: true }),
      ref("professor_id", "Professor", "professors", { list: true }),
      int("workload_hours", "Carga horária (h)", { min: 0, max: 2000, list: true }),
      sel("study_status", "Status de estudo", STUDY_STATUS, { default: "nao_estudado", list: true, filter: true }),
      int("learning_progress", "Progresso de aprendizagem (%)", { min: 0, max: 100, default: 0 }),
      num("final_grade", "Nota final", { min: 0, max: 100 }),
      long("syllabus", "Ementa"),
      long("bibliography", "Bibliografia"),
      area("notes", "Observações"),
      tags(),
    ],
  },
  {
    key: "library_folders",
    slug: "pastas",
    singular: "Pasta",
    plural: "Pastas",
    icon: "Folder",
    description: "Pastas e subpastas da biblioteca.",
    titleField: "name",
    searchFields: ["description"],
    defaultSort: { field: "name", ascending: true },
    fields: [
      text("name", "Nome", { required: true, list: true, maxLength: 160 }),
      ref("parent_id", "Pasta superior", "library_folders", { onDelete: "cascade" }),
      ref("subject_id", "Disciplina", "subjects", { list: true }),
      area("description", "Descrição"),
    ],
  },
  {
    key: "study_notes",
    slug: "caderno",
    singular: "Anotação",
    plural: "Caderno de estudos",
    icon: "NotebookPen",
    description: "Anotações, resumos, mapas mentais e perguntas por disciplina.",
    titleField: "title",
    subtitleField: "topic",
    searchFields: ["topic", "content"],
    favorites: true,
    statusField: "study_status",
    defaultSort: { field: "updated_at", ascending: false },
    fields: [
      text("title", "Título", { required: true, list: true, maxLength: 200 }),
      ref("subject_id", "Disciplina", "subjects", { list: true, filter: true }),
      text("topic", "Assunto", { list: true }),
      sel(
        "note_type",
        "Tipo",
        [o("anotacao", "Anotação"), o("resumo", "Resumo"), o("mapa_mental", "Mapa mental"), o("perguntas_respostas", "Perguntas e respostas")],
        { default: "anotacao", list: true, filter: true },
      ),
      sel("study_status", "Status", STUDY_STATUS, { default: "em_andamento", list: true, filter: true }),
      long("content", "Conteúdo", { help: "Aceita texto com formatação Markdown simples." }),
      url("external_url", "Link externo"),
      tags(),
    ],
  },
  {
    key: "events",
    slug: "eventos",
    singular: "Evento",
    plural: "Eventos da agenda",
    icon: "CalendarDays",
    description: "Aulas, provas, prazos, reuniões e compromissos.",
    titleField: "title",
    subtitleField: "location",
    searchFields: ["location", "description"],
    dateField: "start_at",
    defaultSort: { field: "start_at", ascending: true },
    fields: [
      text("title", "Título", { required: true, list: true, maxLength: 200 }),
      sel("category", "Categoria", AGENDA_CATEGORIES, { required: true, default: "aula", list: true, filter: true }),
      dt("start_at", "Início", { required: true, list: true }),
      dt("end_at", "Término"),
      bool("all_day", "Dia inteiro"),
      text("location", "Local"),
      sel("priority", "Prioridade", PRIORITY, { default: "media", list: true, filter: true }),
      sel(
        "recurrence",
        "Recorrência",
        [o("nenhuma", "Não se repete"), o("diaria", "Diária"), o("semanal", "Semanal"), o("mensal", "Mensal")],
        { default: "nenhuma" },
      ),
      date("recurrence_until", "Repetir até"),
      int("reminder_minutes", "Lembrete (minutos antes)", { min: 0, max: 40320 }),
      ref("subject_id", "Disciplina", "subjects"),
      ref("project_id", "Projeto", "projects"),
      area("description", "Descrição"),
    ],
    checks: { events_dates: "end_at is null or end_at >= start_at" },
  },
  {
    key: "tasks",
    slug: "tarefas",
    singular: "Tarefa",
    plural: "Tarefas",
    icon: "ListChecks",
    description: "Lista de tarefas com prazos, prioridades e vínculos.",
    titleField: "title",
    searchFields: ["description"],
    dateField: "due_at",
    statusField: "status",
    defaultSort: { field: "due_at", ascending: true },
    fields: [
      text("title", "Título", { required: true, list: true, maxLength: 200 }),
      area("description", "Descrição"),
      dt("due_at", "Prazo", { list: true }),
      sel("priority", "Prioridade", PRIORITY, { default: "media", list: true, filter: true }),
      sel("category", "Categoria", AGENDA_CATEGORIES, { default: "trabalho", list: true, filter: true }),
      sel(
        "status",
        "Status",
        [o("pendente", "Pendente"), o("em_andamento", "Em andamento"), o("concluida", "Concluída"), o("cancelada", "Cancelada")],
        { default: "pendente", list: true, filter: true },
      ),
      ref("subject_id", "Disciplina", "subjects", { filter: true }),
      ref("project_id", "Projeto", "projects"),
    ],
    systemColumns: ["completed_at timestamptz"],
  },
  {
    key: "assessments",
    slug: "provas",
    singular: "Avaliação",
    plural: "Avaliações e provas",
    icon: "ClipboardCheck",
    description: "Provas, avaliações práticas, notas e conteúdos cobrados.",
    titleField: "title",
    searchFields: ["content", "notes"],
    dateField: "assessment_date",
    statusField: "status",
    defaultSort: { field: "assessment_date", ascending: true },
    fields: [
      text("title", "Título", { required: true, list: true, maxLength: 200 }),
      ref("subject_id", "Disciplina", "subjects", { list: true, filter: true }),
      sel(
        "assessment_type",
        "Tipo",
        [o("prova", "Prova"), o("trabalho", "Trabalho"), o("seminario", "Seminário"), o("pratica", "Avaliação prática"), o("osce", "OSCE"), o("outro", "Outro")],
        { default: "prova", list: true, filter: true },
      ),
      dt("assessment_date", "Data", { list: true }),
      sel(
        "status",
        "Status",
        [o("agendada", "Agendada"), o("realizada", "Realizada"), o("cancelada", "Cancelada")],
        { default: "agendada", list: true, filter: true },
      ),
      num("weight", "Peso", { min: 0, max: 100 }),
      num("max_score", "Nota máxima", { min: 0, max: 1000, default: 10 }),
      num("score", "Nota obtida", { min: 0, max: 1000, list: true }),
      long("content", "Conteúdos cobrados"),
      area("notes", "Observações"),
    ],
    checks: { assessments_score: "score is null or max_score is null or score <= max_score" },
  },

  /* ---------------- Pesquisa científica ---------------- */
  {
    key: "articles",
    slug: "artigos",
    singular: "Artigo",
    plural: "Artigos científicos",
    icon: "FileText",
    description: "Gerenciamento de artigos, leitura crítica e fichamentos.",
    titleField: "title",
    subtitleField: "authors",
    searchFields: ["authors", "doi", "journal", "keywords", "knowledge_area", "objective", "results", "conclusion"],
    favorites: true,
    statusField: "reading_status",
    defaultSort: { field: "created_at", ascending: false },
    fields: [
      text("title", "Título", { required: true, list: true, maxLength: 500, section: "Metadados" }),
      area("authors", "Autores", { placeholder: "SOBRENOME, Nome; SOBRENOME, Nome", help: "Separe autores com ponto e vírgula.", section: "Metadados" }),
      int("year", "Ano", { min: 1800, max: 2100, list: true, filter: true, section: "Metadados" }),
      text("doi", "DOI", { placeholder: "10.xxxx/xxxxx", section: "Metadados" }),
      text("journal", "Revista", { list: true, section: "Metadados" }),
      text("volume", "Volume", { section: "Metadados" }),
      text("issue", "Número", { section: "Metadados" }),
      text("pages", "Páginas", { placeholder: "Ex.: 120-134", section: "Metadados" }),
      url("url", "URL", { section: "Metadados" }),
      tags("keywords", "Palavras-chave"),
      text("knowledge_area", "Área de conhecimento", { filter: true, section: "Metadados" }),
      sel(
        "study_type",
        "Tipo de estudo",
        [
          o("ensaio_clinico_randomizado", "Ensaio clínico randomizado"),
          o("revisao_sistematica", "Revisão sistemática"),
          o("meta_analise", "Metanálise"),
          o("coorte", "Coorte"),
          o("caso_controle", "Caso-controle"),
          o("transversal", "Transversal"),
          o("relato_caso", "Relato de caso"),
          o("revisao_narrativa", "Revisão narrativa"),
          o("revisao_integrativa", "Revisão integrativa"),
          o("qualitativo", "Estudo qualitativo"),
          o("diretriz", "Diretriz clínica"),
          o("outro", "Outro"),
        ],
        { filter: true, list: true, section: "Metadados" },
      ),
      sel("reading_status", "Status de leitura", READING_STATUS, { default: "nao_lido", list: true, filter: true, section: "Leitura" }),
      date("read_date", "Data de leitura", { section: "Leitura" }),
      area("objective", "Objetivo", { section: "Leitura crítica" }),
      area("methodology", "Metodologia", { section: "Leitura crítica" }),
      area("sample", "Amostra", { section: "Leitura crítica" }),
      area("results", "Resultados", { section: "Leitura crítica" }),
      area("conclusion", "Conclusão", { section: "Leitura crítica" }),
      area("limitations", "Limitações", { section: "Leitura crítica" }),
      long("critical_analysis", "Análise crítica pessoal", { section: "Leitura crítica" }),
      tags(),
    ],
  },
  {
    key: "article_collections",
    slug: "colecoes",
    singular: "Coleção",
    plural: "Coleções de artigos",
    icon: "Library",
    description: "Agrupe artigos por tema, projeto ou disciplina.",
    titleField: "name",
    searchFields: ["description"],
    defaultSort: { field: "name", ascending: true },
    fields: [text("name", "Nome", { required: true, list: true, maxLength: 160 }), area("description", "Descrição", { list: true })],
  },
  {
    key: "article_notes",
    slug: "fichamentos",
    singular: "Fichamento",
    plural: "Fichamentos",
    icon: "ScrollText",
    description: "Fichamentos científicos vinculados aos artigos.",
    titleField: "title",
    searchFields: ["content", "page_reference"],
    parent: { field: "article_id", entity: "articles" },
    defaultSort: { field: "updated_at", ascending: false },
    fields: [
      ref("article_id", "Artigo", "articles", { required: true, onDelete: "cascade", list: true, filter: true }),
      text("title", "Título", { required: true, list: true, maxLength: 200 }),
      sel(
        "note_type",
        "Tipo de fichamento",
        [o("resumo", "Resumo"), o("citacao", "Citação"), o("comentario", "Comentário"), o("bibliografico", "Bibliográfico")],
        { default: "resumo", list: true, filter: true },
      ),
      text("page_reference", "Página(s) de referência"),
      long("content", "Conteúdo", { required: true }),
      tags(),
    ],
  },
  {
    key: "citations",
    slug: "referencias",
    singular: "Referência",
    plural: "Referências bibliográficas",
    icon: "Quote",
    description: "Referências em ABNT geradas apenas a partir dos metadados informados.",
    titleField: "title",
    subtitleField: "authors",
    searchFields: ["authors", "source", "formatted_reference"],
    defaultSort: { field: "created_at", ascending: false },
    fields: [
      sel(
        "reference_type",
        "Tipo",
        [o("artigo", "Artigo de periódico"), o("livro", "Livro"), o("capitulo", "Capítulo de livro"), o("site", "Página da web"), o("tese", "Tese / dissertação / TCC"), o("outro", "Outro")],
        { default: "artigo", required: true, list: true, filter: true },
      ),
      ref("article_id", "Artigo de origem", "articles"),
      area("authors", "Autores", { placeholder: "SOBRENOME, Nome; SOBRENOME, Nome" }),
      text("title", "Título", { required: true, list: true, maxLength: 500 }),
      text("subtitle", "Subtítulo"),
      text("source", "Revista / obra / site", { list: true }),
      text("edition", "Edição"),
      text("place", "Local de publicação"),
      text("publisher", "Editora / instituição"),
      text("volume", "Volume"),
      text("issue", "Número"),
      text("pages", "Páginas"),
      int("year", "Ano", { min: 1500, max: 2100, list: true }),
      text("doi", "DOI"),
      url("url", "URL"),
      date("access_date", "Data de acesso"),
      long("formatted_reference", "Referência formatada (revisável)", { help: "Gerada a partir dos metadados acima. Revise manualmente antes de usar." }),
    ],
  },

  /* ---------------- Conhecimento em Fisioterapia ---------------- */
  {
    key: "pathologies",
    slug: "patologias",
    singular: "Patologia",
    plural: "Banco de patologias",
    icon: "Activity",
    description: "Enciclopédia pessoal de condições clínicas.",
    titleField: "name",
    subtitleField: "specialty",
    searchFields: ["definition", "etiology", "signs_symptoms", "clinical_picture", "related_anatomy", "differential_diagnosis"],
    favorites: true,
    statusField: "study_status",
    defaultSort: { field: "name", ascending: true },
    notice: {
      title: "Conteúdo educacional",
      body: "Registre evidências apenas com fontes verificáveis. Conteúdo gerado por IA deve indicar fonte e data de consulta.",
      tone: "info",
    },
    fields: [
      text("name", "Nome", { required: true, list: true, maxLength: 200, section: "Identificação" }),
      sel("specialty", "Especialidade", SPECIALTIES, { list: true, filter: true, section: "Identificação" }),
      sel("body_region", "Região anatômica", BODY_REGIONS, { list: true, filter: true, section: "Identificação" }),
      sel("mastery_level", "Nível de domínio", MASTERY, { default: "iniciante", list: true, filter: true, section: "Identificação" }),
      sel("study_status", "Status de estudo", STUDY_STATUS, { default: "nao_estudado", filter: true, section: "Identificação" }),
      area("definition", "Definição", { section: "Fundamentos" }),
      area("epidemiology", "Epidemiologia", { section: "Fundamentos" }),
      area("etiology", "Etiologia", { section: "Fundamentos" }),
      area("risk_factors", "Fatores de risco", { section: "Fundamentos" }),
      area("pathophysiology", "Fisiopatologia", { section: "Fundamentos" }),
      area("related_anatomy", "Anatomia relacionada", { section: "Fundamentos" }),
      area("signs_symptoms", "Sinais e sintomas", { section: "Clínica" }),
      area("clinical_picture", "Quadro clínico", { section: "Clínica" }),
      area("differential_diagnosis", "Diagnóstico diferencial", { section: "Clínica" }),
      area("pt_assessment", "Avaliação fisioterapêutica", { section: "Avaliação" }),
      area("specific_tests", "Testes específicos", { section: "Avaliação" }),
      area("scales", "Escalas", { section: "Avaliação" }),
      area("kinetic_functional_diagnosis", "Diagnóstico cinético-funcional", { section: "Avaliação" }),
      area("therapeutic_goals", "Objetivos terapêuticos", { section: "Tratamento" }),
      long("conservative_treatment", "Tratamento conservador", { section: "Tratamento" }),
      long("postoperative_treatment", "Tratamento pós-operatório", { section: "Tratamento" }),
      area("exercises_notes", "Exercícios", { section: "Tratamento" }),
      long("scientific_evidence", "Evidências científicas", { section: "Evidências" }),
      long("references_text", REFS, { section: "Evidências" }),
      tags(),
    ],
  },
  {
    key: "anatomical_structures",
    slug: "atlas",
    singular: "Estrutura anatômica",
    plural: "Atlas anatômico",
    icon: "Bone",
    description: "Ossos, músculos, articulações, nervos e ligamentos.",
    titleField: "name",
    subtitleField: "structure_type",
    searchFields: ["origin", "insertion", "action", "innervation", "description"],
    defaultSort: { field: "name", ascending: true },
    fields: [
      text("name", "Nome", { required: true, list: true, maxLength: 200 }),
      sel(
        "structure_type",
        "Tipo",
        [o("osso", "Osso"), o("musculo", "Músculo"), o("articulacao", "Articulação"), o("nervo", "Nervo"), o("ligamento", "Ligamento"), o("tendao", "Tendão"), o("outro", "Outro")],
        { required: true, default: "musculo", list: true, filter: true },
      ),
      sel("body_region", "Região", BODY_REGIONS, { list: true, filter: true }),
      area("origin", "Origem"),
      area("insertion", "Inserção"),
      area("action", "Ação"),
      area("innervation", "Inervação"),
      area("anatomical_relations", "Relações anatômicas"),
      long("description", "Descrição"),
      long("references_text", REFS),
      tags(),
    ],
  },
  {
    key: "exercises",
    slug: "exercicios",
    singular: "Exercício",
    plural: "Banco de exercícios",
    icon: "Dumbbell",
    description: "Exercícios terapêuticos com prescrição, progressões e precauções.",
    titleField: "name",
    subtitleField: "therapeutic_goal",
    searchFields: ["therapeutic_goal", "muscles", "execution", "indications", "joint"],
    favorites: true,
    defaultSort: { field: "name", ascending: true },
    fields: [
      text("name", "Nome", { required: true, list: true, maxLength: 200, section: "Identificação" }),
      sel(
        "category",
        "Categoria / tipo",
        [
          o("fortalecimento", "Fortalecimento"),
          o("alongamento", "Alongamento"),
          o("mobilidade", "Mobilidade"),
          o("propriocepcao", "Propriocepção"),
          o("equilibrio", "Equilíbrio"),
          o("aerobico", "Aeróbico"),
          o("funcional", "Funcional"),
          o("respiratorio", "Respiratório"),
          o("neuromotor", "Neuromotor"),
          o("pliometria", "Pliometria"),
          o("outro", "Outro"),
        ],
        { list: true, filter: true, section: "Identificação" },
      ),
      text("therapeutic_goal", "Objetivo terapêutico", { filter: true, section: "Identificação" }),
      sel("body_region", "Região anatômica", BODY_REGIONS, { list: true, filter: true, section: "Identificação" }),
      text("joint", "Articulação", { section: "Identificação" }),
      text("muscle_group", "Grupo muscular", { filter: true, section: "Identificação" }),
      area("muscles", "Músculos envolvidos", { section: "Identificação" }),
      sel(
        "rehab_phase",
        "Fase de reabilitação",
        [
          o("aguda", "Aguda / proteção"),
          o("subaguda", "Subaguda"),
          o("remodelamento", "Remodelamento"),
          o("retorno_funcional", "Retorno funcional"),
          o("retorno_esporte", "Retorno ao esporte"),
          o("manutencao", "Manutenção"),
        ],
        { list: true, filter: true, section: "Identificação" },
      ),
      area("starting_position", "Posição inicial", { section: "Execução" }),
      long("execution", "Execução", { section: "Execução" }),
      int("sets", "Séries", { min: 0, max: 100, section: "Prescrição" }),
      text("repetitions", "Repetições", { section: "Prescrição" }),
      text("duration", "Duração", { section: "Prescrição" }),
      text("load", "Carga", { section: "Prescrição" }),
      area("progressions", "Progressões", { section: "Prescrição" }),
      area("regressions", "Regressões", { section: "Prescrição" }),
      area("indications", "Indicações", { section: "Segurança" }),
      area("contraindications", "Contraindicações", { section: "Segurança" }),
      area("precautions", "Precauções", { section: "Segurança" }),
      url("video_url", "Vídeo (URL)", { section: "Mídia" }),
      long("references_text", REFS, { section: "Mídia" }),
      tags(),
    ],
  },
  {
    key: "clinical_tests",
    slug: "testes",
    singular: "Teste",
    plural: "Testes especiais",
    icon: "Stethoscope",
    description: "Testes ortopédicos, neurológicos, funcionais, escalas e medidas.",
    titleField: "name",
    subtitleField: "objective",
    searchFields: ["objective", "indications", "execution", "interpretation"],
    favorites: true,
    defaultSort: { field: "name", ascending: true },
    fields: [
      text("name", "Nome", { required: true, list: true, maxLength: 200 }),
      sel(
        "test_category",
        "Categoria",
        [
          o("ortopedico", "Teste ortopédico"),
          o("neurologico", "Teste neurológico"),
          o("funcional", "Teste funcional"),
          o("cardiovascular", "Teste cardiovascular"),
          o("respiratorio", "Teste respiratório"),
          o("postural", "Avaliação postural"),
          o("goniometria", "Goniometria"),
          o("forca", "Avaliação de força"),
          o("escala_dor", "Escala de dor"),
          o("escala_funcional", "Escala funcional"),
        ],
        { required: true, default: "ortopedico", list: true, filter: true },
      ),
      sel("body_region", "Região", BODY_REGIONS, { list: true, filter: true }),
      sel("mastery_level", "Nível de domínio", MASTERY, { default: "iniciante", filter: true }),
      area("objective", "Objetivo"),
      area("indications", "Indicações"),
      area("patient_position", "Posicionamento do paciente"),
      area("therapist_position", "Posicionamento do fisioterapeuta"),
      long("execution", "Execução"),
      long("interpretation", "Interpretação"),
      num("sensitivity", "Sensibilidade (%)", { min: 0, max: 100, help: "Preencha somente com fonte verificável." }),
      num("specificity", "Especificidade (%)", { min: 0, max: 100, help: "Preencha somente com fonte verificável." }),
      area("accuracy_source", "Fonte da acurácia diagnóstica"),
      area("limitations", "Limitações"),
      url("video_url", "Vídeo (URL)"),
      long("references_text", REFS),
      tags(),
    ],
    checks: {
      clinical_tests_accuracy_source:
        "(sensitivity is null and specificity is null) or coalesce(length(trim(accuracy_source)), 0) > 0",
    },
    requires: [
      { when: "sensitivity", notEmpty: true, then: "accuracy_source", message: "Informe a fonte da sensibilidade." },
      { when: "specificity", notEmpty: true, then: "accuracy_source", message: "Informe a fonte da especificidade." },
    ],
  },
  {
    key: "protocols",
    slug: "protocolos",
    singular: "Protocolo",
    plural: "Protocolos clínicos",
    icon: "ClipboardList",
    description: "Protocolos com etapas, indicações e data de atualização.",
    titleField: "name",
    subtitleField: "objective",
    searchFields: ["objective", "indications", "steps"],
    defaultSort: { field: "name", ascending: true },
    fields: [
      text("name", "Nome", { required: true, list: true, maxLength: 200 }),
      sel("specialty", "Especialidade", SPECIALTIES, { list: true, filter: true }),
      area("objective", "Objetivo"),
      area("indications", "Indicações"),
      long("steps", "Etapas"),
      long("references_text", REFS),
      date("reviewed_at", "Data de atualização", { list: true }),
      tags(),
    ],
  },
  {
    key: "medications",
    slug: "farmacologia",
    singular: "Medicamento",
    plural: "Farmacologia",
    icon: "Pill",
    description: "Classes, mecanismos e efeitos relevantes para a Fisioterapia.",
    titleField: "name",
    subtitleField: "drug_class",
    searchFields: ["drug_class", "mechanism_of_action", "pt_relevant_effects"],
    defaultSort: { field: "name", ascending: true },
    notice: {
      title: "Uso exclusivamente acadêmico",
      body: "Este módulo não fornece orientação de prescrição individualizada. Consulte sempre fontes oficiais e profissionais habilitados.",
      tone: "warning",
    },
    fields: [
      text("name", "Medicamento", { required: true, list: true, maxLength: 200 }),
      text("drug_class", "Classe", { list: true, filter: true }),
      area("mechanism_of_action", "Mecanismo de ação"),
      area("pt_relevant_effects", "Efeitos relevantes para a Fisioterapia"),
      area("precautions", "Precauções"),
      long("references_text", REFS),
      tags(),
    ],
  },
  {
    key: "glossary_terms",
    slug: "glossario",
    singular: "Termo",
    plural: "Glossário técnico",
    icon: "BookA",
    description: "Termos técnicos com definição, exemplo e referência.",
    titleField: "term",
    subtitleField: "category",
    searchFields: ["definition", "example"],
    defaultSort: { field: "term", ascending: true },
    fields: [
      text("term", "Termo", { required: true, list: true, maxLength: 200 }),
      long("definition", "Definição", { required: true }),
      text("category", "Categoria", { list: true, filter: true }),
      area("example", "Exemplo"),
      area("reference", "Referência"),
    ],
  },

  /* ---------------- Prática clínica ---------------- */
  {
    key: "clinical_cases",
    slug: "casos-clinicos",
    singular: "Caso clínico",
    plural: "Casos clínicos",
    icon: "HeartPulse",
    description: "Casos acadêmicos anonimizados: avaliação, planejamento e reflexão.",
    titleField: "case_code",
    subtitleField: "title",
    searchFields: ["title", "chief_complaint", "clinical_findings", "kinetic_functional_diagnosis", "therapeutic_plan"],
    statusField: "status",
    defaultSort: { field: "case_date", ascending: false },
    notice: {
      title: "Confidencialidade e minimização de dados",
      body: "Registre somente informações anonimizadas. Não insira nome, documento, endereço, telefone, data de nascimento, fotos de rosto ou qualquer dado que identifique o paciente. Este módulo é um registro acadêmico e não é um prontuário clínico profissional certificado.",
      tone: "warning",
    },
    fields: [
      text("case_code", "Código do caso", { required: true, list: true, maxLength: 40, placeholder: "Ex.: CC-2026-001", section: "A. Identificação anonimizada" }),
      text("title", "Título descritivo", { list: true, maxLength: 200, placeholder: "Ex.: Dor anterior no joelho em corredor", section: "A. Identificação anonimizada" }),
      date("case_date", "Data", { list: true, section: "A. Identificação anonimizada" }),
      sel(
        "age_range",
        "Faixa etária",
        [o("0-11", "0–11 anos"), o("12-17", "12–17 anos"), o("18-29", "18–29 anos"), o("30-44", "30–44 anos"), o("45-59", "45–59 anos"), o("60-74", "60–74 anos"), o("75+", "75 anos ou mais")],
        { section: "A. Identificação anonimizada" },
      ),
      sel("sex", "Sexo (somente se necessário)", [o("nao_informado", "Não informado"), o("feminino", "Feminino"), o("masculino", "Masculino"), o("outro", "Outro")], {
        default: "nao_informado",
        section: "A. Identificação anonimizada",
      }),
      sel(
        "context",
        "Contexto",
        [o("estagio", "Estágio"), o("aula", "Aula prática"), o("liga", "Liga acadêmica"), o("literatura", "Caso da literatura"), o("simulado", "Caso simulado")],
        { list: true, filter: true, section: "A. Identificação anonimizada" },
      ),
      sel("specialty", "Especialidade", SPECIALTIES, { filter: true, section: "A. Identificação anonimizada" }),
      sel("status", "Status", [o("em_andamento", "Em andamento"), o("concluido", "Concluído"), o("arquivado", "Arquivado")], {
        default: "em_andamento",
        list: true,
        filter: true,
        section: "A. Identificação anonimizada",
      }),
      bool("is_real_case", "Caso real (atendimento)", { section: "A. Identificação anonimizada" }),
      bool("anonymization_confirmed", "Confirmo que os dados estão anonimizados", { section: "A. Identificação anonimizada" }),
      area("chief_complaint", "Queixa principal", { section: "B. Avaliação" }),
      area("hda", "História da doença atual", { section: "B. Avaliação" }),
      area("hpp", "História patológica pregressa", { section: "B. Avaliação" }),
      area("family_history", "Histórico familiar (quando pertinente)", { section: "B. Avaliação" }),
      area("inspection", "Inspeção", { section: "B. Avaliação" }),
      area("palpation", "Palpação", { section: "B. Avaliação" }),
      area("range_of_motion", "Amplitude de movimento", { section: "B. Avaliação" }),
      area("muscle_strength", "Força muscular", { section: "B. Avaliação" }),
      area("functional_assessment", "Avaliação funcional", { section: "B. Avaliação" }),
      area("special_tests", "Testes especiais", { section: "B. Avaliação" }),
      area("scales", "Escalas", { section: "B. Avaliação" }),
      area("clinical_findings", "Achados clínicos", { section: "B. Avaliação" }),
      area("kinetic_functional_diagnosis", "Diagnóstico cinético-funcional", { section: "C. Planejamento" }),
      area("identified_problems", "Problemas identificados", { section: "C. Planejamento" }),
      area("short_term_goals", "Objetivos de curto prazo", { section: "C. Planejamento" }),
      area("long_term_goals", "Objetivos de longo prazo", { section: "C. Planejamento" }),
      long("therapeutic_plan", "Plano terapêutico", { section: "C. Planejamento" }),
      long("scientific_justification", "Justificativas científicas", { section: "C. Planejamento" }),
      long("critical_reflection", "Reflexão crítica", { section: "E. Evolução e reflexão" }),
      tags(),
    ],
    checks: { clinical_cases_anonymized: "not is_real_case or anonymization_confirmed" },
    requires: [
      { when: "is_real_case", equals: true, then: "anonymization_confirmed", message: "Casos reais exigem confirmação de anonimização." },
    ],
  },
  {
    key: "clinical_assessments",
    slug: "avaliacoes-clinicas",
    singular: "Avaliação clínica",
    plural: "Avaliações clínicas",
    icon: "ClipboardPlus",
    description: "Avaliações iniciais, reavaliações e altas vinculadas a casos.",
    titleField: "title",
    searchFields: ["findings", "tests_applied", "scales_results"],
    parent: { field: "case_id", entity: "clinical_cases" },
    dateField: "assessment_date",
    defaultSort: { field: "assessment_date", ascending: false },
    fields: [
      ref("case_id", "Caso clínico", "clinical_cases", { required: true, onDelete: "cascade", list: true, filter: true }),
      text("title", "Título", { required: true, list: true, maxLength: 200 }),
      date("assessment_date", "Data", { list: true }),
      sel("assessment_type", "Tipo", [o("inicial", "Avaliação inicial"), o("reavaliacao", "Reavaliação"), o("alta", "Alta")], {
        default: "reavaliacao",
        list: true,
        filter: true,
      }),
      area("findings", "Achados"),
      area("range_of_motion", "Amplitude de movimento"),
      area("muscle_strength", "Força muscular"),
      area("functional_assessment", "Avaliação funcional"),
      area("tests_applied", "Testes aplicados"),
      area("scales_results", "Escalas e resultados"),
      area("notes", "Observações"),
    ],
  },
  {
    key: "clinical_plans",
    slug: "planejamento-terapeutico",
    singular: "Plano terapêutico",
    plural: "Planejamento terapêutico",
    icon: "Target",
    description: "Planos terapêuticos com objetivos e justificativas.",
    titleField: "title",
    searchFields: ["diagnosis", "plan", "justification"],
    parent: { field: "case_id", entity: "clinical_cases" },
    statusField: "status",
    defaultSort: { field: "start_date", ascending: false },
    fields: [
      ref("case_id", "Caso clínico", "clinical_cases", { required: true, onDelete: "cascade", list: true, filter: true }),
      text("title", "Título", { required: true, list: true, maxLength: 200 }),
      date("start_date", "Início", { list: true }),
      sel("status", "Status", [o("ativo", "Ativo"), o("revisado", "Revisado"), o("encerrado", "Encerrado")], { default: "ativo", list: true, filter: true }),
      area("diagnosis", "Diagnóstico cinético-funcional"),
      area("problems", "Problemas identificados"),
      area("short_term_goals", "Objetivos de curto prazo"),
      area("long_term_goals", "Objetivos de longo prazo"),
      long("plan", "Plano terapêutico"),
      long("justification", "Justificativas científicas"),
    ],
  },
  {
    key: "clinical_interventions",
    slug: "intervencoes",
    singular: "Intervenção",
    plural: "Intervenções",
    icon: "HandHeart",
    description: "Técnicas, exercícios e parâmetros aplicados em cada caso.",
    titleField: "technique",
    searchFields: ["description", "response"],
    parent: { field: "case_id", entity: "clinical_cases" },
    dateField: "intervention_date",
    defaultSort: { field: "intervention_date", ascending: false },
    fields: [
      ref("case_id", "Caso clínico", "clinical_cases", { required: true, onDelete: "cascade", list: true, filter: true }),
      text("technique", "Técnica", { required: true, list: true, maxLength: 200 }),
      ref("exercise_id", "Exercício do banco", "exercises", { list: true }),
      date("intervention_date", "Data", { list: true }),
      area("description", "Descrição"),
      int("sets", "Séries", { min: 0, max: 100 }),
      text("repetitions", "Repetições"),
      text("load", "Carga"),
      text("frequency", "Frequência"),
      area("progression", "Progressões"),
      area("response", "Resposta à intervenção"),
    ],
  },
  {
    key: "clinical_evolutions",
    slug: "evolucoes",
    singular: "Evolução",
    plural: "Evoluções",
    icon: "TrendingUp",
    description: "Registros de evolução, resultados, ajustes e reflexões.",
    titleField: "title",
    searchFields: ["description", "results", "adjustments", "reflection"],
    parent: { field: "case_id", entity: "clinical_cases" },
    dateField: "evolution_date",
    defaultSort: { field: "evolution_date", ascending: false },
    fields: [
      ref("case_id", "Caso clínico", "clinical_cases", { required: true, onDelete: "cascade", list: true, filter: true }),
      text("title", "Título", { required: true, list: true, maxLength: 200 }),
      date("evolution_date", "Data", { required: true, list: true }),
      long("description", "Registro de evolução"),
      area("results", "Resultados"),
      area("adjustments", "Ajustes"),
      area("reflection", "Reflexão crítica"),
    ],
  },
  {
    key: "clinical_conducts",
    slug: "condutas",
    singular: "Conduta",
    plural: "Biblioteca de condutas",
    icon: "BookMarked",
    description: "Condutas terapêuticas reutilizáveis com parâmetros e referências.",
    titleField: "name",
    subtitleField: "objective",
    searchFields: ["objective", "description", "indications"],
    defaultSort: { field: "name", ascending: true },
    fields: [
      text("name", "Nome", { required: true, list: true, maxLength: 200 }),
      sel("specialty", "Especialidade", SPECIALTIES, { list: true, filter: true }),
      area("objective", "Objetivo"),
      long("description", "Descrição"),
      area("parameters", "Parâmetros"),
      area("indications", "Indicações"),
      area("contraindications", "Contraindicações"),
      long("references_text", REFS),
      tags(),
    ],
  },

  /* ---------------- Estudos ---------------- */
  {
    key: "flashcards",
    slug: "flashcards",
    singular: "Flashcard",
    plural: "Flashcards",
    icon: "Layers",
    description: "Cartões de memorização com revisão espaçada.",
    titleField: "front",
    subtitleField: "topic",
    searchFields: ["back", "topic"],
    defaultSort: { field: "next_review_at", ascending: true },
    fields: [
      long("front", "Frente", { required: true, list: true }),
      long("back", "Verso", { required: true }),
      ref("subject_id", "Disciplina", "subjects", { list: true, filter: true }),
      text("topic", "Assunto", { list: true, filter: true }),
      sel("difficulty", "Nível de dificuldade", DIFFICULTY, { default: "medio", list: true, filter: true }),
    ],
    systemColumns: [
      "ease_factor numeric(4,2) not null default 2.5",
      "interval_days integer not null default 0",
      "repetitions_count integer not null default 0",
      "next_review_at timestamptz not null default now()",
      "last_reviewed_at timestamptz",
      "correct_count integer not null default 0",
      "wrong_count integer not null default 0",
    ],
  },
  {
    key: "questions",
    slug: "questoes",
    singular: "Questão",
    plural: "Banco de questões",
    icon: "CircleHelp",
    description: "Questões objetivas e discursivas para simulados.",
    titleField: "statement",
    subtitleField: "topic",
    searchFields: ["topic", "explanation", "expected_answer"],
    defaultSort: { field: "created_at", ascending: false },
    fields: [
      long("statement", "Enunciado", { required: true, list: true }),
      sel("question_type", "Tipo", [o("objetiva", "Objetiva"), o("discursiva", "Discursiva")], { required: true, default: "objetiva", list: true, filter: true }),
      ref("subject_id", "Disciplina", "subjects", { list: true, filter: true }),
      text("topic", "Assunto", { list: true, filter: true }),
      sel("difficulty", "Dificuldade", DIFFICULTY, { default: "medio", filter: true }),
      { name: "options", label: "Alternativas", type: "options", wide: true, help: "Marque a alternativa correta (apenas questões objetivas)." },
      int("correct_option", "Alternativa correta (índice)", { min: 0, max: 9 }),
      long("expected_answer", "Resposta esperada (discursiva)"),
      long("explanation", "Comentário / explicação"),
      area("source", "Fonte"),
    ],
    checks: {
      questions_objective_has_answer:
        "question_type <> 'objetiva' or (jsonb_array_length(coalesce(options, '[]'::jsonb)) >= 2 and correct_option is not null and correct_option < jsonb_array_length(options))",
    },
  },
  {
    key: "study_goals",
    slug: "metas-academicas",
    singular: "Meta acadêmica",
    plural: "Metas acadêmicas",
    icon: "Flag",
    description: "Metas de estudo com etapas e progresso.",
    titleField: "title",
    searchFields: ["description"],
    statusField: "status",
    dateField: "target_date",
    defaultSort: { field: "target_date", ascending: true },
    fields: [
      text("title", "Meta", { required: true, list: true, maxLength: 200 }),
      area("description", "Descrição"),
      ref("subject_id", "Disciplina", "subjects", { list: true }),
      date("target_date", "Prazo", { list: true }),
      int("progress", "Progresso (%)", { min: 0, max: 100, default: 0, list: true }),
      sel("status", "Status", [o("ativa", "Ativa"), o("concluida", "Concluída"), o("pausada", "Pausada")], { default: "ativa", list: true, filter: true }),
      { name: "steps", label: "Etapas", type: "checklist", wide: true },
    ],
  },

  /* ---------------- Projetos ---------------- */
  {
    key: "projects",
    slug: "projetos",
    singular: "Projeto",
    plural: "Trabalhos e projetos",
    icon: "KanbanSquare",
    description: "Trabalhos acadêmicos, seminários e projetos científicos.",
    titleField: "name",
    subtitleField: "project_type",
    searchFields: ["description", "objective", "responsible", "notes"],
    statusField: "status",
    dateField: "due_date",
    favorites: true,
    defaultSort: { field: "due_date", ascending: true },
    fields: [
      text("name", "Nome", { required: true, list: true, maxLength: 200 }),
      sel(
        "project_type",
        "Tipo",
        [
          o("trabalho_academico", "Trabalho acadêmico"),
          o("seminario", "Seminário"),
          o("projeto_cientifico", "Projeto científico"),
          o("projeto_pesquisa", "Projeto de pesquisa"),
          o("revisao_integrativa", "Revisão integrativa"),
          o("revisao_sistematica", "Revisão sistemática"),
          o("artigo_original", "Artigo original"),
          o("relatorio", "Relatório"),
          o("apresentacao", "Apresentação"),
          o("resumo_cientifico", "Resumo científico"),
          o("extensao", "Projeto de extensão"),
          o("tcc", "TCC"),
        ],
        { required: true, default: "trabalho_academico", list: true, filter: true },
      ),
      sel("status", "Status", PROJECT_STATUS, { default: "nao_iniciado", list: true, filter: true }),
      ref("subject_id", "Disciplina", "subjects"),
      area("description", "Descrição"),
      area("objective", "Objetivo"),
      text("responsible", "Responsáveis"),
      date("start_date", "Data de início"),
      date("due_date", "Prazo", { list: true }),
      long("references_text", "Referências"),
      area("notes", "Observações"),
      tags(),
    ],
    checks: { projects_dates: "due_date is null or start_date is null or due_date >= start_date" },
  },

  /* ---------------- Liga acadêmica ---------------- */
  {
    key: "league_members",
    slug: "liga-membros",
    singular: "Membro da liga",
    plural: "Membros da liga",
    icon: "Users",
    description: "Membros e cargos da liga acadêmica.",
    titleField: "name",
    subtitleField: "position",
    searchFields: ["position", "notes"],
    statusField: "status",
    defaultSort: { field: "name", ascending: true },
    fields: [
      text("name", "Nome", { required: true, list: true, maxLength: 160 }),
      sel(
        "position",
        "Cargo",
        [
          o("presidente", "Presidente"),
          o("vice_presidente", "Vice-presidente"),
          o("secretario", "Secretário(a)"),
          o("tesoureiro", "Tesoureiro(a)"),
          o("diretor_cientifico", "Diretor(a) científico(a)"),
          o("diretor_extensao", "Diretor(a) de extensão"),
          o("diretor_marketing", "Diretor(a) de comunicação"),
          o("orientador", "Orientador(a)"),
          o("membro", "Membro"),
        ],
        { default: "membro", list: true, filter: true },
      ),
      { name: "email", label: "E-mail", type: "email" },
      text("course_period", "Período do curso", { list: true }),
      date("joined_at", "Data de ingresso"),
      sel("status", "Status", [o("ativo", "Ativo"), o("inativo", "Inativo")], { default: "ativo", list: true, filter: true }),
      area("notes", "Observações"),
    ],
  },
  {
    key: "league_activities",
    slug: "liga-atividades",
    singular: "Atividade da liga",
    plural: "Atividades da liga",
    icon: "Presentation",
    description: "Reuniões, aulas, palestras, eventos, congressos e projetos.",
    titleField: "title",
    subtitleField: "speaker",
    searchFields: ["speaker", "description", "minutes", "location"],
    dateField: "starts_at",
    statusField: "status",
    defaultSort: { field: "starts_at", ascending: false },
    fields: [
      text("title", "Título", { required: true, list: true, maxLength: 200 }),
      sel(
        "activity_type",
        "Tipo",
        [
          o("reuniao", "Reunião"),
          o("aula", "Aula"),
          o("palestra", "Palestra"),
          o("discussao_artigo", "Discussão de artigo"),
          o("evento", "Evento"),
          o("congresso", "Congresso"),
          o("projeto_cientifico", "Projeto científico"),
          o("projeto_extensao", "Projeto de extensão"),
          o("outro", "Outra atividade"),
        ],
        { required: true, default: "reuniao", list: true, filter: true },
      ),
      dt("starts_at", "Início", { list: true }),
      dt("ends_at", "Término"),
      text("location", "Local"),
      text("speaker", "Palestrante / responsável"),
      sel("body_region", "Região anatômica abordada", BODY_REGIONS, { filter: true }),
      sel("status", "Status", [o("planejada", "Planejada"), o("realizada", "Realizada"), o("cancelada", "Cancelada")], {
        default: "planejada",
        list: true,
        filter: true,
      }),
      num("hours", "Carga horária (h)", { min: 0, max: 1000 }),
      area("description", "Descrição / objetivos"),
      long("minutes", "Ata / registro"),
      area("attendees", "Participantes"),
    ],
    checks: { league_activities_dates: "ends_at is null or starts_at is null or ends_at >= starts_at" },
  },

  /* ---------------- Desenvolvimento profissional ---------------- */
  {
    key: "internships",
    slug: "estagios",
    singular: "Estágio",
    plural: "Estágios",
    icon: "Hospital",
    description: "Estágios, supervisão, horas, competências e reflexões.",
    titleField: "institution",
    subtitleField: "area",
    searchFields: ["location", "supervisor", "area", "activities", "competencies"],
    statusField: "status",
    defaultSort: { field: "start_date", ascending: false },
    fields: [
      text("institution", "Instituição", { required: true, list: true, maxLength: 200 }),
      text("location", "Local / setor", { list: true }),
      sel("area", "Área", SPECIALTIES, { list: true, filter: true }),
      text("supervisor", "Supervisor(a)"),
      date("start_date", "Início", { list: true }),
      date("end_date", "Término"),
      num("planned_hours", "Horas previstas", { min: 0, max: 5000, list: true }),
      sel("status", "Status", [o("planejado", "Planejado"), o("em_andamento", "Em andamento"), o("concluido", "Concluído")], {
        default: "em_andamento",
        list: true,
        filter: true,
      }),
      long("activities", "Atividades"),
      area("competencies", "Competências desenvolvidas"),
      area("difficulties", "Dificuldades"),
      long("reflections", "Reflexões"),
    ],
    checks: { internships_dates: "end_date is null or start_date is null or end_date >= start_date" },
  },
  {
    key: "internship_logs",
    slug: "registros-estagio",
    singular: "Registro de estágio",
    plural: "Registros de estágio",
    icon: "NotebookTabs",
    description: "Diário de horas e atividades do estágio.",
    titleField: "summary",
    searchFields: ["activities", "reflections"],
    parent: { field: "internship_id", entity: "internships" },
    dateField: "log_date",
    defaultSort: { field: "log_date", ascending: false },
    fields: [
      ref("internship_id", "Estágio", "internships", { required: true, onDelete: "cascade", list: true, filter: true }),
      text("summary", "Resumo do dia", { required: true, list: true, maxLength: 200 }),
      date("log_date", "Data", { required: true, list: true }),
      num("hours", "Horas cumpridas", { required: true, min: 0, max: 24, list: true }),
      long("activities", "Atividades"),
      area("reflections", "Reflexões"),
    ],
  },
  {
    key: "certificates",
    slug: "certificados",
    singular: "Certificado",
    plural: "Certificados e cursos",
    icon: "Award",
    description: "Cursos, eventos, monitorias e demais certificados.",
    titleField: "title",
    subtitleField: "institution",
    searchFields: ["institution", "notes"],
    dateField: "issue_date",
    defaultSort: { field: "issue_date", ascending: false },
    fields: [
      text("title", "Título", { required: true, list: true, maxLength: 200 }),
      sel(
        "certificate_type",
        "Tipo",
        [
          o("curso", "Curso"),
          o("congresso", "Congresso"),
          o("evento", "Evento"),
          o("palestra", "Palestra"),
          o("monitoria", "Monitoria"),
          o("extensao", "Extensão"),
          o("liga", "Liga acadêmica"),
          o("estagio", "Estágio"),
          o("publicacao", "Publicação"),
          o("apresentacao", "Apresentação de trabalho"),
          o("outro", "Outro"),
        ],
        { required: true, default: "curso", list: true, filter: true },
      ),
      text("institution", "Instituição emissora", { list: true }),
      date("issue_date", "Data de emissão", { list: true }),
      num("hours", "Carga horária (h)", { min: 0, max: 5000, list: true }),
      url("credential_url", "Link de verificação"),
      area("notes", "Observações"),
    ],
  },
  {
    key: "complementary_activities",
    slug: "horas-complementares",
    singular: "Atividade complementar",
    plural: "Horas complementares",
    icon: "Clock",
    description: "Controle de horas complementares por categoria.",
    titleField: "title",
    subtitleField: "institution",
    searchFields: ["institution", "notes"],
    dateField: "activity_date",
    statusField: "status",
    defaultSort: { field: "activity_date", ascending: false },
    fields: [
      text("title", "Atividade", { required: true, list: true, maxLength: 200 }),
      sel(
        "category",
        "Categoria",
        [o("ensino", "Ensino"), o("pesquisa", "Pesquisa"), o("extensao", "Extensão"), o("cultural", "Cultural / social"), o("representacao", "Representação estudantil"), o("outro", "Outro")],
        { required: true, default: "ensino", list: true, filter: true },
      ),
      date("activity_date", "Data", { list: true }),
      num("hours", "Horas", { required: true, min: 0, max: 2000, list: true }),
      text("institution", "Instituição"),
      ref("certificate_id", "Certificado", "certificates"),
      sel("status", "Status de validação", [o("pendente", "Pendente"), o("validada", "Validada"), o("rejeitada", "Rejeitada")], {
        default: "pendente",
        list: true,
        filter: true,
      }),
      area("notes", "Observações"),
    ],
  },
  {
    key: "portfolio_items",
    slug: "portfolio",
    singular: "Item do portfólio",
    plural: "Portfólio",
    icon: "BriefcaseBusiness",
    description: "Experiências, publicações, apresentações, monitorias e competências.",
    titleField: "title",
    subtitleField: "institution",
    searchFields: ["institution", "role", "description"],
    dateField: "start_date",
    defaultSort: { field: "start_date", ascending: false },
    fields: [
      text("title", "Título", { required: true, list: true, maxLength: 200 }),
      sel(
        "item_type",
        "Tipo",
        [
          o("experiencia", "Experiência"),
          o("formacao", "Formação"),
          o("curso", "Curso"),
          o("congresso", "Congresso"),
          o("monitoria", "Monitoria"),
          o("publicacao", "Publicação"),
          o("apresentacao", "Apresentação"),
          o("extensao", "Extensão"),
          o("competencia", "Competência"),
          o("idioma", "Idioma"),
          o("premio", "Prêmio / distinção"),
          o("outro", "Outro"),
        ],
        { required: true, default: "experiencia", list: true, filter: true },
      ),
      text("institution", "Instituição", { list: true }),
      text("role", "Função / papel"),
      date("start_date", "Início", { list: true }),
      date("end_date", "Término"),
      long("description", "Descrição"),
      url("url", "Link"),
      bool("include_in_cv", "Incluir no currículo", { default: true }),
    ],
  },
  {
    key: "professional_goals",
    slug: "metas-profissionais",
    singular: "Meta profissional",
    plural: "Metas profissionais",
    icon: "Rocket",
    description: "Objetivos de carreira com prazos, etapas e progresso.",
    titleField: "title",
    searchFields: ["description", "notes"],
    dateField: "deadline",
    statusField: "status",
    defaultSort: { field: "deadline", ascending: true },
    fields: [
      text("title", "Objetivo", { required: true, list: true, maxLength: 200 }),
      area("description", "Descrição"),
      date("deadline", "Prazo", { list: true }),
      int("progress", "Progresso (%)", { min: 0, max: 100, default: 0, list: true }),
      sel("status", "Status", [o("ativa", "Ativa"), o("concluida", "Concluída"), o("pausada", "Pausada")], { default: "ativa", list: true, filter: true }),
      { name: "steps", label: "Etapas", type: "checklist", wide: true },
      area("notes", "Observações"),
    ],
  },
];

/** Visões pré-filtradas de uma entidade, expostas como páginas próprias na navegação. */
export interface EntityView {
  slug: string;
  entity: string;
  title: string;
  description: string;
  icon: string;
  filter: { field: string; values: string[] };
  /** Valores pré-preenchidos ao criar a partir desta visão. */
  defaults: Record<string, string>;
}

export const ENTITY_VIEWS: EntityView[] = [
  {
    slug: "liga-reunioes",
    entity: "league_activities",
    title: "Reuniões",
    description: "Reuniões da liga, pautas e atas.",
    icon: "Users",
    filter: { field: "activity_type", values: ["reuniao"] },
    defaults: { activity_type: "reuniao" },
  },
  {
    slug: "liga-aulas",
    entity: "league_activities",
    title: "Aulas e palestras",
    description: "Aulas, palestras e discussões de artigos.",
    icon: "Presentation",
    filter: { field: "activity_type", values: ["aula", "palestra", "discussao_artigo"] },
    defaults: { activity_type: "aula" },
  },
  {
    slug: "liga-eventos",
    entity: "league_activities",
    title: "Eventos e congressos",
    description: "Eventos científicos e congressos.",
    icon: "Ticket",
    filter: { field: "activity_type", values: ["evento", "congresso"] },
    defaults: { activity_type: "evento" },
  },
  {
    slug: "liga-projetos",
    entity: "league_activities",
    title: "Projetos e atividades",
    description: "Projetos científicos, de extensão e outras atividades.",
    icon: "FolderKanban",
    filter: { field: "activity_type", values: ["projeto_cientifico", "projeto_extensao", "outro"] },
    defaults: { activity_type: "projeto_cientifico" },
  },
  {
    slug: "liga-certificados",
    entity: "certificates",
    title: "Certificados da liga",
    description: "Certificados emitidos por atividades da liga.",
    icon: "Award",
    filter: { field: "certificate_type", values: ["liga"] },
    defaults: { certificate_type: "liga" },
  },
  {
    slug: "projetos-pesquisa",
    entity: "projects",
    title: "Projetos de pesquisa",
    description: "Projetos científicos, revisões e artigos originais.",
    icon: "Microscope",
    filter: {
      field: "project_type",
      values: ["projeto_cientifico", "projeto_pesquisa", "revisao_integrativa", "revisao_sistematica", "artigo_original", "resumo_cientifico", "tcc"],
    },
    defaults: { project_type: "projeto_pesquisa" },
  },
  {
    slug: "experiencias",
    entity: "portfolio_items",
    title: "Experiências",
    description: "Experiências acadêmicas e profissionais.",
    icon: "Briefcase",
    filter: { field: "item_type", values: ["experiencia", "monitoria", "extensao"] },
    defaults: { item_type: "experiencia" },
  },
];

export const ENTITY_MAP: Record<string, EntityDef> = Object.fromEntries(ENTITIES.map((e) => [e.key, e]));
export const ENTITY_BY_SLUG: Record<string, EntityDef> = Object.fromEntries(ENTITIES.map((e) => [e.slug, e]));
export const VIEW_BY_SLUG: Record<string, EntityView> = Object.fromEntries(ENTITY_VIEWS.map((v) => [v.slug, v]));

export function getEntity(key: string): EntityDef {
  const e = ENTITY_MAP[key];
  if (!e) throw new Error(`Entidade desconhecida: ${key}`);
  return e;
}

export function optionLabel(field: FieldDef, value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  const opt = field.options?.find((op) => op.value === value);
  return opt ? opt.label : String(value);
}

/**
 * Tipos de entidade que podem participar de "Conteúdos relacionados" e da busca.
 * Inclui as entidades do registro + documentos (tabela especial).
 */
export const LINKABLE_TYPES = [...ENTITIES.map((e) => e.key), "documents"] as const;
