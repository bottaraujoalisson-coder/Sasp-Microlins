export interface PrivacyKnowledgeTopic {
  id: string;
  question: string;
  category:
    | 'Armazenamento e Banco de Dados'
    | 'Criptografia e Senhas'
    | 'Controle de Acesso (RBAC)'
    | 'Isolamento Multi-Escola'
    | 'Coleta e Finalidade'
    | 'Segurança da Conta'
    | 'Retenção e Compartilhamento';
  categoryLabel: string;
  shortAnswer: string;
  detailedExplanation: string;
  legalBasis: string;
  technicalProof: string;
  keywords: string[];
  score?: number;
}

export type PrivacyKnowledgeArticle = PrivacyKnowledgeTopic;

export const PRIVACY_QUICK_QUESTIONS: string[] = [
  'Como meus dados são armazenados?',
  'Como funciona o isolamento entre escolas?',
  'Quem pode acessar minhas informações?',
  'Como as senhas e chaves são protegidas?',
  'Quais informações são coletadas?',
  'Como funciona a segurança da sessão?',
  'Por quanto tempo os dados são mantidos?',
];

export const PRIVACY_KNOWLEDGE_BASE: PrivacyKnowledgeTopic[] = [
  {
    id: 'armazenamento-dados',
    question: 'Como meus dados são armazenados?',
    category: 'Armazenamento e Banco de Dados',
    categoryLabel: 'Armazenamento e Banco de Dados',
    shortAnswer:
      'Os registros operacionais são armazenados em banco de dados relacional com integridade referencial, separação por unidade escolar e comunicação exclusivamente sob HTTPS/TLS.',
    detailedExplanation:
      'Os dados cadastrais de unidades escolares, perfis de acesso autorizados, agendamentos acadêmicos e convites de pesquisa NPS são persistidos em estrutura relacional (PostgreSQL / SQLite no servidor) com transações atômicas (ACID) e chaves estrangeiras ativas. Segredos de infraestrutura e chaves de API residem estritamente em variáveis de ambiente no servidor, sem exposição ao navegador.',
    legalBasis: 'Art. 46 da LGPD (Lei nº 13.709/2018)',
    technicalProof:
      'Tabelas relacionais estruturadas (schools, users, sessions, student_records, nps_records) com validação de esquema e restrições de chave estrangeira.',
    keywords: [
      'como meus dados sao armazenados',
      'armazenamento',
      'banco de dados',
      'onde ficam',
      'guardados',
      'salvos',
      'postgresql',
      'sqlite',
      'persistencia',
    ],
  },
  {
    id: 'isolamento-multi-escola',
    question: 'Como funciona o isolamento entre escolas?',
    category: 'Isolamento Multi-Escola',
    categoryLabel: 'Isolamento Multi-Escola',
    shortAnswer:
      'Cada registro acadêmico, usuário e convite NPS possui vínculo obrigatório com o identificador da unidade escolar (school_id / código da unidade), impedindo a leitura cruzada entre franquias.',
    detailedExplanation:
      'A arquitetura multi-escola vincula usuários operacionais, alunos, contratos e convites NPS ao identificador único de sua respectiva unidade escolar. Quando um colaborador autentica com perfil ESCOLA, o escopo da sessão restringe todas as consultas e filtros exclusivamente aos registros pertencentes à sua unidade. Apenas o perfil ADMIN possui visão administrativa para gerenciamento de unidades e credenciais.',
    legalBasis: 'Art. 6º, I e VII da LGPD (Finalidade e Segurança)',
    technicalProof:
      'Filtragem obrigatória por school_id, codigo_portal e unidade nas consultas de alunos, educadores e convites NPS.',
    keywords: [
      'isolamento',
      'multi-escola',
      'outra escola',
      'unidade',
      'franquia',
      'separacao',
      'school_id',
    ],
  },
  {
    id: 'acesso-informacoes',
    question: 'Quem pode acessar minhas informações?',
    category: 'Controle de Acesso (RBAC)',
    categoryLabel: 'Controle de Acesso (RBAC)',
    shortAnswer:
      'Apenas colaboradores autenticados e vinculados à unidade escolar possuem acesso aos indicadores pedagógicos, sob Controle de Acesso Baseado em Papéis (RBAC).',
    detailedExplanation:
      'O sistema opera com dois perfis estritos validados no servidor: Administrador (ADMIN) e Unidade Escolar (ESCOLA). Colaboradores da unidade acessam apenas o acompanhamento pedagógico e de satisfação (NPS) da própria escola, sendo bloqueados de rotas administrativas (/api/admin/*). Em conformidade com o princípio de minimização de dados (Art. 6º, III da LGPD), o painel pedagógico exibe apenas status financeiro binário ("Em dia" ou "Em atraso"), sem expor valores monetários ou boletos.',
    legalBasis: 'Art. 6º, III e VII da LGPD (Necessidade e Prevenção)',
    technicalProof:
      'Validação de sessão por token SHA-256 e verificação de perfil (RBAC) nos endpoints do servidor.',
    keywords: [
      'quem pode acessar minhas informacoes',
      'quem acessa',
      'quem ve',
      'permissoes',
      'acesso',
      'administrador',
      'professor',
      'educador',
      'financeiro',
      'rbac',
    ],
  },
  {
    id: 'protecao-senha',
    question: 'Como as senhas e chaves são protegidas?',
    category: 'Criptografia e Senhas',
    categoryLabel: 'Criptografia e Senhas',
    shortAnswer:
      'Senhas de usuários são processadas com hash Argon2id (salt aleatório de 16 bytes), credenciais de integração usam criptografia autenticada AES-256-GCM no servidor e segredos ficam em variáveis de ambiente.',
    detailedExplanation:
      'Nenhuma senha de usuário é armazenada em texto plano: aplica-se o algoritmo Argon2id (RFC 9106) com salt único de 128 bits e verificação em tempo constante. Chaves de API e segredos de ambiente são lidos exclusivamente via variáveis de ambiente no servidor (.env), nunca sendo enviados ao cliente front-end nem expostos em colunas legíveis pelo navegador.',
    legalBasis: 'Art. 46 e Art. 49 da LGPD',
    technicalProof:
      'Hashing Argon2id, criptografia simétrica autenticada em repouso e sanitização automática de respostas da API (sanitizeSchoolsForClient).',
    keywords: [
      'como minha senha e protegida',
      'senha',
      'hash',
      'argon2',
      'argon2id',
      'criptografada',
      'chaves',
      'variaveis de ambiente',
      'seguranca da senha',
    ],
  },
  {
    id: 'informacoes-coletadas',
    question: 'Quais informações são coletadas?',
    category: 'Coleta e Finalidade',
    categoryLabel: 'Coleta e Finalidade',
    shortAnswer:
      'São tratados estritamente os dados acadêmicos e cadastrais necessários para acompanhamento de frequência, progresso curricular, entrega de apostila, vínculo com educador e pesquisa NPS.',
    detailedExplanation:
      'Dados de Alunos e Responsáveis: Nome, número de contrato, telefone de contato institucional, e-mail cadastral, curso/formação, módulo, horários de aula, sala, educador responsável, notas, status de material didático e indicador binário de adimplência. Dados de Usuários do Sistema: Nome completo, identificador de login, cargo e unidade escolar vinculada. Os dados são utilizados unicamente para a execução do acompanhamento pedagógico contratado.',
    legalBasis: 'Art. 7º, V da LGPD (Execução de Contrato)',
    technicalProof:
      'Esquema de dados restrito aos atributos operacionais sincronizados dos sistemas oficiais da unidade.',
    keywords: [
      'quais informacoes sao coletadas',
      'dados coletados',
      'coleta',
      'quais dados',
      'aluno',
      'responsavel',
      'telefone',
      'contrato',
      'finalidade',
    ],
  },
  {
    id: 'seguranca-conta',
    question: 'Como funciona a segurança da sessão?',
    category: 'Segurança da Conta',
    categoryLabel: 'Segurança da Conta',
    shortAnswer:
      'O acesso conta com limitação de tentativas de login (Rate Limiting), tokens de sessão de 256 bits armazenados por hash SHA-256, sanitização contra XSS e queries parametrizadas.',
    detailedExplanation:
      'Após 5 tentativas consecutivas de login inválidas, o identificador é temporariamente bloqueado por 15 minutos contra ataques de força bruta. As sessões autenticadas geram tokens aleatórios de 256 bits (armazenados no banco apenas como hash SHA-256) com expiração automática, cookies HttpOnly + SameSite=Lax e proteção CSRF em operações sensíveis.',
    legalBasis: 'Art. 46 a 48 da LGPD',
    technicalProof:
      'Controle de tentativas em login_attempts, sessões com hash SHA-256 e consultas SQL parametrizadas (Prepared Statements).',
    keywords: [
      'como funciona a seguranca da minha conta',
      'seguranca da conta',
      'sessao',
      'bloqueio',
      'tentativas de login',
      'forca bruta',
      'xss',
      'sql injection',
      'csrf',
    ],
  },
  {
    id: 'retencao-compartilhamento',
    question: 'Por quanto tempo os dados são mantidos?',
    category: 'Retenção e Compartilhamento',
    categoryLabel: 'Retenção e Compartilhamento',
    shortAnswer:
      'Os dados são mantidos durante a vigência do vínculo contratual ativo da unidade e sincronizados apenas servidor-a-servidor com os sistemas institucionais (Portal MoveEdu e Indecx NPS).',
    detailedExplanation:
      'Não há comercialização ou compartilhamento de dados com terceiros não autorizados. A sincronização ocorre exclusivamente entre o back-end da plataforma e os sistemas oficiais utilizados pela escola (Portal do Aluno MoveEdu para agendamentos/frequência e Indecx para convites NPS). Os registros permanecem armazenados enquanto necessários para a gestão acadêmica ativa e cumprimento de obrigações legais ou contratuais (Art. 16, I da LGPD), sendo sessões expiradas limpas periodicamente.',
    legalBasis: 'Art. 15 e Art. 16 da LGPD (Término do Tratamento e Retenção)',
    technicalProof:
      'Comunicação autenticada no back-end e rotina automática de expurgo de sessões expiradas.',
    keywords: [
      'compartilhamento',
      'terceiros',
      'retencao',
      'quanto tempo',
      'prazo',
      'moveedu',
      'indecx',
      'vencimento',
    ],
  },
];

function normalizeSearchText(text: string): string {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function searchPrivacyKnowledgeBase(
  query: string,
  categoryFilter: string = 'TODAS'
): PrivacyKnowledgeTopic[] {
  const normalizedQuery = normalizeSearchText(query);

  let pool = PRIVACY_KNOWLEDGE_BASE;
  if (categoryFilter && categoryFilter !== 'TODAS') {
    pool = pool.filter((item) => item.category === categoryFilter);
  }

  if (!normalizedQuery) {
    return pool.map((item) => ({ ...item, score: 100 }));
  }

  const queryTokens = normalizedQuery
    .split(/\s+/)
    .filter(
      (t) =>
        t.length >= 2 &&
        ![
          'de',
          'da',
          'do',
          'os',
          'as',
          'um',
          'ou',
          'em',
          'na',
          'no',
          'por',
          'que',
          'sao',
          'meu',
          'meus',
          'minha',
          'minhas',
        ].includes(t)
    );

  const scored = pool
    .map((article) => {
      let score = 0;
      const qNorm = normalizeSearchText(article.question);
      const shortNorm = normalizeSearchText(article.shortAnswer);
      const detailNorm = normalizeSearchText(article.detailedExplanation);
      const keywordsNorm = article.keywords.map(normalizeSearchText);

      if (qNorm.includes(normalizedQuery)) {
        score += 100;
      }

      for (const kw of keywordsNorm) {
        if (kw.includes(normalizedQuery) || normalizedQuery.includes(kw)) {
          score += 50;
        }
      }

      for (const token of queryTokens) {
        if (qNorm.includes(token)) score += 25;
        if (keywordsNorm.some((k) => k.includes(token))) score += 20;
        if (shortNorm.includes(token)) score += 12;
        if (detailNorm.includes(token)) score += 8;
      }

      return { article: { ...article, score }, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.map((s) => s.article);
}
