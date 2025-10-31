'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient, uploadFile, sendMessage, getMessages } from '@/lib/supabase'
import { Users, LogOut, Search, Paperclip, Send, FileText, Download, MessageSquare } from 'lucide-react'

export default function ChatApp({ session }) {
  const [activeTab, setActiveTab] = useState('friends')
  const [friends, setFriends] = useState([])
  const [groups, setGroups] = useState([])
  const [friendRequests, setFriendRequests] = useState([])
  const [selectedChat, setSelectedChat] = useState(null) // {type, id, displayName}
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [loading, setLoading] = useState(false)

  const fileInputRef = useRef(null)
  const messagesEndRef = useRef(null)
  const supabase = createClient()

  useEffect(() => {
    loadFriends()
    loadGroups()
    loadFriendRequests()
  }, [])

  useEffect(() => {
    if (selectedChat) {
      loadMessages()
      const unsub = subscribeToMessages()
      return unsub
    }
  }, [selectedChat])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ---------- load lists ----------
  const loadFriends = async () => {
    const { data, error } = await supabase
      .from('friendships')
      .select('friend:profiles!friend_id(id, email, full_name)')
      .eq('user_id', session.user.id)
      .eq('status', 'accepted')

    if (!error && data) {
      setFriends(data.map((f) => f.friend))
    }
  }

  const loadGroups = async () => {
    const { data } = await supabase
      .from('group_members')
      .select('group:groups(id, name)')
      .eq('user_id', session.user.id)

    if (data) setGroups(data.map((g) => g.group))
  }

  const loadFriendRequests = async () => {
    const { data } = await supabase
      .from('friendships')
      .select('id, from:profiles!user_id(id, email, full_name)')
      .eq('friend_id', session.user.id)
      .eq('status', 'pending')

    if (data) setFriendRequests(data)
  }

  // ---------- messages ----------
  const loadMessages = async () => {
    try {
      const data = await getMessages(
        supabase,
        selectedChat?.type === 'friend' ? selectedChat.id : null,
        selectedChat?.type === 'group' ? selectedChat.id : null
      )
      setMessages(data)
    } catch (err) {
      console.error('Error loading messages:', err)
    }
  }

  const subscribeToMessages = () => {
    const channel = supabase
      .channel('messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          if (
            (selectedChat?.type === 'friend' &&
              (payload.new.receiver_id === selectedChat.id || payload.new.sender_id === selectedChat.id)) ||
            (selectedChat?.type === 'group' && payload.new.group_id === selectedChat.id)
          ) {
            loadMessages()
          }
        }
      )
      .subscribe()
    return () => supabase.removeChannel(channel)
  }

  // ---------- search users (by email or full_name) ----------
  useEffect(() => {
    const q = searchQuery.trim()
    if (!q) {
      setSearchResults([])
      return
    }
    const t = setTimeout(() => searchUsers(q), 250)
    return () => clearTimeout(t)
  }, [searchQuery])

  async function searchUsers(q) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, avatar_url')
      .or(`email.ilike.*${q}*,full_name.ilike.*${q}*`)
      .limit(10)

    if (!error) setSearchResults(data || [])
  }

  // ---------- actions ----------
  const handleFileUpload = async (file) => {
    if (!file) return
    if (file.size > 100 * 1024 * 1024) {
      alert('File size exceeds 100MB limit')
      return
    }

    setLoading(true)
    try {
      const { url } = await uploadFile(supabase, file, session.user.id)
      await sendMessage(supabase, {
        sender_id: session.user.id,
        receiver_id: selectedChat?.type === 'friend' ? selectedChat.id : null,
        group_id: selectedChat?.type === 'group' ? selectedChat.id : null,
        message_type: 'file',
        content: newMessage || 'Shared a file',
        file_name: file.name,
        file_url: url,
        file_size: file.size
      })
      setNewMessage('')
      loadMessages()
    } catch (err) {
      alert('Error uploading file: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedChat) return
    try {
      await sendMessage(supabase, {
        sender_id: session.user.id,
        receiver_id: selectedChat.type === 'friend' ? selectedChat.id : null,
        group_id: selectedChat.type === 'group' ? selectedChat.id : null,
        message_type: 'text',
        content: newMessage
      })
      setNewMessage('')
      loadMessages()
    } catch (err) {
      alert('Error sending message: ' + err.message)
    }
  }

  const acceptFriendRequest = async (requestId) => {
    await supabase.from('friendships').update({ status: 'accepted' }).eq('id', requestId)
    loadFriends()
    loadFriendRequests()
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
  }

  // ---------- UI ----------
  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-semibold text-gray-800">DocShare</h1>
            <button onClick={handleSignOut} className="p-2 hover:bg-gray-100 rounded-lg">
              <LogOut className="w-5 h-5 text-gray-600" />
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or email…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* search results (tap to open chat) */}
          {searchResults.length > 0 && (
            <div className="mt-3 max-h-56 overflow-y-auto border border-gray-200 rounded-lg">
              {searchResults.map((u) => (
                <button
                  key={u.id}
                  onClick={() => {
                    setSelectedChat({
                      type: 'friend',
                      id: u.id,
                      displayName: u.full_name || u.email
                    })
                    setSearchResults([])
                    setSearchQuery('')
                  }}
                  className="w-full text-left p-3 hover:bg-gray-50 border-b last:border-b-0"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-600/10 text-blue-700 font-semibold flex items-center justify-center">
                      {(u.full_name || u.email).charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-gray-800 truncate">{u.full_name || u.email}</div>
                      {u.full_name && <div className="text-xs text-gray-500 truncate">{u.email}</div>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('friends')}
            className={`flex-1 py-3 text-sm font-medium ${activeTab === 'friends' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-600 hover:text-gray-800'}`}
          >
            Friends
          </button>
          <button
            onClick={() => setActiveTab('groups')}
            className={`flex-1 py-3 text-sm font-medium ${activeTab === 'groups' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-600 hover:text-gray-800'}`}
          >
            Groups
          </button>
          <button
            onClick={() => setActiveTab('requests')}
            className={`flex-1 py-3 text-sm font-medium ${activeTab === 'requests' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-600 hover:text-gray-800'}`}
          >
            Requests
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {activeTab === 'friends' && (
            <div>
              {friends.map((friend) => (
                <button
                  key={friend.id}
                  onClick={() =>
                    setSelectedChat({ type: 'friend', id: friend.id, displayName: friend.full_name || friend.email })
                  }
                  className="w-full p-4 hover:bg-gray-50 border-b text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full text-white font-semibold flex items-center justify-center">
                      {(friend.full_name || friend.email).charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-gray-800 truncate">{friend.full_name || friend.email}</p>
                      {friend.full_name && <p className="text-sm text-gray-500 truncate">{friend.email}</p>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {activeTab === 'groups' && (
            <div>
              {groups.map((group) => (
                <button
                  key={group.id}
                  onClick={() => setSelectedChat({ type: 'group', id: group.id, displayName: group.name })}
                  className="w-full p-4 hover:bg-gray-50 border-b text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-teal-500 rounded-full text-white flex items-center justify-center">
                      <Users className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-gray-800 truncate">{group.name}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {activeTab === 'requests' && (
            <div>
              {friendRequests.map((r) => (
                <div key={r.id} className="p-4 border-b">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-pink-500 rounded-full text-white font-semibold flex items-center justify-center">
                      {(r.from?.full_name || r.from?.email || 'U').charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-800">
                        {r.from?.full_name || r.from?.email}
                      </p>
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => acceptFriendRequest(r.id)}
                          className="flex-1 py-2 px-3 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
                        >
                          Accept
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col">
        {selectedChat ? (
          <>
            <div className="h-16 bg-white border-b flex items-center px-6">
              <p className="font-semibold text-gray-800">{selectedChat.displayName}</p>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {messages.map((msg) => (
                <div key={msg.id} className="flex gap-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full text-white text-sm font-semibold flex items-center justify-center">
                    {(msg.sender?.full_name || 'U').charAt(0)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-gray-800 text-sm">
                        {msg.sender?.full_name || 'Unknown'}
                      </span>
                      <span className="text-xs text-gray-400">
                        {new Date(msg.created_at).toLocaleTimeString()}
                      </span>
                    </div>

                    {msg.message_type === 'file' ? (
                      <div className="bg-white border rounded-lg p-4 max-w-md">
                        <div className="flex items-start gap-3">
                          <FileText className="w-5 h-5 text-blue-600" />
                          <div className="flex-1">
                            <p className="font-medium text-gray-800">{msg.file_name}</p>
                            <p className="text-sm text-gray-600 mt-1">{msg.content}</p>
                          </div>
                          <a href={msg.file_url} download className="p-2 hover:bg-gray-100 rounded-lg">
                            <Download className="w-4 h-4 text-gray-600" />
                          </a>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-white border rounded-lg p-3 max-w-md">
                        <p className="text-gray-700">{msg.content}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className="bg-white border-t p-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Type a message…"
                  disabled={loading}
                  className="flex-1 px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <label className="p-3 bg-gray-100 hover:bg-gray-200 rounded-lg cursor-pointer">
                  <input
                    ref={fileInputRef}
                    type="file"
                    onChange={(e) => e.target.files[0] && handleFileUpload(e.target.files[0])}
                    className="hidden"
                  />
                  <Paperclip className="w-5 h-5 text-gray-600" />
                </label>
                <button onClick={handleSendMessage} disabled={loading} className="px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-gray-400">
              <MessageSquare className="w-16 h-16 mx-auto mb-4" />
              <p>Select a conversation to start</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
