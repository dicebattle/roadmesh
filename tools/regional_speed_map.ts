/** Bounded official WFS/WMS evidence for the predeclared regional corridors.
 * 미리 고정한 지역 도로의 제한된 공식 WFS/WMS 근거 수집입니다. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { geodesicSphere } from "./geodesy.js";
import { parseJson, sha256 } from "./shared.js";
import { REGIONAL_SCENES } from "./seoul_bundle.js";
import { PublicSpeedError, type PublicBounds } from "./public_speed_source.js";
import { validateRegionalBounds } from "./regional_speed_source.js";
import { readRegionalPublicUrl } from "./regional_speed_collector.js";
import { parseGitsWfs, reviewGitsWms } from "./regional_speed_geometry.js";

export async function collectRegionalMapEvidence(bounds: PublicBounds, output: string): Promise<void> {
  validateRegionalBounds(bounds);mkdirSync(output,{mode:0o700});
  const wms=join(output,"wms");mkdirSync(wms);
  const base="https://gitsmap.gg.go.kr/cgi-bin/mapserv.exe";
  const map="/ms4w/mapserver/mapfile/ATTRLV10.map";
  const get=async(name:string,url:string,mime:string,limit=16*1024*1024)=>{
    const began=Date.now();
    try{
      const raw=await readRegionalPublicUrl(url,undefined,limit,mime);
      writeFileSync(name+".body",raw,{flag:"wx",mode:0o600});
      writeFileSync(name+".receipt.json",JSON.stringify({url,status:200,bytes:raw.length,sha256:sha256(raw),
        retrieved_at:new Date().toISOString()},null,2)+"\n",{flag:"wx",mode:0o600});return raw;
    }catch(e){
      writeFileSync(name+".failure.json",JSON.stringify({url,code:e instanceof PublicSpeedError?e.code:"READ_FAILED",
        message_en:"No geometry accepted from this failed read.",message_ko:"실패한 조회의 지형은 수용하지 않습니다."},null,2)+"\n",{flag:"wx"});throw e;
    }finally{await delay(Math.max(0,500-(Date.now()-began)));}
  };
  const query={map,SERVICE:"WFS",REQUEST:"GetFeature",VERSION:"1.1.0",TYPENAME:"ATTRLV10",BBOX:bounds.join(","),SRSNAME:"EPSG:5181"};
  const hits=await get(join(output,"gits-wfs-region-hits"),base+"?"+new URLSearchParams({...query,RESULTTYPE:"hits"}),"text/xml");
  const count=Number(hits.toString().match(/\bnumberOfFeatures="(\d+)"/)?.[1]);
  if(!Number.isSafeInteger(count) || count<1 || count>10000)throw new PublicSpeedError("INVALID_GITS_HITS");
  const raw=await get(join(output,"gits-wfs-region"),base+"?"+new URLSearchParams({...query,MAXFEATURES:String(count+1)}),"text/xml");
  const parsed=parseGitsWfs(raw,count);
  const scenes=parseJson(readFileSync(REGIONAL_SCENES)) as {scenes:Array<{provider_geometry_reference:string;neighbour_geometry_references:string[]}>};
  const selected=new Set(scenes.scenes.flatMap(s=>[s.provider_geometry_reference,...s.neighbour_geometry_references]));
  if(selected.size>96)throw new PublicSpeedError("REGIONAL_MAP_REQUEST_LIMIT");
  const outcomes=[];
  for(const id of [...selected].sort()){
    const c=parsed.curves.find(c=>c.source_id===id);
    if(!c){outcomes.push({source_id:id,status:"MISSING_WFS_CURVE"});continue;}
    const p=geodesicSphere.position(c.coordinates,geodesicSphere.length(c.coordinates)*0.5),radius=0.0003;
    const url=base+"?"+new URLSearchParams({MAP:map,SERVICE:"WMS",REQUEST:"GetFeatureInfo",VERSION:"1.1.1",
      LAYERS:"ATTRLV10",QUERY_LAYERS:"ATTRLV10",BBOX:[p[0]!-radius,p[1]!-radius,p[0]!+radius,p[1]!+radius].join(","),
      X:"128",Y:"128",WIDTH:"256",HEIGHT:"256",INFO_FORMAT:"application/vnd.ogc.gml",SRS:"EPSG:5181",STYLES:"",FEATURE_COUNT:"20"});
    try{const response=await get(join(wms,"link-"+id),url,"application/vnd.ogc.gml",1024*1024);reviewGitsWms(c,response);
      outcomes.push({source_id:id,status:"VERIFIED"});}
    catch(e){outcomes.push({source_id:id,status:e instanceof PublicSpeedError?e.code:"READ_FAILED"});}
  }
  writeFileSync(join(output,"review-outcomes.json"),JSON.stringify({outcomes,unsupported:parsed.excluded,
    message_en:"Only the fixed corridor references were reviewed. Raw government geometry stays local.",
    message_ko:"고정 도로 참조만 검토했으며 기관 지형 원문은 로컬에 유지합니다."},null,2)+"\n",{flag:"wx"});
}
