import json, subprocess, time, sys, os
BIN = "/tmp/claude-0/-home-user-kuiohhu/2b5fae34-061e-5fed-9d9e-8d71812edf02/scratchpad/dl/squashfs-root/usr/bin/concat"
class MCP:
    def __init__(self, log=None):
        self.p = subprocess.Popen([BIN, "--mcp", "headless"], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                  stderr=open(os.path.dirname(os.path.abspath(__file__))+"/../concat_stderr.log","a"), text=True, bufsize=1)
        self.i = 0; self.log = log; self.t0 = time.time()
        self.req("initialize", {"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"demo","version":"1"}})
        self.p.stdin.write(json.dumps({"jsonrpc":"2.0","method":"notifications/initialized"})+"\n"); self.p.stdin.flush()
    def req(self, method, params):
        self.i += 1; rid = self.i
        self.p.stdin.write(json.dumps({"jsonrpc":"2.0","id":rid,"method":method,"params":params})+"\n"); self.p.stdin.flush()
        while True:
            line = self.p.stdout.readline()
            if not line: raise RuntimeError("server closed")
            d = json.loads(line)
            if d.get("id") == rid: return d
    def call(self, _tool, **args):
        name = _tool
        t = time.time()
        d = self.req("tools/call", {"name": name, "arguments": args})
        dt = time.time() - t
        r = d.get("result", d)
        sc = r.get("structuredContent") if isinstance(r, dict) else None
        txt = ""
        if isinstance(r, dict) and r.get("content"):
            txt = "".join(c.get("text","") for c in r["content"] if c.get("type")=="text")
        err = r.get("isError") if isinstance(r, dict) else True
        if self.log is not None:
            self.log.append({"tool": name, "args": args, "ms": round(dt*1000), "isError": err, "result": sc if sc is not None else txt[:4000]})
        status = "ERR" if err else "ok"
        print(f"[{status}] {name} ({dt*1000:.0f} ms): {(json.dumps(sc) if sc is not None else txt)[:600]}", flush=True)
        return sc if sc is not None else txt
    def close(self):
        self.p.stdin.close(); self.p.wait(timeout=20)
