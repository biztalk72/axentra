"""Industry-neutral lot/balance/BOM ledger. Pure copy-on-write transactions."""
import copy
import hashlib
import json
from datetime import date
from decimal import Decimal,InvalidOperation,ROUND_CEILING
from fastapi import HTTPException

CATEGORIES=('raw','wip','finished','packaging')
UNITS=('kg','ea','box')

def fail(message,status=422):raise HTTPException(status,message)
def quantity(value,positive=True):
    try:n=Decimal(str(value))
    except (InvalidOperation,ValueError):fail('수량 형식을 확인하세요.')
    if not n.is_finite() or n>Decimal('1000000000') or n<(Decimal('.001') if positive else 0) or n.as_tuple().exponent < -3:fail('수량은 소수 3자리, 0~1,000,000,000 범위입니다.')
    return n

def qstr(n):return format(Decimal(n).quantize(Decimal('.001')),'f')
def get(state,kind,rid):
    row=next((r for r in state[kind] if r['id']==rid),None)
    if not row:fail('등록되지 않은 항목입니다: '+str(rid),404)
    return row

def eligible(lot,today):return lot['status']=='released' and (not lot.get('expires_on') or lot['expires_on']>=today)
def bin_for(state,lid,sku):
    location=get(state,'locations',lid)
    if sku['category'] not in location['allowed_categories']:fail('이 로케이션은 해당 품목 분류를 허용하지 않습니다.')
    return location

def balance(state,lot_id,location_id):
    row=next((r for r in state['balances'] if r['lot_id']==lot_id and r['location_id']==location_id),None)
    if not row:row={'lot_id':lot_id,'location_id':location_id,'quantity':'0.000'};state['balances'].append(row)
    return row

def add_balance(state,lot_id,lid,delta):
    row=balance(state,lot_id,lid);n=Decimal(row['quantity'])+delta
    if n<0:fail('가용 재고가 부족합니다.',409)
    if n>Decimal('1000000000'):fail('재고 수량 범위를 초과했습니다.')
    row['quantity']=qstr(n)

def units(state,sku_id,n):
    sku=get(state,'skus',sku_id)
    if sku['unit']!='kg' and n!=n.to_integral_value():fail('개/박스 단위는 정수 수량을 입력하세요.')
    return sku

def new_lot(state,sku_id,code,manufactured,expires,supplier='',parents=None,status='quarantine'):
    if not code.strip() or len(code)>60:fail('LOT 코드는 1~60자입니다.')
    if manufactured and date.fromisoformat(manufactured)>date.today():fail('제조일은 미래일 수 없습니다.')
    if expires and manufactured and expires<manufactured:fail('소비/유효기한은 제조일 이후여야 합니다.')
    lid='LOT-'+hashlib.sha256((sku_id+':'+code).encode()).hexdigest()[:24]
    if any(r['id']==lid for r in state['lots']):fail('이미 사용 중인 생산 LOT 코드입니다.',409)
    lot={'id':lid,'sku_id':sku_id,'code':code.strip(),'manufactured_on':manufactured,'expires_on':expires,'supplier':supplier,'parents':sorted(set(parents or [])),'status':status,'revision':1}
    state['lots'].append(lot);return lot

def record(state,action,lot,amount,source,target,reference,stamp,batch=None):
    state['sequence']+=1
    row={'id':f"MOV-{state['sequence']:06d}",'action':action,'lot_id':lot['id'],'sku_id':lot['sku_id'],'quantity':qstr(amount),'from_location':source,'to_location':target,'reference':reference,'timestamp':stamp,'batch_id':batch}
    state['movements'].append(row);return row

def validate_boms(state,candidate):
    product=get(state,'skus',candidate['product_sku_id']);output=quantity(candidate['output_quantity']);units(state,product['id'],output)
    if not candidate['components'] or len(candidate['components'])>30:fail('BOM 구성품을 1~30개 입력하세요.')
    if len({c['sku_id'] for c in candidate['components']})!=len(candidate['components']):fail('BOM 구성품을 중복 등록할 수 없습니다.')
    for c in candidate['components']:units(state,c['sku_id'],quantity(c['quantity']))
    graph={b['product_sku_id']:[c['sku_id'] for c in b['components']] for b in state['boms']};graph[product['id']]=[c['sku_id'] for c in candidate['components']]
    visited=set();active=set()
    def visit(node):
        if node in active:fail('BOM 순환 참조는 허용되지 않습니다.')
        if node in visited:return
        active.add(node)
        for child in graph.get(node,[]):visit(child)
        active.remove(node);visited.add(node)
    for node in graph:visit(node)

def production_plan(state,body,today):
    bom=get(state,'boms',body['bom_id'])
    if bom['revision']!=body['bom_revision']:fail('BOM이 변경되었습니다. 소요량을 다시 확인하세요.',409)
    qty=quantity(body['quantity']);product=units(state,bom['product_sku_id'],qty);needs=[];allocations=[]
    for c in bom['components']:
        sku=get(state,'skus',c['sku_id']);step=Decimal('.001') if sku['unit']=='kg' else Decimal('1')
        required=(quantity(c['quantity'])*qty/quantity(bom['output_quantity'])).quantize(step,rounding=ROUND_CEILING)
        remaining=required
        candidates=[]
        for stock in state['balances']:
            lot=get(state,'lots',stock['lot_id'])
            if lot['sku_id']==sku['id'] and eligible(lot,today) and Decimal(stock['quantity'])>0:candidates.append((lot.get('expires_on') or '9999-12-31',lot.get('manufactured_on') or '',lot['id'],stock))
        for _,__,lid,stock in sorted(candidates,key=lambda c:(c[0],c[1],c[2],c[3]['location_id'])):
            take=min(remaining,Decimal(stock['quantity']))
            if take>0:allocations.append({'lot_id':lid,'from_location':stock['location_id'],'quantity':qstr(take)})
            remaining-=take
            if remaining<=0:break
        needs.append({'sku_id':sku['id'],'name':sku['name'],'unit':sku['unit'],'required':qstr(required),'shortage':qstr(max(remaining,0))})
    return {'bom_id':bom['id'],'bom_revision':bom['revision'],'product_sku_id':product['id'],'quantity':qstr(qty),'needs':needs,'allocations':allocations,'ready':all(Decimal(n['shortage'])==0 for n in needs),'planned_on':today}

def transact(original,command,body,stamp):
    state=copy.deepcopy(original);today=stamp[:10]
    fingerprint=hashlib.sha256(json.dumps({'command':command,'body':body},sort_keys=True,ensure_ascii=False).encode()).hexdigest()
    event_id=body.get('event_id')
    if event_id and event_id in state['events']:
        old=state['events'][event_id]
        if old['fingerprint']!=fingerprint:fail('같은 요청 ID에 다른 내용을 사용할 수 없습니다.',409)
        return state,{**old['result'],'duplicate':True}
    result={}
    if command=='sku':
        sku=copy.deepcopy(body);rid=sku.pop('id');old=next((r for r in state['skus'] if r['id']==rid),None);expected=sku.pop('expected_revision',None)
        if old and expected!=old['revision']:fail('품목 설정이 변경되었습니다.',409)
        if sku['category'] not in CATEGORIES or sku['unit'] not in UNITS:fail('품목 분류와 단위를 확인하세요.')
        quantity(sku['min_stock'],False)
        if old and old['unit']!=sku['unit'] and (any(l['sku_id']==rid for l in state['lots']) or any(b['product_sku_id']==rid or any(c['sku_id']==rid for c in b['components']) for b in state['boms'])):fail('LOT 또는 BOM에 사용된 품목의 단위는 변경할 수 없습니다.',409)
        if old and old['category']!=sku['category']:
            for stock in state['balances']:
                if get(state,'lots',stock['lot_id'])['sku_id']==rid and Decimal(stock['quantity'])>0 and sku['category'] not in get(state,'locations',stock['location_id'])['allowed_categories']:fail('현재 적치 위치와 맞지 않는 품목 분류입니다.',409)
        result={**sku,'id':rid,'min_stock':qstr(sku['min_stock']),'revision':old['revision']+1 if old else 1}
        state['skus']=[r for r in state['skus'] if r['id']!=rid]+[result]
    elif command=='location':
        loc=copy.deepcopy(body);rid=loc.pop('id');expected=loc.pop('expected_revision',None);old=next((r for r in state['locations'] if r['id']==rid),None)
        if old and expected!=old['revision']:fail('로케이션 설정이 변경되었습니다.',409)
        if not loc['allowed_categories'] or len(set(loc['allowed_categories']))!=len(loc['allowed_categories']) or any(c not in CATEGORIES for c in loc['allowed_categories']):fail('적치 가능한 품목 분류를 선택하세요.')
        for stock in state['balances']:
            if stock['location_id']==rid and Decimal(stock['quantity'])>0 and get(state,'skus',get(state,'lots',stock['lot_id'])['sku_id'])['category'] not in loc['allowed_categories']:fail('현재 재고가 있는 분류를 제외할 수 없습니다.',409)
        result={**loc,'id':rid,'revision':old['revision']+1 if old else 1};state['locations']=[r for r in state['locations'] if r['id']!=rid]+[result]
    elif command=='bom':
        candidate=copy.deepcopy(body);expected=candidate.pop('expected_revision',None);rid='BOM-'+candidate['product_sku_id'];old=next((b for b in state['boms'] if b['id']==rid),None)
        if old and expected!=old['revision']:fail('BOM이 변경되었습니다.',409)
        validate_boms(state,candidate)
        result={**candidate,'id':rid,'output_quantity':qstr(candidate['output_quantity']),'components':[{'sku_id':c['sku_id'],'quantity':qstr(c['quantity'])} for c in candidate['components']],'revision':old['revision']+1 if old else 1};state['boms']=[b for b in state['boms'] if b['id']!=rid]+[result]
    elif command=='lot-status':
        lot=get(state,'lots',body['lot_id'])
        if lot['revision']!=body['expected_revision']:fail('LOT 상태가 변경되었습니다.',409)
        if body['status'] not in ('released','quarantine','blocked'):fail('LOT 상태를 확인하세요.')
        lot['status']=body['status'];lot['revision']+=1;result=lot
    elif command in ('receipt','issue','transfer'):
        amount=quantity(body['quantity']);reference=body.get('reference','')
        if command=='receipt':
            sku=units(state,body['sku_id'],amount);bin_for(state,body['to_location'],sku)
            code=body['lot_code'].strip();existing=next((l for l in state['lots'] if l['sku_id']==sku['id'] and l['code']==code),None)
            if existing:
                if existing['parents'] or any(b['lot_id']==existing['id'] for b in state['batches']):fail('생산 LOT에 외부 추가 입고할 수 없습니다.',409)
                if any(existing.get(k)!=body.get(k) for k in ('manufactured_on','expires_on','supplier')):fail('기존 LOT의 제조일·기한·공급처와 다릅니다.',409)
                lot=existing
            else:lot=new_lot(state,sku['id'],code,body.get('manufactured_on'),body.get('expires_on'),body.get('supplier',''))
            add_balance(state,lot['id'],body['to_location'],amount);result=record(state,command,lot,amount,None,body['to_location'],reference,stamp)
        else:
            lot=get(state,'lots',body['lot_id']);sku=units(state,lot['sku_id'],amount);get(state,'locations',body['from_location'])
            if command=='issue' and not eligible(lot,today):fail('사용 승인되지 않았거나 기한이 지난 LOT는 출고할 수 없습니다.',409)
            if command=='transfer':
                if body['from_location']==body['to_location']:fail('출발지와 도착지가 같습니다.')
                bin_for(state,body['to_location'],sku)
            add_balance(state,lot['id'],body['from_location'],-amount)
            if command=='transfer':add_balance(state,lot['id'],body['to_location'],amount)
            result=record(state,command,lot,amount,body['from_location'],body.get('to_location'),reference,stamp)
    elif command=='produce':
        plan=production_plan(state,body,today)
        if not plan['ready']:fail('가용 원재료/반제품이 부족합니다.',409)
        sku=get(state,'skus',plan['product_sku_id']);bin_for(state,body['to_location'],sku)
        allocations=body['allocations'];consumed={};seen=set()
        if not allocations:fail('검토한 LOT 할당이 필요합니다.')
        for allocation in allocations:
            lot=get(state,'lots',allocation['lot_id']);amount=quantity(allocation['quantity']);units(state,lot['sku_id'],amount)
            if not eligible(lot,today):fail('보류·차단·기한 경과 LOT는 생산에 투입할 수 없습니다.',409)
            key=(lot['id'],allocation['from_location'])
            if key in seen:fail('동일 LOT·로케이션을 중복 투입할 수 없습니다.')
            seen.add(key);get(state,'locations',allocation['from_location']);consumed[lot['sku_id']]=consumed.get(lot['sku_id'],Decimal(0))+amount
            add_balance(state,lot['id'],allocation['from_location'],-amount)
        if consumed!={n['sku_id']:Decimal(n['required']) for n in plan['needs']}:fail('LOT 투입량이 검토한 BOM 소요량과 다릅니다.')
        output=new_lot(state,sku['id'],body['lot_code'],today,body.get('expires_on'),parents=[a['lot_id'] for a in allocations],status='quarantine')
        batch=f"BAT-{state['sequence']+1:06d}"
        for a in allocations:record(state,'consume',get(state,'lots',a['lot_id']),Decimal(a['quantity']),a['from_location'],None,body.get('reference',''),stamp,batch)
        add_balance(state,output['id'],body['to_location'],Decimal(plan['quantity']));movement=record(state,'produce',output,Decimal(plan['quantity']),None,body['to_location'],body.get('reference',''),stamp,batch)
        result={'batch_id':batch,'lot_id':output['id'],'movement_id':movement['id'],'bom_snapshot':copy.deepcopy(get(state,'boms',body['bom_id'])),'allocations':allocations,'quantity':plan['quantity']}
        state['batches'].append(copy.deepcopy(result))
    else:fail('지원하지 않는 공급망 작업입니다.',404)
    state['revision']+=1
    if event_id:state['events'][event_id]={'fingerprint':fingerprint,'result':copy.deepcopy(result)}
    return state,{**copy.deepcopy(result),'duplicate':False}

def public_state(state):return {k:copy.deepcopy(v) for k,v in state.items() if k not in ('events','sequence')}
def trace(state,lid):
    get(state,'lots',lid);selected={lid};edges=set()
    def ancestors(node):
        for parent in get(state,'lots',node)['parents']:
            edges.add((parent,node))
            if parent not in selected:selected.add(parent);ancestors(parent)
    ancestors(lid)
    pending=[lid];seen={lid}
    while pending:
        current=pending.pop()
        for lot in state['lots']:
            if current in lot['parents']:
                edges.add((current,lot['id']))
                if lot['id'] not in seen:seen.add(lot['id']);selected.add(lot['id']);pending.append(lot['id'])
    for selected_id in list(selected):ancestors(selected_id)
    return {'root':lid,'nodes':[copy.deepcopy(l) for l in state['lots'] if l['id'] in selected],'edges':[{'source':a,'target':b} for a,b in sorted(edges)]}
