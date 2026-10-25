/** Captions outside original frame / 원 화면 밖 자막. */
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {createCanvas,GlobalFonts}=require('/Users/dice/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas');
if(!GlobalFonts.registerFromPath('/System/Library/Fonts/AppleSDGothicNeo.ttc','DemoCaption'))throw Error('Caption font unavailable / 자막 서체 없음');
const rows={en:['Public speeds on Seoul roads: route, next turn, departure and rejoin.','MOLIT ITS observations · partial live coverage · authored GPS replay at 4×'],ko:['서울 공공 속도로 경로 계산 · 다음 회전·남은 거리·이탈·복귀','국토교통부 실제 관측 · 일부 구간 적용 · GPS는 자체 합성·4배속 재생']};
fs.mkdirSync('data/public-speeds-captions',{recursive:true});
for(const[lang,lines]of Object.entries(rows)){const c=createCanvas(1280,108),ctx=c.getContext('2d');ctx.fillStyle='#f5f8fa';ctx.fillRect(0,0,1280,108);ctx.fillStyle='#24766e';ctx.fillRect(0,0,1280,3);ctx.fillStyle='#142631';ctx.font='28px DemoCaption';ctx.fillText(lines[0],28,45);ctx.fillStyle='#526772';ctx.font='20px DemoCaption';ctx.fillText(lines[1],28,82);fs.writeFileSync(`data/public-speeds-captions/${lang}-0.png`,c.toBuffer('image/png'));}
