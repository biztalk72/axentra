"""Synchronize the browser demo's registry contract from the backend definition."""
import json
import sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]
source=root/'backend/app/agent_modules/catalog.json'
target=root/'frontend/src/agent-modules/catalog.json'
data=json.loads(source.read_text())
if '--check' in sys.argv:
    if json.loads(target.read_text())!=data:raise SystemExit('Agent catalogs differ. Run scripts/sync-agent-catalog.py')
    print('Agent catalog contracts match.')
else:
    target.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
    print('Updated browser agent catalog.')
