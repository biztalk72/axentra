import json
import os

def publish(event,config):
    from confluent_kafka import Producer
    options={'bootstrap.servers':config['endpoint'],'enable.idempotence':True,'acks':'all','delivery.timeout.ms':8000,'socket.timeout.ms':5000,'security.protocol':'SSL' if config['tls'] else 'PLAINTEXT'}
    if config['username_env']:
        options.update({'security.protocol':'SASL_SSL' if config['tls'] else 'SASL_PLAINTEXT','sasl.mechanism':'PLAIN','sasl.username':os.environ[config['username_env']],'sasl.password':os.environ[config['password_env']]})
    delivered=[]
    def report(error,message):
        delivered.append({'error':str(error) if error else None,'partition':message.partition() if message else None,'offset':message.offset() if message else None})
    producer=Producer(options)
    producer.produce(config['topic'],key=event['id'],value=json.dumps(event,ensure_ascii=False),on_delivery=report)
    remaining=producer.flush(9)
    if remaining or not delivered or delivered[0]['error']:raise ConnectionError('Kafka delivery was not acknowledged')
    return {'acknowledged':True,'protocol':'kafka',**delivered[0]}
