"""Synchronize backend-owned contracts into the browser adapter."""
import json
import sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]
pairs=[('backend/app/agent_modules/catalog.json','frontend/src/agent-modules/catalog.json')]+[(f'backend/app/supply/{name}.json',f'frontend/src/supply/{name}.json') for name in ('assets','profiles','seed')]
for source,target in pairs:
    data=json.loads((root/source).read_text())
    if '--check' in sys.argv:
        if json.loads((root/target).read_text())!=data:raise SystemExit('Contract mismatch: '+target)
    else:(root/target).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
print('Agent and industry/supply contracts match.' if '--check' in sys.argv else 'Updated browser contracts.')
