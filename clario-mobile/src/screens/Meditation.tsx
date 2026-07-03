import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Animated, Easing, ScrollView, Switch, Vibration,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, Brain, Check, RefreshCcw, Camera } from 'lucide-react-native';
import { WebView } from 'react-native-webview';
import { colors, fonts, cardShadow } from '../lib/theme';

// ─── constants ────────────────────────────────────────────────────────────────
const HORN_COOLDOWN = 2500;   // ms minimum between alerts
const DURATIONS = [5, 10, 15, 20, 30];
const GUIDANCE = [
  'Find a comfortable seated position and close your eyes.',
  'Breathe in slowly through your nose for four counts.',
  'Notice the sensations in your body without judgment.',
  'When thoughts arise, gently return to your breath.',
  'Feel the rise and fall of your chest with each breath.',
  'You are safe. You are present. You are doing well.',
  'Soften the muscles around your eyes and jaw.',
  'Each exhale is a release. Let go of what doesn\'t serve you.',
];

// ─── audio alert ─────────────────────────────────────────────────────────────
async function playAlert() {
  try {
    const { createAudioPlayer, setAudioModeAsync } = require('expo-audio');
    await setAudioModeAsync({ playsInSilentMode: true, shouldDuckAndroid: true });
    const p = createAudioPlayer(require('../../public/breathe/deepbreadth.m4a'));
    p.volume = 0.9;
    p.play();
    setTimeout(() => { try { p.pause(); p.remove(); } catch {} }, 4000);
  } catch {}
}

// ─── WebView HTML ─────────────────────────────────────────────────────────────
// Uses TF.js MoveNet (WebGL only — no SharedArrayBuffer / WASM required).
// Scripts loaded SEQUENTIALLY to avoid the parallel race-condition bug.
//
// Visual: camera feed + skeleton overlay + radial glow aura when in lotus pose.
// (True pixel-level segmentation would require a second model download; the
//  glow effect achieves the same atmospheric result without the extra weight.)
//
// MoveNet COCO keypoint indices used here:
//   5=lShoulder  6=rShoulder  11=lHip  12=rHip  13=lKnee  14=rKnee  15=lAnkle  16=rAnkle
// ─────────────────────────────────────────────────────────────────────────────
const MEDITATION_HTML = `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
*{margin:0;padding:0;box-sizing:border-box;}
html,body{width:100%;height:100%;background:#060F1E;overflow:hidden;font-family:-apple-system,sans-serif;}
#video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transform:scaleX(-1);opacity:0;}
#canvas{position:absolute;inset:0;width:100%;height:100%;transform:scaleX(-1);}
#status{position:absolute;top:10px;left:50%;transform:translateX(-50%);
        background:rgba(0,0,0,0.65);color:#fff;padding:5px 14px;border-radius:14px;
        font-size:13px;white-space:nowrap;pointer-events:none;z-index:20;transition:color .25s;}
#loading{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
         flex-direction:column;gap:12px;background:#060F1E;z-index:100;
         color:rgba(255,255,255,.6);font-size:14px;}
.sp{width:32px;height:32px;border:3px solid rgba(93,176,117,.3);border-top-color:#5DB075;
    border-radius:50%;animation:spin .8s linear infinite;}
@keyframes spin{to{transform:rotate(360deg);}}
</style>
</head>
<body>
<div id="loading"><div class="sp"></div><span id="ltxt">Loading pose model…</span></div>
<video id="video" playsinline autoplay muted></video>
<canvas id="canvas"></canvas>
<div id="status">Sit so your full body is visible</div>

<script>
(function(){
  var video=document.getElementById('video');
  var canvas=document.getElementById('canvas');
  var ctx=canvas.getContext('2d');
  var status=document.getElementById('status');
  var loading=document.getElementById('loading');
  var ltxt=document.getElementById('ltxt');

  /* Tracked keypoint indices for movement: shoulders + hips + knees + ankles */
  var TRACKED=[5,6,11,12,13,14,15,16];
  var MOVE_THRESHOLD=0.009; /* normalised per-landmark displacement per frame */
  var prev=null, detector=null;

  function send(o){try{window.ReactNativeWebView.postMessage(JSON.stringify(o));}catch(e){}}

  /* ── sequential script loader (same fix as squats) ── */
  var CDNS=['https://cdn.jsdelivr.net/npm','https://unpkg.com'];
  var SCRIPTS=[
    '@tensorflow/tfjs@4.22.0/dist/tf.min.js',
    '@tensorflow/tfjs-backend-webgl@4.22.0/dist/tf-backend-webgl.min.js',
    '@tensorflow-models/pose-detection@2.1.3/dist/pose-detection.min.js'
  ];

  function loadSeq(si,ci){
    if(si>=SCRIPTS.length){init();return;}
    if(ci>=CDNS.length){
      loading.innerHTML='<p style="color:#ef4444;font-size:13px;padding:20px;text-align:center">Could not load pose model.<br>Check your connection.</p>';
      send({type:'ERROR',message:'all CDNs failed'});
      return;
    }
    ltxt.textContent='Loading ('+(si+1)+'/'+SCRIPTS.length+')…';
    var el=document.createElement('script');
    el.src=CDNS[ci]+'/'+SCRIPTS[si];
    el.onload=function(){loadSeq(si+1,ci);};
    el.onerror=function(){ltxt.textContent='Retrying…';loadSeq(si,ci+1);};
    document.head.appendChild(el);
  }

  var loadTimer=setTimeout(function(){
    if(loading.style.display!=='none'){
      loading.innerHTML='<p style="color:#ef4444;font-size:13px;padding:20px;text-align:center">Loading timed out.<br>Try on Wi-Fi.</p>';
      send({type:'ERROR',message:'timeout'});
    }
  },35000);

  loadSeq(0,0);

  /* ── init detector + camera ── */
  async function init(){
    clearTimeout(loadTimer);
    var tf=window.tf, pd=window.poseDetection;
    if(!tf||!pd){send({type:'ERROR',message:'tfjs missing'});return;}

    ltxt.textContent='Starting GPU…';
    try{await tf.setBackend('webgl');await tf.ready();}
    catch(e){
      try{await tf.setBackend('cpu');await tf.ready();}
      catch(e2){
        loading.innerHTML='<p style="color:#ef4444;font-size:13px;padding:20px;text-align:center">GPU unavailable.<br>'+e2.message+'</p>';
        send({type:'ERROR',message:e2.message});return;
      }
    }

    ltxt.textContent='Loading MoveNet…';
    try{
      detector=await pd.createDetector(
        pd.SupportedModels.MoveNet,
        {modelType:pd.movenet.modelType.SINGLEPOSE_LIGHTNING,enableSmoothing:true}
      );
    }catch(e){
      loading.innerHTML='<p style="color:#ef4444;font-size:13px;padding:20px;text-align:center">Model failed.<br>'+e.message+'</p>';
      send({type:'ERROR',message:e.message});return;
    }

    ltxt.textContent='Opening camera…';
    if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){
      loading.innerHTML='<p style="color:#ef4444;font-size:13px;padding:20px;text-align:center">Camera API unavailable.</p>';
      send({type:'ERROR',message:'getUserMedia not supported'});return;
    }

    try{
      var stream=await navigator.mediaDevices.getUserMedia(
        {video:{facingMode:'user',width:{ideal:480},height:{ideal:640}},audio:false}
      );
      video.srcObject=stream;
      await new Promise(function(res,rej){video.onloadedmetadata=res;video.onerror=rej;setTimeout(rej,8000);});
      video.play();
    }catch(e){
      loading.innerHTML='<p style="color:#ef4444;font-size:13px;padding:20px;text-align:center">Camera blocked.<br>'+e.message+'</p>';
      send({type:'ERROR',message:e.message});return;
    }

    loading.style.display='none';
    send({type:'READY'});
    loop();
  }

  /* ── per-frame inference ── */
  async function loop(){
    if(!detector||!video.videoWidth){return requestAnimationFrame(loop);}
    var W=video.videoWidth, H=video.videoHeight;
    canvas.width=W; canvas.height=H;
    ctx.clearRect(0,0,W,H);
    ctx.drawImage(video,0,0,W,H);

    var poses=null;
    try{poses=await detector.estimatePoses(video,{flipHorizontal:false});}
    catch(e){return requestAnimationFrame(loop);}

    if(!poses||!poses.length||!poses[0].keypoints){
      status.textContent='No person detected — step back';
      status.style.color='#fff';
      prev=null;
      return requestAnimationFrame(loop);
    }

    var kp=poses[0].keypoints;

    /* ── movement score (normalised) ── */
    var score=0, isMoving=false;
    if(prev){
      var total=0, n=0;
      TRACKED.forEach(function(i){
        var a=prev[i], b=kp[i];
        if(!a||!b||(a.score||0)<0.2||(b.score||0)<0.2)return;
        var dx=(a.x-b.x)/W, dy=(a.y-b.y)/H;
        total+=Math.sqrt(dx*dx+dy*dy); n++;
      });
      score=n>0?total/n:0;
      isMoving=score>MOVE_THRESHOLD;
    }
    prev=kp;

    /* ── lotus / seated pose detection ── */
    var inLotus=detectLotus(kp,W,H);

    /* ── aura glow when still + lotus ── */
    if(!isMoving&&inLotus){
      var cx=0,cy=0,cn=0;
      [5,6,11,12,13,14].forEach(function(i){
        if(!kp[i]||(kp[i].score||0)<0.2)return;
        cx+=kp[i].x; cy+=kp[i].y; cn++;
      });
      if(cn>0){
        cx/=cn; cy/=cn;
        var rad=H*0.45;
        var g=ctx.createRadialGradient(cx,cy,0,cx,cy,rad);
        g.addColorStop(0,'rgba(34,197,94,0.22)');
        g.addColorStop(0.5,'rgba(34,197,94,0.07)');
        g.addColorStop(1,'rgba(34,197,94,0)');
        ctx.save();
        ctx.globalCompositeOperation='lighter';
        ctx.fillStyle=g;
        ctx.fillRect(0,0,W,H);
        ctx.restore();
      }
    }

    /* ── skeleton ── */
    var CONN=[[5,6],[5,7],[7,9],[6,8],[8,10],[5,11],[6,12],[11,12],
              [11,13],[13,15],[12,14],[14,16]];
    var skelColor=isMoving?'rgba(239,68,68,0.85)':'rgba(34,197,94,0.85)';
    var dotFill  =isMoving?'rgba(239,68,68,0.5)':'rgba(34,197,94,0.5)';
    ctx.strokeStyle=skelColor; ctx.lineWidth=2.5;
    CONN.forEach(function(c){
      var a=kp[c[0]],b=kp[c[1]];
      if(!a||!b||(a.score||0)<0.2||(b.score||0)<0.2)return;
      ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
    });
    kp.forEach(function(p){
      if((p.score||0)<0.2)return;
      ctx.beginPath(); ctx.arc(p.x,p.y,5,0,Math.PI*2);
      ctx.fillStyle=dotFill; ctx.fill();
      ctx.beginPath(); ctx.arc(p.x,p.y,3,0,Math.PI*2);
      ctx.fillStyle='#ffffff'; ctx.fill();
    });

    /* ── status hint ── */
    if(isMoving){
      status.textContent='⚠️ Movement detected — stay still';
      status.style.color='#ef4444';
    } else if(inLotus){
      status.textContent='✓ Lotus detected — perfect posture';
      status.style.color='#22c55e';
    } else {
      status.textContent='Cross your legs and sit upright';
      status.style.color='#fff';
    }

    send({type:'MOVEMENT',score:score,inLotus:inLotus,isMoving:isMoving});
    requestAnimationFrame(loop);
  }

  /* ── lotus detection (MoveNet COCO indices) ── */
  function detectLotus(kp,W,H){
    var ls=kp[5],rs=kp[6],lh=kp[11],rh=kp[12],lk=kp[13],rk=kp[14];
    if(!ls||!rs||!lh||!rh||!lk||!rk)return false;
    if([(ls.score||0),(rs.score||0),(lh.score||0),(rh.score||0),(lk.score||0),(rk.score||0)]
        .some(function(s){return s<0.3;}))return false;
    /* Normalise to 0-1 */
    var lsN={x:ls.x/W,y:ls.y/H}, rsN={x:rs.x/W,y:rs.y/H};
    var lhN={x:lh.x/W,y:lh.y/H}, rhN={x:rh.x/W,y:rh.y/H};
    var lkN={x:lk.x/W,y:lk.y/H}, rkN={x:rk.x/W,y:rk.y/H};
    var shoulderW=Math.abs(rsN.x-lsN.x);
    var kneeW    =Math.abs(rkN.x-lkN.x);
    var hipMidY  =(lhN.y+rhN.y)/2;
    var sMidY    =(lsN.y+rsN.y)/2;
    var kMidY    =(lkN.y+rkN.y)/2;
    return hipMidY>sMidY+0.1        /* seated: hips below shoulders */
      && kneeW>=shoulderW*0.8       /* knees spread wide */
      && Math.abs(kMidY-hipMidY)<0.25  /* knees near hips */
      && Math.abs(hipMidY-sMidY)>0.15; /* upright torso */
  }
})();
</script>
</body>
</html>`;

// ─── component ───────────────────────────────────────────────────────────────
export default function Meditation() {
  const router = useRouter();

  // setup
  const [selectedMinutes, setSelectedMinutes] = useState(10);
  const [trackPosture, setTrackPosture]       = useState(true);

  // session
  const [phase, setPhase]       = useState<'setup' | 'active' | 'done'>('setup');
  const [elapsed,  setElapsed]  = useState(0);
  const [totalSec, setTotalSec] = useState(600);

  // posture state (from WebView messages)
  const [motionPct,  setMotionPct]  = useState(0);
  const [isMoving,   setIsMoving]   = useState(false);
  const [inLotus,    setInLotus]    = useState(false);
  const [breakCount, setBreakCount] = useState(0);
  const [postureOn,  setPostureOn]  = useState(false);
  const [webviewReady, setWebviewReady] = useState(false);

  // no-camera mode
  const [guidanceIdx, setGIdx]  = useState(0);
  const [breathPhase, setBreath] = useState<'in'|'out'>('in');

  // refs
  const lastHornTime   = useRef(0);
  const sessionTimer   = useRef<ReturnType<typeof setInterval> | null>(null);
  const guidanceTimer  = useRef<ReturnType<typeof setInterval> | null>(null);
  const breathTimer    = useRef<ReturnType<typeof setInterval> | null>(null);

  // animations
  const fadeIn       = useRef(new Animated.Value(0)).current;
  const pulseAnim    = useRef(new Animated.Value(1)).current;
  const pulseLoop    = useRef<Animated.CompositeAnimation | null>(null);
  const guidanceFade = useRef(new Animated.Value(1)).current;
  const flashAnim    = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeIn, { toValue: 1, duration: 500, useNativeDriver: true }).start();
    return () => stopAll();
  }, []);

  const stopAll = () => {
    sessionTimer.current  && clearInterval(sessionTimer.current);
    guidanceTimer.current && clearInterval(guidanceTimer.current);
    breathTimer.current   && clearInterval(breathTimer.current);
    pulseLoop.current?.stop();
    sessionTimer.current = guidanceTimer.current = breathTimer.current = null;
  };

  // ── WebView message handler ───────────────────────────────────────────────
  const handleWebViewMessage = useCallback((event: { nativeEvent: { data: string } }) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'READY') {
        setWebviewReady(true);
      }
      if (data.type === 'ERROR') {
        setPostureOn(false); // fall back to orb mode
      }
      if (data.type === 'MOVEMENT') {
        const score: number = data.score ?? 0;
        const moving: boolean = data.isMoving ?? false;
        setMotionPct(Math.min(score / 0.016, 1));
        setIsMoving(moving);
        setInLotus(data.inLotus ?? false);

        if (moving) {
          const now = Date.now();
          if (now - lastHornTime.current > HORN_COOLDOWN) {
            lastHornTime.current = now;
            setBreakCount(c => c + 1);
            Vibration.vibrate(300);
            playAlert();
            Animated.sequence([
              Animated.timing(flashAnim, { toValue: 1, duration: 80,  useNativeDriver: true }),
              Animated.timing(flashAnim, { toValue: 0, duration: 470, useNativeDriver: true }),
            ]).start();
          }
        }
      }
    } catch {}
  }, [flashAnim]);

  // ── start pulse animation ─────────────────────────────────────────────────
  const startPulse = useCallback(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.18, duration: 4000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1,    duration: 4000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    pulseLoop.current = loop;
    loop.start();
  }, [pulseAnim]);

  // ── begin session ─────────────────────────────────────────────────────────
  const start = useCallback(() => {
    const secs = selectedMinutes * 60;
    setTotalSec(secs);
    setElapsed(0);
    setBreakCount(0);
    setMotionPct(0);
    setIsMoving(false);
    setInLotus(false);
    setWebviewReady(false);
    lastHornTime.current = 0;
    setGIdx(0);
    setBreath('in');
    setPostureOn(trackPosture);
    setPhase('active');
    startPulse();

    sessionTimer.current = setInterval(() => {
      setElapsed(prev => {
        const next = prev + 1;
        if (next >= secs) { stopAll(); setPhase('done'); }
        return next;
      });
    }, 1000);

    guidanceTimer.current = setInterval(() => {
      Animated.sequence([
        Animated.timing(guidanceFade, { toValue: 0, duration: 500, useNativeDriver: true }),
        Animated.timing(guidanceFade, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]).start();
      setGIdx(i => (i + 1) % GUIDANCE.length);
    }, 20000);

    breathTimer.current = setInterval(() => setBreath(p => p === 'in' ? 'out' : 'in'), 4000);
  }, [selectedMinutes, trackPosture, startPulse]);

  // ── end / reset ───────────────────────────────────────────────────────────
  const endSession = useCallback(() => { stopAll(); pulseAnim.setValue(1); setPhase('done'); }, [pulseAnim]);
  const reset = useCallback(() => {
    stopAll(); pulseAnim.setValue(1);
    setPhase('setup'); setPostureOn(false); setMotionPct(0); setIsMoving(false); setInLotus(false); setBreakCount(0);
  }, [pulseAnim]);

  const remaining = totalSec - elapsed;
  const progress  = elapsed / (totalSec || 1);
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={st.root}>
      <SafeAreaView style={st.safe} edges={['top', 'bottom']}>
        <Animated.View style={[st.container, { opacity: fadeIn }]}>

          {/* Top bar */}
          <View style={st.topBar}>
            <TouchableOpacity onPress={() => { reset(); router.back(); }} style={st.backBtn} hitSlop={12}>
              <ChevronLeft size={22} color={colors.cocoa} strokeWidth={2.2} />
            </TouchableOpacity>
            <Text style={st.screenTitle}>meditation</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* ══ SETUP ══════════════════════════════════════════════════════════ */}
          {phase === 'setup' && (
            <ScrollView contentContainerStyle={st.setupArea} showsVerticalScrollIndicator={false}>
              <View style={st.setupOrb}>
                <Brain size={44} color={colors.amberRich} strokeWidth={1.6} />
              </View>

              <Text style={st.setupTitle}>still your mind</Text>
              <Text style={st.setupSub}>
                find a quiet place, sit comfortably, and choose how long you'd like to be present.
              </Text>

              <Text style={st.pickerLabel}>SESSION LENGTH</Text>
              <View style={st.durationGrid}>
                {DURATIONS.map(d => (
                  <TouchableOpacity
                    key={d}
                    style={[st.durationPill, selectedMinutes === d && st.durationPillActive]}
                    onPress={() => setSelectedMinutes(d)}
                    activeOpacity={0.8}
                  >
                    <Text style={[st.durationNum, selectedMinutes === d && st.durationNumActive]}>{d}</Text>
                    <Text style={[st.durationUnit, selectedMinutes === d && st.durationUnitActive]}>min</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Posture tracking toggle */}
              <View style={st.toggleCard}>
                <View style={st.toggleLeft}>
                  <Camera size={18} color={colors.lavenderDeep} strokeWidth={2} />
                  <View style={{ flex: 1 }}>
                    <Text style={st.toggleTitle}>posture tracking</Text>
                    <Text style={st.toggleSub}>mediapipe detects your body, draws skeleton, and alerts when posture breaks</Text>
                  </View>
                </View>
                <Switch
                  value={trackPosture}
                  onValueChange={setTrackPosture}
                  trackColor={{ false: colors.border, true: colors.lavender }}
                  thumbColor={trackPosture ? colors.lavenderDeep : colors.softGray}
                />
              </View>

              <View style={st.tipsBox}>
                <Text style={st.tipsTitle}>BEFORE YOU BEGIN</Text>
                {[
                  'Sit with your back straight',
                  'Rest your hands on your knees',
                  trackPosture
                    ? 'Prop your phone so your full body is visible'
                    : 'Close your eyes or soften your gaze',
                ].map((tip, i) => (
                  <View key={i} style={st.tipRow}>
                    <View style={st.tipDot} />
                    <Text style={st.tipText}>{tip}</Text>
                  </View>
                ))}
              </View>

              <TouchableOpacity style={st.startBtn} onPress={start} activeOpacity={0.85}>
                <Text style={st.startBtnText}>begin session</Text>
              </TouchableOpacity>
            </ScrollView>
          )}

          {/* ══ ACTIVE ════════════════════════════════════════════════════════ */}
          {phase === 'active' && (
            <View style={st.activeArea}>

              {/* Timer */}
              <View style={st.timerRow}>
                <Text style={st.timerBig}>{fmt(remaining)}</Text>
                <Text style={st.timerLabel}>remaining</Text>
              </View>

              {/* ── MediaPipe WebView (posture tracking) ─────────────────── */}
              {postureOn ? (
                <View style={st.cameraCard}>
                  <WebView
                    source={{ html: MEDITATION_HTML, baseUrl: 'https://localhost' }}
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
                  {/* red flash on movement */}
                  <Animated.View
                    style={[StyleSheet.absoluteFill, {
                      opacity: flashAnim,
                      backgroundColor: 'rgba(220,60,60,0.3)',
                      borderRadius: 20,
                    }]}
                    pointerEvents="none"
                  />
                  {/* status badge */}
                  <View style={[st.statusBadge, isMoving ? st.statusBadgeMoving : inLotus ? st.statusBadgeLotus : st.statusBadgeStill]}>
                    <View style={[st.statusDot, isMoving ? st.dotMoving : inLotus ? st.dotLotus : st.dotStill]} />
                    <Text style={[st.statusText, isMoving ? st.statusTextMoving : inLotus ? st.statusTextLotus : st.statusTextStill]}>
                      {isMoving ? 'Moving!' : inLotus ? 'Lotus ✓' : 'Still ✓'}
                    </Text>
                  </View>
                </View>
              ) : (
                /* ── animated orb (no camera) ─────────────────────────── */
                <View style={st.orbWrap}>
                  <Animated.View style={[st.orbOuter, { transform: [{ scale: pulseAnim }] }]} />
                  <Animated.View style={[st.orbMid,   { transform: [{ scale: Animated.multiply(pulseAnim, 0.84) }] }]} />
                  <View style={st.orbCenter}>
                    <Text style={st.breathText}>{breathPhase === 'in' ? '↑ breathe in' : '↓ breathe out'}</Text>
                  </View>
                </View>
              )}

              {/* Stats row */}
              <View style={st.statsRow}>
                <View style={st.statCard}>
                  <Text style={st.statNum}>{breakCount}</Text>
                  <Text style={st.statLabel}>breaks</Text>
                </View>
                <View style={[st.statCard, st.statCardMid]}>
                  <View style={st.motionBarWrap}>
                    <View style={[
                      st.motionBarFill,
                      { width: `${Math.round(motionPct * 100)}%` as any },
                      motionPct > 0.6 ? st.motionBarRed : st.motionBarGreen,
                    ]} />
                  </View>
                  <Text style={st.statLabel}>movement</Text>
                </View>
                <View style={st.statCard}>
                  <Text style={st.statNum}>{fmt(elapsed)}</Text>
                  <Text style={st.statLabel}>elapsed</Text>
                </View>
              </View>

              {/* Progress */}
              <View style={st.progressWrap}>
                <View style={st.progressBg}>
                  <View style={[st.progressFill, { width: `${Math.round(progress * 100)}%` as any }]} />
                </View>
                <Text style={st.progressPct}>{Math.round(progress * 100)}% complete</Text>
              </View>

              {/* Guidance */}
              {postureOn ? (
                <View style={st.guidanceBox}>
                  <Text style={st.guidanceText}>
                    {isMoving
                      ? '⚠️  Realign your posture — sit tall, shoulders relaxed.'
                      : inLotus
                      ? '🌿  Lotus detected. Hold this stillness.'
                      : '✓  Cross your legs, sit upright, rest hands on knees.'}
                  </Text>
                </View>
              ) : (
                <Animated.View style={[st.guidanceBox, { opacity: guidanceFade }]}>
                  <Text style={st.guidanceText}>"{GUIDANCE[guidanceIdx]}"</Text>
                </Animated.View>
              )}

              <TouchableOpacity style={st.stopBtn} onPress={endSession} activeOpacity={0.8}>
                <Text style={st.stopBtnText}>end session</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ══ DONE ═══════════════════════════════════════════════════════════ */}
          {phase === 'done' && (
            <View style={st.doneArea}>
              <View style={[st.doneOrb, breakCount === 0 && st.doneOrbPerfect]}>
                <Check size={48} color={colors.mossRich} strokeWidth={2} />
              </View>
              <Text style={st.doneTitle}>wonderful session</Text>
              <Text style={st.doneSub}>
                {selectedMinutes} minutes of mindful presence.{'\n'}your mind thanks you.
              </Text>

              {postureOn && (
                <View style={st.summaryCard}>
                  <Text style={st.summaryTitle}>POSTURE SUMMARY</Text>
                  <View style={st.summaryRow}>
                    <Text style={st.summaryLabel}>posture breaks</Text>
                    <Text style={[st.summaryVal, breakCount === 0 && { color: colors.mossRich }]}>
                      {breakCount === 0 ? 'Perfect! 🌟' : breakCount}
                    </Text>
                  </View>
                  <View style={st.summaryRow}>
                    <Text style={st.summaryLabel}>session duration</Text>
                    <Text style={st.summaryVal}>{selectedMinutes} min</Text>
                  </View>
                  <Text style={st.summaryNote}>
                    {breakCount === 0
                      ? 'You held perfect stillness the entire session.'
                      : 'Each break is a chance to return to presence. Keep practicing.'}
                  </Text>
                </View>
              )}

              <TouchableOpacity style={st.startBtn} onPress={reset} activeOpacity={0.85}>
                <RefreshCcw size={16} color={colors.cream} strokeWidth={2.3} />
                <Text style={st.startBtnText}>meditate again</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.textBtn} onPress={() => router.back()} activeOpacity={0.7}>
                <Text style={st.textBtnText}>return to mood</Text>
              </TouchableOpacity>
            </View>
          )}

        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  root:      { flex: 1, backgroundColor: colors.cream },
  safe:      { flex: 1 },
  container: { flex: 1, paddingHorizontal: 24 },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 12, paddingBottom: 16,
  },
  backBtn:     { padding: 4 },
  screenTitle: { fontFamily: fonts.serif, fontSize: 18, color: colors.cocoa },

  // ── setup ──────────────────────────────────────────────────────────────
  setupArea: { alignItems: 'center', gap: 20, paddingBottom: 48, paddingTop: 4 },
  setupOrb: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: colors.amber, alignItems: 'center', justifyContent: 'center',
    ...cardShadow,
  },
  setupTitle: { fontFamily: fonts.serif, fontSize: 30, color: colors.cocoa, textAlign: 'center' },
  setupSub:   { fontSize: 14, color: colors.warmGray, textAlign: 'center', lineHeight: 21, maxWidth: 300 },

  pickerLabel:      { fontSize: 10, letterSpacing: 3, fontWeight: '700', color: colors.softGray, alignSelf: 'flex-start' },
  durationGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  durationPill: {
    paddingHorizontal: 18, paddingVertical: 12, borderRadius: 16,
    backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', minWidth: 64,
  },
  durationPillActive: { backgroundColor: colors.amber, borderColor: colors.amberRich },
  durationNum:        { fontFamily: fonts.serif, fontSize: 22, color: colors.warmGray },
  durationNumActive:  { color: colors.cocoa },
  durationUnit:       { fontSize: 11, color: colors.softGray, marginTop: 2 },
  durationUnitActive: { color: colors.warmGray },

  toggleCard: {
    backgroundColor: colors.paper, borderRadius: 18,
    borderWidth: 1, borderColor: colors.border,
    padding: 16, width: '100%',
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  toggleLeft:  { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  toggleTitle: { fontSize: 14, fontWeight: '700', color: colors.cocoa, marginBottom: 2 },
  toggleSub:   { fontSize: 12, color: colors.warmGray, lineHeight: 17 },

  tipsBox: {
    backgroundColor: colors.paper, borderRadius: 20,
    borderWidth: 1, borderColor: colors.border,
    padding: 20, width: '100%', gap: 10,
  },
  tipsTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 2, color: colors.softGray, marginBottom: 4 },
  tipRow:    { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tipDot:    { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.amberRich, flexShrink: 0 },
  tipText:   { fontSize: 14, color: colors.warmGray, lineHeight: 20, flex: 1 },

  startBtn: {
    backgroundColor: colors.cocoa, borderRadius: 18,
    paddingHorizontal: 40, paddingVertical: 16,
    width: '100%', alignItems: 'center',
    flexDirection: 'row', justifyContent: 'center', gap: 8,
  },
  startBtnText: { fontSize: 16, fontWeight: '700', color: colors.cream },

  // ── active ─────────────────────────────────────────────────────────────
  activeArea: { flex: 1, gap: 14, paddingTop: 4, paddingBottom: 20 },

  timerRow:   { alignItems: 'center', gap: 2 },
  timerBig:   { fontFamily: fonts.serif, fontSize: 54, color: colors.cocoa },
  timerLabel: { fontSize: 12, color: colors.warmGray },

  cameraCard: {
    height: 260, borderRadius: 20, overflow: 'hidden',
    borderWidth: 1, borderColor: colors.border,
    backgroundColor: '#060F1E',
  },

  statusBadge: {
    position: 'absolute', top: 10, right: 10,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99,
  },
  statusBadgeStill:  { backgroundColor: 'rgba(34,197,94,0.18)',  borderWidth: 1, borderColor: '#22c55e66' },
  statusBadgeMoving: { backgroundColor: 'rgba(239,68,68,0.18)',  borderWidth: 1, borderColor: '#ef444466' },
  statusBadgeLotus:  { backgroundColor: 'rgba(139,92,246,0.18)', borderWidth: 1, borderColor: '#8b5cf666' },
  statusDot:         { width: 7, height: 7, borderRadius: 4 },
  dotStill:          { backgroundColor: '#22c55e' },
  dotMoving:         { backgroundColor: '#ef4444' },
  dotLotus:          { backgroundColor: '#8b5cf6' },
  statusText:        { fontSize: 12, fontWeight: '700' },
  statusTextStill:   { color: '#22c55e' },
  statusTextMoving:  { color: '#ef4444' },
  statusTextLotus:   { color: '#8b5cf6' },

  orbWrap:   { alignSelf: 'center', width: 200, height: 200, alignItems: 'center', justifyContent: 'center' },
  orbOuter: {
    position: 'absolute', width: 200, height: 200, borderRadius: 100,
    backgroundColor: colors.amber + '30', borderWidth: 1, borderColor: colors.amberRich + '44',
  },
  orbMid: {
    position: 'absolute', width: 200, height: 200, borderRadius: 100,
    backgroundColor: colors.amber + '18', borderWidth: 1, borderColor: colors.amberRich + '22',
  },
  orbCenter: { alignItems: 'center' },
  breathText:{ fontSize: 15, fontWeight: '600', color: colors.amberRich, letterSpacing: 0.5 },

  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1, backgroundColor: colors.paper, borderRadius: 14,
    borderWidth: 1, borderColor: colors.border,
    padding: 12, alignItems: 'center', gap: 4,
  },
  statCardMid: { flex: 1.4 },
  statNum:   { fontFamily: fonts.serif, fontSize: 22, color: colors.cocoa },
  statLabel: { fontSize: 10, color: colors.softGray, letterSpacing: 1, fontWeight: '700' },
  motionBarWrap: {
    width: '100%', height: 8, borderRadius: 999,
    backgroundColor: colors.border, overflow: 'hidden',
  },
  motionBarFill:  { height: '100%', borderRadius: 999 },
  motionBarGreen: { backgroundColor: '#22c55e' },
  motionBarRed:   { backgroundColor: '#ef4444' },

  progressWrap: { gap: 5 },
  progressBg:   { height: 4, borderRadius: 999, backgroundColor: colors.border, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 999, backgroundColor: colors.amberRich },
  progressPct:  { fontSize: 10, color: colors.softGray, textAlign: 'right' },

  guidanceBox: {
    backgroundColor: colors.paper, borderRadius: 16,
    borderWidth: 1, borderColor: colors.border, padding: 16,
  },
  guidanceText: { fontSize: 14, color: colors.warmGray, lineHeight: 21, textAlign: 'center', fontStyle: 'italic' },

  stopBtn: {
    backgroundColor: colors.cream, borderRadius: 14,
    paddingHorizontal: 32, paddingVertical: 13,
    borderWidth: 1, borderColor: colors.border, alignSelf: 'center',
  },
  stopBtnText: { fontSize: 14, fontWeight: '600', color: colors.warmGray },

  // ── done ───────────────────────────────────────────────────────────────
  doneArea: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18, paddingHorizontal: 8 },
  doneOrb: {
    width: 110, height: 110, borderRadius: 55,
    backgroundColor: colors.sage, borderWidth: 1, borderColor: colors.moss,
    alignItems: 'center', justifyContent: 'center', ...cardShadow,
  },
  doneOrbPerfect: { backgroundColor: colors.amber, borderColor: colors.amberRich },
  doneTitle: { fontFamily: fonts.serif, fontSize: 30, color: colors.cocoa },
  doneSub:   { fontSize: 14, color: colors.warmGray, textAlign: 'center', lineHeight: 21 },

  summaryCard: {
    backgroundColor: colors.paper, borderRadius: 20,
    borderWidth: 1, borderColor: colors.border,
    padding: 20, width: '100%', gap: 10,
  },
  summaryTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 2, color: colors.softGray },
  summaryRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { fontSize: 14, color: colors.warmGray },
  summaryVal:   { fontSize: 14, fontWeight: '700', color: colors.cocoa },
  summaryNote:  { fontSize: 13, color: colors.warmGray, lineHeight: 19, fontStyle: 'italic' },

  textBtn:     { marginTop: 4 },
  textBtnText: { fontSize: 14, color: colors.warmGray },
});
