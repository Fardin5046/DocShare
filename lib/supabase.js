import { createClient as createBrowserClient } from '@supabase/supabase-js'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
}

// Upload to bucket: 'documents'
export async function uploadFile(supabase, file, userId) {
  const ext = file.name.split('.').pop()
  const fileName = `${userId}/${Date.now()}.${ext}`

  const { error } = await supabase.storage
    .from('documents')
    .upload(fileName, file, { cacheControl: '3600', upsert: false })

  if (error) throw error

  const { data: urlData, error: urlErr } = supabase.storage
    .from('documents')
    .getPublicUrl(fileName)

  if (urlErr) throw urlErr

  return { path: fileName, url: urlData.publicUrl }
}

export async function sendMessage(supabase, payload) {
  const { error } = await supabase.from('messages').insert(payload)
  if (error) throw error
}

export async function getMessages(supabase, friendId, groupId) {
  let query = supabase
    .from('messages')
    .select(`
      id, sender_id, receiver_id, group_id, message_type, content,
      file_name, file_url, file_size, created_at,
      sender:profiles!sender_id(id, full_name)
    `)
    .order('created_at', { ascending: true })

  if (friendId) {
    query = query.or(`receiver_id.eq.${friendId},sender_id.eq.${friendId}`)
  }
  if (groupId) {
    query = query.eq('group_id', groupId)
  }

  const { data, error } = await query
  if (error) throw error
  return data
}
