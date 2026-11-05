import { supabase } from '../src/utils/supabaseClient.ts';

async function verifySupabase() {
  console.log('Verifying Supabase connection and tables...');
  
  const { data: schools, error: schoolErr } = await supabase.from('schools').select('*');
  console.log('Schools table:', schools?.length || 0, 'records found.', schoolErr ? 'Error: ' + schoolErr.message : 'OK');

  const { data: students, error: studentErr } = await supabase.from('student_records').select('id, nome_completo');
  console.log('Student records table:', students?.length || 0, 'records found.', studentErr ? 'Error: ' + studentErr.message : 'OK');

  const { data: nps, error: npsErr } = await supabase.from('nps_records').select('id, student_name');
  console.log('NPS records table:', nps?.length || 0, 'records found.', npsErr ? 'Error: ' + npsErr.message : 'OK');
}

verifySupabase().catch(console.error);
