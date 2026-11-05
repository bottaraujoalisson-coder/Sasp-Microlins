export type ClassStatus = "INICIADO" | "NÃO INICIADO" | "FINALIZADO";
export type ShiftType = "Manhã" | "Tarde" | "Noite";
export type ModalityType = "Online" | "Presencial";

export interface StudentPerformanceRecord {
  id: number;
  contrato: string;
  aulaId: string;
  nomeCompleto: string;
  nomeCurto: string;
  telefoneAluno: string;
  whatsappAlunoUrl: string;
  nomeResponsavel: string;
  telefoneResponsavel: string;
  whatsappResponsavelUrl: string;
  formacao: string;
  curso: string;
  aulaInfo: string;
  aulaNumero: number;
  tipoMaterial: string;
  possuiApostila?: boolean;
  horario: string;
  horaInicio: string;
  horaFim: string;
  turno: ShiftType;
  sala: string;
  modalidade: ModalityType;
  inicio: string;
  fim: string;
  nota: number | null;
  notaId: string;
  infoAula: string;
  status: ClassStatus;
  presencaOuFalta?: "P" | "F" | "";
  statusSistema?: "PRESENCA" | "FALTA" | "NAO_INICIADA" | "NAO_REGISTRADO" | "";
  inadimplente: boolean;
  parcelasAtrasadas?: number;
  notaAulaNumero?: number | null;
  diaSemana?: string;
  semanaCode?: string;
  email?: string;
  linkLoginUrl?: string;
  cadId?: string;
  cadNome?: string;
  unidade?: string;
  municipio?: string;
  educador?: string;
  educadorCachedAt?: string;
  causaFaltaMaterialExplicita?: string;
  schoolId?: string;
  escolaCodigo?: string;
}

export const OFFICIAL_PORTAL_LOGIN_URL = "https://portaldoaluno.microlins.com.br/login/";

export const PORTAL_WEEKDAY_MAP: Record<string, string> = {
  "1": "Segunda-feira",
  "2": "Terça-feira",
  "3": "Quarta-feira",
  "4": "Quinta-feira",
  "5": "Sexta-feira",
  "6": "Sábado",
  "7": "Domingo"
};

export const PORTAL_WEEKDAY_LABEL_TO_CODE: Record<string, string> = {
  "Segunda-feira": "1",
  "Terça-feira": "2",
  "Quarta-feira": "3",
  "Quinta-feira": "4",
  "Sexta-feira": "5",
  "Sábado": "6",
  "Domingo": "7"
};

export const PORTAL_METADATA = {
  unidade: "ESCOLA PRESIDENTE PRUDENTE",
  usuarioLogin: "",
  usuarioNomeCompleto: "Coordenação Pedagógica",
  usuarioCargo: "Auxiliar Pedagógico",
  portalUrl: "https://portaldoaluno.microlins.com.br/login/",
  dataReferencia: "30/10/2026",
  horaExtracao: "20:30:00",
  diaSemana: "Sexta-feira",
  versaoPortal: "2026.07.21.6"
};

export type NpsOrigemType = "Portal do Aluno" | "E-mail";
export type NpsInvitationStatusType = "ativo" | "respondido" | "expirado";
export type NpsEmailDeliveryStatusType =
  | "Enviado"
  | "Entregue"
  | "Aberto"
  | "Não entregue"
  | "Em processamento";

export type NpsDestinatarioType = "ALUNO" | "RESPONSAVEL";
export type NpsNivelCruzamentoType =
  | "CONTRATO"
  | "NOME_ALUNO"
  | "NOME_RESPONSAVEL"
  | "EMAIL"
  | "NAO_ASSOCIADO";

export interface ActiveNpsInvitation {
  id: string;
  controlId: string;
  studentName: string;
  contrato: string;
  codigoPessoa: string;
  email: string;
  phone: string;
  actionName: string;
  pontoJornada: string;
  origem: NpsOrigemType;
  channel: "widget" | "email";
  invitationStatus: NpsInvitationStatusType;
  answered: boolean;
  createdAt: string;
  sentAt?: string;
  answeredAt?: string | null;
  attemptsCount?: number;
  totalStudentInvitations?: number;
  emailDeliveryStatus?: NpsEmailDeliveryStatusType;
  emailDeliveryEvents?: string[];
  emailLastEventAt?: string;
  emailBounceReason?: string;
  surveyUrl: string;
  npsDestinatario?: NpsDestinatarioType;
  nivelCruzamento?: NpsNivelCruzamentoType;
  respondenteNome?: string;
  respondenteVinculoLabel?: string;
  isVinculoFamiliarAmbiguo?: boolean;
  alunosVinculadosFamilia?: string[];
  contratosVinculadosFamilia?: string[];
  orientacaoAbordagemPresencial?: string;
  priorizarNpsNoLogin?: boolean;
  cicloPriorizado?: string;
  priorizadoPor?: string;
  priorizadoEm?: string;
  notaNps?: number | null;
  comentarioNps?: string | null;
  ultimoReenvioEmailEm?: string;
  ultimoReenvioEmailPor?: string;
  emailAnterior?: string;
  schoolId?: string;
  escolaCodigo?: string;
  unidade?: string;
}

function loadRecordsFromServerSqlite(): {
  students: StudentPerformanceRecord[];
  nps: ActiveNpsInvitation[];
  apostilas: Record<string, boolean>;
} {
  if (typeof process === "undefined") {
    return { students: [], nps: [], apostilas: {} };
  }
  try {
    const getBuiltin = (process as unknown as { getBuiltinModule?: (id: string) => any })
      .getBuiltinModule;
    if (!getBuiltin) return { students: [], nps: [], apostilas: {} };
    const fs = getBuiltin("node:fs");
    const path = getBuiltin("node:path");
    const sqlite = getBuiltin("node:sqlite");
    if (!fs || !path || !sqlite) return { students: [], nps: [], apostilas: {} };

    const dbPath = path.resolve(process.cwd(), ".data", "microlins_production.sqlite");
    if (!fs.existsSync(dbPath)) return { students: [], nps: [], apostilas: {} };

    const db = new sqlite.DatabaseSync(dbPath, { open: true });
    try {
      const studentRows = db
        .prepare("SELECT payload_json, educador FROM student_records WHERE school_id = 'school-1875' ORDER BY id ASC")
        .all() as Array<{ payload_json: string; educador: string }>;
      const students: StudentPerformanceRecord[] = [];
      const apostilas: Record<string, boolean> = {};
      for (const row of studentRows) {
        try {
          const parsed = JSON.parse(row.payload_json) as StudentPerformanceRecord;
          if (!parsed.educador && row.educador) parsed.educador = row.educador;
          students.push(parsed);
          if (parsed.contrato && typeof parsed.possuiApostila === "boolean") {
            apostilas[parsed.contrato] = parsed.possuiApostila;
          }
        } catch {}
      }

      const npsRows = db
        .prepare("SELECT payload_json FROM nps_records WHERE school_id = 'school-1875' ORDER BY updated_at DESC")
        .all() as Array<{ payload_json: string }>;
      const nps: ActiveNpsInvitation[] = [];
      for (const row of npsRows) {
        try {
          const parsed = JSON.parse(row.payload_json) as ActiveNpsInvitation;
          parsed.surveyUrl = "";
          nps.push(parsed);
        } catch {}
      }
      return { students, nps, apostilas };
    } finally {
      try {
        db.close();
      } catch {}
    }
  } catch {
    return { students: [], nps: [], apostilas: {} };
  }
}

const serverDbSnapshot = loadRecordsFromServerSqlite();

export const PORTAL_AUTH_LINKS_BY_CONTRATO: Record<string, string> = {};
export const PORTAL_APOSTILA_BY_CONTRATO: Record<string, boolean> = serverDbSnapshot.apostilas;
export const ALL_WEEK_STUDENT_RECORDS: StudentPerformanceRecord[] = serverDbSnapshot.students;
export const INITIAL_STUDENT_RECORDS: StudentPerformanceRecord[] = ALL_WEEK_STUDENT_RECORDS.filter(
  (r) => r.diaSemana === "Sexta-feira"
);
export const INITIAL_ACTIVE_NPS_INVITATIONS: ActiveNpsInvitation[] = serverDbSnapshot.nps;
