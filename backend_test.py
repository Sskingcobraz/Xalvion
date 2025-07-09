import requests
import json
import time
import uuid
import websocket
import threading
import sys
from datetime import datetime

class XalvionAPITester:
    def __init__(self, base_url):
        self.base_url = base_url
        self.token = None
        self.user_id = None
        self.username = None
        self.tests_run = 0
        self.tests_passed = 0
        self.ws = None
        self.ws_messages = []
        self.server_id = None
        self.channel_id = None
        self.message_id = None

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.base_url}/api/{endpoint}"
        
        if headers is None:
            headers = {'Content-Type': 'application/json'}
            if self.token:
                headers['Authorization'] = f'Bearer {self.token}'

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    return success, response.json()
                except:
                    return success, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    print(f"Response: {response.json()}")
                except:
                    print(f"Response: {response.text}")
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_health_check(self):
        """Test health check endpoint"""
        success, response = self.run_test(
            "Health Check",
            "GET",
            "health",
            200
        )
        return success

    def test_register(self):
        """Test user registration"""
        # Generate unique username to avoid conflicts
        test_username = f"test_user_{uuid.uuid4().hex[:8]}"
        test_email = f"{test_username}@example.com"
        test_password = "TestPass123!"
        
        success, response = self.run_test(
            "User Registration",
            "POST",
            "auth/register",
            200,
            data={
                "username": test_username,
                "email": test_email,
                "password": test_password,
                "display_name": f"Test User {test_username}"
            }
        )
        
        if success and 'access_token' in response:
            self.token = response['access_token']
            self.user_id = response['user']['user_id']
            self.username = test_username
            print(f"Registered user: {test_username}")
            return True
        return False

    def test_login(self):
        """Test user login"""
        if not self.username:
            print("❌ Cannot test login without registering first")
            return False
            
        success, response = self.run_test(
            "User Login",
            "POST",
            "auth/login",
            200,
            data={
                "username": self.username,
                "password": "TestPass123!"
            }
        )
        
        if success and 'access_token' in response:
            self.token = response['access_token']
            return True
        return False

    def test_get_profile(self):
        """Test getting user profile"""
        success, response = self.run_test(
            "Get User Profile",
            "GET",
            "user/profile",
            200
        )
        return success

    def test_create_server(self):
        """Test server creation"""
        server_name = f"Test Server {uuid.uuid4().hex[:8]}"
        
        success, response = self.run_test(
            "Create Server",
            "POST",
            "servers",
            200,
            data={
                "name": server_name,
                "description": "Test server for API testing"
            }
        )
        
        if success and 'server_id' in response:
            self.server_id = response['server_id']
            print(f"Created server: {server_name} with ID: {self.server_id}")
            return True
        return False

    def test_get_servers(self):
        """Test getting user servers"""
        success, response = self.run_test(
            "Get User Servers",
            "GET",
            "servers",
            200
        )
        
        if success and 'servers' in response:
            print(f"Found {len(response['servers'])} servers")
            return True
        return False

    def test_get_channels(self):
        """Test getting server channels"""
        if not self.server_id:
            print("❌ Cannot test channels without creating a server first")
            return False
            
        success, response = self.run_test(
            "Get Server Channels",
            "GET",
            f"servers/{self.server_id}/channels",
            200
        )
        
        if success and 'channels' in response:
            if len(response['channels']) > 0:
                self.channel_id = response['channels'][0]['channel_id']
                print(f"Found {len(response['channels'])} channels, using channel ID: {self.channel_id}")
            return True
        return False

    def test_create_channel(self):
        """Test channel creation"""
        if not self.server_id:
            print("❌ Cannot test channel creation without a server")
            return False
            
        channel_name = f"test-channel-{uuid.uuid4().hex[:8]}"
        
        success, response = self.run_test(
            "Create Channel",
            "POST",
            "channels",
            200,
            data={
                "name": channel_name,
                "server_id": self.server_id,
                "channel_type": "text",
                "description": "Test channel for API testing"
            }
        )
        
        if success and 'channel_id' in response:
            self.channel_id = response['channel_id']
            print(f"Created channel: {channel_name} with ID: {self.channel_id}")
            return True
        return False

    def test_send_message(self):
        """Test sending a message"""
        if not self.channel_id:
            print("❌ Cannot test messaging without a channel")
            return False
            
        message_content = f"Test message {datetime.now().isoformat()}"
        
        success, response = self.run_test(
            "Send Message",
            "POST",
            "messages",
            200,
            data={
                "content": message_content,
                "channel_id": self.channel_id
            }
        )
        
        if success and 'message_id' in response:
            self.message_id = response['message_id']
            print(f"Sent message with ID: {self.message_id}")
            return True
        return False

    def test_get_messages(self):
        """Test getting channel messages"""
        if not self.channel_id:
            print("❌ Cannot test getting messages without a channel")
            return False
            
        success, response = self.run_test(
            "Get Channel Messages",
            "GET",
            f"channels/{self.channel_id}/messages",
            200
        )
        
        if success and 'messages' in response:
            print(f"Found {len(response['messages'])} messages")
            return True
        return False

    def test_add_reaction(self):
        """Test adding a reaction to a message"""
        if not self.message_id:
            print("❌ Cannot test reactions without a message")
            return False
            
        success, response = self.run_test(
            "Add Reaction",
            "POST",
            f"messages/{self.message_id}/reactions",
            200,
            data={
                "message_id": self.message_id,
                "emoji": "👍",
                "action": "add"
            }
        )
        return success

    def on_ws_message(self, ws, message):
        """Handle WebSocket messages"""
        print(f"📩 WebSocket message received: {message[:100]}...")
        self.ws_messages.append(json.loads(message))

    def on_ws_error(self, ws, error):
        """Handle WebSocket errors"""
        print(f"❌ WebSocket error: {error}")

    def on_ws_close(self, ws, close_status_code, close_msg):
        """Handle WebSocket close"""
        print(f"WebSocket closed: {close_status_code} - {close_msg}")

    def on_ws_open(self, ws):
        """Handle WebSocket open"""
        print("WebSocket connection established")
        if self.server_id:
            ws.send(json.dumps({
                "type": "join_server",
                "server_id": self.server_id
            }))
            print(f"Joined server: {self.server_id} via WebSocket")

    def test_websocket(self):
        """Test WebSocket connection"""
        if not self.user_id:
            print("❌ Cannot test WebSocket without user ID")
            return False
            
        print("\n🔍 Testing WebSocket connection...")
        
        try:
            ws_url = f"{self.base_url.replace('http', 'ws')}/ws/{self.user_id}"
            print(f"Connecting to WebSocket: {ws_url}")
            
            self.ws = websocket.WebSocketApp(
                ws_url,
                on_message=self.on_ws_message,
                on_error=self.on_ws_error,
                on_close=self.on_ws_close,
                on_open=self.on_ws_open
            )
            
            # Start WebSocket in a separate thread
            ws_thread = threading.Thread(target=self.ws.run_forever)
            ws_thread.daemon = True
            ws_thread.start()
            
            # Wait for connection to establish
            time.sleep(3)
            
            # Test typing indicator
            if self.channel_id:
                if self.ws.sock and self.ws.sock.connected:
                    self.ws.send(json.dumps({
                        "type": "typing",
                        "channel_id": self.channel_id,
                        "username": self.username
                    }))
                    print("Sent typing indicator")
                    time.sleep(1)
                    
                    self.ws.send(json.dumps({
                        "type": "stop_typing",
                        "channel_id": self.channel_id
                    }))
                    print("Sent stop typing indicator")
                    time.sleep(1)
                    
                    # Check if we received any messages
                    if len(self.ws_messages) > 0:
                        print(f"Received {len(self.ws_messages)} WebSocket messages")
                        self.tests_passed += 1
                        return True
            
            print("❌ No WebSocket messages received")
            return False
            
        except Exception as e:
            print(f"❌ WebSocket test failed: {str(e)}")
            return False
        finally:
            if self.ws:
                self.ws.close()

def main():
    # Get the backend URL from the frontend .env file
    backend_url = "https://720371fc-11bc-492d-ad36-e35ae5c76c2f.preview.emergentagent.com"
    
    print(f"Testing Xalvion API at: {backend_url}")
    
    tester = XalvionAPITester(backend_url)
    
    # Run tests
    health_check_ok = tester.test_health_check()
    
    if not health_check_ok:
        print("❌ Health check failed, stopping tests")
        return 1
    
    # Authentication tests
    register_ok = tester.test_register()
    if not register_ok:
        print("❌ Registration failed, stopping tests")
        return 1
    
    profile_ok = tester.test_get_profile()
    login_ok = tester.test_login()
    
    # Server and channel tests
    server_ok = tester.test_create_server()
    servers_list_ok = tester.test_get_servers()
    channels_list_ok = tester.test_get_channels()
    channel_create_ok = tester.test_create_channel()
    
    # Message tests
    message_ok = tester.test_send_message()
    messages_list_ok = tester.test_get_messages()
    reaction_ok = tester.test_add_reaction()
    
    # WebSocket test
    websocket_ok = tester.test_websocket()
    
    # Print results
    print("\n📊 Test Results:")
    print(f"Tests passed: {tester.tests_passed}/{tester.tests_run}")
    
    # Print summary of what worked and what didn't
    print("\n📋 Summary:")
    print(f"Health Check: {'✅' if health_check_ok else '❌'}")
    print(f"Registration: {'✅' if register_ok else '❌'}")
    print(f"Get Profile: {'✅' if profile_ok else '❌'}")
    print(f"Login: {'✅' if login_ok else '❌'}")
    print(f"Create Server: {'✅' if server_ok else '❌'}")
    print(f"List Servers: {'✅' if servers_list_ok else '❌'}")
    print(f"List Channels: {'✅' if channels_list_ok else '❌'}")
    print(f"Create Channel: {'✅' if channel_create_ok else '❌'}")
    print(f"Send Message: {'✅' if message_ok else '❌'}")
    print(f"List Messages: {'✅' if messages_list_ok else '❌'}")
    print(f"Add Reaction: {'✅' if reaction_ok else '❌'}")
    print(f"WebSocket: {'✅' if websocket_ok else '❌'}")
    
    return 0 if tester.tests_passed == tester.tests_run else 1

if __name__ == "__main__":
    sys.exit(main())