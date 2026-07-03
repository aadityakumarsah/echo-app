/**
 * Day Refill — Pose-based squat counter.
 *
 * Primary:  TensorFlow.js MoveNet in WebView (lighter than MediaPipe, no SharedArrayBuffer
 *           requirement, works in React Native WebView on both iOS and Android).
 * Fallback: Manual tap mode shown when camera / CDN unavailable.
 *
 * Why TF.js MoveNet instead of MediaPipe:
 *   - MediaPipe v0.5 uses SIMD WASM that requires SharedArrayBuffer, which is unavailable
 *     in non-cross-origin-isolated WebView contexts → silent WASM failure on device.
 *   - MediaPipe parallel script loading had a race-condition bug causing broken retries.
 *   - MoveNet runs purely on WebGL (no WASM) → works reliably in every WebView.
 *
 * Squat thresholds (same as web version):
 *   knee angle < 100° → "down", knee angle > 160° → "up" + count rep.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WebView } from 'react-native-webview';
import { useCameraPermissions } from 'expo-camera';
import { markStepDone } from './DailyCheck';
import { colors, fonts, cardShadow } from '../lib/theme';

const ACCENT   = colors.mossRich;
const TARGETS  = [10, 15, 20, 25];
const LEVEL_KEY = 'squat-level';

async function getSquatLevel(): Promise<number> {
  const raw = await AsyncStorage.getItem(LEVEL_KEY);
  return raw ? parseInt(raw, 10) : 0;
}
async function advanceSquatLevel(): Promise<void> {
  const current = await getSquatLevel();
  if (current < TARGETS.length - 1) {
    await AsyncStorage.setItem(LEVEL_KEY, String(current + 1));
  }
}

// ─── WebView HTML ─────────────────────────────────────────────────────────────
// Uses TF.js MoveNet SINGLEPOSE_LIGHTNING — ~400 KB model, WebGL backend only.
// Scripts loaded SEQUENTIALLY (not in parallel) to avoid race conditions.
// MoveNet COCO keypoint indices:
//   11=leftHip  12=rightHip  13=leftKnee  14=rightKnee  15=leftAnkle  16=rightAnkle
// ─────────────────────────────────────────────────────────────────────────────
const makePoseHtml = (target: number) => `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
*{margin:0;padding:0;box-sizing:border-box;}
html,body{width:100%;height:100%;background:#060F1E;overflow:hidden;font-family:-apple-system,sans-serif;}
#video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transform:scaleX(-1);}
#canvas{position:absolute;inset:0;width:100%;height:100%;transform:scaleX(-1);z-index:10;}
#hint{position:absolute;top:12px;left:50%;transform:translateX(-50%);
      background:rgba(0,0,0,0.65);color:#fff;padding:6px 16px;border-radius:14px;
      font-size:13px;white-space:nowrap;pointer-events:none;z-index:20;transition:opacity .3s;}
#angle{position:absolute;bottom:12px;right:12px;background:rgba(93,176,117,0.85);
       color:#fff;padding:5px 12px;border-radius:12px;z-index:20;font-size:12px;pointer-events:none;}
#loading{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
         flex-direction:column;gap:14px;background:#060F1E;z-index:100;color:rgba(255,255,255,.55);font-size:14px;}
.sp{width:34px;height:34px;border:3px solid rgba(93,176,117,.3);border-top-color:#5DB075;
    border-radius:50%;animation:spin .8s linear infinite;}
@keyframes spin{to{transform:rotate(360deg);}}
#err{position:absolute;inset:0;display:none;align-items:center;justify-content:center;
     flex-direction:column;gap:12px;background:#060F1E;z-index:100;text-align:center;padding:32px;}
#etitle{color:#ef4444;font-size:15px;font-weight:600;}
#emsg{color:rgba(255,255,255,.4);font-size:13px;line-height:1.7;}
</style>
</head>
<body>
<div id="loading"><div class="sp"></div><span id="ltxt">Loading pose model…</span></div>
<div id="err"><p id="etitle"></p><p id="emsg"></p></div>
<video id="video" playsinline autoplay muted></video>
<canvas id="canvas"></canvas>
<div id="hint">Stand so your full body is visible</div>
<div id="angle">—°</div>

<script>
(function(){
  var TARGET=${target};
  var video=document.getElementById('video');
  var canvas=document.getElementById('canvas');
  var ctx=canvas.getContext('2d');
  var hint=document.getElementById('hint');
  var angleEl=document.getElementById('angle');
  var loading=document.getElementById('loading');
  var err=document.getElementById('err');
  var ltxt=document.getElementById('ltxt');
  var stage='up', count=0, poseDetector=null, animId=null;

  function send(o){try{window.ReactNativeWebView.postMessage(JSON.stringify(o));}catch(e){}}

  function showErr(title,msg){
    loading.style.display='none';
    err.style.display='flex';
    document.getElementById('etitle').textContent=title;
    document.getElementById('emsg').textContent=msg;
    send({type:'ERROR',message:title});
  }

  function angle(a,b,c){
    var r=Math.atan2(c.y-b.y,c.x-b.x)-Math.atan2(a.y-b.y,a.x-b.x);
    var d=Math.abs(r*180/Math.PI);
    return d>180?360-d:d;
  }

  /* ── Sequential script loader: loads one script at a time, retries on next CDN ── */
  var CDNS=[
    'https://cdn.jsdelivr.net/npm',
    'https://unpkg.com'
  ];
  var SCRIPTS=[
    '@tensorflow/tfjs@4.22.0/dist/tf.min.js',
    '@tensorflow/tfjs-backend-webgl@4.22.0/dist/tf-backend-webgl.min.js',
    '@tensorflow-models/pose-detection@2.1.3/dist/pose-detection.min.js'
  ];

  function loadSeq(scriptIdx, cdnIdx){
    if(scriptIdx>=SCRIPTS.length){ initPose(); return; }
    if(cdnIdx>=CDNS.length){
      showErr('Model unavailable','No internet or CDN blocked. Try on Wi-Fi.');
      return;
    }
    ltxt.textContent='Loading ('+(scriptIdx+1)+'/'+SCRIPTS.length+')…';
    var el=document.createElement('script');
    el.src=CDNS[cdnIdx]+'/'+SCRIPTS[scriptIdx];
    el.onload=function(){ loadSeq(scriptIdx+1, cdnIdx); };
    el.onerror=function(){
      ltxt.textContent='Retrying with mirror…';
      loadSeq(scriptIdx, cdnIdx+1);
    };
    document.head.appendChild(el);
  }

  /* Start with 30s overall timeout */
  var loadTimer=setTimeout(function(){
    if(loading.style.display!=='none'){
      showErr('Loading timed out','Took too long. Check your connection and try again.');
    }
  },30000);

  loadSeq(0,0);

  /* ── Init pose detector + camera ── */
  async function initPose(){
    clearTimeout(loadTimer);
    var tf=window.tf;
    var poseDetection=window.poseDetection;
    if(!tf||!poseDetection){
      showErr('Script error','TF.js failed to initialise. Please retry.');
      return;
    }

    ltxt.textContent='Warming up…';
    try{
      await tf.setBackend('webgl');
      await tf.ready();
    }catch(e){
      /* Fall back to CPU if WebGL unavailable */
      try{
        await tf.setBackend('cpu');
        await tf.ready();
      }catch(e2){
        showErr('GPU unavailable',e2.message||'Cannot run pose model on this device.');
        return;
      }
    }

    ltxt.textContent='Loading MoveNet…';
    try{
      poseDetector=await poseDetection.createDetector(
        poseDetection.SupportedModels.MoveNet,
        {modelType:poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
         enableSmoothing:true}
      );
    }catch(e){
      showErr('Model load failed',e.message||'Could not load MoveNet model.');
      return;
    }

    ltxt.textContent='Starting camera…';
    if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){
      showErr('Camera unavailable','Camera API not accessible in this WebView.');
      return;
    }

    try{
      var stream=await navigator.mediaDevices.getUserMedia({
        video:{facingMode:'user',width:{ideal:480},height:{ideal:640}},
        audio:false
      });
      video.srcObject=stream;
      await new Promise(function(res,rej){
        video.onloadedmetadata=res;
        video.onerror=rej;
        setTimeout(rej,8000);
      });
      video.play();
    }catch(e){
      showErr('Camera blocked',e.message||'Allow camera permission and reload.');
      return;
    }

    loading.style.display='none';
    send({type:'READY'});
    detect();
  }

  /* ── Inference loop ── */
  async function detect(){
    if(!poseDetector||!video.videoWidth)return requestAnimationFrame(detect);
    canvas.width=video.videoWidth;
    canvas.height=video.videoHeight;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(video,0,0,canvas.width,canvas.height);

    var poses=null;
    try{
      poses=await poseDetector.estimatePoses(video,{flipHorizontal:false});
    }catch(e){ return requestAnimationFrame(detect); }

    if(!poses||!poses.length||!poses[0].keypoints){
      hint.textContent='No person detected — step back';
      angleEl.textContent='—°';
      return requestAnimationFrame(detect);
    }

    var kp=poses[0].keypoints;
    /* COCO indices: 11=lHip 12=rHip 13=lKnee 14=rKnee 15=lAnkle 16=rAnkle */
    var lH=kp[11],lK=kp[13],lA=kp[15];
    var rH=kp[12],rK=kp[14],rA=kp[16];
    var lVis=(lH.score||0)>0.3&&(lK.score||0)>0.3&&(lA.score||0)>0.3;
    var rVis=(rH.score||0)>0.3&&(rK.score||0)>0.3&&(rA.score||0)>0.3;

    /* Draw skeleton */
    var CONNECT=[[5,6],[5,7],[7,9],[6,8],[8,10],[5,11],[6,12],[11,12],
                 [11,13],[13,15],[12,14],[14,16]];
    ctx.strokeStyle='rgba(93,176,117,0.8)';
    ctx.lineWidth=2.5;
    CONNECT.forEach(function(c){
      var a=kp[c[0]],b=kp[c[1]];
      if(!a||!b||(a.score||0)<0.2||(b.score||0)<0.2)return;
      ctx.beginPath();
      ctx.moveTo(a.x,a.y);
      ctx.lineTo(b.x,b.y);
      ctx.stroke();
    });
    kp.forEach(function(p){
      if((p.score||0)<0.2)return;
      ctx.beginPath();
      ctx.arc(p.x,p.y,4,0,Math.PI*2);
      ctx.fillStyle='#ffffff';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(p.x,p.y,3,0,Math.PI*2);
      ctx.fillStyle='rgba(93,176,117,0.7)';
      ctx.fill();
    });

    if(!lVis&&!rVis){
      hint.textContent='Step back — show full legs';
      angleEl.textContent='—°';
      return requestAnimationFrame(detect);
    }

    var angles=[];
    if(lVis)angles.push(angle({x:lH.x,y:lH.y},{x:lK.x,y:lK.y},{x:lA.x,y:lA.y}));
    if(rVis)angles.push(angle({x:rH.x,y:rH.y},{x:rK.x,y:rK.y},{x:rA.x,y:rA.y}));
    var avg=angles.reduce(function(a,b){return a+b;},0)/angles.length;
    angleEl.textContent=Math.round(avg)+'°';

    /* Knee angle label */
    var knee=lVis?lK:rK;
    ctx.save();
    ctx.font='bold 15px -apple-system,sans-serif';
    ctx.fillStyle='rgba(255,255,255,0.85)';
    ctx.fillText(Math.round(avg)+'°',knee.x+12,knee.y-8);
    ctx.restore();

    /* Squat logic: <100° down, >160° up (same direction as web) */
    if(avg<100&&stage==='up'){
      stage='down';
      send({type:'STAGE',stage:'down'});
      hint.textContent='↓ Hold low — push back up';
    } else if(avg>160&&stage==='down'){
      stage='up';
      count++;
      send({type:'REP',count:count,stage:'up'});
      hint.textContent=count<TARGET?'✓ Rep '+count+' of '+TARGET+'  keep going!':'🎉 Done!';
    } else if(stage==='up'){
      hint.textContent='Bend knees to squat ↓  (need <100°)';
    } else {
      hint.textContent='Push back up ↑  (need >160°)';
    }

    requestAnimationFrame(detect);
  }
})();
</script>
</body>
</html>`;

// ─── component ────────────────────────────────────────────────────────────────
type Mode = 'camera' | 'manual';

export default function DailyCheckRefill() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [target, setTarget] = useState(10);
  const [count, setCount]   = useState(0);
  const [stage, setStage]   = useState<'up' | 'down'>('up');
  const [done,  setDone]    = useState(false);
  const [mode,  setMode]    = useState<Mode>('camera');
  const [webReady, setWebReady] = useState(false);

  const progressAnim = useRef(new Animated.Value(0)).current;
  const doneScale    = useRef(new Animated.Value(0)).current;
  const doneOpacity  = useRef(new Animated.Value(0)).current;
  const webviewRef   = useRef<WebView>(null);

  useEffect(() => {
    getSquatLevel().then((level) =>
      setTarget(TARGETS[Math.min(level, TARGETS.length - 1)])
    );
    requestPermission();
  }, []);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: target > 0 ? count / target : 0,
      duration: 300,
      useNativeDriver: false,
    }).start();

    if (count >= target && target > 0 && !done) {
      setDone(true);
      Animated.parallel([
        Animated.timing(doneOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.spring(doneScale, { toValue: 1, stiffness: 260, damping: 18, useNativeDriver: true }),
      ]).start();
    }
  }, [count, target]);

  const handleMessage = useCallback((event: { nativeEvent: { data: string } }) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'READY') {
        setWebReady(true);
      } else if (data.type === 'STAGE') {
        setStage(data.stage);
      } else if (data.type === 'REP') {
        setCount((prev) => Math.min(Math.max(prev, data.count), target));
        setStage('up');
      } else if (data.type === 'ERROR') {
        // Pose model or camera failed — switch to manual mode
        setMode('manual');
      }
    } catch { /* ignore */ }
  }, [target]);

  const reset = () => {
    setCount(0);
    setStage('up');
    setDone(false);
    progressAnim.setValue(0);
    doneScale.setValue(0);
    doneOpacity.setValue(0);
    if (mode === 'camera') {
      setWebReady(false);
      webviewRef.current?.reload();
    }
  };

  const handleComplete = async () => {
    await advanceSquatLevel();
    await markStepDone('refill');
    router.back();
  };

  const addManualRep = () => {
    if (done) return;
    setCount((prev) => {
      const next = Math.min(prev + 1, target);
      if (next >= target) setDone(true);
      return next;
    });
    setStage((s) => (s === 'up' ? 'down' : 'up'));
  };

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const nextTarget = TARGETS[Math.min(TARGETS.indexOf(target) + 1, TARGETS.length - 1)];

  const showCameraView = mode === 'camera';

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* Top bar — OUTSIDE scroll so back button is always visible */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={styles.backText}>← back</Text>
        </TouchableOpacity>
        {mode === 'manual' && (
          <TouchableOpacity onPress={() => { setMode('camera'); setWebReady(false); }} activeOpacity={0.7}>
            <Text style={[styles.backText, { color: ACCENT }]}>try camera</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.eyebrow, { color: ACCENT }]}>02 · DAY REFILL</Text>
        <Text style={styles.title}>{target} Squats</Text>
        <Text style={styles.subtitle}>
          {showCameraView
            ? 'Stand so your full body is visible. Squat below 100°, stand back up above 160°.'
            : 'Camera unavailable — tap the circle each time you stand up from a squat.'}
        </Text>
      </View>

      {/* Camera / manual area */}
      <View style={styles.cameraBox}>
        {showCameraView ? (
          permission && !permission.granted ? (
            <View style={styles.errArea}>
              <Text style={styles.errEmoji}>📷</Text>
              <Text style={styles.errTitle}>Camera permission needed</Text>
              <Text style={styles.errSub}>Pose detection needs camera access to track squats.</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={requestPermission} activeOpacity={0.8}>
                <Text style={styles.retryBtnTxt}>Allow Camera</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setMode('manual')} activeOpacity={0.7} style={{ marginTop: 8 }}>
                <Text style={styles.fallbackLink}>Use manual counting instead</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <WebView
              ref={webviewRef}
              source={{ html: makePoseHtml(target), baseUrl: 'https://localhost' }}
              onMessage={handleMessage}
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction={false}
              javaScriptEnabled
              domStorageEnabled
              originWhitelist={['*']}
              mediaCapturePermissionGrantType="grant"
allowFileAccessFromFileURLs
              allowUniversalAccessFromFileURLs
              mixedContentMode="always"
              style={styles.fill}
            />
          )
        ) : (
          /* Manual mode — big tap circle */
          <View style={styles.manualArea}>
            <Text style={styles.manualHint}>
              {stage === 'up' ? 'Squat down ↓' : 'Stand back up ↑'}
            </Text>
            <TouchableOpacity
              onPress={addManualRep}
              activeOpacity={0.75}
              disabled={done}
              style={[styles.manualCircle, done && { opacity: 0.4 }]}
            >
              <Text style={styles.manualCount}>{count}</Text>
              <Text style={styles.manualOf}>of {target}</Text>
            </TouchableOpacity>
            <Text style={styles.manualTap}>
              {done ? 'Set complete!' : 'Tap each rep'}
            </Text>
          </View>
        )}
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>REPS</Text>
          <View style={styles.repRow}>
            <Text style={[styles.repCount, { color: ACCENT }]}>{count}</Text>
            <Text style={styles.repTotal}>/ {target}</Text>
          </View>
          <View style={styles.progressBg}>
            <Animated.View style={[styles.progressFill, { width: progressWidth, backgroundColor: ACCENT }]} />
          </View>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statLabel}>POSITION</Text>
          <View style={styles.stageRow}>
            {(['up', 'down'] as const).map((s) => (
              <View
                key={s}
                style={[
                  styles.stagePill,
                  stage === s
                    ? { backgroundColor: colors.sage, borderColor: colors.moss }
                    : { backgroundColor: colors.sand, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.stagePillTxt, { color: stage === s ? colors.mossRich : colors.softGray }]}>
                  {s.toUpperCase()}
                </Text>
              </View>
            ))}
          </View>
          <Text style={styles.levelLabel}>Day {TARGETS.indexOf(target) + 1} · {target} reps</Text>
        </View>
      </View>

      {/* Done overlay — covers the full screen so the buttons are always reachable */}
      {done && (
        <Animated.View style={[styles.doneOverlay, { opacity: doneOpacity }]}>
          <Animated.View style={[styles.doneInner, { transform: [{ scale: doneScale }] }]}>
            <View style={[styles.doneCircle, { borderColor: colors.moss, backgroundColor: colors.sage }]}>
              <Text style={[styles.doneCheck, { color: ACCENT }]}>✓</Text>
            </View>
            <Text style={styles.doneTitle}>Set complete!</Text>
            <Text style={styles.doneSub}>
              {target} squats done — body refilled.
              {target < 25 ? `\nNext session: ${nextTarget} reps 💪` : '\nMax level! 🔥'}
            </Text>
            <View style={styles.doneBtns}>
              <TouchableOpacity style={styles.againBtn} onPress={reset} activeOpacity={0.7}>
                <Text style={styles.againTxt}>↺ again</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.doneBtn, { backgroundColor: ACCENT }]}
                onPress={handleComplete}
                activeOpacity={0.8}
              >
                <Text style={styles.doneBtnTxt}>back to daily check</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: colors.cream, paddingHorizontal: 24, paddingBottom: 24 },

  topBar:   { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 12, paddingBottom: 4 },
  backText: { fontSize: 13, fontWeight: '500', color: colors.warmGray },

  header:   { marginTop: 12, marginBottom: 14 },
  eyebrow:  { fontSize: 10, letterSpacing: 4, marginBottom: 6, opacity: 0.9 },
  title:    { fontFamily: fonts.serif, fontSize: 30, color: colors.cocoa, letterSpacing: -0.4 },
  subtitle: { marginTop: 6, fontSize: 13, color: colors.warmGray, lineHeight: 20 },

  cameraBox: {
    borderRadius: 20, overflow: 'hidden',
    height: 300, backgroundColor: '#060F1E',
    borderWidth: 1, borderColor: colors.border,
    marginBottom: 14, ...cardShadow,
  },
  fill: { flex: 1 },

  errArea: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 28, gap: 10, backgroundColor: '#060F1E',
  },
  errEmoji:    { fontSize: 44, marginBottom: 4 },
  errTitle:    { fontSize: 16, fontWeight: '700', color: '#fff' },
  errSub:      { fontSize: 13, color: 'rgba(255,255,255,0.45)', textAlign: 'center', lineHeight: 20 },
  retryBtn:    { marginTop: 8, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 14, backgroundColor: colors.mossRich },
  retryBtnTxt: { fontSize: 13, fontWeight: '600', color: '#fff' },
  fallbackLink:{ fontSize: 12, color: colors.warmGray, textDecorationLine: 'underline' },

  manualArea: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12,
    backgroundColor: '#060F1E',
  },
  manualHint:   { fontSize: 13, color: 'rgba(255,255,255,0.55)' },
  manualCircle: {
    width: 140, height: 140, borderRadius: 70,
    backgroundColor: 'rgba(93,176,117,0.15)',
    borderWidth: 3, borderColor: colors.mossRich,
    alignItems: 'center', justifyContent: 'center',
  },
  manualCount:  { fontFamily: fonts.serif, fontSize: 52, color: '#fff' },
  manualOf:     { fontSize: 14, color: 'rgba(255,255,255,0.4)' },
  manualTap:    { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 4 },

  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  statCard: {
    flex: 1, backgroundColor: colors.paper, borderRadius: 16,
    borderWidth: 1, borderColor: colors.border, padding: 14,
  },
  statLabel:    { fontSize: 10, letterSpacing: 2, color: colors.softGray, marginBottom: 8, fontWeight: '700' },
  repRow:       { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  repCount:     { fontFamily: fonts.serif, fontSize: 40 },
  repTotal:     { fontSize: 16, fontWeight: '500', color: colors.softGray },
  progressBg:   { marginTop: 10, height: 5, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },

  stageRow:     { gap: 8 },
  stagePill:    { paddingVertical: 7, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  stagePillTxt: { fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  levelLabel:   { marginTop: 10, fontSize: 10, color: colors.softGray, textAlign: 'center' },

  doneOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    zIndex: 10,
  },
  doneInner:  { alignItems: 'center', gap: 14, width: '100%' },
  doneCircle: { width: 72, height: 72, borderRadius: 36, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  doneCheck:  { fontSize: 32, fontWeight: '700' },
  doneTitle:  { fontFamily: fonts.serif, fontSize: 22, color: colors.cocoa },
  doneSub:    { fontSize: 13, color: colors.warmGray, textAlign: 'center', lineHeight: 20 },
  doneBtns:   { flexDirection: 'row', gap: 12, marginTop: 4 },
  againBtn:   { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, backgroundColor: colors.sand, borderWidth: 1, borderColor: colors.border },
  againTxt:   { fontSize: 13, fontWeight: '600', color: colors.warmGray },
  doneBtn:    { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 },
  doneBtnTxt: { fontSize: 13, fontWeight: '700', color: colors.cream },
});
