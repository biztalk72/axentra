from typing import Literal
from pydantic import BaseModel, Field, AwareDatetime, ConfigDict

class Input(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)

class LoginInput(Input):
    email: str = Field(max_length=200)
    password: str = Field(min_length=1, max_length=256)

class EventInput(Input):
    event_id: str = Field(min_length=1, max_length=100)
    asset_id: str = Field(min_length=1, max_length=50)
    source: str = Field(default='edge-gateway-01', max_length=50)
    temperature: float = Field(ge=-50, le=250)
    vibration: float = Field(ge=0, le=100)
    good: int = Field(default=0, ge=0, le=10000)
    rejected: int = Field(default=0, ge=0, le=10000)
    timestamp: AwareDatetime | None = None

class BatchInput(Input):
    events: list[EventInput] = Field(min_length=1, max_length=500)

class ConnectorInput(Input):
    name: str = Field(min_length=2, max_length=80)
    protocol: Literal['REST', 'MQTT', 'OPC-UA', 'Modbus']
    endpoint: str = Field(min_length=3, max_length=200)

class SimulationInput(Input):
    name: str = Field(default='라인 최적화 시나리오', min_length=1, max_length=100)
    line: Literal['A', 'B'] = 'A'
    cycle_reduction: float = Field(default=15, ge=0, le=40)
    downtime: float = Field(default=5, ge=0, le=40)
    hours: float = Field(default=8, ge=1, le=24)
    defect_rate: float = Field(default=1.5, ge=0, le=20)

class TrainInput(Input):
    name: str = Field(default='설비 온도 이상감지', min_length=1, max_length=100)
    asset_id: str = 'CNC-003'
    metric: Literal['temperature', 'vibration'] = 'temperature'

class OrderInput(Input):
    name: str = Field(min_length=2, max_length=80)
    product: str = Field(min_length=2, max_length=100)
    line: Literal['A', 'B'] = 'A'
    quantity: int = Field(ge=1, le=1000000)

class DecisionInput(Input):
    decision: Literal['approve', 'reject']

class RobotInput(Input):
    robot_id: Literal['AMR-001', 'AMR-002']
    destination: Literal['자재 창고', '가공 A라인', '조립 B라인', '출하 구역']

class DatasetInput(Input):
    simulation_id: str
    samples: int = Field(default=200, ge=10, le=2000)
