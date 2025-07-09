import os
import uuid
from datetime import datetime
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
from motor.motor_asyncio import AsyncIOMotorClient
import json
import asyncio
import jwt
import bcrypt
from websockets.exceptions import ConnectionClosed
from bson import json_util
from fastapi.middleware.cors import CORSMiddleware


# Database setup
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
client = AsyncIOMotorClient(MONGO_URL)
db = client.xalvion_db

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'xalvion-super-secret-key-2025')
JWT_ALGORITHM = "HS256"

app = FastAPI(title="Xalvion - Advanced Chat System", version="1.0.0")

# CORS setup — allow Netlify frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://xalvion.netlify.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Security
security = HTTPBearer()

# Pydantic models
class UserRegistration(BaseModel):
    username: str
    email: str
    password: str
    display_name: Optional[str] = None

class UserLogin(BaseModel):
    username: str
    password: str

class ServerCreate(BaseModel):
    name: str
    description: Optional[str] = None
    icon: Optional[str] = None

class ChannelCreate(BaseModel):
    name: str
    server_id: str
    channel_type: str = "text"  # text, voice, video
    description: Optional[str] = None

class MessageCreate(BaseModel):
    content: str
    channel_id: str
    message_type: str = "text"  # text, file, image, system
    attachments: Optional[List[str]] = None

class MessageReaction(BaseModel):
    message_id: str
    emoji: str
    action: str  # add, remove

# Helper function to handle MongoDB ObjectId serialization
def parse_json(data):
    return json.loads(json_util.dumps(data))

# Connection Manager for WebSocket
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.user_presence: Dict[str, Dict[str, Any]] = {}
        self.server_members: Dict[str, List[str]] = {}
        
    async def connect(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        self.active_connections[user_id] = websocket
        self.user_presence[user_id] = {
            "status": "online",
            "last_seen": datetime.utcnow().isoformat(),
            "activity": "online"
        }
        
    def disconnect(self, user_id: str):
        if user_id in self.active_connections:
            del self.active_connections[user_id]
        if user_id in self.user_presence:
            self.user_presence[user_id]["status"] = "offline"
            self.user_presence[user_id]["last_seen"] = datetime.utcnow().isoformat()
    
    async def send_personal_message(self, message: str, user_id: str):
        if user_id in self.active_connections:
            try:
                await self.active_connections[user_id].send_text(message)
            except ConnectionClosed:
                self.disconnect(user_id)
    
    async def broadcast_to_server(self, message: str, server_id: str):
        if server_id in self.server_members:
            for user_id in self.server_members[server_id]:
                await self.send_personal_message(message, user_id)
    
    async def broadcast_to_channel(self, message: str, channel_id: str):
        # Get all users in the channel's server
        channel = await db.channels.find_one({"channel_id": channel_id})
        if channel:
            await self.broadcast_to_server(message, channel["server_id"])

manager = ConnectionManager()

# Authentication helpers
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def create_access_token(data: dict) -> str:
    return jwt.encode(data, JWT_SECRET, algorithm=JWT_ALGORITHM)

def verify_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    payload = verify_token(credentials.credentials)
    user_id = payload.get("user_id")
    user = await db.users.find_one({"user_id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

# API Routes

@app.post("/api/auth/register")
async def register(user_data: UserRegistration):
    # Check if user exists
    existing_user = await db.users.find_one({"$or": [{"username": user_data.username}, {"email": user_data.email}]})
    if existing_user:
        raise HTTPException(status_code=400, detail="User already exists")
    
    # Create user
    user_id = str(uuid.uuid4())
    hashed_password = hash_password(user_data.password)
    
    user = {
        "user_id": user_id,
        "username": user_data.username,
        "email": user_data.email,
        "display_name": user_data.display_name or user_data.username,
        "password": hashed_password,
        "avatar": None,
        "created_at": datetime.utcnow().isoformat(),
        "status": "offline",
        "bio": "",
        "theme": "dark",
        "custom_status": "",
        "servers": [],
        "friends": [],
        "blocked_users": []
    }
    
    await db.users.insert_one(user)
    
    # Create access token
    token = create_access_token({"user_id": user_id, "username": user_data.username})
    
    return {"access_token": token, "user": {k: v for k, v in user.items() if k != "password"}}

@app.post("/api/auth/login")
async def login(user_data: UserLogin):
    user = await db.users.find_one({"username": user_data.username})
    if not user or not verify_password(user_data.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = create_access_token({"user_id": user["user_id"], "username": user["username"]})
    return {"access_token": token, "user": {k: v for k, v in user.items() if k != "password"}}

@app.get("/api/user/profile")
async def get_profile(current_user: dict = Depends(get_current_user)):
    return {k: v for k, v in current_user.items() if k != "password"}

@app.get("/api/user/presence")
async def get_user_presence():
    return {"presence": manager.user_presence}

@app.post("/api/servers")
async def create_server(server_data: ServerCreate, current_user: dict = Depends(get_current_user)):
    server_id = str(uuid.uuid4())
    
    server = {
        "server_id": server_id,
        "name": server_data.name,
        "description": server_data.description,
        "icon": server_data.icon,
        "owner_id": current_user["user_id"],
        "members": [current_user["user_id"]],
        "created_at": datetime.utcnow().isoformat(),
        "channels": [],
        "roles": [
            {
                "role_id": str(uuid.uuid4()),
                "name": "Admin",
                "permissions": ["all"],
                "color": "#ff6b6b",
                "members": [current_user["user_id"]]
            },
            {
                "role_id": str(uuid.uuid4()),
                "name": "Member",
                "permissions": ["read", "write"],
                "color": "#4ecdc4",
                "members": []
            }
        ]
    }
    
    await db.servers.insert_one(server)
    
    # Add server to user's server list
    await db.users.update_one(
        {"user_id": current_user["user_id"]},
        {"$push": {"servers": server_id}}
    )
    
    # Create default channels
    default_channels = [
        {"name": "general", "type": "text", "description": "General discussion"},
        {"name": "announcements", "type": "text", "description": "Server announcements"},
        {"name": "General Voice", "type": "voice", "description": "General voice chat"}
    ]
    
    for channel_data in default_channels:
        channel_id = str(uuid.uuid4())
        channel = {
            "channel_id": channel_id,
            "server_id": server_id,
            "name": channel_data["name"],
            "channel_type": channel_data["type"],
            "description": channel_data["description"],
            "created_at": datetime.utcnow().isoformat(),
            "position": len(server["channels"]),
            "messages": []
        }
        
        await db.channels.insert_one(channel)
        server["channels"].append(channel_id)
    
    await db.servers.update_one(
        {"server_id": server_id},
        {"$set": {"channels": server["channels"]}}
    )
    
    return server

@app.get("/api/servers")
async def get_user_servers(current_user: dict = Depends(get_current_user)):
    servers = await db.servers.find({"members": current_user["user_id"]}).to_list(None)
    return {"servers": parse_json(servers)}

@app.get("/api/servers/{server_id}/channels")
async def get_server_channels(server_id: str, current_user: dict = Depends(get_current_user)):
    # Check if user is member of server
    server = await db.servers.find_one({"server_id": server_id, "members": current_user["user_id"]})
    if not server:
        raise HTTPException(status_code=403, detail="Access denied")
    
    channels = await db.channels.find({"server_id": server_id}).to_list(None)
    return {"channels": parse_json(channels)}

@app.post("/api/channels")
async def create_channel(channel_data: ChannelCreate, current_user: dict = Depends(get_current_user)):
    # Check if user has permission to create channels
    server = await db.servers.find_one({"server_id": channel_data.server_id, "members": current_user["user_id"]})
    if not server:
        raise HTTPException(status_code=403, detail="Access denied")
    
    channel_id = str(uuid.uuid4())
    channel = {
        "channel_id": channel_id,
        "server_id": channel_data.server_id,
        "name": channel_data.name,
        "channel_type": channel_data.channel_type,
        "description": channel_data.description,
        "created_at": datetime.utcnow().isoformat(),
        "position": len(server["channels"]),
        "messages": []
    }
    
    await db.channels.insert_one(channel)
    
    # Add channel to server
    await db.servers.update_one(
        {"server_id": channel_data.server_id},
        {"$push": {"channels": channel_id}}
    )
    
    return channel

@app.get("/api/channels/{channel_id}/messages")
async def get_channel_messages(channel_id: str, limit: int = 50, current_user: dict = Depends(get_current_user)):
    # Check if user has access to channel
    channel = await db.channels.find_one({"channel_id": channel_id})
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    
    server = await db.servers.find_one({"server_id": channel["server_id"], "members": current_user["user_id"]})
    if not server:
        raise HTTPException(status_code=403, detail="Access denied")
    
    messages = await db.messages.find({"channel_id": channel_id}).sort("created_at", -1).limit(limit).to_list(None)
    messages.reverse()  # Show oldest first
    
    return {"messages": parse_json(messages)}

@app.post("/api/messages")
async def create_message(message_data: MessageCreate, current_user: dict = Depends(get_current_user)):
    message_id = str(uuid.uuid4())
    
    message = {
        "message_id": message_id,
        "channel_id": message_data.channel_id,
        "author_id": current_user["user_id"],
        "author_username": current_user["username"],
        "author_display_name": current_user["display_name"],
        "content": message_data.content,
        "message_type": message_data.message_type,
        "attachments": message_data.attachments or [],
        "created_at": datetime.utcnow().isoformat(),
        "edited_at": None,
        "reactions": [],
        "replies": [],
        "pinned": False,
        "thread_id": None
    }
    
    await db.messages.insert_one(message)
    
    # Broadcast message to channel
    await manager.broadcast_to_channel(
        json.dumps({
            "type": "new_message",
            "data": parse_json(message)
        }),
        message_data.channel_id
    )
    
    return message

@app.post("/api/messages/{message_id}/reactions")
async def add_reaction(message_id: str, reaction_data: MessageReaction, current_user: dict = Depends(get_current_user)):
    message = await db.messages.find_one({"message_id": message_id})
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    
    if reaction_data.action == "add":
        # Add reaction
        reaction = {
            "emoji": reaction_data.emoji,
            "user_id": current_user["user_id"],
            "username": current_user["username"]
        }
        await db.messages.update_one(
            {"message_id": message_id},
            {"$push": {"reactions": reaction}}
        )
    elif reaction_data.action == "remove":
        # Remove reaction
        await db.messages.update_one(
            {"message_id": message_id},
            {"$pull": {"reactions": {"emoji": reaction_data.emoji, "user_id": current_user["user_id"]}}}
        )
    
    # Broadcast reaction update
    updated_message = await db.messages.find_one({"message_id": message_id})
    await manager.broadcast_to_channel(
        json.dumps({
            "type": "reaction_update",
            "data": {
                "message_id": message_id,
                "reactions": parse_json(updated_message["reactions"])
            }
        }),
        message["channel_id"]
    )
    
    return {"success": True}

# WebSocket endpoint
@app.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str):
    await manager.connect(websocket, user_id)
    
    try:
        while True:
            data = await websocket.receive_text()
            message_data = json.loads(data)
            
            if message_data["type"] == "typing":
                # Broadcast typing indicator
                await manager.broadcast_to_channel(
                    json.dumps({
                        "type": "typing",
                        "data": {
                            "user_id": user_id,
                            "channel_id": message_data["channel_id"],
                            "username": message_data.get("username", "Unknown")
                        }
                    }),
                    message_data["channel_id"]
                )
            elif message_data["type"] == "stop_typing":
                # Broadcast stop typing
                await manager.broadcast_to_channel(
                    json.dumps({
                        "type": "stop_typing",
                        "data": {
                            "user_id": user_id,
                            "channel_id": message_data["channel_id"]
                        }
                    }),
                    message_data["channel_id"]
                )
            elif message_data["type"] == "join_server":
                # Add user to server members for broadcasting
                server_id = message_data["server_id"]
                if server_id not in manager.server_members:
                    manager.server_members[server_id] = []
                if user_id not in manager.server_members[server_id]:
                    manager.server_members[server_id].append(user_id)
                    
                # Broadcast user joined
                await manager.broadcast_to_server(
                    json.dumps({
                        "type": "user_joined",
                        "data": {
                            "user_id": user_id,
                            "server_id": server_id,
                            "presence": manager.user_presence.get(user_id, {})
                        }
                    }),
                    server_id
                )
            elif message_data["type"] == "presence_update":
                # Update user presence
                if user_id in manager.user_presence:
                    manager.user_presence[user_id].update(message_data["data"])
                    
                # Broadcast presence update
                for server_id, members in manager.server_members.items():
                    if user_id in members:
                        await manager.broadcast_to_server(
                            json.dumps({
                                "type": "presence_update",
                                "data": {
                                    "user_id": user_id,
                                    "presence": manager.user_presence[user_id]
                                }
                            }),
                            server_id
                        )
            
    except WebSocketDisconnect:
        manager.disconnect(user_id)
        
        # Broadcast user left
        for server_id, members in manager.server_members.items():
            if user_id in members:
                members.remove(user_id)
                await manager.broadcast_to_server(
                    json.dumps({
                        "type": "user_left",
                        "data": {
                            "user_id": user_id,
                            "server_id": server_id
                        }
                    }),
                    server_id
                )

@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "service": "Xalvion Backend"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
