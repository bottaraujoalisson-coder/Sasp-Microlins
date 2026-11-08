# DOCUMENTO COMPLETO DE REGRAS DE NEGÓCIO — SISTEMA MICROLINS

**Versão**: 3.0 — Homologada para Produção  
**Fuso Horário Oficial**: `America/Sao_Paulo` (Horário de Brasília)  
**Fontes Oficiais de Dados**: Portal do Aluno MoveEdu (`portaldoaluno.microlins.com.br`) & Indecx NPS API v2 (`indecx.com`)  
**Banco de Dados Autorizado**: Supabase PostgreSQL + Supabase Auth  

---

## 1. VISÃO GERAL E CONCEITOS FUNDAMENTAIS

O Sistema Microlins é uma plataforma corporativa de gestão acadêmica, acompanhamento pedagógico em tempo real, inteligência de frequência e retenção de alunos.

### 1.1. Pilares Arquiteturais
1. **Fonte Autoritativa**: O Portal do Aluno (`portaldoaluno.microlins.com.br`) é a referência factual absoluta para agendamentos, presenças, faltas, horários e notas.
2. **Tempo Real**: Atualização contínua com reconciliação pontual e preservação de registros históricos.
3. **Isolamento Multi-Escola**: Segregação lógica rígida por `school_id` (`sch_<uuid>`), impedindo que dados de uma unidade interfiram em outra.
4. **Segurança e LGPD**: Anonimização de contatos para visualizações restritas, bloqueio estrito de autocadastro e proteção contra vetores maliciosos (SQLi e XSS).

---

## 2. REGRAS DE CLASSIFICAÇÃO DE ALUNOS E FORMAÇÕES

### 2.1. Classificação Exclusiva pela Formação (`formacao`)
- **Regra Mandatória**: Toda a validação, filtragem e separação de cursos entre **'INGLÊS'** e **'PROFISSIONALIZANTE'** é realizada **EXCLUSIVAMENTE pela FORMAÇÃO DO ALUNO (`formacao`)**.
- **Proibição Estrita**: A classificação **NUNCA** deve ser inferida pelo nome da sala (`sala`), laboratório ou módulo isolado.
- **Categorias Permitidas**:
  - `INGLÊS`: Identificado quando `formacao` contiver os termos `INGL`, `ENGLISH`, `ANNUAL BOOK` ou `SPEED`.
  - `PROFISSIONALIZANTE`: Todas as demais formações (Informática, Gestão Empresarial, Robótica, Design, Farmácia, etc.).

### 2.2. Separação por Formação do Aluno
- Alunos vinculados ao mesmo contrato que possuam mais de uma formação devem ser desmembrados em **registros analíticos distintos**.
- O número de contrato **NUNCA** deve ser utilizado isoladamente para consolidar formações diferentes.
- A chave de consolidação e separação é gerada por `buildStudentFormationKey(aluno, formacao)`.

### 2.3. Unificação de Alunos Ativos Únicos
- Para fins de métricas de alunos ativos únicos (`totalAlunosUnicos`), alunos com múltiplos contratos ou múltiplas formações são contabilizados **uma única vez** com base na sua identidade unificada (`normalizeStudentName(nomeCompleto)` ou contrato principal).

---

## 3. MOTOR DE APURAÇÃO DE PRESENÇAS, FALTAS E HORÁRIOS

A apuração de frequência é realizada pela função centralizada `evaluateStudentAttendance` e opera em 4 estados possíveis:

### 3.1. Estado: PRESENÇA (`Presença`)
- **Precedência Absoluta**: Um registro factual de presença emitido pelo Portal do Aluno (`presencaOuFalta === 'P'`, `status === 'FINALIZADO'`, `status === 'INICIADO'`, `CodigoAulasRealizadas`, ou com carimbos `inicio`/`fim` registrados) tem **precedência máxima e irrevogável**.
- **Imutabilidade**: Se o aluno compareceu ou iniciou a aula, o status permanece **Presença** em qualquer dia, horário ou visualização, jamais sendo rebaixado para "Não iniciada" ou "Falta".
- **Aulas Adiantadas**: Se o aluno iniciar a aula antes do horário agendado (ex.: agendamento às 10:00 e início registrado às 09:50), a presença é reconhecida imediatamente com status `INICIADO`.

### 3.2. Estado: FALTA (`Falta`)
A falta é computada sob duas condições factuais e auditáveis:
1. **Falta Registrada pelo Sistema**: Quando o Portal do Aluno retorna expressamente `presencaOuFalta === 'F'` ou `status === 'FALTA'`.
2. **Dias Anteriores (`PAST_DAY`)**: Quando a aula pertencer a um dia anterior da semana já encerrado e o lote/turma possuir confirmação de fechamento pelo Portal, qualquer agendamento sem presença registrada converte-se automaticamente em **Falta** (`ScheduleStage: FALTA_CONTABILIZADA`).
3. **Dia Atual (`CURRENT_DAY`) - Tolerância de 15 Minutos Expirada**: No dia em andamento, se o horário atual de Brasília ultrapassar o horário agendado de início em **mais de 15 minutos** (`currentTimeMinutes > scheduledStartMinutes + 15`) e o aluno não tiver registrado entrada (`inicio === ''`), o horário converte-se pontualmente em **Falta**.

### 3.3. Estado: NÃO INICIADA (`Não iniciada`)
Aplicado exclusivamente quando a aula ainda não ocorreu ou está dentro da janela permitida:
1. **Dias Futuros (`FUTURE_DAY`)**: Agendamentos para dias posteriores da semana vigente.
2. **Dia Atual Antes do Horário**: Agendamentos cujo horário de início ainda não chegou (`currentTimeMinutes < scheduledStartMinutes`) e o aluno não iniciou a aula adiantado.
3. **Janela de Tolerância (15 Minutos)**: No dia atual, entre o horário marcado e os 15 minutos subsequentes (`scheduledStartMinutes <= currentTimeMinutes <= scheduledStartMinutes + 15`), o status permanece *"Não iniciada"* com a flag de advertência ativa `isWithinTolerance = true`.
4. **Proteção Contra Falsas Faltas (Turmas Não Sincronizadas)**: Se um dia ou turno inteiro possuir agendamentos mas contar com **0 presenças e 0 faltas** no Portal do Aluno (ex.: feriado, dia sem aula ou turno matutino que ainda não sincronizou), os alunos permanecem como *"Não iniciada"*, impedindo a fabricação artificial de faltas em massa.

### 3.4. Fórmula da Taxa de Frequência
$$\text{Taxa de Frequência (\%)} = \left( \frac{\text{Total de Presenças}}{\text{Total de Presenças} + \text{Total de Faltas}} \right) \times 100$$
- Aulas *"Não iniciadas"* **NÃO** entram no denominador para não distorcer a métrica de comparecimento real.

---

## 4. REGRA DE NEGÓCIO DE EVASÃO (AUSÊNCIA PARCIAL)

### 4.1. Apuração Estrita por Formação do Aluno
- **Regra Fundamental**: O cálculo de evasão é realizado **por formação do aluno, e não por contrato**.
- Se o aluno possuir mais de 1 formação (ex.: *Informática* e *Inglês*):
  - Cada formação é analisada e contabilizada de forma **completamente isolada e independente**.
  - O comparecimento a uma aula de *Informática* não anula nem interfere nas presenças/faltas de *Inglês*.

### 4.2. Critério de Atribuição de Evasão
Para que uma formação do aluno seja classificada em **Evasão** (`isEvasao = true`) no dia:
1. A formação do aluno deve possuir **2 ou mais agendamentos no mesmo dia** ($\text{totalAgendamentosDia} \ge 2$).
2. O aluno deve possuir **pelo menos 1 Presença confirmada** ($\text{presencaCount} \ge 1$) naquela formação.
3. O aluno deve possuir **pelo menos 1 Falta contabilizada** ($\text{faltaCount} \ge 1$) em outro horário da mesma formação cujo horário/tolerância já expirou.

### 4.3. Cenários de Validação
| Cenário do Aluno no Mesmo Dia | Formação A (Informática) | Formação B (Inglês) | Resultado de Evasão |
| :--- | :--- | :--- | :--- |
| **1 aula de cada formação** | 08h: Presença | 09h: Falta | **Sem Evasão** (Cada formação teve apenas 1 agendamento). |
| **2 aulas em A e 1 aula em B** | 08h: Presença / 09h: Falta | 10h: Presença | **Evasão exclusiva na Formação A** (`evasaoCount = 1`). Formação B regular. |
| **2 aulas em A e 2 aulas em B** | 08h: Presença / 09h: Falta | 10h: Presença / 11h: Falta | **Evasão em ambas as formações** (`evasaoCount = 2`). |
| **Falta a todos os horários** | 08h: Falta / 09h: Falta | — | **Sem Evasão** (Trata-se de Falta Integral, não comparecimento parcial). |
| **Presença em todos os horários**| 08h: Presença / 09h: Presença| — | **Sem Evasão** (Frequência 100%). |

### 4.4. Remoção Automática de Evasão
O status de evasão é imediatamente revogado (`isEvasao = false`, `evasaoSummary = null`) se:
- O professor lançar justificativa ou marcar presença manual na aula faltante;
- A aula faltante for convertida em presença pelo Portal do Aluno;
- A falta for reposta no mesmo dia.

### 4.5. Contabilização nos Indicadores (KPIs)
- O totalizador `evasaoCount` (no cabeçalho do Kanban e nas colunas) contabiliza o total de **formações de alunos em evasão**, utilizando o conjunto único de chaves `buildStudentFormationKey(aluno, formacao)`.

---

## 5. REGRAS DO CONSOLIDADO & POSSÍVEIS DESISTÊNCIAS

### 5.1. Critérios Cumulativos de "Possível Desistência"
Um aluno é classificado como **Possível Desistência** (`isPossivelDesistencia = true`) se e somente se atender simultaneamente aos critérios pedagógicos, financeiros e de frequência:
1. **Frequência Baixa ou Ausência Crítica**:
   - Taxa de frequência semanal inferior a 50% OU 2 ou mais faltas acumuladas sem reposição.
2. **Inadimplência Financeira**:
   - Possuir 1 ou mais parcelas em atraso registradas no Portal (`inadimplente === true` ou `parcelasAtrasadas > 0`).
3. **Engajamento ou Pendência de Material**:
   - Estar sem apostila entregue OU apresentar sinais de evasão recorrente.

### 5.2. Regra de Exclusão Obrigatória
- **Alunos sem aulas contabilizadas**: Alunos que possuem 0 aulas realizadas na semana (frequência `null` e 0 aulas computadas) **NÃO PODEM** ser considerados possíveis desistências, evitando alarmes falsos em semanas de matrícula nova ou turmas inaugurais.

---

## 6. REGRAS DO PORTAL NPS (INDECX & SATISFAÇÃO)

### 6.1. Cruzamento Hierárquico em 4 Níveis
A conciliação entre a grade diária do Portal do Aluno e a base de convites da Indecx segue uma hierarquia rigorosa:
1. **Nível 1 - Contrato**: Correspondência exata pelo número do contrato do aluno.
2. **Nível 2 - Nome do Aluno**: Correspondência por nome normalizado (`normalizeStudentName(NomeAluno)`).
3. **Nível 3 - Nome do Responsável**: Correspondência quando o convite foi enviado ao responsável financeiro/pedagógico.
4. **Nível 4 - E-mail**: Correspondência por endereço de e-mail sanitizado.

### 6.2. Ciclos da Pesquisa NPS
Os convites são divididos nos seguintes marcos contratuais:
- `Novo contrato` (boas-vindas);
- `30 dias` (primeiras impressões);
- `50 dias` (andamento do módulo);
- `70 dias` (metade do curso);
- `Concluído` (término e formatura).

### 6.3. Priorização no Portal do Aluno
- Alunos com convite ativo (`answered === false` e `status === 'Ativo'`) que possuem aula no dia recebem destaque prioritário no Kanban NPS e formulário automático de resposta ao logarem no Portal do Aluno.

---

## 7. REGRAS DE MATERIAL DIDÁTICO E DESAFIO PEDAGÓGICO

### 7.1. Regra da Aula 3 e Aula 4
- Alunos na **Aula 3 ou 4** em diante (`aulaNumero >= 3`) que **não possuem apostila entregue** (`possuiApostila === false`):
  - **Desafio Pedagógico**: Se o aluno estiver com a situação financeira em dia (`inadimplente === false`), o caso é classificado como falha de entrega pedagógica/estoque.
  - **Desafio Financeiro**: Se o aluno possuir parcelas em atraso, a retenção de material didático decorre de bloqueio contratual/financeiro.

### 7.2. Registro de Causa Explícita
- Toda falta de material didático pode receber justificativa formal cadastrada pela coordenação (`causaFaltaMaterialExplicita`), persistida no Supabase e mantida no histórico do aluno.

---

## 8. REGRAS DE EDUCADORES E VÍNCULO PEDAGÓGICO

1. **Vínculo Oficial**: Cada aluno agendado deve ter seu educador responsável devidamente identificado através do mapeamento do Portal do Aluno.
2. **Eliminação de "A Definir"**: Não é permitida a exibição de status genéricos ("A definir" ou "Não informado"). O sistema recorre ao educador cadastrado no contrato ou na turma ativa da escola.
3. **Filtro no Kanban e Coluna no Consolidado**: O educador é filtro de visualização no Kanban e coluna ordenável na tabela consolidada.

---

## 9. REGRAS DE SEGURANÇA, PERSISTÊNCIA E INFRAESTRUTURA

1. **Banco Único Autorizado**: **Supabase PostgreSQL**. Qualquer mecanismo legado de armazenamento local (SQLite, arquivos `.db`, `localStorage`) está terminantemente desativado.
2. **Bloqueio de Cadastro Aberto**: O auto-cadastro público de novos usuários via UI (`signUp`) é **estritamente proibido**. Apenas o Administrador da Plataforma pode provisionar escolas e contas de usuários.
3. **Controle de Sessão e Rate Limiting**: Proteção contra ataques de força bruta com bloqueio temporário após 5 tentativas consecutivas de credenciais incorretas.
4. **Criptografia e Hashing**: Senhas administrativas e de usuários são protegidas por algoritmo de hash de alta resistência (Argon2id) e segredos sensíveis são criptografados com AES-256-GCM.
5. **Sanitização de Entradas**: Payloads contendo tags maliciosas (`<script>`, SQL Injection ou XSS) são interceptados e bloqueados com erro `HTTP 400 Bad Request`.
