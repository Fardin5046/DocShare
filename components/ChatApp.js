'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient, uploadFile, sendMessage, getMessages } from '@/lib/supabase'
import { 
  Users, UserPlus, LogOut, Search, Paperclip, Send, 
  FileImage, FileText, Download, X, Check, Plus, MessageSquare 
} from 'lucide-react'

export default function ChatApp({ session }) {
  const [activeTab, setActiveTab] = useState('friends')
  const [friends, setFriends] = useState([])
  const [groups, setGroups] = useState([])
  const [friendRequests, setFriendRequests] = useState([])
  const [selectedChat, setSelectedChat] = useState(null)
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
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
      subscribeToMessages()
    }
  }, [selectedChat])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const loadFriends = async () => {
    const { data } = await supabase
      .from('friendships')
      .select('*, friend:profiles!friend_id(*)')
      .eq('user_id', session.user.id)
      .eq('status', 'accepted')
    
    if (data) setFriends(data.map(f => f.friend))
  }

  const loadGroups = async () => {
    const { data } = await supabase
      .from('group_members')
      .select('*, group:groups(*)')
      .eq('user_id', session.user.id)
    
    if (data) setGroups(data.map(g => g.group))
  }

  const loadFriendRequests = async () => {
    const { data } = await supabase
      .from('friendships')
      .select('*, from:profiles!user_id(*)')
      .eq('friend_id', session.user.id)
      .eq('status', 'pending')
    
    if (data) setFriendRequests(data)
  }

  const loadMessages = async () => {
    try {
      const data = await getMessages(
        supabase,
        selectedChat.type === 'friend' ? selectedChat.id : null,
        selectedChat.type === 'group' ? selectedChat.id : null
      )
      setMessages(data)
    } catch (error) {
      console.error('Error loading messages:', error)
    }
  }

  const subscribeToMessages = () => {
    const channel = supabase
      .channel('messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          if (
            (selectedChat.type === 'friend' && payload.new.receiver_id === selectedChat.id) ||
            (selectedChat.type === 'group' && payload.new.group_id === selectedChat.id)
          ) {
            loadMessages()
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }

  const handleFileUpload = async (file) => {
    if (!file) return
    if (file.size > 100 * 1024 * 1024) {
      alert('File size exceeds 100MB limit')
      return
    }

    setLoading(true)
    try {
      const { path, url } = await uploadFile(supabase, file, session.user.id)
      
      await sendMessage(supabase, {
        sender_id: session.user.id,
        receiver_id: selectedChat.type === 'friend' ? selectedChat.id : null,
        group_id: selectedChat.type === 'group' ? selectedChat.id : null,
        message_type: 'file',
        content: newMessage || 'Shared a file',
        file_name: file.name,
        file_url: url,
        file_size: file.size
      })

      setNewMessage('')
      loadMessages()
    } catch (error) {
      alert('Error uploading file: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const handlePaste = async (e) => {
    const items = e.clipboardData.items
    for (let item of items) {
      if (item.type.indexOf('image') !== -1) {
        const file = item.getAsFile()
        await handleFileUpload(file)
      }
    }
  }

  const handleSendMessage = async () => {
    if (!newMessage.trim()) return

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
    } catch (error) {
      alert('Error sending message: ' + error.message)
    }
  }

  const acceptFriendRequest = async (requestId) => {
    await supabase
      .from('friendships')
      .update({ status: 'accepted' })
      .eq('id', requestId)
    
    loadFriends()
    loadFriendRequests()
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-semibold text-gray-800">DocShare</h1>
            <button 
              onClick={handleSignOut}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <LogOut className="w-5 h-5 text-gray-600" />
            </button>
          </div>
          
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('friends')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === 'friends'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            Friends
          </button>
          <button
            onClick={() => setActiveTab('groups')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === 'groups'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            Groups
          </button>
          <button
            onClick={() => setActiveTab('requests')}
            className={`flex-1 py-3 text-sm font-medium transition-colors relative ${
              activeTab === 'requests'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            Requests
            {friendRequests.length > 0 && (
              <span className="absolute top-2 right-4 w-2 h-2 bg-red-500 rounded-full"></span>
            )}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-hide">
          {activeTab === 'friends' && (
            <div>
              {friends.map((friend) => (
                <button
                  key={friend.id}
                  onClick={() => setSelectedChat({ type: 'friend', ...friend })}
                  className="w-full p-4 hover:bg-gray-50 transition-colors border-b border-gray-100 text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white font-semibold">
                      {friend.name?.charAt(0) || 'U'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-800 truncate">{friend.name}</p>
                      <p className="text-sm text-gray-500 truncate">{friend.email}</p>
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
                  onClick={() => setSelectedChat({ type: 'group', ...group })}
                  className="w-full p-4 hover:bg-gray-50 transition-colors border-b border-gray-100 text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-teal-500 rounded-full flex items-center justify-center text-white">
                      <Users className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-800 truncate">{group.name}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {activeTab === 'requests' && (
            <div>
              {friendRequests.map((request) => (
                <div key={request.id} className="p-4 border-b border-gray-100">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-pink-500 rounded-full flex items-center justify-center text-white font-semibold">
                      {request.from.name?.charAt(0) || 'U'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-800">{request.from.name}</p>
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => acceptFriendRequest(request.id)}
                          className="flex-1 py-2 px-3 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
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

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {selectedChat ? (
          <>
            <div className="h-16 bg-white border-b border-gray-200 flex items-center px-6">
              <p className="font-semibold text-gray-800">{selectedChat.name}</p>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-hide">
              {messages.map((msg) => (
                <div key={msg.id} className="flex gap-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                    {msg.sender?.name?.charAt(0) || 'U'}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-gray-800 text-sm">{msg.sender?.name}</span>
                      <span className="text-xs text-gray-400">
                        {new Date(msg.created_at).toLocaleTimeString()}
                      </span>
                    </div>
                    
                    {msg.message_type === 'file' ? (
                      <div className="bg-white border border-gray-200 rounded-lg p-4 max-w-md">
                        <div className="flex items-start gap-3">
                          <FileText className="w-5 h-5 text-blue-600" />
                          <div className="flex-1">
                            <p className="font-medium text-gray-800">{msg.file_name}</p>
                            <p className="text-sm text-gray-600 mt-1">{msg.content}</p>
                          </div>
                          <a 
                            href={msg.file_url} 
                            download
                            className="p-2 hover:bg-gray-100 rounded-lg"
                          >
                            <Download className="w-4 h-4 text-gray-600" />
                          </a>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-white border border-gray-200 rounded-lg p-3 max-w-md">
                        <p className="text-gray-700">{msg.content}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className="bg-white border-t border-gray-200 p-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onPaste={handlePaste}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Type a message or paste screenshot (Ctrl+V)..."
                  disabled={loading}
                  className="flex-1 px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <label className="p-3 bg-gray-100 hover:bg-gray-200 rounded-lg cursor-pointer transition-colors">
                  <input
                    ref={fileInputRef}
                    type="file"
                    onChange={(e) => handleFileUpload(e.target.files[0])}
                    className="hidden"
                  />
                  <Paperclip className="w-5 h-5 text-gray-600" />
                </label>
                <button
                  onClick={handleSendMessage}
                  disabled={loading}
                  className="px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
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