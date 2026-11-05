"""Optional read-only MCP stdio bridge to the authenticated AXENTRA API."""
import json
import os
import re
import urllib.request
from urllib.parse import quote,urlsplit

def create_server():
    from mcp.server.fastmcp import FastMCP
    server=FastMCP('Axentra manufacturing data products')
    def read(path):
        root=os.getenv('AXENTRA_API_URL','http://127.0.0.1:8088').rstrip('/');parsed=urlsplit(root)
        if parsed.scheme not in ('http','https') or not parsed.hostname or parsed.username or parsed.password:raise ValueError('AXENTRA_API_URL must be an HTTP(S) API origin')
        token=os.environ['AXENTRA_API_TOKEN']
        request=urllib.request.Request(root+'/api'+path,headers={'Authorization':'Bearer '+token})
        with urllib.request.urlopen(request,timeout=10) as response:return json.loads(response.read())
    @server.tool()
    def read_data_catalog()->dict:
        """Read dataset ownership, schemas, grain, quality contracts and lineage."""
        return read('/integrations/catalog')
    @server.tool()
    def read_inventory()->dict:
        """Read inventory, locations, LOT and BOM snapshots. No writes."""
        return read('/supply')
    @server.tool()
    def trace_lot(lot_id:str)->dict:
        """Read upstream and downstream manufacturing LOT lineage."""
        if not re.fullmatch(r'LOT-[a-f0-9]{24}',lot_id):raise ValueError('Invalid LOT identifier')
        return read('/supply/lots/'+quote(lot_id,safe='')+'/trace')
    @server.tool()
    def read_industry_profile()->dict:
        """Read active industry and production line definitions."""
        return read('/industry')
    return server
if __name__=='__main__':create_server().run(transport='stdio')
