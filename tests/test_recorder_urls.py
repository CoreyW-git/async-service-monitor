import unittest
from service_monitor.recorder_urls import normalize_recorder_url


class RecorderUrlTests(unittest.TestCase):
    def test_normalization(self):
        for source, expected in [
            ('www.bing.com', 'https://www.bing.com'),
            (' yahoo.com/finance ', 'https://yahoo.com/finance'),
            ('[www.bing.com](http://www.bing.com)', 'http://www.bing.com'),
            ('localhost:8000/path', 'https://localhost:8000/path'),
            ('//www.bing.com', 'https://www.bing.com'),
            ('http://localhost:8000/?q=ORCL#quote', 'http://localhost:8000/?q=ORCL#quote'),
        ]:
            with self.subTest(source=source):
                self.assertEqual(normalize_recorder_url(source), expected)

    def test_invalid_urls(self):
        for value in ['', 'not a url', 'javascript:alert(1)', 'file:///tmp/file', 'https://', 'https://host:invalid', 'https://host:99999', 'https://host:0', '/relative', 'https://host\\path']:
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    normalize_recorder_url(value)


if __name__ == '__main__':
    unittest.main()
