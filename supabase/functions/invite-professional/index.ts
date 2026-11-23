import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

// Secret disponível somente na Edge Function. Nunca incluí-lo no frontend.
Deno.serve(async (req) => {
  const origin = Deno.env.get('APP_ORIGIN');
  const cors = { 'Access-Control-Allow-Origin': origin || '', 'Vary': 'Origin', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  if (!origin) return reply({ error: 'APP_ORIGIN não configurado.' }, 503);
  if (req.headers.get('origin') !== origin) return reply({ error: 'Origem não permitida.' }, 403);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return reply({ error: 'Método não permitido.' }, 405);
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return reply({ error: 'Acesso negado.' }, 401);
  const { data: identity, error: authError } = await client.auth.getUser(token);
  if (authError || !identity.user) return reply({ error: 'Sessão inválida.' }, 401);
  const { data: profile } = await client.from('profiles').select('role, active').eq('id', identity.user.id).single();
  if (!profile?.active || profile.role !== 'admin') return reply({ error: 'Somente a proprietária pode convidar profissionais.' }, 403);
  try {
    const { action, user_id } = await req.json();
    if (action !== 'reset_password' || typeof user_id !== 'string') return reply({ error: 'Operação inválida.' }, 400);
    const { data: target } = await client.from('profiles').select('id, role').eq('id', user_id).single();
    if (!target || target.role !== 'professional') return reply({ error: 'Profissional não encontrado.' }, 404);
    const { error } = await client.auth.admin.updateUserById(user_id, { password: 'ckm123' });
    if (error) return reply({ error: 'Não foi possível redefinir a senha.' }, 400);
    await client.from('profiles').update({ must_change_password: true }).eq('id', user_id);
    await client.from('audit_logs').insert({ actor_id: identity.user.id, action: 'RESET_PASSWORD', entity: 'profiles', record_id: user_id });
    return reply({ success: true, temporary_password: 'ckm123' });
  } catch { return reply({ error: 'Não foi possível processar o convite.' }, 400); }
});
