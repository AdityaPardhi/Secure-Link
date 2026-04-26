import unittest
from modules.security import SecurityManager

class TestSecurityManager(unittest.TestCase):
    def setUp(self):
        self.security = SecurityManager()
        
    def test_record_failure_and_block(self):
        ip = "192.168.1.100"
        self.assertEqual(self.security.record_failure(ip), 1)
        self.assertFalse(self.security.is_blocked(ip))
        
        self.assertEqual(self.security.record_failure(ip), 2)
        self.assertFalse(self.security.is_blocked(ip))
        
        self.assertEqual(self.security.record_failure(ip), 3)
        self.assertTrue(self.security.is_blocked(ip))
        
        # Ensure failure count is purged
        self.assertEqual(self.security.failure_count(ip), 0)

    def test_clear_failures(self):
        ip = "192.168.1.101"
        self.security.record_failure(ip)
        self.assertEqual(self.security.failure_count(ip), 1)
        self.security.clear_failures(ip)
        self.assertEqual(self.security.failure_count(ip), 0)
        
    def test_allowed_whitelist(self):
        ip1 = "192.168.1.200"
        ip2 = "192.168.1.201"
        
        # Default empty whitelist allows all
        self.assertTrue(self.security.is_allowed(ip1))
        self.assertTrue(self.security.is_allowed(ip2))
        
        self.security.add_to_whitelist(ip1)
        self.assertTrue(self.security.is_allowed(ip1))
        self.assertFalse(self.security.is_allowed(ip2))

if __name__ == '__main__':
    unittest.main()
