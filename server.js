const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const data=require('./market-data');
const files={'/':'index.html','/index.html':'index.html','/styles.css':'styles.css','/app.js':'app.js','/allocation.js':'allocation.js'};
const send=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body))};
async function handler(req,res){
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
 if(req.method!=='GET')return send(res,405,{error:'Read-only API'});
 const url=new URL(req.url,'http://localhost');
 try{
  if(url.pathname==='/api/catalog')return send(res,200,await data.catalog());
  if(['/api/market','/api/history','/api/quote'].includes(url.pathname)){
   const id=url.searchParams.get('id');const c=await data.catalog();const token=c.tokens.find(t=>t.id===id);
   if(!token)return send(res,400,{error:'Select a token from the verified issuer catalog.'});
   if(url.pathname==='/api/market')return send(res,200,await data.market(token));
   if(url.pathname==='/api/history')return send(res,200,await data.history(token));
   const amount=Number(url.searchParams.get('amount'));
   if(!Number.isFinite(amount)||amount<1||amount>1000000)return send(res,400,{error:'Amount must be between 1 and 1,000,000 USDC.'});
   return send(res,200,await data.quote(token,amount));
  }
  const file=files[url.pathname];if(!file){res.writeHead(404);return res.end('Not found')}
  res.setHeader('Content-Type',{'html':'text/html; charset=utf-8','css':'text/css','js':'text/javascript'}[file.split('.').pop()]);
  fs.createReadStream(path.join(__dirname,file)).pipe(res);
 }catch(e){send(res,e.status||502,{error:e.message||'Data provider unavailable. Please retry.'})}
}
function createServer(){return http.createServer(handler)}
if(require.main===module)createServer().listen(Number(process.env.PORT)||3000,'127.0.0.1',()=>console.log('Folio live-data workspace: http://localhost:'+(process.env.PORT||3000)));
module.exports={createServer,handler};

