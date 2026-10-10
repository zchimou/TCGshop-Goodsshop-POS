const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'../app/src/main/res');
const shapes=[
 ['#91DCD9','M31,34L52,29Q57,28 58,33L65,66Q66,71 61,72L40,77Q35,78 34,73L27,41Q26,36 31,34Z'],
 ['#FFFFFF','M44,26H66Q72,26 72,32V69Q72,75 66,75H44Q38,75 38,69V32Q38,26 44,26Z'],
 ['#DDE3FA','M44,31H66V33H44Z'],
 ['#465398','M55,37Q57,43 64,46Q57,49 55,55Q53,49 46,46Q53,43 55,37Z'],
 ['#DDE3FA','M44,61H61V64H44Z'],
 ['#34417D','M52,54H74Q80,54 80,60V80L74,77L69,80L64,77L59,80L54,77L49,80V59Q49,54 52,54Z'],
 ['#A5E9DF','M54,58H74Q76,58 76,61V74L73,72L69,75L65,72L61,75L57,72L53,74V61Q53,58 54,58Z'],
 ['#34417D','M58,62H71V65H58ZM58,68H67V70H58Z']
];
const mono='M31,34L34,33V40L33,41L39,70V77Q35,78 34,73L27,41Q26,36 31,34Z M44,26H66Q72,26 72,32V51H66V33H44V69H46V75H44Q38,75 38,69V32Q38,26 44,26Z M55,37Q57,43 64,46Q57,49 55,55Q53,49 46,46Q53,43 55,37Z M52,54H74Q80,54 80,60V80L74,77L69,80L64,77L59,80L54,77L49,80V59Q49,54 52,54Z M58,62V65H71V62Z M58,68V70H67V68Z';
const vector=paths=>`<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">\n${paths.map(([color,d])=>` <path android:fillColor="${color}" android:fillType="evenOdd" android:pathData="${d}" />`).join('\n')}\n</vector>\n`;
function save(name,data){const p=path.join(root,name);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,data);}
save('drawable/icon_foreground.xml',vector(shapes));
save('drawable/icon_monochrome.xml',vector([['#FFFFFF',mono]]));
save('drawable/app_icon.xml',vector([['#465398','M0,0H108V108H0Z'],...shapes]));
save('values/icon_colors.xml','<resources><color name="icon_background">#465398</color></resources>\n');
for(const api of [26,33])save(`drawable-v${api}/app_icon.xml`,`<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n <background android:drawable="@color/icon_background" />\n <foreground android:drawable="@drawable/icon_foreground" />\n${api===33?' <monochrome android:drawable="@drawable/icon_monochrome" />\n':''}</adaptive-icon>\n`);
const svg=(themed=false)=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="18 18 72 72"><path fill="${themed?'#DDE4FA':'#465398'}" d="M0 0H108V108H0Z"/>${(themed?[['#35416F',mono]]:shapes).map(([fill,d])=>`<path fill="${fill}" fill-rule="evenodd" d="${d}"/>`).join('')}</svg>`;
fs.writeFileSync(path.join(__dirname,'app-icon.svg'),svg());
fs.writeFileSync(path.join(__dirname,'icon-preview.html'),`<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;background:#F1F3F9;font-family:'Microsoft YaHei',sans-serif;color:#24304F;padding:44px}h1{font-size:26px;margin:0 0 8px}p{color:#75809B;font-size:14px;margin:0 0 32px}.row{display:flex;gap:60px;align-items:center}.item{text-align:center}.icon{width:210px;height:210px;overflow:hidden;border-radius:48px;box-shadow:0 14px 28px #25306017}.circle{border-radius:50%}.label{margin-top:18px;font-size:15px}.small{margin-top:36px;display:flex;gap:20px;align-items:center}.small .icon{width:48px;height:48px;border-radius:12px;box-shadow:none}.small span{font-size:13px;color:#75809B}svg{display:block;width:100%;height:100%}</style><h1>TCGshop POS · 新应用图标</h1><p>卡牌 × 销售小票　/　靛蓝与薄荷绿</p><div class="row"><div class="item"><div class="icon">${svg()}</div><div class="label">圆角桌面图标</div></div><div class="item"><div class="icon circle">${svg()}</div><div class="label">圆形桌面图标</div></div><div class="item"><div class="icon">${svg(true)}</div><div class="label">系统主题图标</div></div></div><div class="small"><div class="icon">${svg()}</div><div class="icon circle">${svg()}</div><span>小尺寸预览 · 卡牌与收银管理</span></div>`);
console.log('Generated vector icon layers and preview.');
