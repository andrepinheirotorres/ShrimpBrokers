'use strict';
// ShrimpBrokers: servidor sem dependências npm; requer Node.js 24 LTS.
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const ROOT=__dirname, PUBLIC=path.join(ROOT,'public'), DATA=process.env.DATA_DIR || path.join(ROOT,'dados'), UPLOADS=path.join(DATA,'uploads');
if(process.env.RAILWAY_ENVIRONMENT && !process.env.RAILWAY_VOLUME_MOUNT_PATH){console.error('ERRO: Railway exige volume persistente montado em /data antes de iniciar.');process.exit(1);}
if(process.env.RAILWAY_ENVIRONMENT && DATA!==process.env.RAILWAY_VOLUME_MOUNT_PATH){console.error('ERRO: configura DATA_DIR igual ao mount path do volume Railway.');process.exit(1);}
fs.mkdirSync(UPLOADS,{recursive:true});
fs.mkdirSync(DATA,{recursive:true});
const db=new DatabaseSync(path.join(DATA,'shrimpbrokers.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, grade TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', price REAL NOT NULL CHECK(price>=0), stock INTEGER NOT NULL CHECK(stock>=0), color TEXT NOT NULL DEFAULT '#55b8eb', image TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS product_images (id TEXT PRIMARY KEY, product_id TEXT NOT NULL, filename TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS product_images_product ON product_images(product_id,position);
CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY, salt TEXT NOT NULL, hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, username TEXT NOT NULL, expires INTEGER NOT NULL);`);
if(db.prepare('SELECT COUNT(*) AS n FROM products').get().n===0){
 const seed=JSON.parse(fs.readFileSync(path.join(ROOT,'seed-products.json'),'utf8'));
 const insert=db.prepare('INSERT INTO products(id,name,category,grade,description,price,stock,color,image) VALUES(?,?,?,?,?,?,?,?,?)');
 for(const p of seed)insert.run(p.id,p.name,p.category,p.grade,p.description,p.price,p.stock,p.color,p.image);
}
const HOST=process.env.HOST||'0.0.0.0', PORT=Number(process.env.PORT||3000);
if(!Number.isInteger(PORT)||PORT<1||PORT>65535)throw Error('PORT inválida');
const H={'Strict-Transport-Security':'max-age=31536000; includeSubDomains','Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; img-src 'self' https://files.cdn-files-a.com data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; base-uri 'self'; frame-ancestors 'none'"};
const productSql='SELECT id,name,category,grade,description,price,stock,color,image FROM products ORDER BY name COLLATE NOCASE';
const listProducts=()=>db.prepare(productSql).all().map(p=>({...p, images:db.prepare('SELECT id,filename FROM product_images WHERE product_id=? ORDER BY position,id').all(p.id).map(x=>({id:x.id,url:'/uploads/'+x.filename}))}));
const json=(res,status,obj,headers={})=>{res.writeHead(status,{...H,...headers});res.end(JSON.stringify(obj));};
const passwordHash=(pass,salt)=>crypto.scryptSync(pass,Buffer.from(salt,'hex'),64).toString('hex');
function getSession(req){const match=/(?:^|;\s*)sb_session=([^;]+)/.exec(req.headers.cookie||'');if(!match)return null;const token=match[1];if(!/^[0-9a-f]{64}$/.test(token))return null;const th=crypto.createHash('sha256').update(token).digest('hex');return db.prepare('SELECT username,expires FROM sessions WHERE token_hash=?').get(th)?.expires>Date.now()?{tokenHash:th}:null;}
function cookie(token,req){const secure=process.env.NODE_ENV==='production'||req.headers['x-forwarded-proto']==='https';return `sb_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secure?'; Secure':''}`;}
function validOrigin(req){const origin=req.headers.origin; if(!origin)return false;try{const o=new URL(origin);return o.host===req.headers.host && (o.protocol==='http:'||o.protocol==='https:');}catch{return false;}}
function parseBody(req,maxBytes=16384){return new Promise((resolve,reject)=>{let chunks=[],len=0;req.on('data',b=>{len+=b.length;if(len>maxBytes){reject(Error('too-big'));req.destroy();return;}chunks.push(b)});req.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))}catch{reject(Error('invalid-json'))}});req.on('error',reject);});}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon','.woff2':'font/woff2','.webp':'image/webp'};
function staticFile(req,res,pathname){const file=path.resolve(PUBLIC,'.'+pathname);if(!file.startsWith(PUBLIC+path.sep))return json(res,403,{error:'Proibido'});let stat;try{stat=fs.statSync(file)}catch{return json(res,404,{error:'Não encontrado'})}if(!stat.isFile())return json(res,404,{error:'Não encontrado'});res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY'});fs.createReadStream(file).pipe(res);}
// Primeira conta admin criada exclusivamente através das variáveis privadas da Railway.
function bootstrapAdmin(){const n=db.prepare('SELECT COUNT(*) AS n FROM users').get().n;if(n)return;
 const pass=process.env.ADMIN_PASSWORD||'',username=process.env.ADMIN_USERNAME||'admin';
 if(pass.length<16||pass.length>256||!/^[-_a-zA-Z0-9]{3,40}$/.test(username))throw Error('Define ADMIN_USERNAME e ADMIN_PASSWORD forte (mín. 16 caracteres) nas Variables da Railway antes do primeiro arranque.');
 const salt=crypto.randomBytes(16).toString('hex'),hash=passwordHash(pass,salt);db.prepare('INSERT INTO users(username,salt,hash) VALUES(?,?,?)').run(username,salt,hash);
 console.log('Conta de administração inicial criada. Retira ADMIN_PASSWORD das Variables após confirmar o login; a conta mantém-se na SQLite.');}
bootstrapAdmin();
const failures=new Map();
http.createServer(async(req,res)=>{
 try {
  const url=new URL(req.url,'http://localhost'), p=url.pathname;
  if(req.method==='GET'&&p==='/health')return json(res,200,{status:'ok'});
  if((req.method==='GET'||req.method==='HEAD')&&/^\/uploads\/[a-f0-9-]{36}\.(jpg|png|webp)$/.test(p)){const name=p.slice('/uploads/'.length);const file=path.join(UPLOADS,name);if(!fs.existsSync(file))return json(res,404,{error:'Imagem não encontrada'});res.writeHead(200,{'Content-Type':mime[path.extname(file)],'Cache-Control':'public, max-age=3600','X-Content-Type-Options':'nosniff'});if(req.method==='HEAD')return res.end();return fs.createReadStream(file).pipe(res);}
  if(req.method==='GET'&&p==='/api/products')return json(res,200,listProducts());
  if(p==='/admin'&&req.method==='GET')return staticFile(req,res,'/admin.html');
  if(p==='/api/admin/login'&&req.method==='POST'){
   if(!validOrigin(req))return json(res,403,{error:'Origem não autorizada'});
   const ip=String(req.headers['cf-connecting-ip']||req.socket.remoteAddress||'local'), attempt=failures.get(ip)||{n:0,until:0};if(attempt.until>Date.now())return json(res,429,{error:'Demasiadas tentativas. Tenta mais tarde.'});
   const b=await parseBody(req), user=db.prepare('SELECT * FROM users WHERE username=?').get(String(b.username||''));
   const pass=String(b.password||'');const salt=user?.salt||'a'.repeat(32);const computed=passwordHash(pass,salt),expected=user?.hash||'0'.repeat(128);
   if(!user||!crypto.timingSafeEqual(Buffer.from(computed,'hex'),Buffer.from(expected,'hex'))){const n=attempt.n+1;failures.set(ip,{n,until:n>=5?Date.now()+15*60*1000:0});return json(res,401,{error:'Utilizador ou palavra-passe incorretos'});}
   failures.delete(ip);const token=crypto.randomBytes(32).toString('hex'),hash=crypto.createHash('sha256').update(token).digest('hex');
   db.prepare('INSERT INTO sessions(token_hash,username,expires) VALUES(?,?,?)').run(hash,user.username,Date.now()+8*3600000);
   return json(res,200,{ok:true},{'Set-Cookie':cookie(token,req)});
  }
  if(p.startsWith('/api/admin/')){
   const session=getSession(req);if(!session)return json(res,401,{error:'Inicia sessão'});
   if(req.method!=='GET'&&!validOrigin(req))return json(res,403,{error:'Origem não autorizada'});
   if(p==='/api/admin/products'&&req.method==='GET')return json(res,200,listProducts());
   const photoRoute=/^\/api\/admin\/products\/([a-z0-9-]+)\/images$/.exec(p);
   if(photoRoute&&req.method==='POST'){
    if(!db.prepare('SELECT id FROM products WHERE id=?').get(photoRoute[1]))return json(res,404,{error:'Produto inexistente'});
    const b=await parseBody(req,9*1024*1024);
    if(!['image/jpeg','image/png','image/webp'].includes(b.type)||typeof b.data!=='string'||b.data.length>8*1024*1024)return json(res,400,{error:'Usa JPG, PNG ou WebP até 5 MB'});
    const bytes=Buffer.from(b.data,'base64');
    if(bytes.length>5*1024*1024||bytes.length<100)return json(res,400,{error:'Imagem inválida ou demasiado grande (máx. 5 MB)'});
    const jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255, png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),webp=bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
    if(!(b.type==='image/jpeg'&&jpg||b.type==='image/png'&&png||b.type==='image/webp'&&webp))return json(res,400,{error:'Formato de imagem inválido'});
    const ext=jpg?'jpg':png?'png':'webp',id=crypto.randomUUID(), filename=id+'.'+ext;
    const directory=UPLOADS;fs.writeFileSync(path.join(directory,filename),bytes,{flag:'wx'});
    const pos=db.prepare('SELECT COALESCE(MAX(position),-1)+1 AS n FROM product_images WHERE product_id=?').get(photoRoute[1]).n;
    db.prepare('INSERT INTO product_images(id,product_id,filename,position) VALUES(?,?,?,?)').run(id,photoRoute[1],filename,pos);return json(res,200,{ok:true});
   }
   const deletePhoto=/^\/api\/admin\/products\/([a-z0-9-]+)\/images\/([a-f0-9-]{36})$/.exec(p);
   if(deletePhoto&&req.method==='DELETE'){
    const photo=db.prepare('SELECT filename FROM product_images WHERE id=? AND product_id=?').get(deletePhoto[2],deletePhoto[1]);if(!photo)return json(res,404,{error:'Fotografia inexistente'});
    db.prepare('DELETE FROM product_images WHERE id=?').run(deletePhoto[2]);
    try{fs.unlinkSync(path.join(UPLOADS,photo.filename))}catch{}return json(res,200,{ok:true});
   }
   if(p==='/api/admin/logout'&&req.method==='POST'){db.prepare('DELETE FROM sessions WHERE token_hash=?').run(session.tokenHash);return json(res,200,{ok:true},{'Set-Cookie':cookie('',req).replace('Max-Age=28800','Max-Age=0')});}
   if(p==='/api/admin/products'&&req.method==='POST'){
    const b=await parseBody(req);let v=validateProduct(b,true);if(v.error)return json(res,400,{error:v.error});
    if(db.prepare('SELECT id FROM products WHERE id=?').get(v.p.id))return json(res,409,{error:'ID já existe'});
    const q=v.p;db.prepare('INSERT INTO products (id,name,category,grade,description,price,stock,color,image) VALUES(?,?,?,?,?,?,?,?,?)').run(q.id,q.name,q.category,q.grade,q.description,q.price,q.stock,q.color,q.image);return json(res,200,{ok:true});
   }
   const m=/^\/api\/admin\/products\/([a-z0-9-]+)$/.exec(p);
   if(m&&req.method==='PUT'){
    if(!db.prepare('SELECT id FROM products WHERE id=?').get(m[1]))return json(res,404,{error:'Produto inexistente'});
    const b=await parseBody(req);let v=validateProduct({...b,id:m[1]},false);if(v.error)return json(res,400,{error:v.error});const q=v.p;
    db.prepare('UPDATE products SET name=?, category=?, grade=?, description=?, price=?, stock=?, color=?, image=? WHERE id=?').run(q.name,q.category,q.grade,q.description,q.price,q.stock,q.color,q.image,m[1]);return json(res,200,{ok:true});
   }
   if(m&&req.method==='DELETE'){for(const f of db.prepare('SELECT filename FROM product_images WHERE product_id=?').all(m[1]))try{fs.unlinkSync(path.join(PUBLIC,'uploads',f.filename))}catch{}db.prepare('DELETE FROM product_images WHERE product_id=?').run(m[1]);db.prepare('DELETE FROM products WHERE id=?').run(m[1]);return json(res,200,{ok:true});}
   return json(res,404,{error:'Rota não encontrada'});
  }
  if(req.method==='GET'||req.method==='HEAD'){if(['/admin.html','/admin.js','/config.js'].includes(p) && p==='/admin.html')return json(res,404,{error:'Não encontrado'});return staticFile(req,res,p==='/'?'/index.html':p);}
  return json(res,405,{error:'Método inválido'});
 }catch(e){console.error(e);if(!res.headersSent)json(res,400,{error:'Pedido inválido'});}
}).listen(PORT,HOST,()=>console.log(`ShrimpBrokers ativo em http://localhost:${PORT} | Administração http://localhost:${PORT}/admin`));
function validateProduct(b,newProduct){
 const id=String(b.id||'').trim(),name=String(b.name||'').trim(),category=String(b.category||''),grade=String(b.grade||'').trim(),description=String(b.description||'').trim(),color=String(b.color||'#55b8eb').trim(),image=String(b.image||'').trim();const price=Number(b.price),stock=Number(b.stock);
 if(!/^[a-z0-9-]{2,60}$/.test(id))return {error:'ID: 2-60 caracteres minúsculos, números ou hífen'};
 if(!name||name.length>100||grade.length>100||description.length>500)return {error:'Nome ou descrição inválidos'};
 if(!['Caridina','Neocaridina'].includes(category))return {error:'Categoria inválida'};
 if(!Number.isFinite(price)||price<0||price>100000||!Number.isInteger(stock)||stock<0||stock>1000000)return {error:'Preço ou stock inválidos'};
 if(!/^#[0-9a-fA-F]{6}$/.test(color))return {error:'Cor inválida'};
 if(image.length>1000 || (image && !(/^https:\/\//.test(image)||/^assets\/[\w.-]+\.(svg|png|jpe?g|webp)$/.test(image))))return {error:'Imagem tem de ser endereço HTTPS ou assets/ficheiro'};
 return {p:{id,name,category,grade,description,color,image,price,stock}};
}
