import { supabase } from '../../lib/supabase'

function unwrap({ data, error }) {
  if (error) throw error
  return data
}

export function errorMessage(err) {
  if (err?.code === '23505') return '這個背號已經有人使用'
  return err?.message ?? '發生未知錯誤'
}

/* ---------- 球隊 ---------- */

// 只取目前登入者建立的球隊，並附上球員人數 players[0].count
export async function fetchTeams() {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  return unwrap(
    await supabase
      .from('teams')
      .select('*, players(count)')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: true })
  )
}

export async function createTeam({ name, shortName }) {
  return unwrap(
    await supabase
      .from('teams')
      .insert({ name, short_name: shortName || null })
      .select()
      .single()
  )
}

export async function updateTeam(id, { name, shortName }) {
  return unwrap(
    await supabase
      .from('teams')
      .update({ name, short_name: shortName || null })
      .eq('id', id)
      .select()
      .single()
  )
}

export async function deleteTeam(id) {
  unwrap(await supabase.from('teams').delete().eq('id', id))
}

/* ---------- 球員 ---------- */

export async function fetchPlayers(teamId) {
  return unwrap(
    await supabase
      .from('players')
      .select('*')
      .eq('team_id', teamId)
      .order('jersey_number', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true })
  )
}

export async function createPlayer(teamId, fields) {
  return unwrap(
    await supabase
      .from('players')
      .insert({ team_id: teamId, ...fields })
      .select()
      .single()
  )
}

export async function updatePlayer(id, fields) {
  return unwrap(
    await supabase.from('players').update(fields).eq('id', id).select().single()
  )
}

export async function deletePlayer(id) {
  unwrap(await supabase.from('players').delete().eq('id', id))
}