import urllib.request, json

prod_url = "https://watgmfdpsmdmiebmtacj.supabase.co"
anon_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndhdGdtZmRwc21kbWllYm10YWNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODczNjIwNDIsImV4cCI6MjEwMjkzODA0Mn0.qVGwegioRw93MYP4VJVQExW9rBngkmPvZpwXxRxliPg"

# The OpenAPI spec is available at the root endpoint
try:
    req = urllib.request.Request(
        f"{prod_url}/rest/v1/",
        method="GET",
        headers={
            "apikey": anon_key,
            "Authorization": f"Bearer {anon_key}",
        }
    )
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode())
        # Extract all function names from paths
        paths = data.get("paths", {})
        rpc_paths = [p for p in paths if "/rpc/" in p]
        print(f"Total RPC endpoints: {len(rpc_paths)}")
        for p in sorted(rpc_paths):
            print(f"  {p}")
        # Also check definitions
        defs = data.get("definitions", {})
        print(f"\nTotal definitions: {len(defs)}")
        for d in sorted(defs):
            print(f"  {d}")
except urllib.error.HTTPError as e:
    print(f"HTTP {e.code}: {e.read().decode()[:300]}")
