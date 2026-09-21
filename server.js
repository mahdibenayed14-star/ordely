
import express from "express";
import { WebSocketServer } from "ws";
import http from "http";
import fs from "fs";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/voice" });
const PORT = process.env.PORT || 10000;
const DB_FILE = "./data/database.json";

let db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
const sessions = new Map();

function saveDB() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf8");
}
function customerOf(o){ return db.customers.find(c=>c.id===o.customerId); }
function productOf(id){ return db.products.find(p=>p.id===id); }
function orderOf(id){ return db.orders.find(o=>o.id===id); }
function price(o){ return o.items.reduce((s,i)=>s+(productOf(i.productId)?.price||0)*i.qty,0); }

function norm(s=""){
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[’']/g,"'").replace(/\s+/g," ").trim();
}
function intent(text){
  const t=norm(text);
  if(/annul|n'achete|j'annule|cancel|nheb nfassakh|fassakh/.test(t)) return "CANCEL";
  if(/بعد ساعة|baad sa3a|apres une heure|rappelle|recall|reappelle|ma nish mawjou|pas present|pas la/.test(t)) return "CALLBACK";
  if(/address|adresse|3onwen|عنوان|nبدل|nبدلها|nبدel/.test(t)) return "ADDRESS";
  if(/numero|num|telephone|tel|نمبر|نيميرو|telifoun|تليفون/.test(t)) return "PHONE";
  if(/prix|price|قداش|بقداش|combien|total/.test(t)) return "PRICE";
  if(/couleur|color|لون|lawn/.test(t)) return "VARIANT";
  if(/taille|size|قياس|قياسي|smol|small|grand|صغير|كبير/.test(t)) return "SIZE";
  if(/quantite|qty|quantity|كمية|pieces|قطعة|زوز|ثلاثة/.test(t)) return "QTY";
  if(/oui|yes|ok|okay|d'accord|موافق|اي|ايه|نعم|باهي|مريقل|exactement|صحيح/.test(t)) return "YES";
  if(/non|no|لا|موش|مش صحيح/.test(t)) return "NO";
  if(/نحّي|nحي|nحي|enleve|retire|juste|كان|غير|garde|خلي/.test(t)) return "MODIFY";
  return "OTHER";
}
function extractPhone(t){
  const m=t.replace(/\D/g,"");
  return m.length>=8 ? m.slice(-8) : null;
}
function extractQty(t){
  const n=norm(t);
  if(/زوز|deux|two/.test(n)) return 2;
  if(/ثلاثة|trois|three/.test(n)) return 3;
  const m=n.match(/\b([1-9]|10)\b/); return m ? Number(m[1]) : null;
}
function extractSize(t){
  const n=norm(t);
  const m=n.match(/\b(xl|xxl|s|m|l|[3-4][0-9])\b/);
  if(m) return m[1].toUpperCase();
  if(/smol|small|صغير/.test(n)) return "S";
  if(/grand|large|كبير/.test(n)) return "L";
  return null;
}
function extractVariant(t, o){
  const n=norm(t);
  for(const v of db.products.flatMap(p=>p.variants)){
    if(n.includes(norm(v))) return v;
  }
  if(/blanc|white|ابيض|الأبيض/.test(n)) return "blanc";
  if(/noir|black|اسود|الاسود|mystic black/.test(n)) return o.items[0]?.variant || "noir";
  if(/rouge|red|احمر|الأحمر/.test(n)) return "rouge";
  if(/bleu|blue|ازرق|الأزرق/.test(n)) return "bleu";
  if(/argent|silver|فضي/.test(n)) return "argent";
  return null;
}
function itemLabel(i){
  const p=productOf(i.productId);
  return `${p?.name||i.productId}${i.variant ? " "+i.variant : ""}${i.size ? " taille "+i.size : ""} x${i.qty}`;
}
function orderSummary(o){
  return o.items.map(itemLabel).join(" + ");
}
function derjaOrder(o){
  const c=customerOf(o);
  return {c, total:price(o)};
}
function askOpening(o){
  const {c,total}=derjaOrder(o);
  return `عسلامة ${c.name.split(" ")[0]}، نكلمك بخصوص commande عملتها عندنا. باش نأكدوها مع بعضنا: ${orderSummary(o)}. المجموع ${total} دينار.`;
}
function reply(s, text){
  const o=orderOf(s.orderId), c=customerOf(o), t=norm(text), it=intent(text);
  s.turn++;
  if(it==="CANCEL"){
    s.phase="cancel_confirm";
    return "أكيد، نجم نلغيهالك. تحب نعمل cancel نهائي للcommande؟";
  }
  if(s.phase==="cancel_confirm"){
    if(it==="YES"){o.status="CANCELLED"; saveDB(); s.phase="done"; return "مريقل، تلغت الـcommande. يعطيك الصحة."; }
    return "باهي، نخليها كيف ما هي. نكملو confirmation؟";
  }
  if(it==="CALLBACK"){
    s.phase="callback";
    return "ما فما حتى مشكل. نعاودو نتصلو بيك بعد ساعة. تحب نستعمل نفس النيميرو ولا النيميرو الآخر؟";
  }
  if(s.phase==="callback" && it==="PHONE"){
    const p=extractPhone(text);
    if(p){ c.altPhone=p; saveDB(); return `مريقل، سجلت النيميرو ${p}. نعاودو نتصلو بيك بعد ساعة.`; }
  }
  if(it==="PRICE") return `المجموع الحالي هو ${price(o)} دينار.`;
  if(it==="ADDRESS"){
    s.phase="address";
    return `العنوان اللي عندنا هو ${c.address}. تحب تبدلو؟`;
  }
  if(s.phase==="address"){
    if(it==="YES" || it==="OTHER"){
      s.phase="address_new";
      return "باهي، أعطيني العنوان الجديد بالتفصيل.";
    }
  }
  if(s.phase==="address_new"){
    if(text.trim().length>5){
      c.address=text.trim(); saveDB(); s.phase="verify";
      return `مريقل، سجلت العنوان: ${c.address}. نكملو؟`;
    }
  }
  if(it==="PHONE"){
    s.phase="phone";
    return `النيميرو اللي عندنا هو ${c.phone}. تحب تزيد نيميرو آخر للlivraison؟`;
  }
  if(s.phase==="phone"){
    const p=extractPhone(text);
    if(p){ c.altPhone=p; saveDB(); s.phase="verify"; return `مريقل، سجلت النيميرو الآخر ${p}.`; }
  }
  if(it==="VARIANT"){
    const v=extractVariant(text,o);
    if(v){
      const p=productOf(o.items[0].productId);
      if(p.variants.map(norm).includes(norm(v))){
        o.items[0].variant=v; saveDB();
        return `مريقل، بدلت اللون إلى ${v}.`;
      }
    }
    return `الخيارات الموجودة هي ${productOf(o.items[0].productId).variants.join(" ولا ")}.`;
  }
  if(it==="SIZE"){
    const z=extractSize(text);
    if(z){ o.items[0].size=z; saveDB(); return `مريقل، سجلت la taille ${z}.`; }
    return "شنوة الـ taille اللي تحبها؟ S ولا M ولا L؟";
  }
  if(it==="QTY"){
    const q=extractQty(text);
    if(q){ o.items[0].qty=q; saveDB(); return `مريقل، ولّينا على ${q} pièces. المجموع الجديد ${price(o)} دينار.`; }
    return "قداش تحب من قطعة؟";
  }
  if(it==="MODIFY"){
    s.phase="modify";
    return "أكيد. شنوّة تحب تبدّل: produit، quantité، couleur، taille، adresse ولا numéro؟";
  }
  if(s.phase==="modify"){
    if(it==="ADDRESS") return "العنوان الحالي هو "+c.address+". تحب تعطيني الجديد؟";
    if(it==="PHONE") return `النيميرو الحالي هو ${c.phone}. أعطيني النيميرو الآخر.`;
    if(it==="VARIANT") return "باهي، شنوّة اللون اللي تحبو؟";
    if(it==="SIZE") return "باهي، شنوّة الـ taille؟";
    if(it==="QTY") return "باهي، قداش من قطعة؟";
  }
  if(it==="NO") return "باهي، شنوة تحب نراجع معاك بالضبط؟";
  if(it==="YES"){
    if(s.phase==="verify" || s.phase==="product" || s.phase==="final"){
      o.status="CONFIRMED"; saveDB(); s.phase="done";
      return `مريقل، تأكدت الـcommande. باش توصلك على ${c.address}. يعطيك الصحة و نهارك زين.`;
    }
    return "مريقل. نكملو confirmation.";
  }
  if(s.phase==="product"){
    s.phase="verify";
    return `باهي. العنوان هو ${c.address}، والنيميرو ${c.phone}. تحب نأكد الـcommande هكّا؟`;
  }
  if(/Huawei|Oppo|casque|sneakers|t-shirt|écouteurs|montre|sac/i.test(text)){
    return `إي، عندك ${orderSummary(o)}. تحب تبدّل حاجة في الـcommande؟`;
  }
  return "سمعتك. نجم نراجع معاك produit، quantité، couleur، taille، adresse، numéro ولا prix. شنوة تحب نبدّل؟";
}

app.use(express.static("public"));
app.use(express.json());
app.get("/health",(req,res)=>res.json({ok:true,version:"FINAL-1.0.0",mode:"FREE",database:"local-json"}));
app.get("/api/orders",(req,res)=>res.json(db.orders.map(o=>({id:o.id,status:o.status,customer:customerOf(o)?.name,total:price(o),summary:orderSummary(o)}))));
app.get("/api/orders/:id",(req,res)=>{
  const o=orderOf(req.params.id); if(!o) return res.status(404).json({error:"not found"});
  res.json({...o,customer:customerOf(o),items:o.items.map(i=>({...i,product:productOf(i.productId)})),total:price(o)});
});

wss.on("connection",(ws)=>{
  const sid=Math.random().toString(36).slice(2);
  sessions.set(sid,{orderId:"ORD-DEMO-MULTI",phase:"product",turn:0});
  ws.send(JSON.stringify({type:"ready",sessionId:sid}));
  ws.on("message",(raw)=>{
    try{
      const m=JSON.parse(raw.toString());
      const s=sessions.get(sid); if(!s) return;
      if(m.type==="select"){s.orderId=m.orderId;s.phase="product";s.turn=0;ws.send(JSON.stringify({type:"state",state:s}));return;}
      if(m.type==="start"){
        s.phase="product"; s.turn=0;
        const o=orderOf(s.orderId);
        ws.send(JSON.stringify({type:"assistant",text:askOpening(o)}));
        ws.send(JSON.stringify({type:"state",state:s,order:orderOf(s.orderId)})); return;
      }
      if(m.type==="user"){
        const text=String(m.text||"").trim(); if(!text)return;
        ws.send(JSON.stringify({type:"user",text}));
        const r=reply(s,text);
        ws.send(JSON.stringify({type:"assistant",text:r}));
        ws.send(JSON.stringify({type:"state",state:s,order:orderOf(s.orderId),customer:customerOf(orderOf(s.orderId))}));
      }
    }catch(e){ ws.send(JSON.stringify({type:"error",message:e.message})); }
  });
  ws.on("close",()=>sessions.delete(sid));
});

server.listen(PORT,"0.0.0.0",()=>console.log(`Ordely FINAL running on ${PORT}`));
