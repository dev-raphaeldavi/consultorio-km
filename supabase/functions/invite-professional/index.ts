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
    const { email, full_name } = await req.json();
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || typeof full_name !== 'string' || full_name.trim().length < 2 || full_name.length > 120) return reply({ error: 'Informe nome e e-mail válidos.' }, 400);
    const { data, error } = await client.auth.admin.inviteUserByEmail(email.trim().toLowerCase(), { redirectTo: origin + '/?onboarding=1', data: { full_name: full_name.trim() } });
    if (error || !data.user) return reply({ error: 'Não foi possível enviar o convite. Confira se o e-mail já possui cadastro e as configurações de envio.' }, 400);
    const { error: profileError } = await client.from('profiles').insert({ id: data.user.id, full_name: full_name.trim(), role: 'professional', active: true });
    if (profileError) return reply({ error: 'Convite enviado, mas o perfil não foi liberado. A administração deve conferir o cadastro no Supabase antes de reenviar.' }, 409);
    await client.from('audit_logs').insert({ actor_id: identity.user.id, action: 'INVITE', entity: 'profiles', record_id: data.user.id });
    return reply({ success: true });
  } catch { return reply({ error: 'Não foi possível processar o convite.' }, 400); }
});
