from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import os
import sys
import json
from datetime import datetime
import hashlib
 
HERE = os.path.dirname(__file__) or os.getcwd()
os.chdir(HERE)

# Cache for heroes list
heroes_cache = None

def load_heroes():
    global heroes_cache
    try:
        with open('heroes.json', 'r', encoding='utf-8') as f:
            heroes_cache = json.load(f)
    except:
        heroes_cache = []
    return heroes_cache

def get_daily_hero():
    """Get deterministic daily hero based on UTC date"""
    heroes = heroes_cache if heroes_cache is not None else load_heroes()
    if not heroes:
        return None
    
    # Use UTC date as seed
    today = datetime.utcnow().strftime('%Y-%m-%d')
    seed = int(hashlib.md5(today.encode()).hexdigest(), 16)
    idx = seed % len(heroes)
    return heroes[idx]

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
        if self.path == '/api/daily-hero':
            hero = get_daily_hero()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            if hero:
                self.wfile.write(json.dumps(hero, ensure_ascii=False).encode('utf-8'))
            else:
                self.wfile.write(b'{}')
        else:
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
