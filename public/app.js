(() => {
'use strict';
const config = window.SHRIMP_CONFIG;
let products = [];
const byId = id => document.getElementById(id);
const euros = n => new Intl.NumberFormat('pt-PT', {style:'currency', currency:'EUR'}).format(n);
const safe = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let category = 'todos';
let cart = {};
try { const saved=JSON.parse(localStorage.getItem('shrimpbrokers-cart')||'{}'); if(saved && typeof saved==='object' && !Array.isArray(saved)) cart=saved; } catch {}
function normalizeCart(){const clean={};for(const p of products){const q=Number(cart[p.id]);if(Number.isInteger(q)&&q>0&&p.stock>0)clean[p.id]=Math.min(q,p.stock);}cart=clean;save();}
function save(){try{localStorage.setItem('shrimpbrokers-cart',JSON.stringify(cart));}catch{}}
function galleryImages(p){return [p.image,...(p.images||[]).map(i=>i.url)].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i);}
function itemImage(p){return galleryImages(p)[0] || `assets/${p.id}.svg`;}
let galleryIndex=0,galleryProduct=null;
function updateGallery(){if(!galleryProduct)return;const images=galleryImages(galleryProduct);const src=images[galleryIndex];byId('galleryPhoto').src=src;byId('galleryPhoto').alt=`${galleryProduct.name} — fotografia ${galleryIndex+1}`;byId('galleryCount').textContent=`${galleryIndex+1} / ${images.length}`;byId('galleryThumbs').innerHTML=images.map((url,i)=>`<button type="button" class="gallery-thumb ${i===galleryIndex?'selected':''}" data-photo="${i}" aria-label="Ver fotografia ${i+1}"><img src="${safe(url)}" alt=""></button>`).join('');byId('galleryPrev').disabled=images.length<2;byId('galleryNext').disabled=images.length<2;}
function openGallery(id){const p=products.find(x=>x.id===id);if(!p)return;galleryProduct=p;galleryIndex=0;byId('galleryTitle').textContent=p.name;updateGallery();byId('galleryModal').hidden=false;document.body.classList.add('no-scroll');byId('galleryClose').focus();}
function closeGallery(){byId('galleryModal').hidden=true;galleryProduct=null;document.body.classList.remove('no-scroll');}
function moveGallery(dir){if(!galleryProduct)return;let n=galleryImages(galleryProduct).length;galleryIndex=(galleryIndex+dir+n)%n;updateGallery();}
function renderProducts(){
 const q=byId('search').value.trim().toLocaleLowerCase('pt-PT');
 let list=products.filter(p=>(category==='todos'||p.category===category)&&(!byId('onlyStock').checked||p.stock>0)&&(`${p.name} ${p.category} ${p.grade}`.toLocaleLowerCase('pt-PT').includes(q)));
 const sort=byId('sort').value;
 if(sort==='price-asc') list.sort((a,b)=>a.price-b.price);
 if(sort==='price-desc') list.sort((a,b)=>b.price-a.price);
 if(sort==='name') list.sort((a,b)=>a.name.localeCompare(b.name,'pt'));
 if(sort==='stock') list.sort((a,b)=>b.stock-a.stock);
 byId('productTotal').textContent=`${list.length} ${list.length===1?'mutação':'mutações'}`;
 byId('emptyState').hidden=list.length!==0;
 byId('products').innerHTML=list.map(p=>`<article class="product-card"><div class="product-image"><button type="button" class="product-photo-open" data-view="${safe(p.id)}" aria-label="Ampliar fotografias de ${safe(p.name)}"><img src="${safe(itemImage(p))}" alt="Fotografia da mutação ${safe(p.name)}" loading="lazy" onerror="this.onerror=null;this.src='assets/${p.id}.svg';this.alt='Ilustração da mutação ${safe(p.name)}'"></button><span class="badge ${p.stock?'available':'sold-out'}">${p.stock?'● Disponível':'Esgotado'}</span></div><div class="product-body"><div class="product-category">${safe(p.category)} <span>•</span> ${safe(p.grade)}</div><h3>${safe(p.name)}</h3><p>${safe(p.description)}</p><div class="product-footer"><div><strong class="price">${euros(p.price)}</strong><small>${p.stock?`${p.stock} unidades disponíveis`:'Sem stock'}</small></div><button class="add-btn" data-add="${safe(p.id)}" ${p.stock===0?'disabled':''} aria-label="Adicionar ${safe(p.name)} ao carrinho">${p.stock?'＋ Adicionar':'Esgotado'}</button></div></div></article>`).join('');
}
function toast(message){const el=byId('toast');el.textContent=message;el.classList.add('show');clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>el.classList.remove('show'),2600);}
function add(id){const p=products.find(x=>x.id===id);if(!p||!p.stock)return;const current=cart[id]||0;if(current>=p.stock){toast('Atingiste o stock disponível disponível.');return;}cart[id]=current+1;save();renderCart();toast(`${p.name} adicionado ao carrinho.`);}
function update(id,delta){const p=products.find(x=>x.id===id);if(!p)return;const count=Math.max(0,Math.min(p.stock,(cart[id]||0)+delta));if(count===0)delete cart[id];else cart[id]=count;save();renderCart();}
function renderCart(){const count=Object.values(cart).reduce((a,b)=>a+b,0);byId('cartCount').textContent=count;byId('cartHeadingCount').textContent=`(${count})`;
 const items=products.filter(p=>cart[p.id]);byId('cartItems').innerHTML=items.length?items.map(p=>`<div class="cart-item"><img src="${itemImage(p)}" alt=""><div><strong>${safe(p.name)}</strong><small>${euros(p.price)} / unidade</small><div class="qty"><button data-minus="${p.id}" aria-label="Reduzir ${safe(p.name)}">−</button><span>${cart[p.id]}</span><button data-plus="${p.id}" aria-label="Aumentar ${safe(p.name)}" ${cart[p.id]>=p.stock?'disabled':''}>+</button></div></div><b>${euros(p.price*cart[p.id])}</b></div>`).join(''):'<div class="cart-empty"><span>🦐</span><h3>O carrinho está vazio</h3><p>Descobre as nossas mutações e escolhe as tuas favoritas.</p><button class="btn primary" id="browseBtn">Explorar catálogo</button></div>';
 byId('subtotal').textContent=euros(items.reduce((s,p)=>s+p.price*cart[p.id],0));byId('checkout').disabled=!count;byId('clearCart').disabled=!count;
}
function openCart(){byId('cartPanel').classList.add('open');byId('cartPanel').setAttribute('aria-hidden','false');byId('overlay').hidden=false;document.body.classList.add('no-scroll');byId('closeCart').focus();}
function closeCart(){byId('cartPanel').classList.remove('open');byId('cartPanel').setAttribute('aria-hidden','true');byId('overlay').hidden=true;document.body.classList.remove('no-scroll');byId('cartBtn').focus();}
function whatsApp(text){return `https://wa.me/${String(config.whatsapp).replace(/\D/g,'')}?text=${encodeURIComponent(text)}`;}
function checkout(){const items=products.filter(p=>cart[p.id]);if(!items.length)return;const total=items.reduce((s,p)=>s+p.price*cart[p.id],0);
 const lines=['Olá! Gostaria de confirmar a disponibilidade e encomendar:','',...items.map(p=>`• ${p.name} — ${cart[p.id]} × ${euros(p.price)} = ${euros(p.price*cart[p.id])}`),'',`Subtotal: ${euros(total)} (portes não incluídos)`,'','Podem confirmar a encomenda, os portes e prazo de entrega?','Obrigado!'];
 const url=whatsApp(lines.join('\n'));window.open(url,'_blank','noopener,noreferrer');}
byId('products').addEventListener('click',e=>{const v=e.target.closest('[data-view]');if(v){openGallery(v.dataset.view);return;}const b=e.target.closest('[data-add]');if(b)add(b.dataset.add);});
byId('galleryClose').addEventListener('click',closeGallery);byId('galleryModal').addEventListener('click',e=>{if(e.target===byId('galleryModal'))closeGallery();});byId('galleryPrev').addEventListener('click',()=>moveGallery(-1));byId('galleryNext').addEventListener('click',()=>moveGallery(1));byId('galleryThumbs').addEventListener('click',e=>{const b=e.target.closest('[data-photo]');if(b){galleryIndex=Number(b.dataset.photo);updateGallery();}});document.addEventListener('keydown',e=>{if(byId('galleryModal').hidden)return;if(e.key==='Escape')closeGallery();else if(e.key==='ArrowLeft')moveGallery(-1);else if(e.key==='ArrowRight')moveGallery(1);});
byId('cartItems').addEventListener('click',e=>{const minus=e.target.closest('[data-minus]');const plus=e.target.closest('[data-plus]');if(minus)update(minus.dataset.minus,-1);if(plus)update(plus.dataset.plus,1);if(e.target.closest('#browseBtn')){closeCart();location.hash='#loja';}});
document.querySelectorAll('.filter').forEach(b=>b.addEventListener('click',()=>{category=b.dataset.category;document.querySelectorAll('.filter').forEach(el=>el.classList.toggle('active',el===b));renderProducts();}));
['search','sort','onlyStock'].forEach(id=>byId(id).addEventListener(id==='search'?'input':'change',renderProducts));
byId('cartBtn').addEventListener('click',openCart);byId('closeCart').addEventListener('click',closeCart);byId('overlay').addEventListener('click',closeCart);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&byId('cartPanel').classList.contains('open'))closeCart();});
byId('checkout').addEventListener('click',checkout);byId('clearCart').addEventListener('click',()=>{cart={};save();renderCart();});
byId('whatsappContact').href=whatsApp('Olá! Tenho uma questão sobre os camarões ShrimpBrokers.');
for(const id of ['emailContact','footerEmail']){byId(id).href=`mailto:${config.email}`;byId(id).textContent=config.email;}
byId('year').textContent=new Date().getFullYear();
byId('menuBtn').addEventListener('click',()=>{const nav=byId('mainNav');const open=nav.classList.toggle('mobile-open');byId('menuBtn').setAttribute('aria-expanded',String(open));});
byId('mainNav').addEventListener('click',e=>{if(e.target.closest('a')){byId('mainNav').classList.remove('mobile-open');byId('menuBtn').setAttribute('aria-expanded','false');}});
async function loadProducts(){
 try {
  const response=await fetch('/api/products',{cache:'no-store'});
  if(!response.ok) throw new Error('Erro de ligação');
  products=await response.json();
  normalizeCart();renderProducts();renderCart();
 }catch(error){
  byId('productTotal').textContent='Serviço indisponível';
  byId('products').innerHTML='<p>Não foi possível consultar o stock. Verifica se o servidor está ligado e atualiza a página.</p>';
  toast('Servidor indisponível.');
 }
}
loadProducts();
})();
