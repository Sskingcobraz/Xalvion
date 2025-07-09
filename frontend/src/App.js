import React, { useState, useEffect, useRef } from 'react';
import './App.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('xalvion_token'));
  const [servers, setServers] = useState([]);
  const [activeServer, setActiveServer] = useState(null);
  const [channels, setChannels] = useState([]);
  const [activeChannel, setActiveChannel] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [ws, setWs] = useState(null);
  const [userPresence, setUserPresence] = useState({});
  const [typingUsers, setTypingUsers] = useState({});
  const [isTyping, setIsTyping] = useState(false);
  const [showUserList, setShowUserList] = useState(false);
  const [theme, setTheme] = useState('dark');
  const [customStatus, setCustomStatus] = useState('');
  const [showLogin, setShowLogin] = useState(!token);
  const [loginData, setLoginData] = useState({ username: '', password: '' });
  const [registerData, setRegisterData] = useState({ username: '', email: '', password: '', display_name: '' });
  const [isRegistering, setIsRegistering] = useState(false);
  const [showCreateServer, setShowCreateServer] = useState(false);
  const [newServer, setNewServer] = useState({ name: '', description: '' });
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [newChannel, setNewChannel] = useState({ name: '', channel_type: 'text', description: '' });
  const [emojiPicker, setEmojiPicker] = useState({ show: false, messageId: null });
  
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const messageInputRef = useRef(null);

  // Available emojis
  const emojis = ['👍', '👎', '❤️', '😂', '😮', '😢', '😡', '🎉', '🚀', '👀', '🔥', '💯', '✨', '⚡', '🌟', '💎', '🎯', '🏆', '🎊', '🎈'];

  useEffect(() => {
    if (token) {
      fetchUserProfile();
      fetchServers();
    }
  }, [token]);

  useEffect(() => {
    if (user && !ws) {
      connectWebSocket();
    }
  }, [user]);

  useEffect(() => {
    if (activeServer) {
      fetchChannels(activeServer.server_id);
    }
  }, [activeServer]);

  useEffect(() => {
    if (activeChannel) {
      fetchMessages(activeChannel.channel_id);
    }
  }, [activeChannel]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const connectWebSocket = () => {
    if (!user) return;
    
    const wsUrl = BACKEND_URL.replace('http', 'ws') + `/ws/${user.user_id}`;
    const websocket = new WebSocket(wsUrl);
    
    websocket.onopen = () => {
      console.log('WebSocket connected');
      setWs(websocket);
      
      // Join active server
      if (activeServer) {
        websocket.send(JSON.stringify({
          type: 'join_server',
          server_id: activeServer.server_id
        }));
      }
    };
    
    websocket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      
      switch (message.type) {
        case 'new_message':
          setMessages(prev => [...prev, message.data]);
          break;
        case 'reaction_update':
          setMessages(prev => prev.map(msg => 
            msg.message_id === message.data.message_id 
              ? { ...msg, reactions: message.data.reactions }
              : msg
          ));
          break;
        case 'typing':
          if (message.data.user_id !== user.user_id) {
            setTypingUsers(prev => ({
              ...prev,
              [message.data.channel_id]: {
                ...prev[message.data.channel_id],
                [message.data.user_id]: message.data.username
              }
            }));
          }
          break;
        case 'stop_typing':
          setTypingUsers(prev => {
            const updated = { ...prev };
            if (updated[message.data.channel_id]) {
              delete updated[message.data.channel_id][message.data.user_id];
            }
            return updated;
          });
          break;
        case 'user_joined':
          setUserPresence(prev => ({
            ...prev,
            [message.data.user_id]: message.data.presence
          }));
          break;
        case 'presence_update':
          setUserPresence(prev => ({
            ...prev,
            [message.data.user_id]: message.data.presence
          }));
          break;
      }
    };
    
    websocket.onclose = () => {
      console.log('WebSocket disconnected');
      setWs(null);
      // Reconnect after 3 seconds
      setTimeout(connectWebSocket, 3000);
    };
  };

  const fetchUserProfile = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/user/profile`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
        setTheme(userData.theme || 'dark');
        setCustomStatus(userData.custom_status || '');
      } else {
        localStorage.removeItem('xalvion_token');
        setToken(null);
        setShowLogin(true);
      }
    } catch (error) {
      console.error('Error fetching user profile:', error);
    }
  };

  const fetchServers = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/servers`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setServers(data.servers);
        if (data.servers.length > 0 && !activeServer) {
          setActiveServer(data.servers[0]);
        }
      }
    } catch (error) {
      console.error('Error fetching servers:', error);
    }
  };

  const fetchChannels = async (serverId) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/servers/${serverId}/channels`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setChannels(data.channels);
        if (data.channels.length > 0 && !activeChannel) {
          setActiveChannel(data.channels[0]);
        }
      }
    } catch (error) {
      console.error('Error fetching channels:', error);
    }
  };

  const fetchMessages = async (channelId) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/channels/${channelId}/messages`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages);
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`${BACKEND_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(loginData)
      });
      
      if (response.ok) {
        const data = await response.json();
        setToken(data.access_token);
        localStorage.setItem('xalvion_token', data.access_token);
        setUser(data.user);
        setShowLogin(false);
      } else {
        alert('Login failed');
      }
    } catch (error) {
      console.error('Login error:', error);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`${BACKEND_URL}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(registerData)
      });
      
      if (response.ok) {
        const data = await response.json();
        setToken(data.access_token);
        localStorage.setItem('xalvion_token', data.access_token);
        setUser(data.user);
        setShowLogin(false);
      } else {
        alert('Registration failed');
      }
    } catch (error) {
      console.error('Registration error:', error);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!messageInput.trim() || !activeChannel) return;
    
    try {
      const response = await fetch(`${BACKEND_URL}/api/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          content: messageInput,
          channel_id: activeChannel.channel_id
        })
      });
      
      if (response.ok) {
        setMessageInput('');
        handleStopTyping();
      }
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const handleTyping = () => {
    if (!isTyping && ws && activeChannel) {
      setIsTyping(true);
      ws.send(JSON.stringify({
        type: 'typing',
        channel_id: activeChannel.channel_id,
        username: user.username
      }));
    }
    
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      handleStopTyping();
    }, 3000);
  };

  const handleStopTyping = () => {
    if (isTyping && ws && activeChannel) {
      setIsTyping(false);
      ws.send(JSON.stringify({
        type: 'stop_typing',
        channel_id: activeChannel.channel_id
      }));
    }
    clearTimeout(typingTimeoutRef.current);
  };

  const handleCreateServer = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`${BACKEND_URL}/api/servers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newServer)
      });
      
      if (response.ok) {
        const server = await response.json();
        setServers(prev => [...prev, server]);
        setActiveServer(server);
        setShowCreateServer(false);
        setNewServer({ name: '', description: '' });
      }
    } catch (error) {
      console.error('Error creating server:', error);
    }
  };

  const handleCreateChannel = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`${BACKEND_URL}/api/channels`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ...newChannel,
          server_id: activeServer.server_id
        })
      });
      
      if (response.ok) {
        const channel = await response.json();
        setChannels(prev => [...prev, channel]);
        setShowCreateChannel(false);
        setNewChannel({ name: '', channel_type: 'text', description: '' });
      }
    } catch (error) {
      console.error('Error creating channel:', error);
    }
  };

  const handleReaction = async (messageId, emoji) => {
    try {
      await fetch(`${BACKEND_URL}/api/messages/${messageId}/reactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          message_id: messageId,
          emoji: emoji,
          action: 'add'
        })
      });
      
      setEmojiPicker({ show: false, messageId: null });
    } catch (error) {
      console.error('Error adding reaction:', error);
    }
  };

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getTypingText = () => {
    if (!activeChannel || !typingUsers[activeChannel.channel_id]) return '';
    
    const users = Object.values(typingUsers[activeChannel.channel_id]);
    if (users.length === 0) return '';
    
    if (users.length === 1) {
      return `${users[0]} is typing...`;
    } else if (users.length === 2) {
      return `${users[0]} and ${users[1]} are typing...`;
    } else {
      return `${users[0]} and ${users.length - 1} others are typing...`;
    }
  };

  const logout = () => {
    localStorage.removeItem('xalvion_token');
    setToken(null);
    setUser(null);
    setShowLogin(true);
    if (ws) {
      ws.close();
    }
  };

  if (showLogin) {
    return (
      <div className={`min-h-screen ${theme === 'dark' ? 'bg-gray-900' : 'bg-gray-100'} flex items-center justify-center`}>
        <div className={`${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} p-8 rounded-xl shadow-2xl w-full max-w-md`}>
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              Xalvion
            </h1>
            <p className={`${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'} mt-2`}>
              The most advanced free chat platform
            </p>
          </div>
          
          <div className="flex mb-6">
            <button
              onClick={() => setIsRegistering(false)}
              className={`flex-1 py-2 px-4 rounded-l-lg transition-all ${
                !isRegistering 
                  ? 'bg-purple-600 text-white' 
                  : theme === 'dark' 
                    ? 'bg-gray-700 text-gray-300' 
                    : 'bg-gray-200 text-gray-700'
              }`}
            >
              Login
            </button>
            <button
              onClick={() => setIsRegistering(true)}
              className={`flex-1 py-2 px-4 rounded-r-lg transition-all ${
                isRegistering 
                  ? 'bg-purple-600 text-white' 
                  : theme === 'dark' 
                    ? 'bg-gray-700 text-gray-300' 
                    : 'bg-gray-200 text-gray-700'
              }`}
            >
              Register
            </button>
          </div>
          
          {!isRegistering ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <input
                type="text"
                placeholder="Username"
                value={loginData.username}
                onChange={(e) => setLoginData({ ...loginData, username: e.target.value })}
                className={`w-full p-3 rounded-lg ${
                  theme === 'dark' 
                    ? 'bg-gray-700 text-white border-gray-600' 
                    : 'bg-gray-100 text-gray-900 border-gray-300'
                } border focus:outline-none focus:ring-2 focus:ring-purple-500`}
                required
              />
              <input
                type="password"
                placeholder="Password"
                value={loginData.password}
                onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                className={`w-full p-3 rounded-lg ${
                  theme === 'dark' 
                    ? 'bg-gray-700 text-white border-gray-600' 
                    : 'bg-gray-100 text-gray-900 border-gray-300'
                } border focus:outline-none focus:ring-2 focus:ring-purple-500`}
                required
              />
              <button
                type="submit"
                className="w-full bg-purple-600 text-white py-3 rounded-lg hover:bg-purple-700 transition-colors font-semibold"
              >
                Login
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              <input
                type="text"
                placeholder="Username"
                value={registerData.username}
                onChange={(e) => setRegisterData({ ...registerData, username: e.target.value })}
                className={`w-full p-3 rounded-lg ${
                  theme === 'dark' 
                    ? 'bg-gray-700 text-white border-gray-600' 
                    : 'bg-gray-100 text-gray-900 border-gray-300'
                } border focus:outline-none focus:ring-2 focus:ring-purple-500`}
                required
              />
              <input
                type="email"
                placeholder="Email"
                value={registerData.email}
                onChange={(e) => setRegisterData({ ...registerData, email: e.target.value })}
                className={`w-full p-3 rounded-lg ${
                  theme === 'dark' 
                    ? 'bg-gray-700 text-white border-gray-600' 
                    : 'bg-gray-100 text-gray-900 border-gray-300'
                } border focus:outline-none focus:ring-2 focus:ring-purple-500`}
                required
              />
              <input
                type="text"
                placeholder="Display Name (optional)"
                value={registerData.display_name}
                onChange={(e) => setRegisterData({ ...registerData, display_name: e.target.value })}
                className={`w-full p-3 rounded-lg ${
                  theme === 'dark' 
                    ? 'bg-gray-700 text-white border-gray-600' 
                    : 'bg-gray-100 text-gray-900 border-gray-300'
                } border focus:outline-none focus:ring-2 focus:ring-purple-500`}
              />
              <input
                type="password"
                placeholder="Password"
                value={registerData.password}
                onChange={(e) => setRegisterData({ ...registerData, password: e.target.value })}
                className={`w-full p-3 rounded-lg ${
                  theme === 'dark' 
                    ? 'bg-gray-700 text-white border-gray-600' 
                    : 'bg-gray-100 text-gray-900 border-gray-300'
                } border focus:outline-none focus:ring-2 focus:ring-purple-500`}
                required
              />
              <button
                type="submit"
                className="w-full bg-purple-600 text-white py-3 rounded-lg hover:bg-purple-700 transition-colors font-semibold"
              >
                Register
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`h-screen flex ${theme === 'dark' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-900'}`}>
      {/* Server List */}
      <div className={`w-16 ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} flex flex-col items-center py-4 space-y-2`}>
        {servers.map((server) => (
          <div
            key={server.server_id}
            onClick={() => setActiveServer(server)}
            className={`w-12 h-12 rounded-full flex items-center justify-center cursor-pointer transition-all ${
              activeServer?.server_id === server.server_id
                ? 'bg-purple-600 text-white'
                : theme === 'dark'
                  ? 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                  : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
            }`}
          >
            {server.icon ? (
              <img src={server.icon} alt={server.name} className="w-8 h-8 rounded-full" />
            ) : (
              <span className="text-lg font-bold">{server.name.charAt(0)}</span>
            )}
          </div>
        ))}
        <button
          onClick={() => setShowCreateServer(true)}
          className={`w-12 h-12 rounded-full flex items-center justify-center cursor-pointer transition-all ${
            theme === 'dark'
              ? 'bg-gray-700 hover:bg-green-600 text-gray-300 hover:text-white'
              : 'bg-gray-200 hover:bg-green-500 text-gray-700 hover:text-white'
          }`}
        >
          <span className="text-2xl">+</span>
        </button>
      </div>

      {/* Channel List */}
      <div className={`w-64 ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} flex flex-col`}>
        <div className={`p-4 ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'} border-b ${theme === 'dark' ? 'border-gray-600' : 'border-gray-300'}`}>
          <h2 className="font-bold text-lg truncate">{activeServer?.name || 'No Server'}</h2>
          {activeServer && (
            <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
              {activeServer.description || 'No description'}
            </p>
          )}
        </div>
        
        <div className="flex-1 overflow-y-auto p-2">
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className={`text-sm font-semibold ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'} uppercase`}>
                Text Channels
              </h3>
              <button
                onClick={() => setShowCreateChannel(true)}
                className={`p-1 rounded hover:${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}`}
              >
                <span className="text-sm">+</span>
              </button>
            </div>
            {channels.filter(c => c.channel_type === 'text').map((channel) => (
              <div
                key={channel.channel_id}
                onClick={() => setActiveChannel(channel)}
                className={`p-2 rounded cursor-pointer transition-all ${
                  activeChannel?.channel_id === channel.channel_id
                    ? 'bg-purple-600 text-white'
                    : theme === 'dark'
                      ? 'hover:bg-gray-700 text-gray-300'
                      : 'hover:bg-gray-200 text-gray-700'
                }`}
              >
                <span className="mr-2">#</span>
                {channel.name}
              </div>
            ))}
          </div>
          
          <div className="mb-4">
            <h3 className={`text-sm font-semibold ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'} uppercase mb-2`}>
              Voice Channels
            </h3>
            {channels.filter(c => c.channel_type === 'voice').map((channel) => (
              <div
                key={channel.channel_id}
                className={`p-2 rounded cursor-pointer transition-all ${
                  theme === 'dark'
                    ? 'hover:bg-gray-700 text-gray-300'
                    : 'hover:bg-gray-200 text-gray-700'
                }`}
              >
                <span className="mr-2">🔊</span>
                {channel.name}
              </div>
            ))}
          </div>
        </div>
        
        {/* User Info */}
        <div className={`p-4 ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'} border-t ${theme === 'dark' ? 'border-gray-600' : 'border-gray-300'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center text-white font-bold">
                {user?.username?.charAt(0)?.toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-sm">{user?.display_name}</p>
                <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                  {customStatus || 'Online'}
                </p>
              </div>
            </div>
            <div className="flex space-x-1">
              <button
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className={`p-1 rounded hover:${theme === 'dark' ? 'bg-gray-600' : 'bg-gray-300'}`}
              >
                {theme === 'dark' ? '🌙' : '☀️'}
              </button>
              <button
                onClick={logout}
                className={`p-1 rounded hover:${theme === 'dark' ? 'bg-gray-600' : 'bg-gray-300'}`}
              >
                🚪
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Channel Header */}
        <div className={`p-4 ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'} border-b ${theme === 'dark' ? 'border-gray-600' : 'border-gray-300'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-xl">#</span>
              <h2 className="font-bold text-lg">{activeChannel?.name || 'No Channel'}</h2>
              {activeChannel?.description && (
                <span className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                  • {activeChannel.description}
                </span>
              )}
            </div>
            <button
              onClick={() => setShowUserList(!showUserList)}
              className={`p-2 rounded hover:${theme === 'dark' ? 'bg-gray-600' : 'bg-gray-300'}`}
            >
              👥
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((message) => (
            <div key={message.message_id} className="group">
              <div className="flex items-start space-x-3">
                <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0">
                  {message.author_username?.charAt(0)?.toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-1">
                    <span className="font-semibold">{message.author_display_name || message.author_username}</span>
                    <span className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                      {formatTimestamp(message.created_at)}
                    </span>
                  </div>
                  <p className={`${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                    {message.content}
                  </p>
                  
                  {/* Reactions */}
                  <div className="flex items-center space-x-2 mt-2">
                    {message.reactions && message.reactions.length > 0 && (
                      <div className="flex space-x-1">
                        {Object.entries(
                          message.reactions.reduce((acc, reaction) => {
                            acc[reaction.emoji] = acc[reaction.emoji] || [];
                            acc[reaction.emoji].push(reaction);
                            return acc;
                          }, {})
                        ).map(([emoji, reactions]) => (
                          <span
                            key={emoji}
                            className={`px-2 py-1 rounded text-sm ${
                              theme === 'dark' 
                                ? 'bg-gray-700 hover:bg-gray-600' 
                                : 'bg-gray-200 hover:bg-gray-300'
                            } cursor-pointer`}
                          >
                            {emoji} {reactions.length}
                          </span>
                        ))}
                      </div>
                    )}
                    <button
                      onClick={() => setEmojiPicker({ 
                        show: !emojiPicker.show || emojiPicker.messageId !== message.message_id, 
                        messageId: message.message_id 
                      })}
                      className={`opacity-0 group-hover:opacity-100 p-1 rounded hover:${
                        theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'
                      } transition-opacity`}
                    >
                      😊
                    </button>
                  </div>
                  
                  {/* Emoji Picker */}
                  {emojiPicker.show && emojiPicker.messageId === message.message_id && (
                    <div className={`mt-2 p-2 rounded ${
                      theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'
                    } flex flex-wrap gap-1`}>
                      {emojis.map((emoji) => (
                        <button
                          key={emoji}
                          onClick={() => handleReaction(message.message_id, emoji)}
                          className={`p-1 rounded hover:${
                            theme === 'dark' ? 'bg-gray-600' : 'bg-gray-300'
                          }`}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          
          {/* Typing Indicator */}
          {getTypingText() && (
            <div className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'} italic`}>
              {getTypingText()}
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {/* Message Input */}
        <div className={`p-4 ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'} border-t ${theme === 'dark' ? 'border-gray-600' : 'border-gray-300'}`}>
          <form onSubmit={handleSendMessage} className="flex space-x-2">
            <input
              ref={messageInputRef}
              type="text"
              value={messageInput}
              onChange={(e) => {
                setMessageInput(e.target.value);
                handleTyping();
              }}
              onBlur={handleStopTyping}
              placeholder={`Message #${activeChannel?.name || 'channel'}`}
              className={`flex-1 p-3 rounded-lg ${
                theme === 'dark' 
                  ? 'bg-gray-800 text-white border-gray-600' 
                  : 'bg-white text-gray-900 border-gray-300'
              } border focus:outline-none focus:ring-2 focus:ring-purple-500`}
            />
            <button
              type="submit"
              disabled={!messageInput.trim()}
              className="bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
            >
              Send
            </button>
          </form>
        </div>
      </div>

      {/* User List */}
      {showUserList && (
        <div className={`w-64 ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} border-l ${theme === 'dark' ? 'border-gray-600' : 'border-gray-300'}`}>
          <div className={`p-4 ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'} border-b ${theme === 'dark' ? 'border-gray-600' : 'border-gray-300'}`}>
            <h3 className="font-bold">Members</h3>
          </div>
          <div className="p-4">
            <div className="space-y-2">
              {Object.entries(userPresence).map(([userId, presence]) => (
                <div key={userId} className="flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${
                    presence.status === 'online' ? 'bg-green-500' : 'bg-gray-500'
                  }`} />
                  <span className="text-sm">{userId}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Create Server Modal */}
      {showCreateServer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className={`${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} p-6 rounded-lg w-full max-w-md`}>
            <h2 className="text-xl font-bold mb-4">Create Server</h2>
            <form onSubmit={handleCreateServer} className="space-y-4">
              <input
                type="text"
                placeholder="Server Name"
                value={newServer.name}
                onChange={(e) => setNewServer({ ...newServer, name: e.target.value })}
                className={`w-full p-3 rounded-lg ${
                  theme === 'dark' 
                    ? 'bg-gray-700 text-white border-gray-600' 
                    : 'bg-gray-100 text-gray-900 border-gray-300'
                } border focus:outline-none focus:ring-2 focus:ring-purple-500`}
                required
              />
              <textarea
                placeholder="Description (optional)"
                value={newServer.description}
                onChange={(e) => setNewServer({ ...newServer, description: e.target.value })}
                className={`w-full p-3 rounded-lg ${
                  theme === 'dark' 
                    ? 'bg-gray-700 text-white border-gray-600' 
                    : 'bg-gray-100 text-gray-900 border-gray-300'
                } border focus:outline-none focus:ring-2 focus:ring-purple-500`}
                rows="3"
              />
              <div className="flex space-x-2">
                <button
                  type="submit"
                  className="flex-1 bg-purple-600 text-white py-2 rounded-lg hover:bg-purple-700"
                >
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateServer(false)}
                  className={`flex-1 ${
                    theme === 'dark' 
                      ? 'bg-gray-700 hover:bg-gray-600' 
                      : 'bg-gray-200 hover:bg-gray-300'
                  } py-2 rounded-lg`}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Channel Modal */}
      {showCreateChannel && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className={`${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} p-6 rounded-lg w-full max-w-md`}>
            <h2 className="text-xl font-bold mb-4">Create Channel</h2>
            <form onSubmit={handleCreateChannel} className="space-y-4">
              <input
                type="text"
                placeholder="Channel Name"
                value={newChannel.name}
                onChange={(e) => setNewChannel({ ...newChannel, name: e.target.value })}
                className={`w-full p-3 rounded-lg ${
                  theme === 'dark' 
                    ? 'bg-gray-700 text-white border-gray-600' 
                    : 'bg-gray-100 text-gray-900 border-gray-300'
                } border focus:outline-none focus:ring-2 focus:ring-purple-500`}
                required
              />
              <select
                value={newChannel.channel_type}
                onChange={(e) => setNewChannel({ ...newChannel, channel_type: e.target.value })}
                className={`w-full p-3 rounded-lg ${
                  theme === 'dark' 
                    ? 'bg-gray-700 text-white border-gray-600' 
                    : 'bg-gray-100 text-gray-900 border-gray-300'
                } border focus:outline-none focus:ring-2 focus:ring-purple-500`}
              >
                <option value="text">Text Channel</option>
                <option value="voice">Voice Channel</option>
              </select>
              <textarea
                placeholder="Description (optional)"
                value={newChannel.description}
                onChange={(e) => setNewChannel({ ...newChannel, description: e.target.value })}
                className={`w-full p-3 rounded-lg ${
                  theme === 'dark' 
                    ? 'bg-gray-700 text-white border-gray-600' 
                    : 'bg-gray-100 text-gray-900 border-gray-300'
                } border focus:outline-none focus:ring-2 focus:ring-purple-500`}
                rows="3"
              />
              <div className="flex space-x-2">
                <button
                  type="submit"
                  className="flex-1 bg-purple-600 text-white py-2 rounded-lg hover:bg-purple-700"
                >
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateChannel(false)}
                  className={`flex-1 ${
                    theme === 'dark' 
                      ? 'bg-gray-700 hover:bg-gray-600' 
                      : 'bg-gray-200 hover:bg-gray-300'
                  } py-2 rounded-lg`}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;