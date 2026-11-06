import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  'https://dwarcjrpwubtveilwkyi.supabase.co';
const SUPABASE_KEY =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  'sb_publishable_qs0jbtlopLTJG1cbZD8AFQ_kRR37HKM';

const PORTAL_LOGIN = process.env.PORTAL_MICROLINS_LOGIN || 'a116882';
const PORTAL_PASSWORD = process.env.PORTAL_MICROLINS_PASSWORD || 'Joao@2025';
const PORTAL_ESCOLA = process.env.PORTAL_MICROLINS_ESCOLA || '1875';
const DEFAULT_SCHOOL_ID = 'school-1875';

const PORTAL_WEEKDAY_MAP = {
  '1': 'Segunda-feira',
  '2': 'Terça-feira',
  '3': 'Quarta-feira',
  '4': 'Quinta-feira',
  '5': 'Sexta-feira',
  '6': 'Sábado',
  '7': 'Domingo',
};

const PORTAL_WEEKDAY_LABEL_TO_CODE = {
  'Segunda-feira': '1',
  'Terça-feira': '2',
  'Quarta-feira': '3',
  'Quinta-feira': '4',
  'Sexta-feira': '5',
  Sábado: '6',
  Domingo: '7',
};

function getBrasiliaDayOfWeek(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short',
  });
  const shortDay = formatter.format(date);
  const mapShortToCode = {
    Mon: '1',
    Tue: '2',
    Wed: '3',
    Thu: '4',
    Fri: '5',
    Sat: '6',
    Sun: '7',
  };
  const semanaCode = mapShortToCode[shortDay] || '5';
  return {
    semanaCode,
    diaLabel: PORTAL_WEEKDAY_MAP[semanaCode] || 'Sexta-feira',
  };
}

function extractCookiesFromResponse(res, jar) {
  const rawCookies =
    typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : res.headers.get('set-cookie')
        ? [res.headers.get('set-cookie')]
        : [];
  for (const cookieStr of rawCookies) {
    if (!cookieStr) continue;
    const firstPart = cookieStr.split(';')[0];
    const eqIdx = firstPart.indexOf('=');
    if (eqIdx > 0) {
      const name = firstPart.slice(0, eqIdx).trim();
      const val = firstPart.slice(eqIdx + 1).trim();
      jar.set(name, val);
    }
  }
}

function serializeCookieJar(jar) {
  return Array.from(jar.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

function resolveCanonicalEducator(formacao, contrato, existingEducador) {
  if (existingEducador && String(existingEducador).trim()) {
    return String(existingEducador).trim();
  }
  const formacaoUpper = String(formacao || '').toUpperCase().trim();
  const isEnglish =
    formacaoUpper.includes('INGL') ||
    formacaoUpper.includes('ENGLISH') ||
    formacaoUpper.includes('ANNUAL BOOK') ||
    formacaoUpper.includes('SPEED');
  if (isEnglish) {
    return 'João Pedro da Silva Santos';
  }
  const num = parseInt(String(contrato || '0').replace(/\D/g, ''), 10) || 0;
  return num % 2 === 0 ? 'Luana Menezes Monguilod' : 'Gabriel Batista Mota';
}

function mapRawPortalItemToRecord(item, idx, diaLabel, notasDict, existingBySlot) {
  const contrato = String(item.CodigoContrato || '').trim();
  const nomeCompleto = String(item.NomeAluno || '').trim();
  const parts = nomeCompleto.split(/\s+/);
  const nomeCurto =
    parts.length > 2 ? `${parts[0]} ${parts[1]} ${parts[2][0]}.` : nomeCompleto;

  const horaInicio = String(item.HoraInicio || '').slice(0, 5);
  const horaFim = String(item.HoraFim || '').slice(0, 5);
  const horario =
    horaInicio && horaFim
      ? `${horaInicio} à ${horaFim}`
      : String(item.Horario || '');
  const hourNum = parseInt(horaInicio.split(':')[0] || '8', 10);
  const turno = hourNum < 12 ? 'Manhã' : hourNum < 18 ? 'Tarde' : 'Noite';

  const rawNomeSala = String(item.NomeSala || item.Sala || '').trim();
  const salaClean =
    (rawNomeSala.split(' - ')[0] || rawNomeSala || 'Sala não informada').trim();

  const formacao = String(item.Curso || item.Formacao || '').trim();
  const curso = String(item.NomeMateria || item.MateriaAtual || '').trim();

  const inicio = String(item.AulaInicio || item.AulaInicioAula || '').trim();
  const fim = String(item.AulaFim || item.AulaFimAula || '').trim();
  const concluidaAula =
    String(item.ConcluidaAula || '').trim().toUpperCase() === 'S';
  const hasRealizedClassCode =
    Boolean(item.CodigoAulasRealizadas) &&
    String(item.CodigoAulasRealizadas).trim() !== '0';
  const rawPresencaOuFalta = String(item.PresencaOuFalta || '')
    .trim()
    .toUpperCase();

  const slotKey = `${contrato}|${diaLabel}|${horaInicio}|${curso}`;
  const timeSlotKey = `${contrato}|${diaLabel}|${horaInicio}`;
  const stored = existingBySlot.get(slotKey) || existingBySlot.get(timeSlotKey);

  const incomingPresenca =
    rawPresencaOuFalta === 'P' ||
    Boolean(inicio) ||
    Boolean(fim) ||
    concluidaAula ||
    hasRealizedClassCode
      ? 'P'
      : rawPresencaOuFalta === 'F'
        ? 'F'
        : '';

  const storedHasConfirmedPresence =
    stored &&
    (stored.presencaOuFalta === 'P' ||
      stored.infoAula === 'Sistema Acadêmico' ||
      stored.status === 'INICIADO' ||
      stored.status === 'FINALIZADO' ||
      Boolean(stored.inicio) ||
      Boolean(stored.fim));

  const effectiveInicio = inicio || (storedHasConfirmedPresence ? stored.inicio || '' : '');
  const effectiveFim = fim || (storedHasConfirmedPresence ? stored.fim || '' : '');
  const presencaOuFalta =
    incomingPresenca || (storedHasConfirmedPresence ? 'P' : '');

  const status =
    effectiveFim || concluidaAula
      ? 'FINALIZADO'
      : effectiveInicio || hasRealizedClassCode
        ? 'INICIADO'
        : presencaOuFalta === 'P'
          ? 'FINALIZADO'
          : 'NÃO INICIADO';

  const cccm = String(item.CodigoContratoCursoMateria || '');
  const notaObj = notasDict[cccm];
  const nota =
    notaObj && notaObj.UltimaNota !== undefined && notaObj.UltimaNota !== ''
      ? Number(notaObj.UltimaNota)
      : stored?.nota ?? null;
  const notaAulaNumero =
    notaObj && notaObj.Aula !== undefined && notaObj.Aula !== ''
      ? Number(notaObj.Aula)
      : stored?.notaAulaNumero ?? null;
  const aulaNum = Number(
    item.AulaAtual || item.Aula || (notaObj ? notaObj.Aula : 0) || stored?.aulaNumero || 0
  );
  const possuiApostila =
    Boolean(item.idcodigoapostila || item.CodigoApostila) ||
    Boolean(stored?.possuiApostila);

  const infoAula =
    Boolean(effectiveInicio) || Boolean(effectiveFim) || hasRealizedClassCode
      ? 'Portal do Aluno'
      : rawPresencaOuFalta === 'P' && item.CodigoPresencaFalta
        ? 'Sistema Acadêmico'
        : storedHasConfirmedPresence && stored?.infoAula
          ? stored.infoAula
          : rawPresencaOuFalta === 'F' && item.CodigoPresencaFalta
            ? 'Falta'
            : 'Não registrado';

  const parcelasAtrasadas = Math.max(
    0,
    Math.floor(Number(item.ParcelasAtrasadas || item.Inadimplente || stored?.parcelasAtrasadas || 0))
  );

  const rawPortalEducator = String(
    item.NomeEducador || item.Educador || item.NomeProfessor || item.Professor || ''
  ).trim();
  const educador = resolveCanonicalEducator(
    formacao,
    contrato,
    rawPortalEducator || stored?.educador
  );

  const rawFone = String(item.FoneAluno || item.CelularAluno || '').replace(/\D/g, '');
  const telefoneAluno = rawFone
    ? rawFone.startsWith('55')
      ? rawFone
      : `55${rawFone}`
    : stored?.telefoneAluno || '';

  const rawFoneResp = String(item.FoneResponsavel || '').replace(/\D/g, '');
  const telefoneResponsavel = rawFoneResp
    ? rawFoneResp.startsWith('55')
      ? rawFoneResp
      : `55${rawFoneResp}`
    : stored?.telefoneResponsavel || '';

  return {
    id: idx + 1,
    contrato,
    aulaId: String(
      item.CodigoAulasRealizadas || item.CodigoPresencaFalta || cccm || idx + 1
    ),
    nomeCompleto,
    nomeCurto,
    telefoneAluno,
    whatsappAlunoUrl: telefoneAluno ? `https://wa.me/${telefoneAluno}` : '',
    nomeResponsavel: String(item.NomeResponsavel || stored?.nomeResponsavel || '').trim(),
    telefoneResponsavel,
    whatsappResponsavelUrl: telefoneResponsavel
      ? `https://wa.me/${telefoneResponsavel}`
      : '',
    formacao,
    curso,
    aulaInfo: `Aula ${aulaNum} - Apostila`,
    aulaNumero: aulaNum,
    tipoMaterial: 'Apostila',
    possuiApostila,
    horario,
    horaInicio,
    horaFim,
    turno,
    sala: salaClean,
    modalidade: 'Presencial',
    inicio: effectiveInicio,
    fim: effectiveFim,
    nota,
    notaAulaNumero,
    notaId: cccm,
    infoAula,
    status,
    presencaOuFalta,
    inadimplente: parcelasAtrasadas > 0,
    parcelasAtrasadas,
    diaSemana: diaLabel,
    schoolId: DEFAULT_SCHOOL_ID,
    escolaCodigo: PORTAL_ESCOLA,
    unidade: 'ESCOLA PRESIDENTE PRUDENTE',
    linkLoginUrl: stored?.linkLoginUrl || 'https://portaldoaluno.microlins.com.br/',
    educador,
    causaFaltaMaterialExplicita: stored?.causaFaltaMaterialExplicita || undefined,
  };
}

function mapSupabaseRowToRecord(row) {
  const rawSala = String(row.sala ?? '').trim();
  const cleanSala = rawSala.split(' - ')[0].trim() || 'Sala não informada';
  const rawPresenca = row.presenca_ou_falta ?? '';
  const rawInfoAula = String(row.info_aula ?? '');
  const rawStatus = row.status ?? 'NÃO INICIADO';
  const rawInicio = String(row.inicio ?? '').trim();
  const rawFim = String(row.fim ?? '').trim();
  const hasPresenceSignal =
    rawPresenca === 'P' ||
    rawInfoAula === 'Sistema Acadêmico' ||
    rawStatus === 'INICIADO' ||
    rawStatus === 'FINALIZADO' ||
    Boolean(rawInicio) ||
    Boolean(rawFim);
  const effectivePresenca = hasPresenceSignal
    ? 'P'
    : rawPresenca === 'F' || rawInfoAula === 'Falta'
      ? 'F'
      : '';
  const effectiveStatus = rawFim
    ? 'FINALIZADO'
    : rawInicio && rawStatus !== 'FINALIZADO'
      ? 'INICIADO'
      : effectivePresenca === 'P' && rawStatus === 'NÃO INICIADO'
        ? 'FINALIZADO'
        : rawStatus;

  return {
    id: Number(row.id),
    contrato: String(row.contrato ?? '').trim(),
    aulaId: row.aula_id ?? '',
    nomeCompleto: row.nome_completo ?? '',
    nomeCurto: row.nome_curto ?? '',
    telefoneAluno: row.telefone_aluno ?? '',
    whatsappAlunoUrl: row.whatsapp_aluno_url ?? '',
    nomeResponsavel: row.nome_responsavel ?? '',
    telefoneResponsavel: row.telefone_responsavel ?? '',
    whatsappResponsavelUrl: row.whatsapp_responsavel_url ?? '',
    formacao: row.formacao ?? '',
    curso: row.curso ?? '',
    aulaInfo: row.aula_info ?? '',
    aulaNumero: Number(row.aula_numero ?? 0),
    tipoMaterial: row.tipo_material ?? 'Apostila',
    possuiApostila: Boolean(row.possui_apostila),
    horario: row.horario ?? '',
    horaInicio: row.hora_inicio ?? '',
    horaFim: row.hora_fim ?? '',
    turno: row.turno ?? 'Manhã',
    sala: cleanSala,
    modalidade: 'Presencial',
    inicio: rawInicio,
    fim: rawFim,
    nota: row.nota !== null && row.nota !== undefined ? Number(row.nota) : null,
    notaId: row.nota_id ?? '',
    notaAulaNumero:
      row.nota_aula_numero !== null && row.nota_aula_numero !== undefined
        ? Number(row.nota_aula_numero)
        : null,
    infoAula: rawInfoAula,
    status: effectiveStatus,
    presencaOuFalta: effectivePresenca,
    inadimplente: Boolean(row.inadimplente),
    parcelasAtrasadas: Number(row.parcelas_atrasadas ?? 0),
    diaSemana: row.dia_semana ?? 'Sexta-feira',
    email: row.email ?? undefined,
    linkLoginUrl: row.link_login_url ?? undefined,
    educador: row.educador ? String(row.educador).trim() : undefined,
    causaFaltaMaterialExplicita: row.causa_falta_material_explicita || undefined,
    schoolId: row.school_id ? String(row.school_id) : DEFAULT_SCHOOL_ID,
    escolaCodigo: row.escola_codigo ? String(row.escola_codigo) : PORTAL_ESCOLA,
    unidade: row.unidade ? String(row.unidade) : 'ESCOLA PRESIDENTE PRUDENTE',
  };
}

function mapRecordToSupabaseRow(r, idx) {
  return {
    id: idx + 1,
    contrato: r.contrato,
    aula_id: r.aulaId,
    nome_completo: r.nomeCompleto,
    nome_curto: r.nomeCurto,
    telefone_aluno: r.telefoneAluno,
    whatsapp_aluno_url: r.whatsappAlunoUrl,
    nome_responsavel: r.nomeResponsavel,
    telefone_responsavel: r.telefoneResponsavel,
    whatsapp_responsavel_url: r.whatsappResponsavelUrl,
    formacao: r.formacao,
    curso: r.curso,
    aula_info: r.aulaInfo,
    aula_numero: r.aulaNumero,
    tipo_material: r.tipoMaterial,
    possui_apostila: r.possuiApostila,
    horario: r.horario,
    hora_inicio: r.horaInicio,
    hora_fim: r.horaFim,
    turno: r.turno,
    sala: r.sala,
    modalidade: 'Presencial',
    inicio: r.inicio,
    fim: r.fim,
    nota: r.nota,
    nota_id: r.notaId,
    nota_aula_numero: r.notaAulaNumero ?? null,
    info_aula: r.infoAula,
    status: r.status,
    presenca_ou_falta: r.presencaOuFalta ?? '',
    inadimplente: r.inadimplente,
    parcelas_atrasadas: r.parcelasAtrasadas ?? (r.inadimplente ? 1 : 0),
    dia_semana: r.diaSemana,
    email: r.email ?? null,
    link_login_url: r.linkLoginUrl ?? null,
    educador: resolveCanonicalEducator(r.formacao, r.contrato, r.educador),
    causa_falta_material_explicita: r.causaFaltaMaterialExplicita ?? null,
    school_id: DEFAULT_SCHOOL_ID,
    escola_codigo: PORTAL_ESCOLA,
    unidade: 'ESCOLA PRESIDENTE PRUDENTE',
  };
}

export async function handler(event) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, max-age=0',
  };

  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const semanaParam = event?.queryStringParameters?.semana || '';
    const { semanaCode: todayCode } = getBrasiliaDayOfWeek(new Date());
    let targetCode = todayCode;
    if (semanaParam && PORTAL_WEEKDAY_MAP[semanaParam]) {
      targetCode = semanaParam;
    } else if (semanaParam && PORTAL_WEEKDAY_LABEL_TO_CODE[semanaParam]) {
      targetCode = PORTAL_WEEKDAY_LABEL_TO_CODE[semanaParam];
    }

    // 1. Fetch existing records from Supabase
    const { data: existingRows } = await sb
      .from('student_records')
      .select('*')
      .eq('school_id', DEFAULT_SCHOOL_ID)
      .order('id', { ascending: true });

    const storedRecords = Array.isArray(existingRows)
      ? existingRows.map(mapSupabaseRowToRecord)
      : [];

    const existingBySlot = new Map();
    for (const r of storedRecords) {
      existingBySlot.set(`${r.contrato}|${r.diaSemana}|${r.horaInicio}|${r.curso}`, r);
      existingBySlot.set(`${r.contrato}|${r.diaSemana}|${r.horaInicio}`, r);
    }

    // 2. Authenticate with Portal do Aluno Microlins and fetch live target weekday
    const jar = new Map();
    let liveDayRecords = null;
    try {
      const parsePortalJsonResponse = async (res) => {
        try {
          const rawText = await res.text();
          if (!rawText) return null;
          const trimmed = rawText.trim();
          if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            return JSON.parse(trimmed);
          }
          const scriptEndIdx = trimmed.lastIndexOf('</script>');
          const searchFrom = scriptEndIdx >= 0 ? scriptEndIdx + 9 : 0;
          const objIdx = trimmed.indexOf('{', searchFrom);
          const arrIdx = trimmed.indexOf('[', searchFrom);
          const startIdx =
            objIdx >= 0 && arrIdx >= 0
              ? Math.min(objIdx, arrIdx)
              : objIdx >= 0
                ? objIdx
                : arrIdx;
          if (startIdx >= 0) {
            return JSON.parse(trimmed.slice(startIdx));
          }
          return null;
        } catch {
          return null;
        }
      };

      const r1 = await fetch('https://portaldoaluno.microlins.com.br/login/');
      extractCookiesFromResponse(r1, jar);

      const r2 = await fetch(
        'https://portaldoaluno.microlins.com.br//login/validarCadastroPerfil',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
            Cookie: serializeCookieJar(jar),
          },
          body: new URLSearchParams({
            login: PORTAL_LOGIN,
            senha: PORTAL_PASSWORD,
            email: '',
          }).toString(),
        }
      );
      extractCookiesFromResponse(r2, jar);
      const valData = r2.ok ? await parsePortalJsonResponse(r2) : null;

      if (valData && valData.info) {
        const r3 = await fetch('https://portaldoaluno.microlins.com.br/login/', {
          method: 'POST',
          redirect: 'manual',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            Cookie: serializeCookieJar(jar),
          },
          body: new URLSearchParams({
            'userdata[login]': PORTAL_LOGIN,
            'userdata[senha]': PORTAL_PASSWORD,
            'userdata[app]': 'N',
            'userdata[contrato]': '',
            'userdata[info]': valData.info,
          }).toString(),
        });
        extractCookiesFromResponse(r3, jar);
      }

      const cookieHeader = serializeCookieJar(jar);
      const [rAlunos, rNotas] = await Promise.all([
        fetch('https://portaldoaluno.microlins.com.br//dashboard/dadosAlunosAula', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
            Cookie: cookieHeader,
          },
          body: new URLSearchParams({
            tipoPesq: 'aluno',
            nome: '',
            escola: PORTAL_ESCOLA,
            horaInicio: '',
            horaFim: '',
            semana: targetCode,
            sala: '',
          }).toString(),
        }),
        fetch('https://portaldoaluno.microlins.com.br//dashboard/getUltimaNotaContrato', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
            Cookie: cookieHeader,
          },
          body: new URLSearchParams({
            CodigoContratoCursoMateria: '0',
            semana: targetCode,
          }).toString(),
        }),
      ]);

      if (rAlunos.ok) {
        const dados = await parsePortalJsonResponse(rAlunos);
        const notasDict = rNotas.ok
          ? (await parsePortalJsonResponse(rNotas)) || {}
          : {};
        if (dados && Array.isArray(dados.listaAlunos)) {
          const targetDiaLabel = PORTAL_WEEKDAY_MAP[targetCode] || 'Sexta-feira';
          liveDayRecords = dados.listaAlunos.map((item, idx) =>
            mapRawPortalItemToRecord(item, idx, targetDiaLabel, notasDict, existingBySlot)
          );
        }
      }
    } catch (portalErr) {
      console.error('[Netlify Sync] Portal fetch error:', portalErr);
    }

    // 3. Merge liveDayRecords into the full week array and persist back to Supabase
    let finalAllWeek = storedRecords;
    let source = 'LOCAL_CACHE_SYNC';
    if (Array.isArray(liveDayRecords) && liveDayRecords.length > 0) {
      source = 'PORTAL_LIVE_VERIFIED';
      const targetDiaLabel = PORTAL_WEEKDAY_MAP[targetCode] || 'Sexta-feira';
      const combined = [];
      let globalId = 1;
      for (const code of ['1', '2', '3', '4', '5', '6', '7']) {
        const label = PORTAL_WEEKDAY_MAP[code];
        const dayList =
          code === targetCode
            ? liveDayRecords
            : storedRecords.filter((r) => r.diaSemana === label);
        for (const rec of dayList) {
          combined.push({ ...rec, id: globalId++ });
        }
      }
      finalAllWeek = combined;

      if (combined.length >= 600) {
        const payloadRows = combined.map((r, idx) => mapRecordToSupabaseRow(r, idx));
        await sb.rpc('replace_school_student_records', {
          p_school_id: DEFAULT_SCHOOL_ID,
          p_records: payloadRows,
        });
      }
    }

    const { data: npsRows } = await sb
      .from('nps_records')
      .select('*')
      .eq('school_id', DEFAULT_SCHOOL_ID);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        source,
        syncedAt: new Date().toISOString(),
        records: finalAllWeek,
        allWeekRecords: finalAllWeek,
        activeNpsInvitationsCount: Array.isArray(npsRows) ? npsRows.length : 0,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        ok: false,
        error: err?.message || 'Erro interno na sincronização serverless.',
      }),
    };
  }
}
