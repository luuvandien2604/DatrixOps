import sys
import os
import json
from http.server import HTTPServer, BaseHTTPRequestHandler
import hashlib

# Test-only HTTP fixture used by cross-platform installer CI.

class MockHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.endswith('/agent-release.version'):
            self.send_response(200)
            self.send_header('Content-type', 'text/plain')
            self.end_headers()
            self.wfile.write(b'1.0.1\n')
            return
        
        if self.path.endswith('.size'):
            self.send_response(200)
            self.send_header('Content-type', 'text/plain')
            self.end_headers()
            if self.path.startswith('/wrong-size/'):
                self.wfile.write(b'999\n')
            elif self.path.startswith('/invalid-size/'):
                self.wfile.write(b'abc\n')
            else:
                self.wfile.write(b'4\n')
            return
            
        if self.path.endswith('.sha256'):
            if 'linux' in self.path:
                content = bytes.fromhex('7f454c46')
            elif 'darwin' in self.path:
                content = bytes.fromhex('cffaedfe')
            elif 'windows' in self.path:
                content = bytes.fromhex('4d5a0000')
            else:
                content = b'test'
            h = hashlib.sha256(content).hexdigest()
            self.send_response(200)
            self.send_header('Content-type', 'text/plain')
            self.end_headers()
            self.wfile.write(h.encode('utf-8') + b'\n')
            return
            
        if 'datrixops-agent' in self.path and not self.path.endswith(('.size', '.sha256')):
            if 'linux' in self.path:
                content = bytes.fromhex('7f454c46')
            elif 'darwin' in self.path:
                content = bytes.fromhex('cffaedfe')
            elif 'windows' in self.path:
                content = bytes.fromhex('4d5a0000')
            else:
                content = b'test'
            self.send_response(200)
            self.send_header('Content-type', 'application/octet-stream')
            self.end_headers()
            self.wfile.write(content)
            return

        if self.path == '/api/v1/agent/bootstrap-status':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"data": {"bootstrap_completed": True}, "bootstrap_completed": True}, separators=(',', ':')).encode('utf-8'))
            return
            
        self.send_response(404)
        self.end_headers()
        
    def do_POST(self):
        if self.path == '/api/v1/agent/enroll':
            self.send_response(201)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            resp = {
                "data": {
                    "agent_token": "a" * 32,
                    "bootstrap_rollback_token": "b" * 32
                },
                # Flattened for bash script parsing
                "agent_token": "a" * 32,
                "bootstrap_rollback_token": "b" * 32
            }
            self.wfile.write(json.dumps(resp, separators=(',', ':')).encode('utf-8'))
            return
            
        if self.path == '/api/v1/agent/enroll/rollback':
            self.send_response(204)
            self.end_headers()
            return
            
        self.send_response(404)
        self.end_headers()

if __name__ == '__main__':
    port = int(os.environ.get('DATRIXOPS_MOCK_SERVER_PORT', '8080'))
    server = HTTPServer(('127.0.0.1', port), MockHandler)
    server.serve_forever()
