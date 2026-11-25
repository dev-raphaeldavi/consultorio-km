import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

// Secret disponível somente na Edge Function. Nunca incluí-lo no frontend.
Deno.serve(async (req) => {
  const origin = 'https://consultoriokm.vercel.app';
  const cors = { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
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
    const { action, user_id, email, full_name, role, business_model, room_rent_cents } = await req.json();
    if (action === 'create_user') {
      if (typeof email !== 'string' || !email.includes('@') || typeof full_name !== 'string' || full_name.trim().length < 2 || !['professional', 'secretary'].includes(role)) return reply({ error: 'Dados do novo usuário são inválidos.' }, 400);
      const model = role === 'professional' && business_model === 'room_rental' ? 'room_rental' : 'percentage';
      const rent = model === 'room_rental' ? Number(room_rent_cents) : 0;
      if (!Number.isSafeInteger(rent) || rent < 0) return reply({ error: 'Valor de aluguel inválido.' }, 400);
      const { data: created, error: createError } = await client.auth.admin.createUser({ email: email.trim().toLowerCase(), password: 'ckm123', email_confirm: true });
      if (createError || !created.user) return reply({ error: 'Não foi possível criar o acesso. Confira se o e-mail já existe.' }, 400);
      const { error: profileError } = await client.from('profiles').insert({ id: created.user.id, email: email.trim().toLowerCase(), full_name: full_name.trim(), role, active: true, must_change_password: true, business_model: model, room_rent_cents: rent });
      if (profileError) {
        await client.auth.admin.deleteUser(created.user.id);
        return reply({ error: 'Não foi possível criar o perfil.' }, 400);
      }
      await client.from('audit_logs').insert({ actor_id: identity.user.id, action: 'CREATE_USER', entity: 'profiles', record_id: created.user.id });
      return reply({ success: true, user_id: created.user.id, temporary_password: 'ckm123' });
    }
    if (action !== 'reset_password' || typeof user_id !== 'string') return reply({ error: 'Operação inválida.' }, 400);
    const { data: target } = await client.from('profiles').select('id, role').eq('id', user_id).single();
    if (!target || !['professional', 'secretary', 'admin'].includes(target.role)) return reply({ error: 'Usuário não encontrado.' }, 404);
    const { error } = await client.auth.admin.updateUserById(user_id, { password: 'ckm123' });
    if (error) return reply({ error: 'Não foi possível redefinir a senha.' }, 400);
    await client.from('profiles').update({ must_change_password: true }).eq('id', user_id);
    await client.from('audit_logs').insert({ actor_id: identity.user.id, action: 'RESET_PASSWORD', entity: 'profiles', record_id: user_id });
    return reply({ success: true, temporary_password: 'ckm123' });
  } catch { return reply({ error: 'Não foi possível processar o convite.' }, 400); }
});
