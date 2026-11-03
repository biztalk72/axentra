from typing import Literal
import re
from pydantic import BaseModel, Field, AwareDatetime, ConfigDict, field_validator, model_validator

class Input(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)

def normalize_email(value: str):
    value = value.strip().lower()
    if not re.fullmatch(r"[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}", value) or '..' in value or value.startswith('.') or value.split('@')[0].endswith('.'):
        raise ValueError('올바른 이메일 주소를 입력하세요.')
    return value

def validate_password(value: str):
    if not 8 <= len(value) <= 128 or not re.search(r'[A-Za-z]', value) or not re.search(r'[0-9]', value):
        raise ValueError('비밀번호는 8~128자이며 영문과 숫자를 포함해야 합니다.')
    return value

class LoginInput(Input):
    email: str = Field(min_length=3, max_length=200)
    password: str = Field(min_length=1, max_length=256)

    @field_validator('email')
    @classmethod
    def email_format(cls, value):
        return normalize_email(value)

class RegisterInput(Input):
    name: str = Field(min_length=2, max_length=60)
    email: str = Field(min_length=3, max_length=200)
    password: str = Field(min_length=8, max_length=128)
    password_confirm: str = Field(min_length=1, max_length=128)

    @field_validator('name')
    @classmethod
    def name_format(cls, value):
        value = value.strip()
        if len(value) < 2:
            raise ValueError('이름은 공백을 제외하고 2자 이상 입력하세요.')
        return value

    @field_validator('email')
    @classmethod
    def email_format(cls, value):
        return normalize_email(value)

    @field_validator('password')
    @classmethod
    def password_format(cls, value):
        return validate_password(value)

    @model_validator(mode='after')
    def passwords_match(self):
        if self.password != self.password_confirm:
            raise ValueError('비밀번호 확인이 일치하지 않습니다.')
        return self

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
    asset_id: str = 'NDL-STEAM'
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
    destination: Literal['자재 창고', '제면 A라인', '스프 B라인', '출하 구역']

class DatasetInput(Input):
    simulation_id: str
    samples: int = Field(default=200, ge=10, le=2000)
