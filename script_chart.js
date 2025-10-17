/*
script_chart.js  – patched for GitHub Pages (CORS-safe)
– uses https://data.binance.com  (public endpoint, no-CORS issues)
– keeps your read-only key in headers (optional)
*/
const BINANCE_API_KEY = "O8rmKGFBvpqWzqZlAksLEOzvf7ahjVIgpL0SSsRRuki6Kb9tyJZ7BxJ7i6WvLp8r"; // ← your key
const ctx = document.getElementById('candlesChart').getContext('2d');
let candlesChart = null;
let lastRecommendation = null;

/* ---------- helpers ---------- */
const toCandleData = k => k.map(d => ({
  x: new Date(d[0]),
  o: parseFloat(d[1]),
  h: parseFloat(d[2]),
  l: parseFloat(d[3]),
  c: parseFloat(d[4])
}));

/* ---------- chart ---------- */
function createChart(candles){
  if(candlesChart){
    candlesChart.data.datasets[0].data = candles;
    candlesChart.update();
    return;
  }
  candlesChart = new Chart(ctx,{
    type:'candlestick',
    data:{datasets:[{label:'Candles',data:candles}]},
    options:{
      animation:false,
      maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{mode:'index',intersect:false},annotation:{annotations:{}}},
      scales:{
        x:{type:'time',time:{tooltipFormat:'dd MMM yyyy HH:mm'},ticks:{color:'#cfe8ff'}},
        y:{position:'right',ticks:{color:'#cfe8ff'}}
      }
    }
  });
}

/* ---------- annotations ---------- */
function setTradeAnnotations(entry,stop,target){
  if(!candlesChart) return;
  const ann={};
  if(entry!=null) ann.entryLine  ={type:'line',yMin:entry,yMax:entry,borderColor:'rgba(54,144,255,.9)',borderWidth:2,label:{enabled:true,content:'Entry',position:'start',backgroundColor:'rgba(54,144,255,.2)',color:'#e6f5ff'}};
  if(stop !=null) ann.stopLine   ={type:'line',yMin:stop ,yMax:stop ,borderColor:'rgba(255,60,60,.95)',borderWidth:2,label:{enabled:true,content:'Stop Loss',position:'start',backgroundColor:'rgba(255,60,60,.12)',color:'#ffecec'}};
  if(target!=null) ann.targetLine={type:'line',yMin:target,yMax:target,borderColor:'rgba(46,200,120,.95)',borderWidth:2,label:{enabled:true,content:'Take Profit',position:'start',backgroundColor:'rgba(46,200,120,.12)',color:'#eafff0'}};
  candlesChart.options.plugins.annotation.annotations=ann;
  candlesChart.update();
}

/* ---------- Binance call (CORS-safe domain) ---------- */
async function fetchKlines(symbol,interval='1h',limit=200){
  const url = `https://data.binance.com/api/v3/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=${limit}`;
  const headers={};
  if(BINANCE_API_KEY) headers['X-MBX-APIKEY']=BINANCE_API_KEY;
  const res=await fetch(url,{headers});
  if(!res.ok) throw new Error(`Binance API ${res.status} ${res.statusText}`);
  const data=await res.json();
  if(data.code) throw new Error(JSON.stringify(data));
  return data;
}

/* ---------- light recommender ---------- */
function simpleRecommendationFromKlines(symbol,klines){
  const c=klines.map(k=>parseFloat(k[4])); if(c.length<60) return null;
  const ema=(v,p)=>{const k=2/(p+1);let r=v[0];return v.map(x=>r=x*k+r*(1-k))};
  const rsi=(v,p=14)=>{const g=Array(v.length).fill(0),l=Array(v.length).fill(0);
    for(let i=1;i<v.length;i++){const d=v[i]-v[i-1];g[i]=Math.max(0,d);l[i]=Math.max(0,-d);}
    let pg=g.slice(1,p+1).reduce((a,b)=>a+b)/p,pl=l.slice(1,p+1).reduce((a,b)=>a+b)/p;
    const rs=i=>i<=p?null:(pg=(pg*(p-1)+g[i])/p,pl=(pl*(p-1)+l[i])/p,100-100/(1+pg/pl));
    return v.map((_,i)=>rs(i));
  };
  const ema12=ema(c,12),ema26=ema(c,26);
  const lastE12=ema12[ema12.length-1],lastE26=ema26[ema26.length-1],lastRsi=(rsi(c).pop()||50);
  const high=klines.map(k=>parseFloat(k[2])),low=klines.map(k=>parseFloat(k[3]));
  const atrArr=[];
  for(let i=1;i<c.length;i++){const tr=Math.max(high[i]-low[i],Math.abs(high[i]-c[i-1]),Math.abs(low[i]-c[i-1]));atrArr.push(tr);}
  const atr=atrArr.slice(-14).reduce((a,b)=>a+b,0)/14||(Math.max(...high)-Math.min(...low))/50;
  let score=0; if(lastE12>lastE26) score++; if(lastRsi>50&&lastRsi<75) score++;
  const last=c[c.length-1]; let signal=null,entry=null,stop=null,target=null;
  if(lastE12>lastE26&&score>=1){ signal='شراء'; entry=last; stop=+(entry-1.5*atr).toFixed(8); target=+(entry+2.5*(entry-stop)).toFixed(8);}
  else if(lastE12<lastE26&&score<=0){ signal='بيع'; entry=last; stop=+(entry+1.5*atr).toFixed(8); target=+(entry-2.5*(stop-entry)).toFixed(8);}
  return signal? {coin:symbol,signal,entry,stop,target,score,lastRsi,atr}:null;
}

/* ---------- UI ---------- */
const $=id=>document.getElementById(id);
const symbolInput=$('symbolInput'),updateBtn=$('updateChartBtn'),recBtn=$('showLastRecBtn');
const intervalSel=$('chartInterval'),limitSel=$('chartLimit'),title=$('chartTitle'),sub=$('chartSubtitle');

async function updateForSymbol(sym){
  try{
    title.textContent=sym.toUpperCase();
    sub.textContent='جاري جلب الشموع من Binance...';
    const klines=await fetchKlines(sym,intervalSel.value,parseInt(limitSel.value,10));
    const candles=toCandleData(klines);
    createChart(candles);
    sub.textContent=`آخر ${candles.length} شمعة — interval ${intervalSel.value}`;
    const rec=simpleRecommendationFromKlines(sym,klines);
    lastRecommendation=rec;
    if(rec){
      setTradeAnnotations(rec.entry,rec.stop,rec.target);
      sub.textContent+=` — توصية: ${rec.signal} (درجة ${rec.score})`;
    }else{
      setTradeAnnotations(null,null,null);
      sub.textContent+=' — لا توجد توصية قوية حاليًا';
    }
  }catch(err){
    let msg=err.message||String(err);
    if(msg.includes('Failed to fetch')||msg.includes('NetworkError'))
      msg='لا يمكن الوصول لـ Binance – تأكد من اتصالك أو من HTTPS';
    sub.textContent='خطأ في جلب البيانات: '+msg;
  }
}

updateBtn.addEventListener('click',()=>{
  const s=symbolInput.value.trim().toUpperCase();
  if(!s){alert('ادخل رمز زوج مثل BTCUSDT');return;}
  updateForSymbol(s);
});
recBtn.addEventListener('click',()=>{
  if(!candlesChart){alert('لم يتم تحميل المخطط بعد');return;}
  if(!lastRecommendation){alert('لا توصية حالياً');return;}
  setTradeAnnotations(lastRecommendation.entry,lastRecommendation.stop,lastRecommendation.target);
});

/* ---------- تفعيل أولي ---------- */
symbolInput.value='BTCUSDT';
updateForSymbol('BTCUSDT');
