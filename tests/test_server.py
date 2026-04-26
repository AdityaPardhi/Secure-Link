import unittest
from unittest.mock import patch

with patch('builtins.input', return_value='test_password'):
    import server

class TestServerFlows(unittest.TestCase):
    def setUp(self):
        server.app.config['TESTING'] = True
        self.client = server.app.test_client()
        self.socket_client = server.socketio.test_client(server.app)

    def tearDown(self):
        self.socket_client.disconnect()

    def test_join_request_missing_username(self):
        self.socket_client.emit('join_request', {'username': '', 'password': 'test_password'})
        received = self.socket_client.get_received()
        
        rejected = [r for r in received if r['name'] == 'rejected']
        self.assertTrue(len(rejected) > 0)
        self.assertEqual(rejected[0]['args'][0]['reason'], 'Username required')

    def test_join_request_invalid_username_format(self):
        self.socket_client.emit('join_request', {'username': 'invalid user!', 'password': 'test_password'})
        received = self.socket_client.get_received()
        
        rejected = [r for r in received if r['name'] == 'rejected']
        self.assertTrue(len(rejected) > 0)
        self.assertEqual(rejected[0]['args'][0]['reason'], 'Invalid username format')
        
    def test_join_request_invalid_password(self):
        self.socket_client.emit('join_request', {'username': 'testuser', 'password': 'wrong_password'})
        received = self.socket_client.get_received()
        
        rejected = [r for r in received if r['name'] == 'rejected']
        self.assertTrue(len(rejected) > 0)
        self.assertEqual(rejected[0]['args'][0]['reason'], 'Invalid access key')

if __name__ == '__main__':
    unittest.main()
