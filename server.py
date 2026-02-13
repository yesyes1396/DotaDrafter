from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import os
import sys
import json
 
HERE = os.path.dirname(__file__) or os.getcwd()
os.chdir(HERE)

class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        return super().do_GET()

    def do_POST(self):
        if self.path == '/save_heroes':
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length) if length>0 else b''
            try:
                data = json.loads(body.decode('utf-8'))
                with open('heroes.json', 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                self.send_response(200)
                self.send_header('Content-Type','application/json')
                self.send_header('Access-Control-Allow-Origin','*')
                self.end_headers()
                self.wfile.write(b'{"ok":true}')
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type','application/json')
                self.send_header('Access-Control-Allow-Origin','*')
                self.end_headers()
                msg = json.dumps({'ok':False,'error':str(e)}).encode('utf-8')
                self.wfile.write(msg)
        else:
            super().do_POST()

def main():
    port = 5000
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            pass
    addr = ('', port)
    server = ThreadingHTTPServer(addr, Handler)
    print(f"Serving HTTP on 0.0.0.0 port {port} (http://localhost:{port}/) ...")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nStopping server')
        server.server_close()

if __name__ == '__main__':
    main()
