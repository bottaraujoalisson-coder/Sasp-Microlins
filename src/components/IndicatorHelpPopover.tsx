import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { HelpCircle, X } from 'lucide-react';

export interface IndicatorHelpDefinition {
  id: string;
  titulo: string;
  oQueRepresenta: string;
  dadosUtilizados: string;
  regraNegocioFormula: string;
  periodoConsiderado: string;
  filtrosQueInfluenciam: string;
  comoInterpretar: string;
}

export const SYSTEM_INDICATORS_HELP: Record<string, IndicatorHelpDefinition> = {
  // ==========================================================================
  // KANBAN DE ALUNOS (6 CARDS)
  // ==========================================================================
  KANBAN_TODOS_ALUNOS: {
    id: 'KANBAN_TODOS_ALUNOS',
    titulo: 'Todos os alunos (Agendamentos do Dia)',
    oQueRepresenta:
      'Total de agendamentos de aulas previstos para o dia da semana selecionado no Kanban de Alunos, acompanhado da contagem de alunos únicos.',
    dadosUtilizados:
      'Registros de agendamentos sincronizados do Portal do Aluno para a unidade ativa (contrato, nomeCompleto, diaSemana, horaInicio).',
    regraNegocioFormula:
      'Soma de todos os agendamentos filtrados no dia ativo. Alunos com mais de um horário no mesmo dia são contabilizados em agendamentos totais e unificados na contagem de alunos únicos.',
    periodoConsiderado:
      'Dia da semana selecionado na barra de navegação do Kanban (fuso horário America/Sao_Paulo).',
    filtrosQueInfluenciam:
      'Dia da semana, Busca por nome/contrato, Sala, Educador, Curso/Módulo, Período (Manhã/Tarde/Noite), Categoria (Inglês/Profissionalizante), Apostila, Financeiro e NPS.',
    comoInterpretar:
      'O número principal indica o volume total de aulas agendadas no dia; o subtítulo mostra quantos alunos distintos compõem essa grade.',
  },
  KANBAN_PRESENCA: {
    id: 'KANBAN_PRESENCA',
    titulo: 'Presença Confirmada',
    oQueRepresenta:
      'Quantidade de aulas em que o aluno teve presença confirmada no dia selecionado.',
    dadosUtilizados:
      'Campo presencaOuFalta ("P"), status ("INICIADO" ou "FINALIZADO"), timestamps de check-in/check-out (inicio/fim), origem "Sistema Acadêmico" (Inglês) ou apontamento manual do educador.',
    regraNegocioFormula:
      'Contabiliza Presença quando o horário da aula já chegou na semana vigente e o Portal do Aluno (ou override manual) confirma o comparecimento.',
    periodoConsiderado:
      'Dia da semana selecionado no Kanban de Alunos.',
    filtrosQueInfluenciam:
      'Dia da semana, Sala, Educador, Curso/Módulo, Período, Categoria, Apostila, Financeiro e Busca.',
    comoInterpretar:
      'Representa o total absoluto de presenças confirmadas nos horários já iniciados ou concluídos do dia.',
  },
  KANBAN_FALTA: {
    id: 'KANBAN_FALTA',
    titulo: 'Falta Contabilizada',
    oQueRepresenta:
      'Quantidade de agendamentos cujo horário e janela de tolerância já encerraram sem registro de presença, ou com falta explícita no Portal.',
    dadosUtilizados:
      'Campo presencaOuFalta ("F"), status ("NÃO INICIADO"), horário de início agendado + 15 minutos de tolerância e validação de fechamento/sincronização do turno.',
    regraNegocioFormula:
      'Contabiliza Falta somente quando: (1) o Portal informa "F" explicitamente, ou (2) já passaram mais de 15 minutos do início da aula em turno já sincronizado sem check-in do aluno.',
    periodoConsiderado:
      'Horários já encerrados do dia selecionado no Kanban.',
    filtrosQueInfluenciam:
      'Dia da semana, Sala, Educador, Curso/Módulo, Período, Categoria, Apostila, Financeiro e Busca.',
    comoInterpretar:
      'Mostra as ausências confirmadas. Turnos futuros ou ainda não sincronizados pelo Portal permanecem como "Não iniciada" e não geram falsas faltas.',
  },
  KANBAN_NAO_INICIADA: {
    id: 'KANBAN_NAO_INICIADA',
    titulo: 'Aula Não Iniciada / Em Tolerância',
    oQueRepresenta:
      'Agendamentos cujo horário ainda não começou, que estão dentro dos 15 minutos de tolerância ou aguardando sincronização do turno.',
    dadosUtilizados:
      'Horário agendado (horaInicio), hora atual de Brasília (America/Sao_Paulo) e status de sincronização do período.',
    regraNegocioFormula:
      'Inclui aulas de dias futuros da semana, aulas do dia atual antes de (horaInicio + 15 min) sem check-in, e turnos ainda não consolidados pelo Portal.',
    periodoConsiderado:
      'Dia selecionado em tempo real (horário de Brasília).',
    filtrosQueInfluenciam:
      'Dia da semana, Sala, Educador, Curso/Módulo, Período, Categoria, Apostila, Financeiro e Busca.',
    comoInterpretar:
      'Indica quantas aulas ainda vão acontecer no dia ou estão na janela de tolerância de 15 minutos para chegada do aluno.',
  },
  KANBAN_FREQUENCIA: {
    id: 'KANBAN_FREQUENCIA',
    titulo: 'Taxa de Frequência do Dia',
    oQueRepresenta:
      'Percentual de comparecimento efetivo sobre o total de aulas já contabilizadas (Presenças + Faltas) no dia selecionado.',
    dadosUtilizados:
      'Total de Presenças confirmadas e Total de Faltas contabilizadas nos agendamentos filtrados.',
    regraNegocioFormula:
      'Fórmula: Frequência (%) = [Presenças / (Presenças + Faltas)] × 100. Aulas "Não iniciadas" não entram no denominador para não distorcer a média.',
    periodoConsiderado:
      'Aulas contabilizadas no dia selecionado.',
    filtrosQueInfluenciam:
      'Todos os filtros ativos do Kanban (Dia, Sala, Educador, Curso, Período, Categoria, Financeiro, Apostila).',
    comoInterpretar:
      'Exibe de 0% a 100% o índice real de presença. Quando nenhuma aula foi contabilizada ainda no dia, exibe "Sem dados".',
  },
  KANBAN_EVASAO: {
    id: 'KANBAN_EVASAO',
    titulo: 'Evasão no Dia (Apurada por Formação)',
    oQueRepresenta:
      'Formações de alunos com 2 ou mais horários agendados no mesmo dia em que o aluno compareceu a pelo menos 1 aula, mas se ausentou de outro horário já encerrado.',
    dadosUtilizados:
      'Agrupamento de agendamentos por formação do aluno no mesmo dia com 2+ horários e cruzamento de status Presença × Falta.',
    regraNegocioFormula:
      'O cálculo de evasão é por formação do aluno, não por contrato. Se o aluno tiver mais de uma formação, cada formação é apurada individualmente. Atribuído quando totalAgendamentosDia na formação >= 2, presencaCount >= 1 e faltaCount >= 1. Removido automaticamente se a ausência for justificada/convertida em presença.',
    periodoConsiderado:
      'Dia da semana selecionado no Kanban.',
    filtrosQueInfluenciam:
      'Dia da semana, Sala, Educador, Curso/Módulo, Período, Categoria, Apostila e Financeiro.',
    comoInterpretar:
      'Alerta imediato de alunos que estavam na escola no 1º horário de sua formação e saíram antes do 2º horário. Alunos com múltiplas formações (ex: Informática e Inglês) têm cada formação avaliada e contabilizada de forma independente.',
  },

  // ==========================================================================
  // KANBAN NPS (5 CARDS)
  // ==========================================================================
  NPS_ELEGIVEIS_DIA: {
    id: 'NPS_ELEGIVEIS_DIA',
    titulo: 'Alunos Elegíveis no Dia (Kanban NPS)',
    oQueRepresenta:
      'Alunos agendados no dia selecionado que possuem convite NPS ativo e ainda não respondido no ano vigente.',
    dadosUtilizados:
      'Cruzamento em 4 níveis (Contrato, Nome do Aluno, Nome do Responsável, E-mail) entre a grade do Kanban e a base anual Indecx/Portal.',
    regraNegocioFormula:
      'Conta 1 card sincronizado por horário do aluno com pesquisa estritamente ativa (status = "Ativo" e answered = false).',
    periodoConsiderado:
      'Convites gerados no ano vigente (America/Sao_Paulo) vinculados aos alunos do dia selecionado.',
    filtrosQueInfluenciam:
      'Dia da semana, Ciclo NPS (Novo contrato, 30, 50, 70 dias, Concluído), Origem (Portal/E-mail), Status de Envio e Busca.',
    comoInterpretar:
      'Indica quantos alunos presentes na grade do dia devem ser abordados em sala para responder à pesquisa de satisfação.',
  },
  NPS_PORTAL_ALUNO: {
    id: 'NPS_PORTAL_ALUNO',
    titulo: 'Origem: Portal do Aluno',
    oQueRepresenta:
      'Convites NPS ativos cuja pesquisa está disponível diretamente no ambiente do Portal do Aluno.',
    dadosUtilizados:
      'Campo origem === "Portal do Aluno" nos convites NPS vinculados aos alunos do dia.',
    regraNegocioFormula:
      'Soma dos alunos elegíveis no dia cujo convite mais recente não respondido tem origem no Portal do Aluno.',
    periodoConsiderado:
      'Ano vigente + Dia da semana selecionado no Kanban NPS.',
    filtrosQueInfluenciam:
      'Dia da semana, Ciclo NPS, Status de entrega, Período e Busca.',
    comoInterpretar:
      'Mostra quantos alunos podem responder imediatamente ao abrir o Portal do Aluno durante a aula.',
  },
  NPS_EMAIL_INDECX: {
    id: 'NPS_EMAIL_INDECX',
    titulo: 'Origem: E-mail / Indecx',
    oQueRepresenta:
      'Convites NPS ativos disparados via plataforma Indecx por e-mail/link externo para o aluno ou responsável.',
    dadosUtilizados:
      'Campo origem === "E-mail" e rastreio de entrega (Enviado, Entregue, Aberto, Não entregue).',
    regraNegocioFormula:
      'Soma dos alunos elegíveis no dia cujo convite ativo foi emitido via disparo de E-mail Indecx.',
    periodoConsiderado:
      'Ano vigente + Dia da semana selecionado no Kanban NPS.',
    filtrosQueInfluenciam:
      'Dia da semana, Ciclo NPS, Status de entrega, Período e Busca.',
    comoInterpretar:
      'Permite identificar pesquisas enviadas ao e-mail do aluno ou responsável legal para orientação de resposta.',
  },
  NPS_CICLO_30_DIAS: {
    id: 'NPS_CICLO_30_DIAS',
    titulo: 'Jornada Inicial (Novo Contrato / 30 Dias)',
    oQueRepresenta:
      'Alunos elegíveis em fase de adaptação inicial (ciclos de Novo Contrato e 30 dias de curso).',
    dadosUtilizados:
      'Campo pontoJornada dos convites NPS ativos vinculados ao Kanban.',
    regraNegocioFormula:
      'Contabiliza convites ativos cujo ponto de jornada corresponde a "30 dias" ou "Novo contrato".',
    periodoConsiderado:
      'Ano vigente + Dia da semana selecionado.',
    filtrosQueInfluenciam:
      'Dia da semana, Origem, Status de entrega, Período e Busca.',
    comoInterpretar:
      'Destaca alunos recém-matriculados cuja percepção inicial de acolhimento e primeira aula é crítica para retenção.',
  },
  NPS_CICLO_50_70_DIAS: {
    id: 'NPS_CICLO_50_70_DIAS',
    titulo: 'Jornada Intermediária / Evolução (50 e 70+ Dias)',
    oQueRepresenta:
      'Alunos elegíveis nos ciclos de consolidação pedagógica (50 dias, 70 dias e Concluído).',
    dadosUtilizados:
      'Campo pontoJornada ("50 dias", "70 dias", "Concluído") dos convites NPS ativos.',
    regraNegocioFormula:
      'Soma dos convites ativos vinculados aos alunos do dia nos pontos de jornada de 50 dias, 70 dias ou conclusão.',
    periodoConsiderado:
      'Ano vigente + Dia da semana selecionado.',
    filtrosQueInfluenciam:
      'Dia da semana, Origem, Status de entrega, Período e Busca.',
    comoInterpretar:
      'Mede a satisfação com a evolução didática, professor, apostilas e infraestrutura ao longo do curso.',
  },

  // ==========================================================================
  // CONSOLIDADO (6 CARDS / SUB-INDICADORES)
  // ==========================================================================
  CONSOLIDADO_FORMACOES_ATIVAS: {
    id: 'CONSOLIDADO_FORMACOES_ATIVAS',
    titulo: 'Formações Ativas (Inglês e Profissionalizante)',
    oQueRepresenta:
      'Total de matrículas/formações ativas consolidadas na semana, separadas exclusivamente pela Formação do Aluno em Inglês ou Profissionalizante.',
    dadosUtilizados:
      'Chave composta (Contrato + Formação do Aluno) em todos os agendamentos da semana dos CADs selecionados.',
    regraNegocioFormula:
      'Cada par único (Contrato + Formação) gera 1 registro consolidado. Classificação Inglês vs Profissionalizante avalia exclusivamente o campo formacao.',
    periodoConsiderado:
      'Semana completa vigente (Segunda a Sábado) das bases/CADs ativos.',
    filtrosQueInfluenciam:
      'CADs selecionados, Categoria, Dias da Semana, Horários, Sala, Módulo, Educador, Apostila, Financeiro, Aula Mín/Máx e Filtros de Coluna.',
    comoInterpretar:
      'O número principal mostra o total de formações ativas em curso; os subtotais dividem entre Inglês e Profissionalizante.',
  },
  CONSOLIDADO_ALUNOS_E_DESISTENCIAS: {
    id: 'CONSOLIDADO_ALUNOS_E_DESISTENCIAS',
    titulo: 'Alunos Ativos Únicos & Possíveis Desistências',
    oQueRepresenta:
      'Card duplo: à esquerda exibe o total de Alunos Ativos Únicos (unificando quem possui mais de um contrato/formação); à direita exibe os alunos em alerta de Possível Desistência.',
    dadosUtilizados:
      'Identidade normalizada do aluno (Alunos Ativos) e cruzamento simultâneo de Financeiro + Apostila + Frequência com pelo menos 1 aula contabilizada.',
    regraNegocioFormula:
      'Alunos Ativos: contagem distinta de pessoas físicas. Possíveis Desistências: exige simultaneamente (1) Financeiro em atraso, (2) Sem apostila entregue, (3) 0% de frequência e (4) pelo menos 1 aula contabilizada (presencaCount + faltaCount >= 1).',
    periodoConsiderado:
      'Semana vigente consolidada.',
    filtrosQueInfluenciam:
      'Todos os filtros globais e de coluna da aba Consolidado.',
    comoInterpretar:
      'Alunos sem nenhuma aula contabilizada não entram em Possíveis Desistências. O percentual indica a proporção sobre as formações ativas filtradas.',
  },
  CONSOLIDADO_APOSTILAS: {
    id: 'CONSOLIDADO_APOSTILAS',
    titulo: 'Apostilas Entregues vs. Sem Apostila',
    oQueRepresenta:
      'Índice de cobertura de material didático físico/apostila entregue aos alunos em formação.',
    dadosUtilizados:
      'Campo possuiApostila e tipoMaterial validados por contrato e formação na semana.',
    regraNegocioFormula:
      'Entregue (%) = (Formações com Apostila Entregue / Total de Formações Filtradas) × 100.',
    periodoConsiderado:
      'Semana vigente consolidada.',
    filtrosQueInfluenciam:
      'Todos os filtros da aba Consolidado (Categoria, Sala, Educador, Financeiro, Dias, Horários).',
    comoInterpretar:
      'Permite acompanhar a meta de 100% de entrega de material didático e filtrar rapidamente quem ainda está pendente.',
  },
  CONSOLIDADO_FREQUENCIA_E_EVASOES: {
    id: 'CONSOLIDADO_FREQUENCIA_E_EVASOES',
    titulo: 'Frequência Semanal & Evasões',
    oQueRepresenta:
      'Card duplo: à esquerda exibe a Taxa de Frequência Semanal acumulada (Presenças vs Faltas); à direita exibe o total e percentual de formações com Evasão na semana.',
    dadosUtilizados:
      'Soma das presenças e faltas contabilizadas na semana pela função compartilhada evaluateAllStudentsAttendance e evaluateDayScheduleEvasao por formação do aluno.',
    regraNegocioFormula:
      'Frequência (%) = [Total Presenças / (Total Presenças + Total Faltas)] × 100. Evasão: calculada por formação do aluno (aluno com 2+ horários na mesma formação no mesmo dia que teve pelo menos 1 presença e 1 falta). Alunos com múltiplas formações são apurados por cada formação.',
    periodoConsiderado:
      'Dias e turnos já contabilizados na semana vigente.',
    filtrosQueInfluenciam:
      'Todos os filtros ativos na aba Consolidado.',
    comoInterpretar:
      'Garante 100% de paridade matemática com o Kanban de Alunos. Clique em Presenças, Faltas ou Evasões para isolar o grupo na tabela.',
  },
  CONSOLIDADO_FINANCEIRO: {
    id: 'CONSOLIDADO_FINANCEIRO',
    titulo: 'Situação Financeira (Em Dia vs. Em Atraso)',
    oQueRepresenta:
      'Distribuição das formações ativas conforme a adimplência contratual sincronizada do Portal.',
    dadosUtilizados:
      'Indicador inadimplente (Em dia vs Em atraso) de cada formação consolidada.',
    regraNegocioFormula:
      'Em Dia (%) = (Formações Sem Atraso / Total Filtrado) × 100. Em Atraso = Formações com parcela pendente.',
    periodoConsiderado:
      'Posição cadastral vigente na semana.',
    filtrosQueInfluenciam:
      'Todos os filtros ativos na aba Consolidado.',
    comoInterpretar:
      'Cruza saúde financeira com retenção pedagógica, permitindo atuar preventivamente nos alunos em atraso.',
  },
  CONSOLIDADO_SEM_APOSTILA_E_NPS: {
    id: 'CONSOLIDADO_SEM_APOSTILA_E_NPS',
    titulo: 'Desafio Sem Apostila & Presença s/ Resposta NPS',
    oQueRepresenta:
      'Card duplo operacional: à esquerda separa os alunos Sem Apostila por causa Pedagógica (Fin. em dia) vs Financeira (Fin. em atraso); à direita mostra alunos que tiveram Presença na semana mas ainda possuem NPS ativo pendente.',
    dadosUtilizados:
      'Cruzamento (!possuiApostila × inadimplente) e (presencaCount > 0 × hasActiveNps).',
    regraNegocioFormula:
      'Fin. em dia s/ apostila = falha operacional de entrega. Fin. em atraso s/ apostila = bloqueio financeiro. Presença s/ NPS = aluno esteve em sala e ainda não respondeu à pesquisa ativa.',
    periodoConsiderado:
      'Semana vigente consolidada.',
    filtrosQueInfluenciam:
      'Todos os filtros ativos na aba Consolidado.',
    comoInterpretar:
      'Direciona a ação imediata da coordenação: entregar apostila para quem está em dia e abordar em sala quem compareceu e tem NPS pendente.',
  },
  NPS_DESTINATARIO: {
    id: 'NPS_DESTINATARIO',
    titulo: 'Destinatário do Convite NPS (Aluno / Responsável)',
    oQueRepresenta:
      'Classifica os convites NPS ativos conforme o destinatário identificado no cruzamento hierárquico de 4 níveis: o próprio Aluno ou o Responsável legal (inclusive famílias com múltiplos irmãos).',
    dadosUtilizados:
      'Cruzamento automático entre os convites ativos do Portal NPS (Indecx) e os contratos/responsáveis do Portal do Aluno.',
    regraNegocioFormula:
      'Contabiliza quantos convites ativos pertencem diretamente ao Aluno (nível Contrato/Nome/E-mail) e quantos pertencem ao Responsável legal.',
    periodoConsiderado:
      'Ciclo anual vigente no fuso horário de Brasília (America/Sao_Paulo), filtrado pelo dia da semana selecionado.',
    filtrosQueInfluenciam:
      'Dia da Semana, Horário, Canal de Origem, Status de Envio e Ciclo da Pesquisa.',
    comoInterpretar:
      'Clique em "Aluno" ou "Resp." para filtrar os cards do Kanban NPS e direcionar a abordagem em sala de aula ou via WhatsApp do responsável.',
  },
  NPS_STATUS_ENVIO: {
    id: 'NPS_STATUS_ENVIO',
    titulo: 'Status de Envio e Rastreio do Convite NPS',
    oQueRepresenta:
      'Exibe o funil de entrega dos convites NPS ativos no período selecionado: Abertos, Entregues, Enviados e Não entregues.',
    dadosUtilizados:
      'Eventos de disparo, entrega e abertura sincronizados da API Indecx (/v2/company-controls).',
    regraNegocioFormula:
      'Classifica cada convite ativo no estágio mais avançado atingido (Aberto > Entregue > Enviado > Não entregue), somando 100% dos convites exibidos.',
    periodoConsiderado:
      'Ciclo anual vigente no fuso horário de Brasília (America/Sao_Paulo), filtrado pelo dia da semana selecionado.',
    filtrosQueInfluenciam:
      'Dia da Semana, Horário, Canal de Origem, Destinatário e Ciclo da Pesquisa.',
    comoInterpretar:
      'Clique em qualquer um dos 4 estágios (Abertos, Entregues, Enviados ou Não entregues) para filtrar imediatamente os cards correspondentes no Kanban NPS.',
  },
};

// Mapeamentos de aliases utilizados nos componentes Kanban de Alunos e Kanban NPS
const INDICATOR_ALIASES: Record<string, string> = {
  kanban_agendamentos: 'KANBAN_TODOS_ALUNOS',
  kanban_presencas: 'KANBAN_PRESENCA',
  kanban_faltas: 'KANBAN_FALTA',
  kanban_nao_iniciada: 'KANBAN_NAO_INICIADA',
  kanban_frequencia: 'KANBAN_FREQUENCIA',
  kanban_evasao: 'KANBAN_EVASAO',
  nps_total_convites: 'NPS_ELEGIVEIS_DIA',
  nps_portal_aluno: 'NPS_PORTAL_ALUNO',
  nps_por_email: 'NPS_EMAIL_INDECX',
  nps_destinatario: 'NPS_DESTINATARIO',
  nps_status_envio: 'NPS_STATUS_ENVIO',
};
for (const [aliasKey, targetKey] of Object.entries(INDICATOR_ALIASES)) {
  if (SYSTEM_INDICATORS_HELP[targetKey]) {
    SYSTEM_INDICATORS_HELP[aliasKey] = SYSTEM_INDICATORS_HELP[targetKey];
  }
}

interface IndicatorHelpPopoverProps {
  indicatorId: keyof typeof SYSTEM_INDICATORS_HELP | string;
  customDefinition?: IndicatorHelpDefinition;
  className?: string;
  align?: 'left' | 'right' | 'center';
}

export const IndicatorHelpPopover: React.FC<IndicatorHelpPopoverProps> = ({
  indicatorId,
  customDefinition,
  className = '',
  align = 'right',
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const definition =
    customDefinition ||
    SYSTEM_INDICATORS_HELP[indicatorId] || {
      id: indicatorId,
      titulo: 'Explicação do Indicador',
      oQueRepresenta: 'Indicador gerencial calculado em tempo real sobre a base ativa da escola.',
      dadosUtilizados: 'Registros sincronizados do Portal do Aluno e base NPS da unidade.',
      regraNegocioFormula: 'Contagem e percentual calculados sobre o universo filtrado.',
      periodoConsiderado: 'Período ativo selecionado na tela.',
      filtrosQueInfluenciam: 'Filtros de dia, turma, sala, educador e busca ativos.',
      comoInterpretar: 'Analise o valor absoluto em conjunto com o percentual relativo.',
    };

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (ev: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(ev.target as Node)
      ) {
        setOpen(false);
      }
    };
    const handleEscape = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const alignClass =
    align === 'left'
      ? 'left-0'
      : align === 'center'
      ? 'left-1/2 -translate-x-1/2'
      : 'right-0';

  return (
    <div
      ref={containerRef}
      className={`relative inline-flex items-center ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        title={`Como este indicador é calculado: ${definition.titulo}`}
        aria-label={`Explicação do indicador ${definition.titulo}`}
        data-testid={`indicator-help-btn-${indicatorId}`}
        className={`inline-flex h-5 w-5 items-center justify-center rounded-full border transition-all ${
          open
            ? 'border-[#004A8D] bg-[#004A8D] text-white shadow-sm'
            : 'border-slate-200/80 bg-white/90 text-slate-400 hover:border-[#004A8D]/40 hover:bg-[#004A8D]/5 hover:text-[#004A8D]'
        }`}
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 4 }}
            transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
            role="dialog"
            aria-label={definition.titulo}
            data-testid={`indicator-help-popover-${indicatorId}`}
            className={`absolute top-full z-50 mt-2 w-80 sm:w-96 glass-modal p-4 text-left ${alignClass}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2.5 flex items-start justify-between gap-2 border-b border-[var(--border-color)] pb-2">
              <div>
                <span className="inline-block rounded-md bg-[#2563EB]/12 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-primary)]">
                  Entenda o Indicador
                </span>
                <h4 className="mt-1 text-xs font-extrabold text-[var(--text-primary)]">
                  {definition.titulo}
                </h4>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                }}
                className="rounded-lg p-1 text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]"
                aria-label="Fechar explicação"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="space-y-2 text-[11.5px] leading-relaxed text-[var(--text-secondary)] max-h-80 overflow-y-auto pr-1">
              <div>
                <p className="font-bold text-[var(--text-primary)]">1. O que representa:</p>
                <p>{definition.oQueRepresenta}</p>
              </div>
              <div>
                <p className="font-bold text-[var(--text-primary)]">2. Dados utilizados:</p>
                <p>{definition.dadosUtilizados}</p>
              </div>
              <div>
                <p className="font-bold text-[var(--text-primary)]">3. Regra de negócio / Fórmula:</p>
                <p className="rounded-lg bg-[var(--bg-secondary)] px-2.5 py-1.5 font-medium text-[var(--text-primary)] border border-[var(--border-color)]">
                  {definition.regraNegocioFormula}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-[var(--bg-secondary)]/80 p-2 border border-[var(--border-color)]">
                  <p className="font-bold text-[var(--text-primary)]">4. Período:</p>
                  <p className="text-[11px]">{definition.periodoConsiderado}</p>
                </div>
                <div className="rounded-lg bg-[var(--bg-secondary)]/80 p-2 border border-[var(--border-color)]">
                  <p className="font-bold text-[var(--text-primary)]">5. Filtros:</p>
                  <p className="text-[11px]">{definition.filtrosQueInfluenciam}</p>
                </div>
              </div>
              <div>
                <p className="font-bold text-[var(--text-primary)]">6. Como interpretar:</p>
                <p>{definition.comoInterpretar}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

