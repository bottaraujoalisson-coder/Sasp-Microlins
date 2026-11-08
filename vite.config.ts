import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  const rawUrl = (env.VITE_SUPABASE_URL || env.SUPABASE_URL || '').trim();
  const isLegacyDecommissionedUrl = /hkonvuytinqlakerpara/i.test(rawUrl);
  const resolvedSupabaseUrl =
    !rawUrl || isLegacyDecommissionedUrl
      ? 'https://dwarcjrpwubtveilwkyi.supabase.co'
      : rawUrl.replace(/\.supabase\.com(\/|$)/i, '.supabase.co$1');
  const rawAnonKey = (
    env.VITE_SUPABASE_ANON_KEY ||
    env.SUPABASE_ANON_KEY ||
    ''
  ).trim();
  const resolvedAnonKey =
    !rawAnonKey || isLegacyDecommissionedUrl
      ? 'sb_publishable_qs0jbtlopLTJG1cbZD8AFQ_kRR37HKM'
      : rawAnonKey;

  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(resolvedSupabaseUrl),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(resolvedAnonKey),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
