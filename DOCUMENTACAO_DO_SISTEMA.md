# Documentação Técnica e Funcional do Sistema
## Microlins — Plataforma de Gestão, Desempenho e Monitoramento Acadêmico

**Versão:** 2.5 (Produção / Homologação)  
**Data da Documentação:** Novembro de 2026  
**Desenvolvido para:** Grupo Realizar Microlins  

---

## 1. Visão Geral da Plataforma

A plataforma foi desenvolvida para suprir a necessidade de acompanhamento em tempo real da jornada acadêmica, retenção de alunos, controle de frequência e satisfação (NPS) nas escolas da rede Microlins.

O sistema integra dados operacionais do **Portal do Aluno Microlins** e da plataforma de pesquisas **Indecx NPS**, transformando dados fragmentados em inteligência visual e acionável por meio de Kanbans dinâmicos, alertas preventivos de evasão e uma tabela analítica consolidada estilo Power BI.

---

## 2. Autenticação e Perfis de Acesso

### 2.1. Tela de Login Unificada
* **Interface Limpa e Focada:** Layout centralizado com a identidade visual institucional e logotipo oficial da Microlins.
* **Segurança de Entrada:** Campos para `Login` e `Senha`, com botão de alternância (olho) para visualização segura da senha.
* **Lembrar Login:** Opção funcional que salva de forma segura apenas o identificador de login no navegador (`localStorage`), sem gravar senhas.
* **Proteção contra Múltiplos Envios:** Bloqueio do botão com indicador de carregamento (*spinner*) para evitar requisições concorrentes.
* **Validação Rígida:** Usuários sem credenciais cadastradas pelo perfil administrador têm o acesso negado no servidor.

### 2.2. Perfis de Usuário
1. **Administrador Master (`ADMIN`):**
   * Acesso exclusivo ao Painel Administrativo.
   * Gestão de escolas (unidades), credenciais do NPS e cadastro de colaboradores.
   * Capacidade de auditar e acessar a visão de qualquer escola vinculada.
2. **Perfil da Escola (`ESCOLA`):**
   * Acesso operacional completo aos módulos da unidade à qual o colaborador pertence: **Kanban de Alunos**, **Kanban NPS** e **Consolidado**.
   * Identificação institucional no cabeçalho com nome da escola, nome completo do colaborador, cargo e login oficial.
   * Registro do último acesso gravado automaticamente a cada login.

---

## 3. Estrutura do Cabeçalho Institucional

O cabeçalho foi dividido em **duas áreas independentes** para eliminar sobreposições e garantir responsividade:

### 3.1. Área Superior (Identidade e Usuário)
* **Logotipo Oficial da Microlins:** Renderizado em alta definição e ajustado ao tema.
* **Identificação da Unidade:** Nome oficial da escola em destaque (ex.: `ESCOLA PRESIDENTE PRUDENTE`).
* **Identificação do Colaborador:** Nome Completo, Cargo/Função e identificador oficial (ex.: `João Pedro Pereira França · Auxiliar Pedagógico (#a116882)`).
* **Alternador de Tema:** Alternância entre Modo Claro (*Light*) e Modo Escuro (*Dark*) com persistência de preferência.
* **Acesso Administrativo:** Botão de acesso ao Painel ADM (disponível para administradores).
* **Botão Sair:** Encerramento seguro da sessão.

### 3.2. Área Inferior (Navegação e Sincronização)
* **Abas de Navegação:**
  * **Kanban de Alunos** (com contador dinâmico de alunos filtrados).
  * **Kanban NPS** (com contador de convites ativos).
  * **Consolidado** (com painel analítico gerencial).
* **Badge de Status de Conexão:** Indicador verde de status ativo (`Conexão Ativa · Portal & NPS`).
* **Horário Oficial de Brasília:** Timestamp com dia da semana atualizado (ex.: `Sincronizado: 01/11/2026 10:10 (Domingo)`).

---

## 4. Módulo: Painel Administrativo (ADM)

O Painel Administrativo foi projetado com interface limpa, sem tutoriais ou enumerações poluídas, focado em alta produtividade:

### 4.1. Aba Principal — Escolas Cadastradas (Tabela Geral)
* **Formulário de Cadastro:** Exige **obrigatoriamente apenas o Nome da Escola** (o código da escola não é solicitado manualmente).
* **Tabela de Escolas:**
  * Colunas com texto alinhado sem quebras (`whitespace-nowrap`): Nome da Escola, Código do Portal, Status (Ativa/Desativada), Quantidade de Usuários e Status do NPS.
  * **Ações Operacionais:**
    * **Botão "Acessar Escola":** Abre diretamente a gestão detalhada daquela unidade.
    * **Editar Nome:** Modal para renomear a unidade.
    * **Ativar/Desativar:** Bloqueia temporariamente o login de todos os usuários da unidade sem perder dados.
    * **Excluir:** Modal de confirmação detalhado listando os impactos (usuários e credenciais afetadas) antes de confirmar a exclusão.

### 4.2. Gestão Detalhada da Escola Selecionada
* **Credenciais do NPS (Indecx):**
  * Cadastro de e-mail e senha do NPS com visualizador de senha.
  * Botão **"Salvar Credencial NPS"**.
  * Botão **"Testar e Sincronizar NPS"** em tempo real com validação na plataforma Indecx e gravação de data/hora oficial do teste.
* **Cadastro de Usuários pelo Portal do Aluno:**
  * Inserção do login e da senha do colaborador no Portal do Aluno.
  * Botão **"Sincronizar Informações"**: busca em tempo real os dados oficiais na API do Portal.
  * **Preenchimento Automático Protegido:** Nome Completo, Cargo/Função, Escola Vinculada e Código preenchidos automaticamente como **SOMENTE LEITURA** (bloqueados contra alteração manual).
  * Botões **"Cadastrar Usuário"** e **"Limpar Dados"**.
* **Tabela de Usuários Vinculados:**
  * **Barra de Pesquisa:** Busca em tempo real por Nome Completo ou Login (`#...`).
  * **Filtros Rápidos:** Todos, Ativos e Inativos.
  * **Classificação (Ordenação):** Ordenação crescente/decrescente em todas as colunas.
  * **Coluna "Último Acesso":** Exibe a data e hora do último login do usuário no sistema.
  * **Ações:**
    * **Sincronizar (Inteligência Diff):** Compara os dados locais com o Portal do Aluno; se houver divergência, abre modal comparativo (*Valor Anterior* vs *Novo Valor*) para aprovação.
    * **Alterar Senha:** Modal com confirmação e botão de olho.
    * **Ativar/Desativar Usuário:** Bloqueia individualmente o acesso do colaborador.
    * **Acessar:** Entra imediatamente na visão da escola simulando o perfil do colaborador.
    * **Excluir:** Remove o usuário com modal de confirmação.

---

## 5. Módulo: Kanban de Alunos (Frequência e Aulas)

Focado no acompanhamento diário das turmas em tempo real:

* **Sincronia com Horário Real:** Identificação visual e fixação do horário da aula em andamento no horário oficial de Brasília.
* **Separação Obrigatória por Formação:**
  * Alunos classificados estritamente em **INGLÊS** ou **PROFISSIONALIZANTE** com base na **Formação do Aluno** (a sala física não determina o curso).
* **Regra Automática de 15 Minutos:**
  * Se a aula iniciou há mais de 15 minutos e o aluno não iniciou no sistema, o card é sinalizado para ação preventiva da equipe.
* **Reset Semanal aos Domingos:**
  * Toda a contagem de faltas e presenças é zerada no início do domingo, recalculando o fluxo conforme o cronograma semanal.
* **Ações Rápidas no Card do Aluno:**
  * **Botão WhatsApp Responsável / Aluno:** Abre diretamente o WhatsApp com mensagem personalizada contendo o nome do aluno, curso e escola.
  * **Acessar Aula:** Link direto e autenticado para a aula do aluno (usando tokens criptografados oficiais do Portal, rejeitando links quebrados).
* **Modal de Histórico Acadêmico:** Visualização completa de presenças, faltas, notas de módulos e situação financeira.

---

## 6. Módulo: Kanban NPS (Satisfação e Pesquisas)

Gestão dos ciclos de pesquisa de satisfação integrados à Indecx:

* **Divisão por Jornada:** Colunas separadas por tempo de curso: **30 dias**, **50 dias**, **70 dias** e **50+ dias**.
* **Enriquecimento com Envio Real:** Exibição do status real de entrega da plataforma Indecx:
  * `Enviado`
  * `Entregue`
  * `Aberto pelo aluno`
  * `Não entregue (Bounce / Erro)`
* **Deduplicação Inteligente:** Evita convites duplicados avaliando Nome, Jornada, Canal de Envio e Ano vigente.
* **Histórico do Aluno:** Modal com histórico de notas atribuídas, comentários e evolução do aluno.

---

## 7. Módulo: Consolidado (Dashboard e Tabela Analítica Power BI)

Painel analítico completo para diretores e coordenadores:

### 7.1. Seção de Cards Gerenciais (2 Linhas x 3 Colunas)
1. **Frequência Semanal:** Média diária ponderada das presenças.
2. **Aulas Ministradas:** Total de aulas iniciadas/concluídas no período.
3. **Evasões da Semana:** Alunos em risco iminente de desistência por acúmulo de faltas.
4. **Alunos Ativos:** Contagem total de matrículas ativas na unidade.
5. **3 Aulas sem Apostila e Financeiro em Dia:** Alunos a partir da 3ª aula que pagaram mas não receberam material didático.
6. **Desafios na Entrega de Apostilas:**
   * *Causa Pedagógica:* Financeiro em dia, apostila pendente de entrega.
   * *Causa Financeira:* Parcela em atraso e apostila retida.

### 7.2. Filtro Multi-Cards
* Permite clicar em múltiplos cards gerenciais simultaneamente para filtrar dinamicamente a tabela consolidada.

### 7.3. Tabela Analítica Consolidada
* **Configuração Lateral Esquerda Compacta:**
  * Seleção de colunas visíveis por *checkbox*.
  * **Fixação de até 2 Colunas** pelo ícone de alfinete (*pin*), mantendo colunas críticas fixas na rolagem horizontal.
* **Agrupamento Relevante Dinâmico (Até 3 Níveis):**
  * Agrupamento por Formação, Módulo, Dia da Aula, Horário, Sala, Modalidade ou Categoria.
  * Botões de recolher e expandir grupos para análise hierárquica fluida.
* **Frequência Direta:** Coluna de frequência limpa e padronizada (sem poluição de faltas/presenças redundantes na tabela).
* **Barra de Pesquisa:** Busca por nome do aluno ou número do contrato.
* **Exportação de Dados:** Botões para download imediato em **Excel (.xlsx)** e **CSV**, posicionados no topo direito do cabeçalho da tabela.

---

## 8. Arquitetura do Backend e Integrações

* **Node.js + Express + TypeScript:** API corporativa rodando em conjunto com o Vite SPA.
* **Armazenamento Persistente:** Banco estruturado em `.data/schools-registry.json` para persistência de escolas, credenciais e usuários.
* **Isolamento Multi-Tenant:** Ao alternar de escola ou usuário, o servidor limpa caches em memória, atualiza parâmetros de consulta e garante que nenhuma informação de uma escola seja visível por outra.
* **Auditoria de Qualidade:** 10 testes unitários automatizados cobrindo regras de negócio críticas (links de login, regras de 15 minutos, filtros de sábado/domingo, deduplicação de NPS e separação por formação).
