"""Explicitly registered manufacturing agents. No dynamic code loading."""
import copy
import json
from pathlib import Path
from .data import run as data_run
from .equipment import run as equipment_run
from .production import run as production_run
from .quality import run as quality_run
from .logistics import run as logistics_run
from .edge import run as edge_run
from .twin import run as twin_run
from .simulation import run as simulation_run
from .models import run as models_run
from .robots import run as robots_run
from .physical import run as physical_run
from .panels import run as panels_run
from .cctv import run as cctv_run

CATALOG=json.loads(Path(__file__).with_name('catalog.json').read_text())
HANDLERS={'data.inspect':data_run,'equipment.assess':equipment_run,'production.inspect':production_run,'quality.assess':quality_run,'floor.inspect':logistics_run,'edge.inspect':edge_run,'twin.inspect':twin_run,'simulation.inspect':simulation_run,'models.inspect':models_run,'robots.inspect':robots_run,'physical.inspect':physical_run,'panels.inspect':panels_run,'cctv.inspect':cctv_run}

def execute(module,source,blackboard):
    # Each agent receives an isolated snapshot; accidental mutations cannot affect peers.
    expected=next((m['version'] for m in CATALOG if m['tool']==module['tool']),None)
    if module['version']!=expected:raise ValueError('모듈 코드 버전이 달라 새 진단을 시작해야 합니다.')
    result=HANDLERS[module['tool']](copy.deepcopy(source),copy.deepcopy(module['parameters']),copy.deepcopy(blackboard))
    if not isinstance(result.get('summary'),str) or not isinstance(result.get('evidence'),list) or not isinstance(result.get('findings'),list):
        raise ValueError('에이전트 결과 계약을 확인하세요.')
    return result
