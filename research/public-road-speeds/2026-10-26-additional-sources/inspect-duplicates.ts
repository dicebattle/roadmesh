import fs from'node:fs';import path from'node:path';
const [root,output]=process.argv.slice(2);if(!root||!output)throw Error('Usage: inspect-duplicates ROOT OUTPUT / 원문·출력 필요');
const sources=[];
for(const source of ['topis','gyeonggi','utic','daegu']){
 const dir=path.join(root,'campaign01',source);
 const all=fs.readdirSync(dir).filter(p=>p.endsWith('.normalized.json')).flatMap(p=>JSON.parse(fs.readFileSync(path.join(dir,p),'utf8'))) as {record_id:string;direction:string|null;speed_kph:number|null}[];
 const ids=new Set(all.map(r=>r.record_id)),pairs=new Map<string,Set<number|null>>();
 for(const r of all){const k=r.record_id+'|'+r.direction,values=pairs.get(k)??new Set<number|null>();values.add(r.speed_kph);pairs.set(k,values);}
 sources.push({source,rows:all.length,distinct_record_ids:ids.size,distinct_id_direction_pairs:pairs.size,repeated_pair_rows:all.length-pairs.size,pairs_with_different_speeds:[...pairs.values()].filter(v=>v.size>1).length});
}
const result={status:'PASS',sources,message_en:'Counts are provider-local; overlapping road axes, relative axis directions and staggered captures must not be merged by keeping an arbitrary last speed. No unique metropolitan length denominator is available.',message_ko:'출처별 식별자 수이며 겹치는 도로 축·축 기준 방향·시간이 다른 조회를 마지막 속도로 임의 병합하지 않습니다. 수도권 전체 길이 분모는 없습니다.'};
fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
