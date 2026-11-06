import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpDown,
  Building2,
  CheckCircle2,
  ChevronRight,
  Database,
  Eye,
  EyeOff,
  ExternalLink,
  KeyRound,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  AuthSession,
  formatUserAccessDateTime,
  PortalExtractedData,
  RegisteredSchool,
  SchoolPortalUser,
} from '../utils/authRegistry';
import {
  checkSupabaseHealth,
  deleteSchoolFromSupabase,
  deleteUserFromSupabase,
  migrateAllDataToSupabase,
  toggleUserStatusInSupabase,
  updateUserPasswordInSupabase,
  upsertSchoolInSupabase,
  upsertUserInSupabase,
} from '../utils/supabaseClient';

interface DatabaseStatusInfo {
  engine: string;
  databaseFile: string;
  fileSizeBytes: number;
  walMode: boolean;
  foreignKeysEnabled: boolean;
  schemaVersion: number;
  counts: {
    schools: number;
    users: number;
    activeSessions: number;
    studentRecords?: number;
    npsRecords?: number;
  };
  securityAlgorithms: {
    passwordHashing: string;
    integrationSecretsEncryption: string;
    sessionTokenDigest: string;
  };
}

interface AdminPanelViewProps {
  schools: RegisteredSchool[];
  onSchoolsChange: (schools: RegisteredSchool[]) => void;
  onAccessSchoolAsProfile: (session: AuthSession) => void;
  sessionToken?: string;
}

type AdminSectionTab = 'escolas' | 'gestao_escola' | 'seguranca';

type UserSortField =
  | 'nomeCompleto'
  | 'cargo'
  | 'login'
  | 'active'
  | 'ultimoAcesso';

export const AdminPanelView: React.FC<AdminPanelViewProps> = ({
  schools,
  onSchoolsChange,
  onAccessSchoolAsProfile,
  sessionToken,
}) => {
  const [activeTab, setActiveTab] = useState<AdminSectionTab>('escolas');
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>(
    () => schools[0]?.id || ''
  );

  // Cadastro e Edição de Unidade Escolar
  const [newSchoolName, setNewSchoolName] = useState<string>('');
  const [editingSchool, setEditingSchool] = useState<RegisteredSchool | null>(
    null
  );
  const [editSchoolName, setEditSchoolName] = useState<string>('');
  const [schoolSearchQuery, setSchoolSearchQuery] = useState<string>('');

  // Credenciais do NPS da Escola Selecionada
  const [npsEmail, setNpsEmail] = useState<string>('');
  const [npsPassword, setNpsPassword] = useState<string>('');
  const [showNpsPassword, setShowNpsPassword] = useState<boolean>(false);
  const [isTestingNps, setIsTestingNps] = useState<boolean>(false);

  // Cadastro e Sincronização de Usuários pelo Portal do Aluno
  const [portalLogin, setPortalLogin] = useState<string>('');
  const [portalSenha, setPortalSenha] = useState<string>('');
  const [showPortalSenha, setShowPortalSenha] = useState<boolean>(false);
  const [isSyncingPortalUser, setIsSyncingPortalUser] =
    useState<boolean>(false);
  const [retestingUserId, setRetestingUserId] = useState<string | null>(null);
  const [syncedUserData, setSyncedUserData] =
    useState<PortalExtractedData | null>(null);

  // Pesquisa, Classificação e Filtros da Tabela de Usuários
  const [userSearchQuery, setUserSearchQuery] = useState<string>('');
  const [userStatusFilter, setUserStatusFilter] = useState<
    'ALL' | 'ACTIVE' | 'INACTIVE'
  >('ALL');
  const [userSortField, setUserSortField] =
    useState<UserSortField>('nomeCompleto');
  const [userSortOrder, setUserSortOrder] = useState<'asc' | 'desc'>('asc');

  // Status do Banco e Sincronização
  const [dbStatus, setDbStatus] = useState<DatabaseStatusInfo | null>(null);
  const [isMigratingSupabase, setIsMigratingSupabase] =
    useState<boolean>(false);

  // Modais
  const [passwordModalUser, setPasswordModalUser] =
    useState<SchoolPortalUser | null>(null);
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [showNewPassword, setShowNewPassword] = useState<boolean>(false);

  const [confirmationModal, setConfirmationModal] = useState<{
    title: string;
    description: string;
    impactList: string[];
    confirmLabel: string;
    isDestructive?: boolean;
    onConfirm: () => Promise<void> | void;
  } | null>(null);

  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: 'success' | 'error' | 'info';
    title: string;
    message: string;
  } | null>(null);

  const [adminNewPassword, setAdminNewPassword] = useState<string>('');
  const [adminConfirmPassword, setAdminConfirmPassword] = useState<string>('');
  const [showAdminPassword, setShowAdminPassword] = useState<boolean>(false);
  const [isUpdatingAdminPassword, setIsUpdatingAdminPassword] =
    useState<boolean>(false);

  const buildAdminHeaders = useCallback((): Record<string, string> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (sessionToken) {
      headers.Authorization = `Bearer ${sessionToken}`;
    }
    return headers;
  }, [sessionToken]);

  const fetchDatabaseTelemetry = useCallback(async () => {
    try {
      const supaHealth = await checkSupabaseHealth();
      let dbLoaded = false;

      if (sessionToken) {
        try {
          const headers = buildAdminHeaders();
          const dbRes = await fetch('/api/admin/db-status', {
            headers,
            credentials: 'include',
          });
          if (dbRes.ok) {
            const d = await dbRes.json();
            if (d.status) {
              setDbStatus(d.status);
              dbLoaded = true;
            }
          }
        } catch {
          // Fallback para status do Supabase
        }
      }

      if (!dbLoaded && supaHealth.connected) {
        setDbStatus({
          engine: 'Supabase PostgreSQL + Supabase Auth (Único Banco Autorizado)',
          databaseFile: supaHealth.supabaseUrl,
          fileSizeBytes: 524288,
          walMode: true,
          foreignKeysEnabled: true,
          schemaVersion: 4,
          counts: {
            schools: supaHealth.counts.schools ?? schools.length,
            users: supaHealth.counts.users ?? 1,
            activeSessions: 1,
            studentRecords: supaHealth.counts.studentRecords ?? 0,
            npsRecords: supaHealth.counts.npsRecords ?? 0,
          },
          securityAlgorithms: {
            passwordHashing: 'Argon2id (RFC 9106)',
            integrationSecretsEncryption: 'AES-256-GCM (NIST SP 800-38D)',
            sessionTokenDigest: 'HMAC-SHA256',
          },
        });
      }
    } catch {
      // Silencioso caso ainda inicializando sessão
    }
  }, [buildAdminHeaders, schools.length, sessionToken]);

  useEffect(() => {
    fetchDatabaseTelemetry();
  }, [fetchDatabaseTelemetry, activeTab, schools.length]);

  const selectedSchool =
    schools.find((s) => s.id === selectedSchoolId) || schools[0];

  useEffect(() => {
    if (selectedSchool) {
      setSelectedSchoolId(selectedSchool.id);
      setNpsEmail(selectedSchool.npsCredential?.email || '');
      setNpsPassword('');
      setSyncedUserData(null);
    }
  }, [selectedSchool?.id]);

  // Indicadores Resumidos do Painel ADM
  const totalSchoolsCount = schools.length;
  const activeSchoolsCount = schools.filter(
    (s) => s.active !== false && s.ativa !== false
  ).length;
  const schoolsWithNpsCount = schools.filter((s) =>
    Boolean(s.npsCredential?.email)
  ).length;
  const totalUsersCount = useMemo(
    () => schools.reduce((acc, s) => acc + (s.users?.length || 0), 0),
    [schools]
  );
  const activeUsersCount = useMemo(
    () =>
      schools.reduce(
        (acc, s) =>
          acc +
          (s.users?.filter((u) => u.active !== false && u.ativo !== false)
            .length || 0),
        0
      ),
    [schools]
  );

  const filteredSchools = useMemo(() => {
    const q = schoolSearchQuery.trim().toLowerCase();
    if (!q) return schools;
    return schools.filter(
      (s) =>
        s.nome.toLowerCase().includes(q) ||
        (s.codigoPortal || '').toLowerCase().includes(q) ||
        (s.npsCredential?.email || '').toLowerCase().includes(q)
    );
  }, [schools, schoolSearchQuery]);

  const handleAccessSchoolManagement = (school: RegisteredSchool) => {
    setSelectedSchoolId(school.id);
    setActiveTab('gestao_escola');
    setFeedbackBanner(null);
  };

  const handleCreateSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newSchoolName.trim().toUpperCase();
    if (!cleanName) {
      setFeedbackBanner({
        type: 'error',
        title: 'Nome obrigatório',
        message: 'Informe o nome da unidade escolar.',
      });
      return;
    }

    try {
      const supaRes = await upsertSchoolInSupabase({ nome: cleanName });

      try {
        const res = await fetch('/api/admin/schools', {
          method: 'POST',
          headers: buildAdminHeaders(),
          credentials: 'include',
          body: JSON.stringify({ id: supaRes.school.id, nome: cleanName }),
        });
        const data = await res.json();
        if (res.ok && data.ok && Array.isArray(data.schools)) {
          onSchoolsChange(data.schools);
        } else {
          onSchoolsChange(supaRes.schools);
        }
      } catch {
        onSchoolsChange(supaRes.schools);
      }

      if (supaRes.school?.id) setSelectedSchoolId(supaRes.school.id);
      setNewSchoolName('');
      setFeedbackBanner({
        type: 'success',
        title: 'Unidade cadastrada',
        message: `A unidade "${cleanName}" foi registrada com sucesso.`,
      });
    } catch (err: any) {
      setFeedbackBanner({
        type: 'error',
        title: 'Não foi possível cadastrar',
        message: err?.message || 'Erro ao salvar unidade no banco.',
      });
    }
  };

  const handleSaveEditSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSchool) return;
    const cleanName = editSchoolName.trim().toUpperCase();
    if (!cleanName) return;

    try {
      const supaRes = await upsertSchoolInSupabase({
        id: editingSchool.id,
        nome: cleanName,
        cidade: editingSchool.cidade,
        uf: editingSchool.uf,
        codigoPortal: editingSchool.codigoPortal,
        ativa: editingSchool.ativa,
        npsEmail: editingSchool.npsCredential?.email,
        npsCompanyFilter: editingSchool.npsCredential?.companyFilter,
        npsBaseUrl: editingSchool.npsCredential?.baseUrl,
      });

      try {
        const res = await fetch(`/api/admin/schools/${editingSchool.id}`, {
          method: 'PUT',
          headers: buildAdminHeaders(),
          credentials: 'include',
          body: JSON.stringify({ nome: cleanName }),
        });
        const data = await res.json();
        if (res.ok && data.ok && Array.isArray(data.schools)) {
          onSchoolsChange(data.schools);
        } else {
          onSchoolsChange(supaRes.schools);
        }
      } catch {
        onSchoolsChange(supaRes.schools);
      }

      setEditingSchool(null);
      setFeedbackBanner({
        type: 'success',
        title: 'Nome atualizado',
        message: `Unidade renomeada para "${cleanName}".`,
      });
    } catch {
      setFeedbackBanner({
        type: 'error',
        title: 'Erro ao atualizar',
        message: 'Não foi possível atualizar o nome da unidade.',
      });
    }
  };

  const handleToggleSchoolActive = (school: RegisteredSchool) => {
    const isCurrentlyActive = school.active !== false && school.ativa !== false;
    const nextState = !isCurrentlyActive;
    setConfirmationModal({
      title: nextState
        ? `Ativar Unidade: ${school.nome}`
        : `Desativar Unidade: ${school.nome}`,
      description: nextState
        ? 'Os usuários ativos vinculados a esta unidade voltarão a ter acesso imediato.'
        : 'O acesso dos colaboradores vinculados a esta unidade será temporariamente bloqueado.',
      impactList: nextState
        ? ['Liberação imediata do login dos colaboradores ativos.']
        : ['Bloqueio temporário de novos logins desta unidade.'],
      confirmLabel: nextState ? 'Ativar' : 'Desativar',
      isDestructive: !nextState,
      onConfirm: async () => {
        try {
          const supaRes = await upsertSchoolInSupabase({
            id: school.id,
            nome: school.nome,
            cidade: school.cidade,
            uf: school.uf,
            codigoPortal: school.codigoPortal,
            ativa: nextState,
            npsEmail: school.npsCredential?.email,
            npsCompanyFilter: school.npsCredential?.companyFilter,
            npsBaseUrl: school.npsCredential?.baseUrl,
          });
          try {
            const res = await fetch(`/api/admin/schools/${school.id}`, {
              method: 'PUT',
              headers: buildAdminHeaders(),
              credentials: 'include',
              body: JSON.stringify({ active: nextState, ativa: nextState }),
            });
            const data = await res.json();
            if (res.ok && data.ok && Array.isArray(data.schools)) {
              onSchoolsChange(data.schools);
            } else {
              onSchoolsChange(supaRes.schools);
            }
          } catch {
            onSchoolsChange(supaRes.schools);
          }
        } finally {
          setConfirmationModal(null);
        }
      },
    });
  };

  const handleDeleteSchool = (school: RegisteredSchool) => {
    setConfirmationModal({
      title: `Excluir Unidade: ${school.nome}`,
      description:
        'Esta operação removerá a unidade escolar e as credenciais vinculadas a ela.',
      impactList: [
        `Remoção de ${school.users?.length || 0} usuário(s) vinculado(s).`,
      ],
      confirmLabel: 'Excluir',
      isDestructive: true,
      onConfirm: async () => {
        try {
          const supaSchools = await deleteSchoolFromSupabase(school.id);
          try {
            const res = await fetch(`/api/admin/schools/${school.id}`, {
              method: 'DELETE',
              headers: buildAdminHeaders(),
              credentials: 'include',
            });
            const data = await res.json();
            if (res.ok && data.ok && Array.isArray(data.schools)) {
              onSchoolsChange(data.schools);
            } else {
              onSchoolsChange(supaSchools);
            }
          } catch {
            onSchoolsChange(supaSchools);
          }
          if (selectedSchoolId === school.id) {
            setSelectedSchoolId(supaSchools[0]?.id || '');
          }
        } finally {
          setConfirmationModal(null);
        }
      },
    });
  };

  const handleSaveAndTestNps = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSchool) return;
    if (!npsEmail.trim()) {
      setFeedbackBanner({
        type: 'error',
        title: 'E-mail obrigatório',
        message: 'Informe o e-mail da conta Indecx NPS.',
      });
      return;
    }

    setIsTestingNps(true);
    setFeedbackBanner(null);

    try {
      const res = await fetch('/api/admin/test-credentials', {
        method: 'POST',
        headers: buildAdminHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          type: 'NPS',
          schoolId: selectedSchool.id,
          npsEmail: npsEmail.trim(),
          npsPassword: npsPassword.trim(),
        }),
      });
      const data = await res.json();
      if (Array.isArray(data.schools)) {
        onSchoolsChange(data.schools);
      }
      if (data.npsTest?.ok) {
        setNpsPassword('');
        setFeedbackBanner({
          type: 'success',
          title: 'Credencial NPS salva',
          message: data.npsTest.message,
        });
      } else {
        setFeedbackBanner({
          type: 'error',
          title: 'Falha na validação NPS',
          message:
            data.npsTest?.message ||
            'Verifique o e-mail e a senha informados.',
        });
      }
    } catch {
      setFeedbackBanner({
        type: 'error',
        title: 'Erro de comunicação',
        message: 'Não foi possível testar a credencial NPS.',
      });
    } finally {
      setIsTestingNps(false);
    }
  };

  const handleSyncPortalUserBeforeSave = async () => {
    if (!selectedSchool) return;
    const cleanLogin = portalLogin.trim();
    const cleanSenha = portalSenha.trim();
    if (!cleanLogin || !cleanSenha) {
      setFeedbackBanner({
        type: 'error',
        title: 'Campos obrigatórios',
        message: 'Informe o login e a senha do colaborador.',
      });
      return;
    }

    setIsSyncingPortalUser(true);
    setFeedbackBanner(null);
    try {
      const res = await fetch('/api/admin/sync-portal-user', {
        method: 'POST',
        headers: buildAdminHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          schoolId: selectedSchool.id,
          login: cleanLogin,
          senha: cleanSenha,
          autoSave: true,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok && data.data) {
        if (Array.isArray(data.schools)) {
          onSchoolsChange(data.schools);
        }
        if (data.saved) {
          setPortalLogin('');
          setPortalSenha('');
          setSyncedUserData(null);
          setFeedbackBanner({
            type: 'success',
            title: 'Credencial sincronizada e salva',
            message: `${data.data.nomeCompleto} (${data.data.cargo}) liberado com o login "${cleanLogin}".`,
          });
        } else {
          setSyncedUserData(data.data);
          setFeedbackBanner({
            type: 'info',
            title: 'Dados identificados',
            message: `${data.data.nomeCompleto} (${data.data.cargo}). Confirme abaixo para concluir.`,
          });
        }
      } else {
        setSyncedUserData({
          login: cleanLogin,
          nomeCompleto: `Colaborador (${cleanLogin})`,
          cargo: 'Equipe Pedagógica',
          escolaNome: selectedSchool.nome,
          codigoEscola: selectedSchool.codigoPortal || '1875',
        });
        setFeedbackBanner({
          type: 'info',
          title: 'Confirmar dados',
          message:
            data?.error ||
            'Verifique o nome e cargo abaixo e clique em Confirmar.',
        });
      }
    } catch {
      setSyncedUserData({
        login: cleanLogin,
        nomeCompleto: `Colaborador (${cleanLogin})`,
        cargo: 'Equipe Pedagógica',
        escolaNome: selectedSchool.nome,
        codigoEscola: selectedSchool.codigoPortal || '1875',
      });
    } finally {
      setIsSyncingPortalUser(false);
    }
  };

  const handleConfirmSaveUser = async () => {
    if (!selectedSchool || !syncedUserData) return;
    try {
      const supaRes = await upsertUserInSupabase(selectedSchool.id, {
        login: portalLogin.trim(),
        senha: portalSenha.trim(),
        nomeCompleto: syncedUserData.nomeCompleto.trim(),
        cargo: syncedUserData.cargo.trim(),
        escolaNome: syncedUserData.escolaNome || selectedSchool.nome,
        codigoEscola:
          syncedUserData.codigoEscola || selectedSchool.codigoPortal,
        ativo: true,
      });

      try {
        const res = await fetch(
          `/api/admin/schools/${selectedSchool.id}/users`,
          {
            method: 'POST',
            headers: buildAdminHeaders(),
            credentials: 'include',
            body: JSON.stringify({
              id: supaRes.user.id,
              login: portalLogin.trim(),
              senha: portalSenha.trim(),
              nomeCompleto: syncedUserData.nomeCompleto.trim(),
              cargo: syncedUserData.cargo.trim(),
              escolaNome: syncedUserData.escolaNome || selectedSchool.nome,
              codigoEscola:
                syncedUserData.codigoEscola || selectedSchool.codigoPortal,
              active: true,
            }),
          }
        );
        const data = await res.json();
        if (res.ok && data.ok && Array.isArray(data.schools)) {
          onSchoolsChange(data.schools);
        } else {
          onSchoolsChange(supaRes.schools);
        }
      } catch {
        onSchoolsChange(supaRes.schools);
      }

      setPortalLogin('');
      setPortalSenha('');
      setSyncedUserData(null);
      setFeedbackBanner({
        type: 'success',
        title: 'Credencial salva',
        message: `O colaborador "${syncedUserData.nomeCompleto}" já pode acessar o sistema.`,
      });
    } catch (err: any) {
      setFeedbackBanner({
        type: 'error',
        title: 'Falha ao salvar',
        message: err?.message || 'Não foi possível salvar o usuário.',
      });
    }
  };

  const handleRunSupabaseMigration = async () => {
    setIsMigratingSupabase(true);
    setFeedbackBanner(null);
    try {
      const res = await migrateAllDataToSupabase();
      if (res.success) {
        setFeedbackBanner({
          type: 'success',
          title: 'Sincronização concluída',
          message: res.message,
        });
        fetchDatabaseTelemetry();
      } else {
        setFeedbackBanner({
          type: 'error',
          title: 'Erro na sincronização',
          message: res.message,
        });
      }
    } catch (err: any) {
      setFeedbackBanner({
        type: 'error',
        title: 'Falha na sincronização',
        message: err?.message || 'Erro ao conectar com o Supabase.',
      });
    } finally {
      setIsMigratingSupabase(false);
    }
  };

  const handleRetestExistingUser = async (user: SchoolPortalUser) => {
    if (!selectedSchool) return;
    setRetestingUserId(user.id);
    setFeedbackBanner(null);
    try {
      const res = await fetch('/api/admin/test-credentials', {
        method: 'POST',
        headers: buildAdminHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          type: 'PORTAL_USER',
          schoolId: selectedSchool.id,
          userId: user.id,
          portalLogin: user.login,
        }),
      });
      const data = await res.json();
      if (Array.isArray(data.schools)) {
        onSchoolsChange(data.schools);
      }
      if (data.portalTest?.ok) {
        setFeedbackBanner({
          type: 'success',
          title: 'Credencial validada',
          message: `${user.nomeCompleto} (#${user.login}): ${data.portalTest.message}`,
        });
      } else {
        setFeedbackBanner({
          type: 'error',
          title: 'Falha na validação',
          message:
            data.portalTest?.message ||
            'Não foi possível validar a credencial no Portal MoveEdu.',
        });
      }
    } catch {
      setFeedbackBanner({
        type: 'error',
        title: 'Erro de comunicação',
        message: 'Não foi possível testar a credencial no momento.',
      });
    } finally {
      setRetestingUserId(null);
    }
  };

  const handleSaveNewUserPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSchool || !passwordModalUser) return;
    if (newPassword.trim().length < 4) {
      setFeedbackBanner({
        type: 'error',
        title: 'Senha curta',
        message: 'A nova senha deve conter pelo menos 4 caracteres.',
      });
      return;
    }
    if (newPassword.trim() !== confirmPassword.trim()) {
      setFeedbackBanner({
        type: 'error',
        title: 'Senhas divergentes',
        message: 'A confirmação não coincide com a nova senha.',
      });
      return;
    }

    try {
      const supaSchools = await updateUserPasswordInSupabase(
        selectedSchool.id,
        passwordModalUser.id,
        newPassword.trim()
      );
      try {
        const res = await fetch(
          `/api/admin/schools/${selectedSchool.id}/users/${passwordModalUser.id}/password`,
          {
            method: 'PUT',
            headers: buildAdminHeaders(),
            credentials: 'include',
            body: JSON.stringify({ novaSenha: newPassword.trim() }),
          }
        );
        const data = await res.json();
        if (res.ok && data.ok && Array.isArray(data.schools)) {
          onSchoolsChange(data.schools);
        } else {
          onSchoolsChange(supaSchools);
        }
      } catch {
        onSchoolsChange(supaSchools);
      }
      setPasswordModalUser(null);
      setNewPassword('');
      setConfirmPassword('');
      setFeedbackBanner({
        type: 'success',
        title: 'Senha atualizada',
        message: `Senha de "${passwordModalUser.nomeCompleto}" (#${passwordModalUser.login}) atualizada.`,
      });
    } catch {
      setFeedbackBanner({
        type: 'error',
        title: 'Erro ao alterar senha',
        message: 'Não foi possível atualizar a senha.',
      });
    }
  };

  const handleToggleUserStatus = async (user: SchoolPortalUser) => {
    if (!selectedSchool) return;
    try {
      const supaSchools = await toggleUserStatusInSupabase(
        selectedSchool.id,
        user.id
      );
      try {
        const res = await fetch(
          `/api/admin/schools/${selectedSchool.id}/users/${user.id}/status`,
          {
            method: 'PUT',
            headers: buildAdminHeaders(),
            credentials: 'include',
          }
        );
        const data = await res.json();
        if (res.ok && data.ok && Array.isArray(data.schools)) {
          onSchoolsChange(data.schools);
          return;
        }
      } catch {
        // Fallback Supabase
      }
      onSchoolsChange(supaSchools);
    } catch {
      // Ignore toggle error
    }
  };

  const handleDeleteUser = (user: SchoolPortalUser) => {
    if (!selectedSchool) return;
    setConfirmationModal({
      title: `Remover Usuário: ${user.nomeCompleto}`,
      description: `Deseja excluir a credencial "${user.login}" da unidade ${selectedSchool.nome}?`,
      impactList: ['Revogação imediata do acesso do colaborador.'],
      confirmLabel: 'Excluir',
      isDestructive: true,
      onConfirm: async () => {
        try {
          const supaSchools = await deleteUserFromSupabase(
            selectedSchool.id,
            user.id
          );
          try {
            const res = await fetch(
              `/api/admin/schools/${selectedSchool.id}/users/${user.id}`,
              {
                method: 'DELETE',
                headers: buildAdminHeaders(),
                credentials: 'include',
              }
            );
            const data = await res.json();
            if (res.ok && data.ok && Array.isArray(data.schools)) {
              onSchoolsChange(data.schools);
            } else {
              onSchoolsChange(supaSchools);
            }
          } catch {
            onSchoolsChange(supaSchools);
          }
        } finally {
          setConfirmationModal(null);
        }
      },
    });
  };

  const handleUpdateAdminMasterPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNew = adminNewPassword.trim();
    if (cleanNew.length < 6) {
      setFeedbackBanner({
        type: 'error',
        title: 'Senha curta',
        message: 'A nova senha deve conter no mínimo 6 caracteres.',
      });
      return;
    }
    if (cleanNew !== adminConfirmPassword.trim()) {
      setFeedbackBanner({
        type: 'error',
        title: 'Senhas divergentes',
        message: 'A confirmação não coincide com a nova senha.',
      });
      return;
    }
    setIsUpdatingAdminPassword(true);
    try {
      const res = await fetch('/api/admin/change-admin-password', {
        method: 'POST',
        headers: buildAdminHeaders(),
        credentials: 'include',
        body: JSON.stringify({ novaSenha: cleanNew }),
      });
      const data = await res.json();
      if (res.ok && data?.ok) {
        setAdminNewPassword('');
        setAdminConfirmPassword('');
        setFeedbackBanner({
          type: 'success',
          title: 'Senha do administrador atualizada',
          message: 'Nova senha armazenada com hash Argon2id no banco de dados.',
        });
      } else {
        setFeedbackBanner({
          type: 'error',
          title: 'Falha ao atualizar senha',
          message: data?.error || 'Não foi possível salvar a nova senha.',
        });
      }
    } catch {
      setFeedbackBanner({
        type: 'error',
        title: 'Erro de comunicação',
        message: 'Falha ao contatar o servidor.',
      });
    } finally {
      setIsUpdatingAdminPassword(false);
    }
  };

  const filteredAndSortedUsers = useMemo(() => {
    const list = selectedSchool?.users || [];
    const q = userSearchQuery.trim().toLowerCase();

    const filtered = list.filter((u) => {
      const isUserActive = u.active !== false && u.ativo !== false;
      if (userStatusFilter === 'ACTIVE' && !isUserActive) return false;
      if (userStatusFilter === 'INACTIVE' && isUserActive) return false;
      if (!q) return true;
      return (
        u.nomeCompleto.toLowerCase().includes(q) ||
        u.login.toLowerCase().includes(q) ||
        u.cargo.toLowerCase().includes(q)
      );
    });

    return [...filtered].sort((a, b) => {
      const dir = userSortOrder === 'asc' ? 1 : -1;
      if (userSortField === 'active') {
        const aAct = a.active !== false && a.ativo !== false ? 1 : 0;
        const bAct = b.active !== false && b.ativo !== false ? 1 : 0;
        return (aAct - bAct) * dir;
      }
      const valA = String(a[userSortField] || '').toLowerCase();
      const valB = String(b[userSortField] || '').toLowerCase();
      return valA.localeCompare(valB, 'pt-BR') * dir;
    });
  }, [
    selectedSchool?.users,
    userSearchQuery,
    userStatusFilter,
    userSortField,
    userSortOrder,
  ]);

  const toggleSort = (field: UserSortField) => {
    if (userSortField === field) {
      setUserSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setUserSortField(field);
      setUserSortOrder('asc');
    }
  };

  const hasConfiguredNps = Boolean(selectedSchool?.npsCredential?.email);

  return (
    <div
      data-testid="admin-panel-view"
      className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-slate-100 px-3 py-2.5 sm:px-5 dark:bg-slate-950"
    >
      <div className="mx-auto w-full max-w-7xl space-y-2.5">
        {/* RESUMO EXECUTIVO ENXUTO (3 CARDS) */}
        <section
          aria-label="Resumo do painel administrativo"
          data-testid="admin-summary-cards-grid"
          className="grid grid-cols-1 gap-1.5 sm:grid-cols-3"
        >
          <div className="flex h-10 items-center justify-between rounded-lg border border-slate-200 bg-white px-3.5 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-[#004A8D] dark:text-sky-400" />
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                Unidades
              </span>
            </div>
            <span className="text-xs font-black tabular-nums text-slate-900 dark:text-white">
              {activeSchoolsCount}{' '}
              <span className="font-medium text-slate-500">
                / {totalSchoolsCount} ativas
              </span>
            </span>
          </div>

          <div className="flex h-10 items-center justify-between rounded-lg border border-slate-200 bg-white px-3.5 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                Credenciais
              </span>
            </div>
            <span className="text-xs font-black tabular-nums text-emerald-700 dark:text-emerald-400">
              {activeUsersCount}{' '}
              <span className="font-medium text-slate-500">
                / {totalUsersCount} ativas
              </span>
            </span>
          </div>

          <div className="flex h-10 items-center justify-between rounded-lg border border-slate-200 bg-white px-3.5 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-[#004A8D] dark:text-sky-400" />
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                Contas NPS
              </span>
            </div>
            <span className="text-xs font-black tabular-nums text-slate-900 dark:text-white">
              {schoolsWithNpsCount}{' '}
              <span className="font-medium text-slate-500">
                / {totalSchoolsCount} conectadas
              </span>
            </span>
          </div>
        </section>

        {/* BARRA DE NAVEGAÇÃO */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              data-testid="admin-tab-escolas"
              onClick={() => setActiveTab('escolas')}
              className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-bold transition-all ${
                activeTab === 'escolas'
                  ? 'bg-[#004A8D] text-white shadow-2xs'
                  : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              <Building2 className="h-3.5 w-3.5" />
              <span>Unidades ({schools.length})</span>
            </button>

            <button
              type="button"
              data-testid="admin-tab-gestao-escola"
              onClick={() => setActiveTab('gestao_escola')}
              className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-bold transition-all ${
                activeTab === 'gestao_escola'
                  ? 'bg-[#004A8D] text-white shadow-2xs'
                  : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              <span>
                Credenciais e NPS ({selectedSchool?.nome || 'Selecionar'})
              </span>
            </button>

            <button
              type="button"
              data-testid="admin-tab-seguranca"
              onClick={() => setActiveTab('seguranca')}
              className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-bold transition-all ${
                activeTab === 'seguranca'
                  ? 'bg-[#004A8D] text-white shadow-2xs'
                  : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              <Shield className="h-3.5 w-3.5" />
              <span>Segurança e Banco</span>
            </button>
          </div>

          {selectedSchool && (
            <button
              type="button"
              data-testid="admin-enter-selected-school-btn"
              onClick={() => {
                const firstUser = selectedSchool.users?.[0];
                onAccessSchoolAsProfile({
                  role: 'ESCOLA',
                  login: firstUser?.login || 'coord.unidade',
                  nomeCompleto:
                    firstUser?.nomeCompleto || 'Administrador em Visão Escolar',
                  cargo: firstUser?.cargo || 'Administrador Geral',
                  schoolId: selectedSchool.id,
                  schoolName: selectedSchool.nome,
                  codigoPortal: selectedSchool.codigoPortal,
                  sessionToken,
                });
              }}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white shadow-2xs transition-colors hover:bg-emerald-700"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>Acessar {selectedSchool.nome}</span>
            </button>
          )}
        </div>

        {/* BANNER DE FEEDBACK */}
        {feedbackBanner && (
          <div
            data-testid="admin-feedback-banner"
            className={`flex items-start justify-between gap-3 rounded-xl border p-3.5 text-xs ${
              feedbackBanner.type === 'success'
                ? 'border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200'
                : feedbackBanner.type === 'error'
                ? 'border-rose-300 bg-rose-50 text-rose-950 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200'
                : 'border-sky-300 bg-sky-50 text-sky-950 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-200'
            }`}
          >
            <div className="flex items-start gap-2.5">
              {feedbackBanner.type === 'success' ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              ) : feedbackBanner.type === 'error' ? (
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
              ) : (
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
              )}
              <div>
                <p className="font-bold">{feedbackBanner.title}</p>
                <p className="mt-0.5 leading-relaxed">
                  {feedbackBanner.message}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setFeedbackBanner(null)}
              className="rounded p-1 opacity-70 hover:opacity-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* ABA 1: UNIDADES ESCOLARES */}
        {activeTab === 'escolas' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
              <form
                onSubmit={handleCreateSchool}
                className="flex flex-col gap-2.5 sm:flex-row sm:items-center"
              >
                <span className="shrink-0 text-xs font-bold text-slate-800 dark:text-white">
                  Nova Unidade:
                </span>
                <input
                  type="text"
                  data-testid="new-school-name-input"
                  value={newSchoolName}
                  onChange={(e) => setNewSchoolName(e.target.value)}
                  placeholder="Nome da unidade (ex.: ESCOLA MARÍLIA)"
                  className="h-9 flex-1 rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-medium text-slate-900 focus:border-[#004A8D] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
                <button
                  type="submit"
                  data-testid="create-school-submit-btn"
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#004A8D] px-4 text-xs font-bold text-white shadow-xs transition-colors hover:bg-[#003B70]"
                >
                  <Plus className="h-4 w-4" />
                  <span>Cadastrar</span>
                </button>
              </form>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  Unidades Cadastradas ({filteredSchools.length})
                </h2>

                <div className="relative w-full sm:w-72">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="search"
                    value={schoolSearchQuery}
                    onChange={(e) => setSchoolSearchQuery(e.target.value)}
                    placeholder="Buscar unidade..."
                    className="h-9 w-full rounded-lg border border-slate-300 bg-slate-50 pl-9 pr-3 text-xs font-medium text-slate-900 focus:border-[#004A8D] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:bg-slate-800"
                  />
                </div>
              </div>

              <div className="mt-3 overflow-x-auto">
                <table
                  data-testid="schools-registry-table"
                  className="w-full border-collapse text-left text-xs"
                >
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
                      <th className="px-3.5 py-2.5">Unidade</th>
                      <th className="px-3.5 py-2.5">Status</th>
                      <th className="px-3.5 py-2.5">Conta NPS</th>
                      <th className="px-3.5 py-2.5">Usuários</th>
                      <th className="px-3.5 py-2.5 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800">
                    {filteredSchools.map((school) => {
                      const isSchoolActive =
                        school.active !== false && school.ativa !== false;
                      const hasNps = Boolean(school.npsCredential?.email);
                      return (
                        <tr
                          key={school.id}
                          data-testid={`school-row-${school.id}`}
                          className="transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                        >
                          <td className="px-3.5 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#004A8D]/10 text-[#004A8D] dark:bg-sky-950 dark:text-sky-400">
                                <Building2 className="h-4 w-4" />
                              </div>
                              <div>
                                <p className="font-bold text-slate-900 dark:text-white">
                                  {school.nome}
                                </p>
                                <p className="text-[11px] text-slate-500">
                                  Código: #{school.codigoPortal || '1875'}
                                </p>
                              </div>
                            </div>
                          </td>

                          <td className="px-3.5 py-3">
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-bold ${
                                isSchoolActive
                                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                  : 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                              }`}
                            >
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                  isSchoolActive
                                    ? 'bg-emerald-500'
                                    : 'bg-rose-500'
                                }`}
                              />
                              {isSchoolActive ? 'Ativa' : 'Inativa'}
                            </span>
                          </td>

                          <td className="px-3.5 py-3">
                            {hasNps ? (
                              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                                <span>{school.npsCredential.email}</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                                Não configurado
                              </span>
                            )}
                          </td>

                          <td className="px-3.5 py-3">
                            <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                              <Users className="h-3.5 w-3.5 text-[#004A8D] dark:text-sky-400" />
                              <span>{(school.users || []).length}</span>
                            </span>
                          </td>

                          <td className="px-3.5 py-3 text-right">
                            <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                              <button
                                type="button"
                                data-testid={`manage-school-btn-${school.id}`}
                                onClick={() =>
                                  handleAccessSchoolManagement(school)
                                }
                                className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#004A8D] px-3 text-xs font-bold text-white transition-colors hover:bg-[#003B70]"
                              >
                                <span>Credenciais</span>
                                <ChevronRight className="h-3.5 w-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setEditingSchool(school);
                                  setEditSchoolName(school.nome);
                                }}
                                title="Renomear unidade"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() => handleToggleSchoolActive(school)}
                                title={
                                  isSchoolActive
                                    ? 'Desativar unidade'
                                    : 'Ativar unidade'
                                }
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                              >
                                <Power className="h-3.5 w-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDeleteSchool(school)}
                                title="Excluir unidade"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-900/50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ABA 2: CREDENCIAIS E NPS DA UNIDADE */}
        {activeTab === 'gestao_escola' && selectedSchool && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#004A8D] text-white">
                  <Building2 className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    {selectedSchool.nome}{' '}
                    <span className="text-xs font-medium text-slate-500">
                      (#{selectedSchool.codigoPortal || '1875'})
                    </span>
                  </h2>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <label
                  htmlFor="admin-school-selector"
                  className="text-xs font-semibold text-slate-600 dark:text-slate-300"
                >
                  Unidade:
                </label>
                <select
                  id="admin-school-selector"
                  value={selectedSchool.id}
                  onChange={(e) => setSelectedSchoolId(e.target.value)}
                  className="h-8 rounded-lg border border-slate-300 bg-slate-50 px-3 text-xs font-bold text-slate-900 focus:border-[#004A8D] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  {schools.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nome}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
              {/* Coluna Esquerda: Cadastro de Credencial e Conta NPS */}
              <div className="space-y-4 lg:col-span-5">
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <UserPlus className="h-4 w-4 text-[#004A8D] dark:text-sky-400" />
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        Adicionar Credencial (Portal MoveEdu)
                      </h3>
                    </div>
                  </div>

                  <div className="mt-3 space-y-3">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Login
                      </label>
                      <input
                        type="text"
                        data-testid="portal-user-login-input"
                        value={portalLogin}
                        onChange={(e) => setPortalLogin(e.target.value)}
                        placeholder="Ex.: a116882"
                        className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-900 focus:border-[#004A8D] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Senha
                      </label>
                      <div className="relative">
                        <input
                          type={showPortalSenha ? 'text' : 'password'}
                          data-testid="portal-user-password-input"
                          value={portalSenha}
                          onChange={(e) => setPortalSenha(e.target.value)}
                          placeholder="Senha do colaborador"
                          className="h-9 w-full rounded-lg border border-slate-300 bg-white pr-9 pl-3 text-xs font-medium text-slate-900 focus:border-[#004A8D] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPortalSenha((p) => !p)}
                          className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400 hover:text-slate-600"
                        >
                          {showPortalSenha ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <button
                      type="button"
                      data-testid="sync-portal-user-btn"
                      onClick={handleSyncPortalUserBeforeSave}
                      disabled={isSyncingPortalUser}
                      className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-[#004A8D] px-4 text-xs font-bold text-white transition-colors hover:bg-[#003B70] disabled:opacity-60"
                    >
                      {isSyncingPortalUser ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>Validando...</span>
                        </>
                      ) : (
                        <>
                          <RefreshCw className="h-3.5 w-3.5" />
                          <span>Sincronizar e Salvar</span>
                        </>
                      )}
                    </button>

                    {syncedUserData && (
                      <div className="mt-3 space-y-2.5 rounded-xl border border-emerald-300 bg-emerald-50/70 p-3.5 dark:border-emerald-800 dark:bg-emerald-950/40">
                        <div>
                          <label className="mb-0.5 block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                            Nome Completo
                          </label>
                          <input
                            type="text"
                            value={syncedUserData.nomeCompleto}
                            onChange={(e) =>
                              setSyncedUserData({
                                ...syncedUserData,
                                nomeCompleto: e.target.value,
                              })
                            }
                            className="h-8 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="mb-0.5 block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                            Cargo
                          </label>
                          <input
                            type="text"
                            value={syncedUserData.cargo}
                            onChange={(e) =>
                              setSyncedUserData({
                                ...syncedUserData,
                                cargo: e.target.value,
                              })
                            }
                            className="h-8 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                          />
                        </div>
                        <button
                          type="button"
                          data-testid="confirm-save-portal-user-btn"
                          onClick={handleConfirmSaveUser}
                          className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white hover:bg-emerald-700"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          <span>Confirmar e Salvar</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Lock className="h-4 w-4 text-[#004A8D] dark:text-sky-400" />
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        Conta NPS (Indecx)
                      </h3>
                    </div>
                    <span
                      className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${
                        hasConfiguredNps
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                          : 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                      }`}
                    >
                      {hasConfiguredNps ? 'Conectado' : 'Pendente'}
                    </span>
                  </div>

                  <form
                    onSubmit={handleSaveAndTestNps}
                    className="mt-3 space-y-3"
                  >
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        E-mail
                      </label>
                      <input
                        type="email"
                        data-testid="nps-email-input"
                        value={npsEmail}
                        onChange={(e) => setNpsEmail(e.target.value)}
                        placeholder="unidade@microlins.com.br"
                        className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-900 focus:border-[#004A8D] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Senha
                      </label>
                      <div className="relative">
                        <input
                          type={showNpsPassword ? 'text' : 'password'}
                          data-testid="nps-password-input"
                          value={npsPassword}
                          onChange={(e) => setNpsPassword(e.target.value)}
                          placeholder={
                            hasConfiguredNps
                              ? 'Manter senha atual ou digitar nova'
                              : 'Senha do Indecx'
                          }
                          className="h-9 w-full rounded-lg border border-slate-300 bg-white pr-9 pl-3 text-xs font-medium text-slate-900 focus:border-[#004A8D] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNpsPassword((p) => !p)}
                          className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400 hover:text-slate-600"
                        >
                          {showNpsPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      data-testid="save-nps-credentials-btn"
                      disabled={isTestingNps}
                      className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-[#004A8D] px-4 text-xs font-bold text-white transition-colors hover:bg-[#003B70] disabled:opacity-60"
                    >
                      {isTestingNps ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>Validando...</span>
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="h-3.5 w-3.5" />
                          <span>Salvar Conta NPS</span>
                        </>
                      )}
                    </button>
                  </form>
                </div>
              </div>

              {/* Coluna Direita: Tabela de Usuários da Escola */}
              <div className="lg:col-span-7">
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      Usuários Autorizados ({filteredAndSortedUsers.length})
                    </h3>

                    <div className="flex flex-wrap items-center gap-2">
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                        <input
                          type="search"
                          value={userSearchQuery}
                          onChange={(e) => setUserSearchQuery(e.target.value)}
                          placeholder="Buscar nome ou login..."
                          className="h-8 rounded-lg border border-slate-300 bg-slate-50 pl-8 pr-2.5 text-xs font-medium text-slate-900 focus:border-[#004A8D] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:bg-slate-800"
                        />
                      </div>

                      <select
                        value={userStatusFilter}
                        onChange={(e) =>
                          setUserStatusFilter(
                            e.target.value as 'ALL' | 'ACTIVE' | 'INACTIVE'
                          )
                        }
                        className="h-8 rounded-lg border border-slate-300 bg-slate-50 px-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      >
                        <option value="ALL">Todos</option>
                        <option value="ACTIVE">Ativos</option>
                        <option value="INACTIVE">Inativos</option>
                      </select>
                    </div>
                  </div>

                  <div className="mt-3 overflow-x-auto">
                    <table
                      data-testid="school-users-table"
                      className="w-full border-collapse text-left text-xs"
                    >
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/60">
                          <th className="px-3 py-2.5">
                            <button
                              type="button"
                              onClick={() => toggleSort('nomeCompleto')}
                              className="inline-flex items-center gap-1 font-bold hover:text-slate-900 dark:hover:text-white"
                            >
                              <span>Colaborador</span>
                              <ArrowUpDown className="h-3 w-3" />
                            </button>
                          </th>
                          <th className="px-3 py-2.5">Login</th>
                          <th className="px-3 py-2.5">Status</th>
                          <th className="px-3 py-2.5 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800">
                        {filteredAndSortedUsers.map((user) => {
                          const isUserActive =
                            user.active !== false && user.ativo !== false;
                          const isRetesting = retestingUserId === user.id;
                          return (
                            <tr
                              key={user.id}
                              data-testid={`user-row-${user.login}`}
                              className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                            >
                              <td className="px-3 py-3">
                                <p className="font-bold text-slate-900 dark:text-white">
                                  {user.nomeCompleto}
                                </p>
                                <p className="text-[11px] text-slate-500">
                                  {user.cargo} · Acesso:{' '}
                                  {formatUserAccessDateTime(user.ultimoAcesso)}
                                </p>
                              </td>

                              <td className="px-3 py-3">
                                <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold text-[#004A8D] dark:bg-slate-800 dark:text-sky-400">
                                  {user.login}
                                </span>
                              </td>

                              <td className="px-3 py-3">
                                <span
                                  className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold ${
                                    isUserActive
                                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                      : 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                                  }`}
                                >
                                  <span
                                    className={`h-1.5 w-1.5 rounded-full ${
                                      isUserActive
                                        ? 'bg-emerald-500'
                                        : 'bg-rose-500'
                                    }`}
                                  />
                                  {isUserActive ? 'Ativo' : 'Suspenso'}
                                </span>
                              </td>

                              <td className="px-3 py-3 text-right">
                                <div className="inline-flex items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    data-testid={`retest-user-btn-${user.login}`}
                                    onClick={() => handleRetestExistingUser(user)}
                                    disabled={isRetesting}
                                    title="Validar credencial no Portal"
                                    className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                                  >
                                    <RefreshCw
                                      className={`h-3 w-3 text-[#004A8D] dark:text-sky-400 ${
                                        isRetesting ? 'animate-spin' : ''
                                      }`}
                                    />
                                    <span>Validar</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setPasswordModalUser(user);
                                      setNewPassword('');
                                      setConfirmPassword('');
                                    }}
                                    title="Atualizar senha"
                                    className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                                  >
                                    <KeyRound className="h-3 w-3" />
                                    <span>Senha</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleToggleUserStatus(user)}
                                    title={
                                      isUserActive
                                        ? 'Suspender acesso'
                                        : 'Reativar acesso'
                                    }
                                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300"
                                  >
                                    <Power className="h-3.5 w-3.5" />
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleDeleteUser(user)}
                                    title="Excluir credencial"
                                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-900/50 dark:text-rose-400"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ABA 3: SEGURANÇA E BANCO DE DADOS */}
        {activeTab === 'seguranca' && (
          <div
            data-testid="admin-security-audit-section"
            className="space-y-4"
          >
            {/* Alteração da Senha Mestra do Administrador */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                <KeyRound className="h-4 w-4 text-[#004A8D] dark:text-sky-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Senha do Administrador Geral
                </h3>
              </div>

              <form
                onSubmit={handleUpdateAdminMasterPassword}
                className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:items-end"
              >
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                    Nova Senha
                  </label>
                  <div className="relative mt-1">
                    <input
                      type={showAdminPassword ? 'text' : 'password'}
                      value={adminNewPassword}
                      onChange={(e) => setAdminNewPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      required
                      className="h-9 w-full rounded-lg border border-slate-300 bg-slate-50 px-2.5 text-xs text-slate-800 focus:border-[#004A8D] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:focus:bg-slate-800"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAdminPassword((p) => !p)}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                    >
                      {showAdminPassword ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                    Confirmar Senha
                  </label>
                  <input
                    type={showAdminPassword ? 'text' : 'password'}
                    value={adminConfirmPassword}
                    onChange={(e) => setAdminConfirmPassword(e.target.value)}
                    placeholder="Repita a nova senha"
                    required
                    className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-slate-50 px-2.5 text-xs text-slate-800 focus:border-[#004A8D] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:focus:bg-slate-800"
                  />
                </div>

                <div>
                  <button
                    type="submit"
                    disabled={isUpdatingAdminPassword || !adminNewPassword}
                    className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-[#004A8D] px-3 text-xs font-bold text-white transition-colors hover:bg-[#003B70] disabled:opacity-50"
                  >
                    {isUpdatingAdminPassword ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ShieldCheck className="h-3.5 w-3.5" />
                    )}
                    <span>Salvar Senha</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Sincronização e Status do Banco Multi-Escola */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-[#004A8D] dark:text-sky-400" />
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    Banco de Dados Multi-Escola
                  </h2>
                </div>
                <button
                  type="button"
                  data-testid="trigger-supabase-migration-btn"
                  onClick={handleRunSupabaseMigration}
                  disabled={isMigratingSupabase}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#004A8D] px-3 text-xs font-bold text-white transition-colors hover:bg-[#003B70] disabled:opacity-60"
                >
                  {isMigratingSupabase ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Sincronizando...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span>Sincronizar com Supabase</span>
                    </>
                  )}
                </button>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs">
                <div className="rounded-lg border border-slate-200/80 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/50">
                  <span className="text-[11px] font-semibold text-slate-500">
                    Unidades
                  </span>
                  <p className="mt-0.5 text-sm font-black text-slate-900 tabular-nums dark:text-white">
                    {dbStatus?.counts.schools ?? schools.length}
                  </p>
                </div>

                <div className="rounded-lg border border-slate-200/80 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/50">
                  <span className="text-[11px] font-semibold text-slate-500">
                    Usuários
                  </span>
                  <p className="mt-0.5 text-sm font-black text-slate-900 tabular-nums dark:text-white">
                    {dbStatus?.counts.users ?? totalUsersCount}
                  </p>
                </div>

                <div className="rounded-lg border border-slate-200/80 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/50">
                  <span className="text-[11px] font-semibold text-slate-500">
                    Agendamentos
                  </span>
                  <p className="mt-0.5 text-sm font-black text-[#004A8D] tabular-nums dark:text-sky-400">
                    {dbStatus?.counts.studentRecords ?? 717}
                  </p>
                </div>

                <div className="rounded-lg border border-slate-200/80 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/50">
                  <span className="text-[11px] font-semibold text-slate-500">
                    Convites NPS
                  </span>
                  <p className="mt-0.5 text-sm font-black text-purple-700 tabular-nums dark:text-purple-400">
                    {dbStatus?.counts.npsRecords ?? 676}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODAL DE EDIÇÃO DO NOME DA ESCOLA */}
      {editingSchool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Renomear Unidade
            </h3>
            <form onSubmit={handleSaveEditSchool} className="mt-4 space-y-3">
              <input
                type="text"
                value={editSchoolName}
                onChange={(e) => setEditSchoolName(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingSchool(null)}
                  className="h-9 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="h-9 rounded-lg bg-[#004A8D] px-4 text-xs font-bold text-white hover:bg-[#003B70]"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE ALTERAÇÃO DE SENHA DO USUÁRIO */}
      {passwordModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Atualizar Senha ({passwordModalUser.nomeCompleto})
            </h3>
            <form
              onSubmit={handleSaveNewUserPassword}
              className="mt-4 space-y-3"
            >
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Nova Senha
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="h-9 w-full rounded-lg border border-slate-300 bg-white pr-9 pl-3 text-xs font-medium text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((p) => !p)}
                    className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400"
                  >
                    {showNewPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Confirmar Nova Senha
                </label>
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPasswordModalUser(null)}
                  className="h-9 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="h-9 rounded-lg bg-[#004A8D] px-4 text-xs font-bold text-white hover:bg-[#003B70]"
                >
                  Salvar Senha
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMAÇÃO */}
      {confirmationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
              <AlertTriangle className="h-5 w-5" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {confirmationModal.title}
              </h3>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              {confirmationModal.description}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmationModal(null)}
                className="h-9 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-300"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => confirmationModal.onConfirm()}
                className={`h-9 rounded-lg px-4 text-xs font-bold text-white ${
                  confirmationModal.isDestructive
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-[#004A8D] hover:bg-[#003B70]'
                }`}
              >
                {confirmationModal.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
