import json
import os
import threading
from urllib.parse import urlsplit

def publish(event,config):
    import paho.mqtt.client as mqtt
    parsed=urlsplit(config['endpoint']);connected=threading.Event();outcome=[]
    client=mqtt.Client(callback_api_version=mqtt.CallbackAPIVersion.VERSION2)
    client.connect_timeout=5
    if config['username_env']:
        client.username_pw_set(os.environ[config['username_env']],os.environ[config['password_env']] if config['password_env'] else None)
    if parsed.scheme=='mqtts':client.tls_set()
    def on_connect(client,userdata,flags,reason_code,properties):
        outcome.append(reason_code==0);connected.set()
    client.on_connect=on_connect
    try:
        client.connect(parsed.hostname,parsed.port or (8883 if parsed.scheme=='mqtts' else 1883),15);client.loop_start()
        if not connected.wait(5) or not outcome[0]:raise ConnectionError('MQTT connection not acknowledged')
        info=client.publish(config['topic'],json.dumps(event,ensure_ascii=False),qos=1,retain=False)
        info.wait_for_publish(timeout=8)
        if not info.is_published():raise TimeoutError('MQTT PUBACK not received')
        return {'acknowledged':True,'protocol':'mqtt','qos':1,'message_id':info.mid}
    finally:
        client.disconnect();client.loop_stop()
