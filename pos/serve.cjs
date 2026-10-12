const http=require('http'),fs=require('fs'),path=require('path');
const allowed={'/':'index.html','/index.html':'index.html','/style.css':'style.css','/app.js':'app.js','/auth.js':'auth.js','/shops.js':'shops.js','/sync-core.js':'sync-core.js','/nas-sync.js':'nas-sync.js','/camera.js':'camera.js','/scanner.js':'scanner.js','/product-editor.js':'product-editor.js','/refunds.js':'refunds.js','/vendor/zxing-browser-0.2.1.min.js':'vendor/zxing-browser-0.2.1.min.js'};
allowed['/theme.css']='theme.css';allowed['/printer.js']='printer.js';allowed['/loyverse-import.js']='loyverse-import.js';
allowed['/receipt-codes.js']='receipt-codes.js';
allowed['/sync-delta.js']='sync-delta.js';allowed['/sync-assets.js']='sync-assets.js';
http.createServer((req,res)=>{const file=allowed[req.url?.split('?')[0]];if(!file){res.writeHead(404);return res.end('Not found');}res.writeHead(200,{'Content-Type':file.endsWith('.css')?'text/css; charset=utf-8':file.endsWith('.js')?'application/javascript; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(fs.readFileSync(path.join(__dirname,file)));}).listen(5690,'127.0.0.1',()=>console.log('TCGshop POS: http://127.0.0.1:5690'));
