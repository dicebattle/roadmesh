/** Narration is outside the untouched application frame. / 자막은 원 애플리케이션 화면 밖에 둡니다. */
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {createCanvas,GlobalFonts}=require('/Users/dice/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas');
if(!GlobalFonts.registerFromPath('/System/Library/Fonts/AppleSDGothicNeo.ttc','DemoCaption'))throw Error('Caption font unavailable / 자막 서체를 사용할 수 없습니다');
const rows:Record<string,string[]>={en:['1. Choose the Teheran-ro route preset.','2. Click Calculate route.','3. Check the route, distance and estimated time.'],ko:['1. 테헤란로 경로를 선택합니다.','2. 경로 계산을 누릅니다.','3. 지도에서 경로·거리·예상 시간을 확인합니다.']};
fs.mkdirSync('data/p13-user-captions',{recursive:true});
for(const[lang,lines]of Object.entries(rows))for(let i=0;i<lines.length;i++){const c=createCanvas(1280,108),ctx=c.getContext('2d');ctx.fillStyle='#f5f8fa';ctx.fillRect(0,0,1280,108);ctx.fillStyle='#24766e';ctx.fillRect(0,0,1280,3);ctx.fillStyle='#142631';ctx.font='32px DemoCaption';ctx.fillText(lines[i],28,45);ctx.fillStyle='#526772';ctx.font='20px DemoCaption';ctx.fillText(lang==='en'?'Actual Seoul map · synthetic traffic · local browser pilot':'실제 서울 지도 · 합성 교통정보 · 로컬 웹 파일럿',28,82);fs.writeFileSync(`data/p13-user-captions/${lang}-${i}.png`,c.toBuffer('image/png'));}
