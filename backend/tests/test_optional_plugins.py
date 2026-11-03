"""Delivery failure contracts and optional MCP SDK compatibility."""
import asyncio
import sys
import types
import pytest
from app.integration_plugins import kafka

@pytest.mark.parametrize('outcome',['ack','callback-error','no-callback','pending'])
def test_kafka_requires_broker_delivery_ack(monkeypatch,outcome):
    captured={}
    class Producer:
        def __init__(self,options):captured['options']=options
        def produce(self,topic,**kwargs):captured.update(topic=topic,**kwargs)
        def flush(self,timeout):
            if outcome not in ('no-callback','pending'):
                message=types.SimpleNamespace(partition=lambda:2,offset=lambda:7)
                captured['on_delivery'](None if outcome=='ack' else RuntimeError('denied'),message)
            return 1 if outcome=='pending' else 0
    monkeypatch.setitem(sys.modules,'confluent_kafka',types.SimpleNamespace(Producer=Producer))
    config={'endpoint':'broker:9093','topic':'factory.events','tls':True,'username_env':'','password_env':''}
    if outcome=='ack':
        result=kafka.publish({'id':'evt-1'},config);assert result['acknowledged'] and result['offset']==7
        assert captured['key']=='evt-1' and captured['options']['acks']=='all' and captured['options']['enable.idempotence'] is True
    else:
        with pytest.raises(ConnectionError):kafka.publish({'id':'evt-1'},config)

def test_optional_mcp_sdk_exposes_only_read_tools():
    pytest.importorskip('mcp')
    from app.integration_plugins.mcp_server import create_server
    tools=asyncio.run(create_server().list_tools())
    assert {t.name for t in tools}=={'read_data_catalog','read_inventory','trace_lot','read_industry_profile'}
