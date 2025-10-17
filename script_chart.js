/*
script_chart.js ( patched )
- جميع الروابط أصبحت https://
- رسالة خطأ صريحة عند فشل الاتصال
- لا تغيير على المنطق أو البنية
*/
const BINANCE_API_KEY = "O8rmKGFBvpqWzqZlAksLEOzvf7ahjVIgpL0SSsRRuki6Kb9tyJZ7BxJ7i6WvLp8r";   // اتركه فارغاً أو ضع مفتاح القراءة فقط
const ctx = document.getElementById('candlesChart').getContext('2d');
let candlesChart = null;
let lastRecommendation = null;

// ----------------- Helpers -----------------
function toCandleData(klines){
  return klines.map(k=>({
    x: new Date(k[0]),
    o: parseFloat(k[1]),
    h: parseFloat(k[2]),
    l: parseFloat(k[3]),
    c: parseFloat(k[4])
  }));
}

// ----------------- Chart creation -----------------
function createChart(candles){
  if(candlesChart){
    candlesChart.data.datasets[0].data = candles;
    candlesChart.update();
    return;
  }
  candlesChart = new Chart(ctx, {
    type: 'candlestick',
    data:{ datasets:[{ label:'Candles', data:candles }] },
    options:{
      animation:false,
      maintainAspectRatio:false,
      plugins:{
        legend:{display:false},
        tooltip:{mode:'index',intersect:false},
        annotation:{annotations:{}}
      },
      scales:{
        x:{ type:'time', time:{tooltipFormat:'dd MMM yyyy HH:mm'}, ticks:{color:'#cfe8ff'} },
        y:{ position:'right', ticks:{color:'#cfe8ff'} }
      }
    }
  });
}

// ----------------- Annotations -----------------
function setTradeAnnotations(entry,stop,target){
  if(!candlesChart) return;
  const ann={};
  if(entry!=null) ann.entryLine = {type:'line',yMin:entry,yMax:entry,borderColor:'rgba(54,144,255,0.9)',borderWidth:2,label:{enabled:true,content:'Entry',position:'start',backgroundColor:'rgba(54,144,255,0.2)',color:'#e6f5ff'}};
  if(stop !=null) ann.stopLine  = {type:'line',yMin:stop ,yMax:stop ,borderColor:'rgba(255,60,60,0.95)',borderWidth:2,label:{enabled:true,content:'Stop Loss',position:'start',backgroundColor:'rgba(255,60,60,0.12)',color:'#ffecec'}};
  if(target!=null) ann.targetLine= {type:'line',yMin:target,yMax:target,borderColor:'rgba(46,200,120,0.95)',borderWidth:2,label:{enabled:true,content:'Take Profit',position:'start',backgroundColor:'rgba(46,200,120,0.12)',color:'#eafff0'}};
  candlesChart.options.plugins.annotation.annotations = ann;
  candlesChart.update();
}

// ----------------- Binance call (HTTPS only) -----------------
async function fetchKlines(symbol, interval='1h', limit=200){
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=${limit}`;
  const headers = {};
  if(BINANCE_API_KEY) headers['X-MBX-APIKEY'] = BINANCE_API_KEY;

  const resp = await fetch(url, {headers});
  if(!resp.ok) throw new Error(`Binance API ${resp.status} ${resp.statusText}`);
  const data = await resp.json();
  if(data && data.code) throw new Error(JSON.stringify(data));
  return data;
}

// ----------------- Lightweight recommender -----------------
function simpleRecommendationFromKlines(symbol,klines){
  const close = klines.map(k=>parseFloat(k[4]));
  if(close.length<60) return null;

  const ema=(v,p)=>{const o=[],k=2/(p+1);let r=v[0];o.push(r);for(let i=1;i<v.length;i++){r=v[i]*k+r*(1-k);o.push(r);}return o;};
  const rsi=(v,p=14)=>{const o=Array(v.length).fill(null);let g=0,l=0,pg,pl;for(let i=1;i<v.length;i++){const d=v[i]-v[i-1],gt=Math.max(0,d),lt=Math.max(0,-d);if(i<=p){g+=gt;l+=lt;if(i===p){pg=g/p;pl=l/p;o[i]=100-100/(1+pg/pl);}}else{pg=(pg*(p-1)+gt)/p;pl=(pl*(p-1)+lt)/p;o[i]=100-100/(1+pg/pl);}}return o;};

  const ema12=ema(close,12), ema26=ema(close,26);
  const lastE12=ema12[ema12.length-1], lastE26=ema26[ema26.length-1];
  const lastRsi=(rsi(close,14).pop()||50);

  const high=klines.map(k=>parseFloat(k[2])), low=klines.map(k=>parseFloat(k[3]));
  const atrArr=[]; for(let i=1;i<close.length;i++){const tr=Math.max(high[i]-low[i],Math.abs(high[i]-close[i-1]),Math.abs(low[i]-close[i-1]));atrArr.push(tr);}
  const atr=atrArr.slice(-14).reduce((a,b)=>a+b,0)/14 || (Math.max(...high)-Math.min(...low))/50;

  let score=0; if(lastE12>lastE26) score++; if(lastRsi>50&&lastRsi<75) score++;
  let signal=null,entry=null,stop=null,target=null;
  const last=close[close.length-1];

  if(lastE12>lastE26&&score>=1){
    signal='شراء'; entry=last; stop=+(entry-1.5*atr).toFixed(8); target=+(entry+2.5*(entry-stop)).toFixed(8);
  }else if(lastE12<lastE26&&score<=0){
    signal='بيع';  entry=last; stop=+(entry+1.5*atr).toFixed(8); target=+(entry-2.5*(stop-entry)).toFixed(8);
  }
  return signal? {coin:symbol,signal,entry,stop,target,score,lastRsi,atr} : null;
}

// ----------------- UI wiring -----------------
const symbolInput=document.getElementById('symbolInput');
const updateChartBtn=document.getElementById('updateChartBtn');
const showLastRecBtn=document.getElementById('showLastRecBtn');
const chartInterval=document.getElementById('chartInterval');
const chartLimit =document.getElementById('chartLimit');
const chartTitle=document.getElementById('chartTitle');
const chartSubtitle=document.getElementById('chartSubtitle');

async function updateForSymbol(symbol){
  try{
    chartTitle.textContent=symbol.toUpperCase();
    chartSubtitle.textContent='جاري جلب الشموع من Binance...';
    const klines=await fetchKlines(symbol,chartInterval.value,parseInt(chartLimit.value,10));
    const candles=toCandleData(klines);
    createChart(candles);
    chartSubtitle.textContent=`آخر ${candles.length} شمعة — interval ${chartInterval.value}`;
    const rec=simpleRecommendationFromKlines(symbol,klines);
    lastRecommendation=rec;
    if(rec){
      setTradeAnnotations(rec.entry,rec.stop,rec.target);
      chartSubtitle.textContent+=` — توصية: ${rec.signal} (درجة ${rec.score})`;
    }else{
      setTradeAnnotations(null,null,null);
      chartSubtitle.textContent+=' — لا توجد توصية قوية حاليًا';
    }
  }catch(err){
    let msg=err.message||String(err);
    if(msg.includes('Failed to fetch')||msg.includes('NetworkError'))
      msg='لا يمكن الوصول لـ Binance – تأكد من اتصالك أو من HTTPS';
    chartSubtitle.textContent='خطأ في جلب البيانات: '+msg;
  }
}

updateChartBtn.addEventListener('click',()=>{
  const s=symbolInput.value.trim().toUpperCase();
  if(!s){alert('ادخل رمز زوج مثل BTCUSDT');return;}
  updateForSymbol(s);
});
showLastRecBtn.addEventListener('click',()=>{
  if(!candlesChart){alert('لم يتم تحميل المخطط بعد');return;}
  if(!lastRecommendation){alert('لا توصية حالياً');return;}
  setTradeAnnotations(lastRecommendation.entry,lastRecommendation.stop,lastRecommendation.target);
});

// تشغيل تلقائي أولي
symbolInput.value='BTCUSDT';
updateForSymbol('BTCUSDT');
