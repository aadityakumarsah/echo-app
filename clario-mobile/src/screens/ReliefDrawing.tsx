/**
 * Air Drawing — MediaPipe Hands via WebView + canvas drawing.
 * Gesture map (identical to web):
 *   index up, others curled  → draw (pen down)
 *   pinch (thumb ≈ index)    → erase
 *   open hand                → move cursor (pen up)
 * Submit → captures canvas as PNG → POST /relief/analyze → Gemini report
 */
import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Animated,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import { supabase } from '../lib/supabase';

const BASE = 'https://echo-yg4t.onrender.com';
const SESSION_SECONDS = 3 * 60;

// ─── report data type ─────────────────────────────────────────────────────────
interface ReportData {
  stress_level: number;
  mental_state: string;
  drawing_analysis: string;
  stress_reduction: number;
  focus_score: number;
  calm_score: number;
  creativity_score: number;
  mood_before: number;
  mood_after: number;
  insights: string[];
  recommendation: string;
}

// ─── WebView HTML ─────────────────────────────────────────────────────────────
const DRAWING_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    *{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent;}
    html,body{width:100%;height:100%;background:#0A0A0F;overflow:hidden;touch-action:none;}
    #video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transform:scaleX(-1);opacity:0;}
    #canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none;z-index:10;}
    #loading{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
             flex-direction:column;gap:14px;background:#0A0A0F;z-index:200;
             font-family:-apple-system,sans-serif;color:rgba(255,255,255,0.5);font-size:14px;}
    .spinner{width:34px;height:34px;border:3px solid rgba(167,139,250,0.25);
             border-top-color:#A78BFA;border-radius:50%;animation:spin 0.8s linear infinite;}
    @keyframes spin{to{transform:rotate(360deg);}}
    #cursor{position:absolute;pointer-events:none;z-index:50;border-radius:50%;
            transform:translate(-50%,-50%);display:none;transition:width 0.1s,height 0.1s;}
    #topbar{position:absolute;top:0;left:0;right:0;z-index:40;display:flex;align-items:flex-start;
            justify-content:space-between;padding:14px 16px;
            background:linear-gradient(to bottom,rgba(10,10,15,0.88),transparent);}
    #timer-wrap{display:flex;flex-direction:column;align-items:center;gap:5px;}
    #timer{color:#fff;font-family:-apple-system,sans-serif;font-size:14px;font-weight:600;
           letter-spacing:0.5px;}
    #timer-bar-bg{width:90px;height:3px;background:rgba(255,255,255,0.1);border-radius:2px;}
    #timer-bar{height:100%;border-radius:2px;background:#A78BFA;width:100%;}
    .icon-btn{width:38px;height:38px;border-radius:19px;background:rgba(0,0,0,0.5);
              border:1px solid rgba(255,255,255,0.15);display:flex;align-items:center;
              justify-content:center;cursor:pointer;font-size:16px;user-select:none;}
    .top-right{display:flex;gap:8px;}
    #mode-hint{position:absolute;bottom:168px;left:0;right:0;text-align:center;z-index:40;
               pointer-events:none;font-family:-apple-system,sans-serif;font-size:12px;
               color:rgba(255,255,255,0.3);}
    #bottombar{position:absolute;bottom:0;left:0;right:0;z-index:40;
               padding:12px 16px 32px;
               background:linear-gradient(to top,rgba(10,10,15,0.92),transparent);}
    #colors{display:flex;justify-content:center;gap:12px;margin-bottom:12px;}
    .cdot{width:28px;height:28px;border-radius:50%;border:2.5px solid transparent;
          cursor:pointer;transition:transform 0.12s;}
    .cdot.active{border-color:#fff;transform:scale(1.22);}
    #bottom-row{display:flex;align-items:center;justify-content:space-between;}
    #brushes{display:flex;gap:8px;align-items:center;}
    .bbtn{width:40px;height:40px;border-radius:20px;background:rgba(0,0,0,0.45);
          border:1px solid rgba(255,255,255,0.12);display:flex;align-items:center;
          justify-content:center;cursor:pointer;}
    .bbtn.active{border-color:#A78BFA;background:rgba(167,139,250,0.2);}
    .bdot{border-radius:50%;background:rgba(255,255,255,0.45);}
    .bbtn.active .bdot{background:#A78BFA;opacity:1;}
    #analyse-btn{display:flex;align-items:center;gap:8px;padding:11px 20px;border-radius:22px;
                 background:rgba(167,139,250,0.22);border:1px solid rgba(167,139,250,0.5);
                 cursor:pointer;font-family:-apple-system,sans-serif;font-size:14px;
                 font-weight:600;color:#fff;-webkit-appearance:none;}
    #analyse-btn:disabled{opacity:0.32;cursor:default;}
    #err{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
         flex-direction:column;gap:14px;background:#0A0A0F;z-index:200;
         font-family:-apple-system,sans-serif;text-align:center;padding:32px;}
    #err p{color:rgba(255,255,255,0.55);font-size:13px;line-height:1.7;}
    #err-title{color:#F87171;font-size:15px;font-weight:600;margin-bottom:4px;}
  </style>
</head>
<body>
  <div id="loading"><div class="spinner"></div><span id="loading-text">Starting camera…</span></div>
  <div id="err" style="display:none">
    <p id="err-title">Camera unavailable</p>
    <p id="err-msg">MediaPipe requires camera access. Make sure the app has camera permission.</p>
  </div>
  <video id="video" playsinline autoplay muted></video>
  <canvas id="canvas"></canvas>
  <div id="cursor"></div>

  <div id="topbar">
    <div id="timer-wrap">
      <div id="timer">3:00</div>
      <div id="timer-bar-bg"><div id="timer-bar"></div></div>
    </div>
    <div class="top-right">
      <div class="icon-btn" id="undo-btn">↩</div>
      <div class="icon-btn" id="clear-btn">🗑</div>
    </div>
  </div>

  <div id="mode-hint">☝️ Point to draw · Pinch to erase · Open hand to move</div>

  <div id="bottombar">
    <div id="colors"></div>
    <div id="bottom-row">
      <div id="brushes"></div>
      <button id="analyse-btn" disabled>✈️ Analyse</button>
    </div>
  </div>

  <script>
    function send(o){try{window.ReactNativeWebView.postMessage(JSON.stringify(o));}catch(e){}}
    var COLORS=['#A78BFA','#60A5FA','#34D399','#F472B6','#FBBF24','#F87171','#fff'];
    var BRUSHES=[3,5,9,15];
    var color=COLORS[0],brushSize=5;
    var colorRef=color,brushRef=brushSize;
    var history=[],strokeCount=0,hasDrawn=false;
    var prevPt=null,frameCount=0,lastSaveAt=0;
    var elapsed=0,timerInterval=null;
    var videoEl=document.getElementById('video');
    var canvasEl=document.getElementById('canvas');
    var ctx=canvasEl.getContext('2d');
    var cursorEl=document.getElementById('cursor');
    var loadingEl=document.getElementById('loading');
    var errEl=document.getElementById('err');
    var timerEl=document.getElementById('timer');
    var timerBarEl=document.getElementById('timer-bar');
    var analyseBtn=document.getElementById('analyse-btn');
    var modeEl=document.getElementById('mode-hint');

    // ─── color palette ───────────────────────────────────────────────────────
    var colorsDiv=document.getElementById('colors');
    COLORS.forEach(function(c,i){
      var d=document.createElement('div');
      d.className='cdot'+(i===0?' active':'');
      d.style.backgroundColor=c;
      d.onclick=function(){
        document.querySelectorAll('.cdot').forEach(function(x){x.classList.remove('active');});
        d.classList.add('active');
        colorRef=c;
      };
      colorsDiv.appendChild(d);
    });

    // ─── brush sizes ─────────────────────────────────────────────────────────
    var brushDiv=document.getElementById('brushes');
    BRUSHES.forEach(function(s,i){
      var btn=document.createElement('div');
      btn.className='bbtn'+(s===5?' active':'');
      var dot=document.createElement('div');
      dot.className='bdot';
      var dotSize=Math.min(s*1.2,18);
      dot.style.cssText='width:'+dotSize+'px;height:'+dotSize+'px;';
      btn.appendChild(dot);
      btn.onclick=function(){
        document.querySelectorAll('.bbtn').forEach(function(x){x.classList.remove('active');});
        btn.classList.add('active');
        brushRef=s;
      };
      brushDiv.appendChild(btn);
    });

    // ─── canvas resize ───────────────────────────────────────────────────────
    function resizeCanvas(){
      var img=ctx.getImageData(0,0,canvasEl.width,canvasEl.height);
      canvasEl.width=window.innerWidth;
      canvasEl.height=window.innerHeight;
      ctx.putImageData(img,0,0);
    }
    resizeCanvas();
    window.addEventListener('resize',resizeCanvas);

    // ─── undo / clear ────────────────────────────────────────────────────────
    function saveHistory(){
      history.push(ctx.getImageData(0,0,canvasEl.width,canvasEl.height));
      if(history.length>30)history.shift();
    }
    document.getElementById('undo-btn').onclick=function(){
      if(history.length){ctx.putImageData(history.pop(),0,0);}
    };
    document.getElementById('clear-btn').onclick=function(){
      saveHistory();
      ctx.clearRect(0,0,canvasEl.width,canvasEl.height);
      hasDrawn=false;
      analyseBtn.disabled=true;
    };

    // ─── timer ───────────────────────────────────────────────────────────────
    function startTimer(){
      timerInterval=setInterval(function(){
        elapsed++;
        var left=Math.max(0,${SESSION_SECONDS}-elapsed);
        timerEl.textContent=Math.floor(left/60)+':'+(left%60<10?'0':'')+(left%60);
        timerBarEl.style.width=((left/${SESSION_SECONDS})*100)+'%';
      },1000);
    }

    // ─── analyse ─────────────────────────────────────────────────────────────
    analyseBtn.onclick=function(){
      if(!hasDrawn)return;
      // Flatten canvas (dark bg)
      var flat=document.createElement('canvas');
      flat.width=Math.min(800,canvasEl.width);
      flat.height=Math.round(canvasEl.height*(flat.width/canvasEl.width));
      var fCtx=flat.getContext('2d');
      fCtx.fillStyle='#0A0A0F';
      fCtx.fillRect(0,0,flat.width,flat.height);
      fCtx.drawImage(canvasEl,0,0,flat.width,flat.height);
      send({type:'CANVAS',data:flat.toDataURL('image/png')});
    };

    // ─── MediaPipe Hands ─────────────────────────────────────────────────────
    var scriptsLoaded=0;
    function onScriptLoad(){
      scriptsLoaded++;
      if(scriptsLoaded===2)initHands();
    }
    function onScriptError(name){
      errEl.querySelector('#err-msg').textContent='Failed to load '+name+'. Check your internet connection.';
      loadingEl.style.display='none';
      errEl.style.display='flex';
      send({type:'ERROR',message:'script failed: '+name});
    }

    // ─── fallback timeout ────────────────────────────────────────────────────
    var loadTimer=setTimeout(function(){
      if(loadingEl.style.display!=='none'){
        errEl.querySelector('#err-msg').textContent='MediaPipe timed out. Check your internet and reload.';
        loadingEl.style.display='none';
        errEl.style.display='flex';
        send({type:'ERROR',message:'timeout'});
      }
    },20000);

    function isIndexPointing(lm){
      return lm[8].y<lm[6].y && lm[12].y>lm[10].y && lm[16].y>lm[14].y && lm[20].y>lm[18].y;
    }
    function isPinching(lm){
      var dx=lm[4].x-lm[8].x,dy=lm[4].y-lm[8].y;
      return Math.sqrt(dx*dx+dy*dy)<0.07;
    }

    function initHands(){
      if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){
        errEl.querySelector('#err-msg').textContent='Camera not available in this WebView.';
        loadingEl.style.display='none';
        errEl.style.display='flex';
        send({type:'ERROR',message:'getUserMedia not supported'});
        return;
      }
      var hands=new Hands({
        locateFile:function(f){return 'https://cdn.jsdelivr.net/npm/@mediapipe/hands/'+f;}
      });
      hands.setOptions({maxNumHands:1,modelComplexity:0,minDetectionConfidence:0.7,minTrackingConfidence:0.6});

      hands.onResults(function(results){
        if(!results.multiHandLandmarks||!results.multiHandLandmarks.length){
          prevPt=null;
          cursorEl.style.display='none';
          modeEl.textContent='☝️ Point to draw · Pinch to erase · Open hand to move';
          return;
        }
        var lm=results.multiHandLandmarks[0];
        var x=(1-lm[8].x)*window.innerWidth;
        var y=lm[8].y*window.innerHeight;

        cursorEl.style.display='block';
        cursorEl.style.left=x+'px';
        cursorEl.style.top=y+'px';

        var pinching=isPinching(lm);
        var pointing=!pinching&&isIndexPointing(lm);

        if(pinching){
          modeEl.textContent='🫥 Erasing';
          cursorEl.style.width='44px';cursorEl.style.height='44px';
          cursorEl.style.border='2px solid #F87171';
          cursorEl.style.background='transparent';
          ctx.save();
          ctx.globalCompositeOperation='destination-out';
          ctx.beginPath();
          ctx.arc(x,y,22,0,Math.PI*2);
          ctx.fill();
          ctx.restore();
          prevPt=null;
        } else if(pointing){
          modeEl.textContent='✏️ Drawing';
          cursorEl.style.width='16px';cursorEl.style.height='16px';
          cursorEl.style.border='2px solid '+colorRef;
          cursorEl.style.background=colorRef+'44';
          frameCount++;
          if(frameCount-lastSaveAt>40){saveHistory();lastSaveAt=frameCount;}
          if(prevPt){
            ctx.beginPath();
            ctx.moveTo(prevPt.x,prevPt.y);
            ctx.lineTo(x,y);
            ctx.strokeStyle=colorRef;
            ctx.lineWidth=brushRef;
            ctx.lineCap='round';
            ctx.lineJoin='round';
            ctx.stroke();
          }
          prevPt={x:x,y:y};
          if(!hasDrawn){
            hasDrawn=true;
            analyseBtn.disabled=false;
          }
        } else {
          modeEl.textContent='☝️ Point to draw · Pinch to erase';
          cursorEl.style.width='12px';cursorEl.style.height='12px';
          cursorEl.style.border='2px solid rgba(255,255,255,0.5)';
          cursorEl.style.background='transparent';
          prevPt=null;
        }
      });

      var camera=new Camera(videoEl,{
        onFrame:function(){return hands.send({image:videoEl});},
        width:1280,height:720
      });
      camera.start().then(function(){
        clearTimeout(loadTimer);
        loadingEl.style.display='none';
        videoEl.style.opacity='0.3';
        startTimer();
        send({type:'READY'});
      }).catch(function(e){
        errEl.querySelector('#err-msg').textContent='Camera blocked: '+e.message;
        loadingEl.style.display='none';
        errEl.style.display='flex';
        send({type:'ERROR',message:e.message});
      });
    }
  </script>
  <script src="https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils@0.3.1675466862/camera_utils.js"
    crossorigin="anonymous" onload="onScriptLoad()" onerror="onScriptError('camera_utils')"></script>
  <script src="https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js"
    crossorigin="anonymous" onload="onScriptLoad()" onerror="onScriptError('hands')"></script>
</body>
</html>`;

// ─── Drawing Report component ─────────────────────────────────────────────────
function StressLabel(v: number): { label: string; color: string } {
  if (v <= 2) return { label: 'High Stress', color: '#F87171' };
  if (v <= 4) return { label: 'Elevated', color: '#FBBF24' };
  if (v <= 6) return { label: 'Moderate', color: '#60A5FA' };
  if (v <= 8) return { label: 'Calm', color: '#34D399' };
  return { label: 'Very Calm', color: '#A78BFA' };
}

function DrawingReport({ data, onClose }: { data: ReportData; onClose: () => void }) {
  const info = StressLabel(data.stress_level);
  const BARS = [
    { label: 'Stress Reduction', value: data.stress_reduction, color: '#A78BFA' },
    { label: 'Focus',            value: data.focus_score,      color: '#60A5FA' },
    { label: 'Calm Level',       value: data.calm_score,       color: '#34D399' },
    { label: 'Creativity',       value: data.creativity_score, color: '#F472B6' },
  ];

  const circumference = 2 * Math.PI * 32;

  return (
    <View style={rpt.root}>
      <ScrollView style={rpt.scroll} contentContainerStyle={rpt.content} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={rpt.header}>
          <View>
            <Text style={rpt.eyebrow}>AI Drawing Analysis</Text>
            <Text style={rpt.title}>Stress Report</Text>
            <Text style={rpt.subhead}>Powered by Gemini Vision</Text>
          </View>
          <TouchableOpacity style={rpt.closeBtn} onPress={onClose} activeOpacity={0.8}>
            <Text style={rpt.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Stress hero */}
        <View style={[rpt.heroCard, { backgroundColor: info.color + '14', borderColor: info.color + '40' }]}>
          {/* Dial via border trick */}
          <View style={rpt.dial}>
            <View style={[rpt.dialOuter, { borderColor: 'rgba(255,255,255,0.07)' }]} />
            <View style={[rpt.dialFill, {
              borderColor: info.color,
              transform: [{ rotate: `${(data.stress_level / 10) * 360 - 90}deg` }],
            }]} />
            <Text style={[rpt.dialValue, { color: info.color }]}>{data.stress_level}</Text>
          </View>
          <View style={rpt.heroText}>
            <Text style={rpt.heroState}>{data.mental_state}</Text>
            <Text style={[rpt.heroLabel, { color: info.color }]}>{info.label}</Text>
            <Text style={rpt.heroAnalysis}>{data.drawing_analysis}</Text>
          </View>
        </View>

        {/* Metric bars */}
        <View style={rpt.card}>
          {BARS.map((b) => (
            <View key={b.label} style={rpt.barRow}>
              <View style={rpt.barLabelRow}>
                <Text style={rpt.barLabel}>{b.label}</Text>
                <Text style={[rpt.barValue, { color: b.color }]}>{b.value}%</Text>
              </View>
              <View style={rpt.barBg}>
                <View style={[rpt.barFill, { width: `${b.value}%` as any, backgroundColor: b.color }]} />
              </View>
            </View>
          ))}
        </View>

        {/* Mood chart (text-based for RN) */}
        <View style={rpt.card}>
          <Text style={rpt.cardLabel}>Mood shift during session</Text>
          <View style={rpt.moodRow}>
            <View style={rpt.moodBubble}>
              <Text style={[rpt.moodNum, { color: '#F87171' }]}>{data.mood_before}</Text>
              <Text style={rpt.moodSub}>before</Text>
            </View>
            <View style={rpt.moodArrow}>
              {Array.from({ length: 5 }).map((_, i) => (
                <View
                  key={i}
                  style={[rpt.moodDot, {
                    backgroundColor: i < 2 ? '#F87171' : i < 4 ? '#60A5FA' : '#34D399',
                    opacity: 0.4 + i * 0.15,
                  }]}
                />
              ))}
            </View>
            <View style={rpt.moodBubble}>
              <Text style={[rpt.moodNum, { color: '#34D399' }]}>{data.mood_after}</Text>
              <Text style={rpt.moodSub}>after</Text>
            </View>
          </View>
          <Text style={rpt.moodDelta}>
            {data.mood_after > data.mood_before
              ? `+${data.mood_after - data.mood_before} mood lift ↑`
              : `${data.mood_after - data.mood_before} mood change`}
          </Text>
        </View>

        {/* Insights */}
        {data.insights.length > 0 && (
          <View style={rpt.card}>
            <Text style={rpt.cardLabel}>✦ Gemini Insights</Text>
            {data.insights.map((text, i) => (
              <View key={i} style={rpt.insightRow}>
                <Text style={rpt.bullet}>·</Text>
                <Text style={rpt.insightText}>{text}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Recommendation */}
        {!!data.recommendation && (
          <View style={[rpt.card, rpt.recCard]}>
            <Text style={rpt.recLabel}>Recommendation</Text>
            <Text style={rpt.recText}>{data.recommendation}</Text>
          </View>
        )}

        <TouchableOpacity style={rpt.backBtn} onPress={onClose} activeOpacity={0.8}>
          <Text style={rpt.backBtnText}>Draw Again</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

// ─── main screen ──────────────────────────────────────────────────────────────
export default function ReliefDrawing() {
  const router = useRouter();
  const [phase, setPhase] = useState<'draw' | 'analyzing' | 'report' | 'error'>('draw');
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const spinAnim = useRef(new Animated.Value(0)).current;

  const startSpin = () => {
    Animated.loop(
      Animated.timing(spinAnim, { toValue: 1, duration: 900, useNativeDriver: true })
    ).start();
  };

  const handleWebViewMessage = async (event: { nativeEvent: { data: string } }) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'READY') {
        // Camera + hands ready — nothing to do
      } else if (msg.type === 'ERROR') {
        // MediaPipe failed — show error state
        setErrorMsg(msg.message ?? 'Camera unavailable');
        setPhase('error');
      } else if (msg.type === 'CANVAS') {
        // User tapped Analyse — call backend
        setPhase('analyzing');
        startSpin();
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const res = await fetch(`${BASE}/relief/analyze`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
            },
            body: JSON.stringify({ image: msg.data }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail ?? `Server error ${res.status}`);
          }
          const data: ReportData = await res.json();
          setReportData(data);
          setPhase('report');
        } catch (e: any) {
          Alert.alert('Analysis failed', e.message ?? 'Could not analyse your drawing. Try again.');
          setPhase('draw');
        }
      }
    } catch { /* ignore non-JSON */ }
  };

  if (phase === 'report' && reportData) {
    return (
      <DrawingReport
        data={reportData}
        onClose={() => {
          setReportData(null);
          setPhase('draw');
        }}
      />
    );
  }

  if (phase === 'analyzing') {
    return (
      <View style={styles.analyzeScreen}>
        <View style={styles.analyzeInner}>
          <View style={styles.analyzeSpinners}>
            <Animated.View style={[styles.spinRing, styles.spinRingOuter, {
              transform: [{ rotate: spinAnim.interpolate({ inputRange: [0,1], outputRange: ['0deg','360deg'] }) }],
            }]} />
            <Animated.View style={[styles.spinRing, styles.spinRingInner, {
              transform: [{ rotate: spinAnim.interpolate({ inputRange: [0,1], outputRange: ['360deg','0deg'] }) }],
            }]} />
          </View>
          <Text style={styles.analyzeTitle}>Analyzing your drawing…</Text>
          <Text style={styles.analyzeSub}>Gemini is reading your strokes</Text>
        </View>
      </View>
    );
  }

  if (phase === 'error') {
    return (
      <View style={styles.analyzeScreen}>
        <SafeAreaView>
          <TouchableOpacity style={styles.errorBack} onPress={() => router.back()} activeOpacity={0.7}>
            <Text style={styles.errorBackText}>← back</Text>
          </TouchableOpacity>
        </SafeAreaView>
        <View style={styles.analyzeInner}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>📵</Text>
          <Text style={[styles.analyzeTitle, { color: '#F87171' }]}>Camera unavailable</Text>
          <Text style={[styles.analyzeSub, { maxWidth: 280, textAlign: 'center', lineHeight: 20 }]}>
            {errorMsg || 'MediaPipe could not access the camera. Check your internet connection and camera permission.'}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <WebView
        source={{ html: DRAWING_HTML, baseUrl: 'http://localhost' }}
        onMessage={handleWebViewMessage}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={['*']}
        mediaCapturePermissionGrantType="grant"
        onPermissionRequest={(req: any) => req.grant(req.resources)}
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
        mixedContentMode="always"
        style={StyleSheet.absoluteFill}
      />
      {/* Native back button overlaid on top-left */}
      <SafeAreaView style={styles.backOverlay} pointerEvents="box-none">
        <TouchableOpacity style={styles.backBtn2} onPress={() => router.back()} activeOpacity={0.8}>
          <Text style={styles.backBtn2Text}>✕</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </View>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A0A0F' },

  analyzeScreen: {
    flex: 1, backgroundColor: '#0A0A0F',
    alignItems: 'center', justifyContent: 'center',
  },
  analyzeInner: { alignItems: 'center', gap: 14, paddingHorizontal: 32 },
  analyzeSpinners: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  spinRing: {
    position: 'absolute', borderRadius: 99, borderWidth: 2.5,
    borderTopColor: 'transparent',
  },
  spinRingOuter: {
    width: 64, height: 64,
    borderColor: '#A78BFA', borderTopColor: 'transparent',
  },
  spinRingInner: {
    width: 44, height: 44,
    borderColor: '#60A5FA', borderTopColor: 'transparent',
  },
  analyzeTitle: { fontSize: 16, fontWeight: '600', color: '#fff' },
  analyzeSub: { fontSize: 13, color: 'rgba(255,255,255,0.4)' },

  errorBack: { paddingHorizontal: 24, paddingTop: 16 },
  errorBackText: { fontSize: 13, color: 'rgba(255,255,255,0.4)', fontWeight: '500' },

  backOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0,
    paddingTop: 8, paddingLeft: 16,
    flexDirection: 'row',
  },
  backBtn2: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
    marginTop: 8,
  },
  backBtn2Text: { fontSize: 15, color: '#fff' },
});

const rpt = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0F0E0C' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 48, paddingBottom: 60 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  eyebrow: { fontSize: 10, letterSpacing: 4, color: 'rgba(255,255,255,0.3)', marginBottom: 4 },
  title: { fontSize: 24, fontWeight: '700', color: '#fff' },
  subhead: { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  closeBtnText: { fontSize: 14, color: '#fff' },

  heroCard: {
    borderRadius: 20, borderWidth: 1, padding: 20,
    flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 12,
  },
  dial: {
    width: 76, height: 76, alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  dialOuter: {
    position: 'absolute', width: 76, height: 76, borderRadius: 38, borderWidth: 6,
  },
  dialFill: {
    position: 'absolute', width: 76, height: 76, borderRadius: 38, borderWidth: 6,
    borderRightColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: 'transparent',
  },
  dialValue: { fontSize: 22, fontWeight: '700' },
  heroText: { flex: 1 },
  heroState: { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 2 },
  heroLabel: { fontSize: 11, marginBottom: 6 },
  heroAnalysis: { fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 17 },

  card: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
    padding: 20, marginBottom: 12, gap: 14,
  },
  cardLabel: { fontSize: 10, letterSpacing: 3, color: 'rgba(255,255,255,0.35)', marginBottom: 2 },

  barRow: { gap: 8 },
  barLabelRow: { flexDirection: 'row', justifyContent: 'space-between' },
  barLabel: { fontSize: 12, color: 'rgba(255,255,255,0.5)' },
  barValue: { fontSize: 11, fontWeight: '600' },
  barBg: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.07)', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },

  moodRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  moodBubble: { alignItems: 'center' },
  moodNum: { fontSize: 28, fontWeight: '700' },
  moodSub: { fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2 },
  moodArrow: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-evenly',
  },
  moodDot: { width: 8, height: 8, borderRadius: 4 },
  moodDelta: { fontSize: 11, color: '#34D399', textAlign: 'center', marginTop: 4 },

  insightRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  bullet: { fontSize: 16, color: '#A78BFA', lineHeight: 20, marginTop: 1 },
  insightText: { flex: 1, fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 20 },

  recCard: { backgroundColor: 'rgba(52,211,153,0.06)', borderColor: 'rgba(52,211,153,0.18)' },
  recLabel: { fontSize: 10, letterSpacing: 3, color: 'rgba(52,211,153,0.6)', marginBottom: 4 },
  recText: { fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 20 },

  backBtn: {
    marginTop: 8,
    padding: 16, borderRadius: 20,
    backgroundColor: 'rgba(167,139,250,0.12)',
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.3)',
    alignItems: 'center',
  },
  backBtnText: { fontSize: 14, fontWeight: '600', color: '#A78BFA' },
});
