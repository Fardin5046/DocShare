import { createClientComponentClient } from '@supabase/supabase-js'

export function createClient() {
  return createClientComponentClient()
}

// Helper functions
export async function uploadFile(supabase, file, userId) {
  const fileExt = file.name.split('.').pop()
  const fileName = `${userId}/${Date.now()}.${fileExt}`
  
  const { data, error } = await supabase.storage
    .from('documents')
    .upload(fileName, file, {
      cacheControl: '3600',
      upsert: false
    })

  if (error) throw error
  
  const { data: { publicUrl } } = supabase.storage
    .from('documents')
    .getPublicUrl(fileName)

  return { path: fileName, url: publicUrl }
}

export async function sendMessage(supabase, messageData) {
  const { data, error } = await supabase
    .from('messages')
    .insert([messageData])
    .select()
    .single()

  if (error) throw error
  return data
}

export async function getMessages(supabase, receiverId, groupId) {
  let query = supabase
    .from('messages')
    .select(`
      *,
      sender:profiles!sender_id(name, email)
    `)
    .order('created_at', { ascending: true })

  if (groupId) {
    query = query.eq('group_id', groupId)
  } else {
    query = query.or(`receiver_id.eq.${receiverId},sender_id.eq.${receiverId}`)
  }

  const { data, error } = await query
  if (error) throw error
  return data
}