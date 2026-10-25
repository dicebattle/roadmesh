/** Narration is outside the untouched application frame. / 자막은 원 애플리케이션 화면 밖에 둡니다. */
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {createCanvas,GlobalFonts}=require('/Users/dice/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas');
if(!GlobalFonts.registerFromPath('/System/Library/Fonts/AppleSDGothicNeo.ttc','DemoCaption'))throw Error('Caption font unavailable / 자막 서체를 사용할 수 없습니다');
const rows:Record<string,string[]>={en:['Choose a route, calculate, then read each turn.'],ko:['경로 선택·계산 후 회전별 길안내를 확인합니다.']};
fs.mkdirSync('data/nav01-captions',{recursive:true});
for(const[lang,lines]of Object.entries(rows))for(let i=0;i<lines.length;i++){const c=createCanvas(1280,108),ctx=c.getContext('2d');ctx.fillStyle='#f5f8fa';ctx.fillRect(0,0,1280,108);ctx.fillStyle='#24766e';ctx.fillRect(0,0,1280,3);ctx.fillStyle='#142631';ctx.font='32px DemoCaption';ctx.fillText(lines[i],28,45);ctx.fillStyle='#526772';ctx.font='20px DemoCaption';ctx.fillText(lang==='en'?'Actual Seoul roads · synthetic traffic · GPS and voice are future work':'실제 서울 지도 · 합성 교통정보 · GPS·음성은 후속 작업',28,82);fs.writeFileSync(`data/nav01-captions/${lang}-${i}.png`,c.toBuffer('image/png'));}
