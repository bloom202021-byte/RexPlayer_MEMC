/// <reference types="@webgpu/types" />

// Zero-Copy Video Frame Ingest WGSL Shader:
// Converts transient GPUExternalTexture (YUV/NV12/P010 HW decoder surface) -> persistent rgba8unorm keyframe ring texture
export const WGSL_INGEST_EXTERNAL_SHADER = /* wgsl */ `
struct VsOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vs_ingest(@builtin(vertex_index) vid: u32) -> VsOut {
  var positions = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>(-1.0,  1.0),
    vec2<f32>(-1.0,  1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>( 1.0,  1.0)
  );
  let p = positions[vid];
  var out: VsOut;
  out.pos = vec4<f32>(p, 0.0, 1.0);
  out.uv = vec2<f32>((p.x + 1.0) * 0.5, (1.0 - p.y) * 0.5);
  return out;
}

@group(0) @binding(0) var u_extVideo: texture_external;
@group(0) @binding(1) var u_samp: sampler;

@fragment
fn fs_ingest(in: VsOut) -> @location(0) vec4<f32> {
  let c = textureSampleBaseClampToEdge(u_extVideo, u_samp, in.uv);
  return vec4<f32>(c.rgb, 1.0);
}
`;

// Pass 1 WGSL Compute Shader:
// 6-Level Coarse-to-Fine Optical Flow & RIFE v4.15 IFNet Bidirectional Privilege Flow + Workgroup Shared Refinement + SAD Heatmap
export const WGSL_FLOW_COMPUTE_SHADER = /* wgsl */ `
struct FlowUniforms {
  texelStep: vec2<f32>,
  flowMaxShift: vec2<f32>,
  parentFlowStep: vec2<f32>,
  outDims: vec2<f32>,
  sceneCutProtect: i32,
  adrenoOpt: i32,
  debugSad: i32,
  pyrLevel: i32,
  rifeMode: i32,
  fp16Flow: i32,
  _pad0: vec2<f32>,
};

@group(0) @binding(0) var<uniform> u: FlowUniforms;
@group(0) @binding(1) var u_prevTex: texture_2d<f32>;
@group(0) @binding(2) var u_currTex: texture_2d<f32>;
@group(0) @binding(3) var u_lastFlowTex: texture_2d<f32>;
@group(0) @binding(4) var u_temporalFlowTex: texture_2d<f32>;
@group(0) @binding(5) var u_samp: sampler;
@group(0) @binding(6) var u_outFlowTex: texture_storage_2d<rgba16float, write>;

var<workgroup> wgVel: array<vec2<f32>, 64>;
var<workgroup> wgConf: array<f32, 64>;

fn getLuma(c: vec3<f32>) -> f32 {
  return dot(c, vec3<f32>(0.299, 0.587, 0.114));
}

fn fastChromaL1(a: vec3<f32>, b: vec3<f32>) -> f32 {
  let d = abs(a - b);
  let dl = abs(getLuma(a) - getLuma(b));
  return max(0.0, (d.r + d.g + d.b) * 0.3333 - dl * 0.72);
}

fn decodeFlow(rg: vec2<f32>) -> vec2<f32> {
  return clamp(rg, vec2<f32>(-1.0), vec2<f32>(1.0));
}

fn evalSymmetricSad(uv: vec2<f32>, dUV: vec2<f32>, pStep: vec2<f32>) -> f32 {
  let uv0 = clamp(uv - 0.5 * dUV, vec2<f32>(0.002), vec2<f32>(0.998));
  let uv1 = clamp(uv + 0.5 * dUV, vec2<f32>(0.002), vec2<f32>(0.998));

  let rgb0C = textureSampleLevel(u_prevTex, u_samp, uv0, 0.0).rgb;
  let rgb0N = textureSampleLevel(u_prevTex, u_samp, uv0 + vec2<f32>(0.0, -pStep.y), 0.0).rgb;
  let rgb0S = textureSampleLevel(u_prevTex, u_samp, uv0 + vec2<f32>(0.0,  pStep.y), 0.0).rgb;
  let rgb0W = textureSampleLevel(u_prevTex, u_samp, uv0 + vec2<f32>(-pStep.x, 0.0), 0.0).rgb;
  let rgb0E = textureSampleLevel(u_prevTex, u_samp, uv0 + vec2<f32>( pStep.x, 0.0), 0.0).rgb;

  let rgb1C = textureSampleLevel(u_currTex, u_samp, uv1, 0.0).rgb;
  let rgb1N = textureSampleLevel(u_currTex, u_samp, uv1 + vec2<f32>(0.0, -pStep.y), 0.0).rgb;
  let rgb1S = textureSampleLevel(u_currTex, u_samp, uv1 + vec2<f32>(0.0,  pStep.y), 0.0).rgb;
  let rgb1W = textureSampleLevel(u_currTex, u_samp, uv1 + vec2<f32>(-pStep.x, 0.0), 0.0).rgb;
  let rgb1E = textureSampleLevel(u_currTex, u_samp, uv1 + vec2<f32>( pStep.x, 0.0), 0.0).rgb;

  let c0C = getLuma(rgb0C);
  let c0N = getLuma(rgb0N);
  let c0S = getLuma(rgb0S);
  let c0W = getLuma(rgb0W);
  let c0E = getLuma(rgb0E);

  let c1C = getLuma(rgb1C);
  let c1N = getLuma(rgb1N);
  let c1S = getLuma(rgb1S);
  let c1W = getLuma(rgb1W);
  let c1E = getLuma(rgb1E);

  let patchSad = abs(c1C - c0C) * 0.24 +
    (abs(c1N - c0N) + abs(c1S - c0S) + abs(c1W - c0W) + abs(c1E - c0E)) * 0.15;

  let chromaSad = fastChromaL1(rgb1C, rgb0C) * 0.18 +
    (fastChromaL1(rgb1N, rgb0N) + fastChromaL1(rgb1S, rgb0S) + fastChromaL1(rgb1W, rgb0W) + fastChromaL1(rgb1E, rgb0E)) * 0.055;

  let gradDiff = (abs((c1E - c1W) - (c0E - c0W)) + abs((c1S - c1N) - (c0S - c0N))) * 0.16;

  let cenN = abs((c1N - c1C) - (c0N - c0C));
  let cenS = abs((c1S - c1C) - (c0S - c0C));
  let cenW = abs((c1W - c1C) - (c0W - c0C));
  let cenE = abs((c1E - c1C) - (c0E - c0C));
  let censusDiff = (cenN + cenS + cenW + cenE) * 0.065;

  return patchSad + chromaSad + gradDiff + censusDiff;
}

fn sadToThermalHeatmap(sadNorm: f32) -> vec3<f32> {
  let t = clamp(sadNorm, 0.0, 1.0);
  let c0 = vec3<f32>(0.035, 0.094, 0.212);
  let c1 = vec3<f32>(0.000, 0.768, 0.604);
  let c2 = vec3<f32>(1.000, 0.820, 0.400);
  let c3 = vec3<f32>(1.000, 0.240, 0.120);
  let c4 = vec3<f32>(1.000, 0.940, 0.985);
  if (t < 0.25) { return mix(c0, c1, t * 4.0); }
  if (t < 0.50) { return mix(c1, c2, (t - 0.25) * 4.0); }
  if (t < 0.75) { return mix(c2, c3, (t - 0.50) * 4.0); }
  return mix(c3, c4, (t - 0.75) * 4.0);
}

@compute @workgroup_size(8, 8, 1)
fn cs_flow_level(
  @builtin(global_invocation_id) gid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>
) {
  let outW = max(1u, u32(u.outDims.x));
  let outH = max(1u, u32(u.outDims.y));
  let inBounds = (gid.x < outW) && (gid.y < outH);
  let safeCoord = vec2<u32>(min(gid.x, outW - 1u), min(gid.y, outH - 1u));
  let v_uv = (vec2<f32>(safeCoord) + 0.5) / max(u.outDims, vec2<f32>(1.0));
  let localIdx = lid.y * 8u + lid.x;

  var levelScale: f32 = 1.08;
  if (u.pyrLevel == 4) { levelScale = 9.5; }
  else if (u.pyrLevel == 3) { levelScale = 5.2; }
  else if (u.pyrLevel == 2) { levelScale = 2.8; }
  else if (u.pyrLevel == 1) { levelScale = 1.75; }
  else if (u.pyrLevel == 5) { levelScale = 1.35; }

  let pStep = u.texelStep * levelScale;
  let maxShift = max(u.flowMaxShift, vec2<f32>(0.001));

  let rgb0C = textureSampleLevel(u_prevTex, u_samp, v_uv, 0.0).rgb;
  let rgb0N = textureSampleLevel(u_prevTex, u_samp, v_uv + vec2<f32>(0.0, -pStep.y), 0.0).rgb;
  let rgb0S = textureSampleLevel(u_prevTex, u_samp, v_uv + vec2<f32>(0.0,  pStep.y), 0.0).rgb;
  let rgb0W = textureSampleLevel(u_prevTex, u_samp, v_uv + vec2<f32>(-pStep.x, 0.0), 0.0).rgb;
  let rgb0E = textureSampleLevel(u_prevTex, u_samp, v_uv + vec2<f32>( pStep.x, 0.0), 0.0).rgb;

  let rgb1C = textureSampleLevel(u_currTex, u_samp, v_uv, 0.0).rgb;
  let rgb1N = textureSampleLevel(u_currTex, u_samp, v_uv + vec2<f32>(0.0, -pStep.y), 0.0).rgb;
  let rgb1S = textureSampleLevel(u_currTex, u_samp, v_uv + vec2<f32>(0.0,  pStep.y), 0.0).rgb;
  let rgb1W = textureSampleLevel(u_currTex, u_samp, v_uv + vec2<f32>(-pStep.x, 0.0), 0.0).rgb;
  let rgb1E = textureSampleLevel(u_currTex, u_samp, v_uv + vec2<f32>( pStep.x, 0.0), 0.0).rgb;

  let p0C = getLuma(rgb0C);
  let p0N = getLuma(rgb0N);
  let p0S = getLuma(rgb0S);
  let p0W = getLuma(rgb0W);
  let p0E = getLuma(rgb0E);

  let p1C = getLuma(rgb1C);
  let p1N = getLuma(rgb1N);
  let p1S = getLuma(rgb1S);
  let p1W = getLuma(rgb1W);
  let p1E = getLuma(rgb1E);

  let zeroPatchSad = abs(p1C - p0C) * 0.24 +
    (abs(p1N - p0N) + abs(p1S - p0S) + abs(p1W - p0W) + abs(p1E - p0E)) * 0.15;
  let zeroChromaSad = fastChromaL1(rgb1C, rgb0C) * 0.18 +
    (fastChromaL1(rgb1N, rgb0N) + fastChromaL1(rgb1S, rgb0S) + fastChromaL1(rgb1W, rgb0W) + fastChromaL1(rgb1E, rgb0E)) * 0.055;
  let zeroGradDiff = (abs((p1E - p1W) - (p0E - p0W)) + abs((p1S - p1N) - (p0S - p0N))) * 0.16;
  let zeroCenDiff = (
    abs((p1N - p1C) - (p0N - p0C)) +
    abs((p1S - p1C) - (p0S - p0C)) +
    abs((p1W - p1C) - (p0W - p0C)) +
    abs((p1E - p1C) - (p0E - p0C))
  ) * 0.065;
  let zeroSad = zeroPatchSad + zeroChromaSad + zeroGradDiff + zeroCenDiff;

  let e0 = abs(p0E - p0W) + abs(p0S - p0N) + abs(p0N + p0S + p0W + p0E - 4.0 * p0C);
  let e1 = abs(p1E - p1W) + abs(p1S - p1N) + abs(p1N + p1S + p1W + p1E - 4.0 * p1C);

  var bestVel = vec2<f32>(0.0);
  var bestSad = zeroSad;

  let parentStep = max(u.parentFlowStep, vec2<f32>(1.0 / 512.0, 1.0 / 288.0));
  let parC = decodeFlow(textureSampleLevel(u_lastFlowTex, u_samp, v_uv, 0.0).rg);
  let parN = decodeFlow(textureSampleLevel(u_lastFlowTex, u_samp, v_uv + vec2<f32>(0.0, -parentStep.y), 0.0).rg);
  let parS = decodeFlow(textureSampleLevel(u_lastFlowTex, u_samp, v_uv + vec2<f32>(0.0,  parentStep.y), 0.0).rg);
  let parW = decodeFlow(textureSampleLevel(u_lastFlowTex, u_samp, v_uv + vec2<f32>(-parentStep.x, 0.0), 0.0).rg);
  let parE = decodeFlow(textureSampleLevel(u_lastFlowTex, u_samp, v_uv + vec2<f32>( parentStep.x, 0.0), 0.0).rg);

  let parMin = min(min(parN, parS), min(parW, parE));
  let parMax = max(max(parN, parS), max(parW, parE));
  let parMedC = clamp(parC, parMin, parMax);
  let pyramidMeanVel = parMedC * 0.44 + (parN + parS + parW + parE) * 0.14;
  var tempVel = parMedC;

  let isStaticBlock = (zeroSad < 0.0008 && dot(pyramidMeanVel, pyramidMeanVel) < 0.00010);

  if (!isStaticBlock) {
    if (dot(pyramidMeanVel, pyramidMeanVel) > 0.00004) {
      let sadPyr = evalSymmetricSad(v_uv, pyramidMeanVel * maxShift, pStep);
      if (sadPyr + 0.0006 < bestSad) {
        bestSad = sadPyr;
        bestVel = pyramidMeanVel;
      }
    }

    for (var p: i32 = 0; p < 4; p = p + 1) {
      var candP = parE;
      if (p == 0) { candP = parN; }
      else if (p == 1) { candP = parS; }
      else if (p == 2) { candP = parW; }

      if (dot(candP - bestVel, candP - bestVel) > 0.00015) {
        let sadP = evalSymmetricSad(v_uv, candP * maxShift, pStep);
        let diffP = abs(candP - pyramidMeanVel);
        let cohBias = (diffP.x + diffP.y) * 0.0024;
        if (sadP + cohBias + 0.0009 < bestSad) {
          bestSad = sadP;
          bestVel = candP;
        }
      }
    }

    if (u.pyrLevel <= 2 || u.pyrLevel == 5) {
      let advectedTempUv = clamp(v_uv - 0.5 * pyramidMeanVel * maxShift, vec2<f32>(0.002), vec2<f32>(0.998));
      tempVel = decodeFlow(textureSampleLevel(u_temporalFlowTex, u_samp, advectedTempUv, 0.0).rg);
      tempVel = clamp(tempVel, parMin - vec2<f32>(0.14), parMax + vec2<f32>(0.14));
      if (dot(tempVel - bestVel, tempVel - bestVel) > 0.00015) {
        let sadTemp = evalSymmetricSad(v_uv, tempVel * maxShift, pStep);
        let diffT = abs(tempVel - pyramidMeanVel);
        let tempBias = (diffT.x + diffT.y) * 0.0018;
        if (sadTemp + tempBias + 0.0008 < bestSad) {
          bestSad = sadTemp;
          bestVel = tempVel;
        }
      }
    }

    var rScale: f32 = 0.040;
    if (u.pyrLevel == 4) { rScale = 0.85; }
    else if (u.pyrLevel == 3) { rScale = 0.45; }
    else if (u.pyrLevel == 2) { rScale = 0.24; }
    else if (u.pyrLevel == 1) { rScale = 0.12; }
    else if (u.pyrLevel == 5) { rScale = 0.07; }

    let rOuter = 0.70 * rScale;
    let r0 = 0.35 * rScale;
    var cohPenaltyMul: f32 = 0.0045;
    if (u.pyrLevel == 4) { cohPenaltyMul = 0.0012; }
    else if (u.pyrLevel == 3) { cohPenaltyMul = 0.0025; }

    var centerVel0 = bestVel;
    var dirs8 = array<vec2<f32>, 8>(
      vec2<f32>( 1.0,  0.0),
      vec2<f32>(-1.0,  0.0),
      vec2<f32>( 0.0,  1.0),
      vec2<f32>( 0.0, -1.0),
      vec2<f32>( 0.707,  0.707),
      vec2<f32>(-0.707,  0.707),
      vec2<f32>( 0.707, -0.707),
      vec2<f32>(-0.707, -0.707)
    );

    if (u.pyrLevel >= 2) {
      for (var d: i32 = 0; d < 8; d = d + 1) {
        let offset = dirs8[d] * rOuter;
        let candVel = clamp(centerVel0 + offset, vec2<f32>(-0.97), vec2<f32>(0.97));
        let candSad = evalSymmetricSad(v_uv, candVel * maxShift, pStep);
        let diffC = abs(candVel - pyramidMeanVel);
        let regBias = (abs(candVel.x) + abs(candVel.y)) * 0.00045 + (diffC.x + diffC.y) * cohPenaltyMul;
        if (candSad + regBias < bestSad) {
          bestSad = candSad;
          bestVel = candVel;
        }
      }
      centerVel0 = bestVel;
    }

    let innerLimit: i32 = select(8, 4, (u.rifeMode == 0 && (u.pyrLevel <= 1 || u.pyrLevel == 5)));
    for (var d: i32 = 0; d < innerLimit; d = d + 1) {
      let offset = dirs8[d] * r0;
      let candVel = clamp(centerVel0 + offset, vec2<f32>(-0.97), vec2<f32>(0.97));
      let candSad = evalSymmetricSad(v_uv, candVel * maxShift, pStep);
      let diffC = abs(candVel - pyramidMeanVel);
      let regBias = (abs(candVel.x) + abs(candVel.y)) * 0.00050 + (diffC.x + diffC.y) * cohPenaltyMul;
      if (candSad + regBias < bestSad) {
        bestSad = candSad;
        bestVel = candVel;
      }
    }

    if (u.pyrLevel >= 2 || u.pyrLevel == 5 || bestSad > 0.0045) {
      let r1 = 0.15 * rScale;
      let centerVel1 = bestVel;
      let sadCenter = bestSad;
      var sadPosX = sadCenter;
      var sadNegX = sadCenter;
      var sadPosY = sadCenter;
      var sadNegY = sadCenter;
      var movedFromCenter = false;

      for (var d: i32 = 0; d < 4; d = d + 1) {
        let offset = dirs8[d] * r1;
        let candVel = clamp(centerVel1 + offset, vec2<f32>(-0.97), vec2<f32>(0.97));
        let candSad = evalSymmetricSad(v_uv, candVel * maxShift, pStep);
        let diffC = abs(candVel - pyramidMeanVel);
        let regBias = (abs(candVel.x) + abs(candVel.y)) * 0.0010 + (diffC.x + diffC.y) * 0.0048;
        let cost = candSad + regBias;
        if (d == 0) { sadPosX = cost; }
        else if (d == 1) { sadNegX = cost; }
        else if (d == 2) { sadPosY = cost; }
        else { sadNegY = cost; }

        if (cost < bestSad) {
          bestSad = candSad;
          bestVel = candVel;
          movedFromCenter = true;
        }
      }

      if (!movedFromCenter) {
        let denomX = sadNegX - 2.0 * sadCenter + sadPosX;
        let denomY = sadNegY - 2.0 * sadCenter + sadPosY;
        var subOffset = vec2<f32>(0.0);
        if (denomX > 0.00015) {
          subOffset.x = clamp(0.5 * (sadNegX - sadPosX) / denomX, -0.45, 0.45) * r1;
        }
        if (denomY > 0.00015) {
          subOffset.y = clamp(0.5 * (sadNegY - sadPosY) / denomY, -0.45, 0.45) * r1;
        }
        bestVel = clamp(centerVel1 + subOffset, vec2<f32>(-0.97), vec2<f32>(0.97));
      }
    }
  }

  // Level 0 Sub-Pixel Lucas-Kanade Gradient Refinement
  if (!isStaticBlock && u.pyrLevel == 0 && bestSad > 0.0020) {
    let lkStep = u.texelStep * 1.05;
    let uv0 = clamp(v_uv - 0.5 * bestVel * maxShift, vec2<f32>(0.003), vec2<f32>(0.997));
    let uv1 = clamp(v_uv + 0.5 * bestVel * maxShift, vec2<f32>(0.003), vec2<f32>(0.997));

    let m0C = getLuma(textureSampleLevel(u_prevTex, u_samp, uv0, 0.0).rgb);
    let m0E = getLuma(textureSampleLevel(u_prevTex, u_samp, uv0 + vec2<f32>( lkStep.x, 0.0), 0.0).rgb);
    let m0W = getLuma(textureSampleLevel(u_prevTex, u_samp, uv0 + vec2<f32>(-lkStep.x, 0.0), 0.0).rgb);
    let m0S = getLuma(textureSampleLevel(u_prevTex, u_samp, uv0 + vec2<f32>(0.0,  lkStep.y), 0.0).rgb);
    let m0N = getLuma(textureSampleLevel(u_prevTex, u_samp, uv0 + vec2<f32>(0.0, -lkStep.y), 0.0).rgb);

    let m1C = getLuma(textureSampleLevel(u_currTex, u_samp, uv1, 0.0).rgb);
    let m1E = getLuma(textureSampleLevel(u_currTex, u_samp, uv1 + vec2<f32>( lkStep.x, 0.0), 0.0).rgb);
    let m1W = getLuma(textureSampleLevel(u_currTex, u_samp, uv1 + vec2<f32>(-lkStep.x, 0.0), 0.0).rgb);
    let m1S = getLuma(textureSampleLevel(u_currTex, u_samp, uv1 + vec2<f32>(0.0,  lkStep.y), 0.0).rgb);
    let m1N = getLuma(textureSampleLevel(u_currTex, u_samp, uv1 + vec2<f32>(0.0, -lkStep.y), 0.0).rgb);

    let ix = 0.25 * ((m1E - m1W) + (m0E - m0W));
    let iy = 0.25 * ((m1S - m1N) + (m0S - m0N));
    let it = m1C - m0C;
    let gradMagSq = ix * ix + iy * iy;
    if (gradMagSq > 0.00035) {
      let reg = select(0.0035, 0.0045, u.adrenoOpt == 1);
      var deltaPixels = -it * vec2<f32>(ix, iy) / (gradMagSq + reg);
      deltaPixels = clamp(deltaPixels, vec2<f32>(-0.75), vec2<f32>(0.75));
      let deltaVel = (deltaPixels * lkStep) / maxShift;
      let refinedVel = clamp(bestVel + deltaVel, vec2<f32>(-0.97), vec2<f32>(0.97));
      let refinedSad = evalSymmetricSad(v_uv, refinedVel * maxShift, pStep);
      if (refinedSad <= bestSad + 0.0004) {
        bestVel = refinedVel;
        bestSad = refinedSad;
      }
    }
  }

  // Structure-Aware Dense Flow Fill-In:
  // Flat/smooth regions (low e0/e1) MUST NOT invent random outlier vectors from compression noise;
  // they smoothly inherit the coherent parent/neighbor velocity (refCoherent).
  let structureGate = smoothstep(0.0005, 0.0055, max(e0, e1));
  let changeGate = smoothstep(0.0004, 0.0042, zeroSad);
  let improvementRatio = bestSad / max(zeroSad, 0.0004);
  let improvementGate = smoothstep(0.98, 0.70, improvementRatio);
  let localMeasTrust = select(
    structureGate * mix(0.50, 1.0, improvementGate),
    structureGate * changeGate * mix(0.45, 1.0, improvementGate),
    u.pyrLevel == 0
  );

  let matchConf = smoothstep(0.28, 0.012, bestSad) * mix(0.50, 1.0, improvementGate);
  let cutGuard = select(1.0, smoothstep(0.45, 0.20, bestSad), u.sceneCutProtect == 1);
  let finalConf = clamp(matchConf * cutGuard, 0.0, 1.0);
  let sadErrorNorm = clamp(bestSad * 4.5, 0.0, 1.0);

  let rawVel = bestVel * cutGuard;
  let refCoherent = select(pyramidMeanVel * cutGuard, mix(pyramidMeanVel, tempVel, 0.20) * cutGuard, u.pyrLevel == 0);
  let velDiff = length(rawVel - refCoherent);
  let cohAgree = smoothstep(0.32, 0.03, velDiff);

  let blendWeight = select(
    mix(0.14, 0.88, cohAgree * localMeasTrust * (0.30 + 0.70 * finalConf)),
    mix(0.60, 0.94, finalConf * (0.35 + 0.65 * structureGate)),
    u.pyrLevel == 4
  );
  var finalVel = clamp(mix(refCoherent, rawVel, blendWeight), vec2<f32>(-0.97), vec2<f32>(0.97));

  // Seam-Free Workgroup Shared-Memory Median + Bilateral Regularizer
  wgVel[localIdx] = finalVel;
  wgConf[localIdx] = localMeasTrust * finalConf;
  workgroupBarrier();

  let nxW = select(0u, lid.x - 1u, lid.x > 0u);
  let nxE = min(7u, lid.x + 1u);
  let nyN = select(0u, lid.y - 1u, lid.y > 0u);
  let nyS = min(7u, lid.y + 1u);

  let vN = wgVel[nyN * 8u + lid.x];
  let vS = wgVel[nyS * 8u + lid.x];
  let vW = wgVel[lid.y * 8u + nxW];
  let vE = wgVel[lid.y * 8u + nxE];

  let wgMin = min(min(vN, vS), min(vW, vE));
  let wgMax = max(max(vN, vS), max(vW, vE));
  let clampedCenter = mix(finalVel, clamp(finalVel, wgMin, wgMax), 0.65);

  let cN = (wgConf[nyN * 8u + lid.x] + 0.15) / (1.0 + dot(vN - clampedCenter, vN - clampedCenter) * 28.0);
  let cS = (wgConf[nyS * 8u + lid.x] + 0.15) / (1.0 + dot(vS - clampedCenter, vS - clampedCenter) * 28.0);
  let cW = (wgConf[lid.y * 8u + nxW] + 0.15) / (1.0 + dot(vW - clampedCenter, vW - clampedCenter) * 28.0);
  let cE = (wgConf[lid.y * 8u + nxE] + 0.15) / (1.0 + dot(vE - clampedCenter, vE - clampedCenter) * 28.0);
  let tileNeighborVel = (vN * cN + vS * cS + vW * cW + vE * cE) / max(cN + cS + cW + cE, 0.0001);
  let fillPull = select(0.22, 0.42 * (1.0 - localMeasTrust * 0.75), u.pyrLevel == 0);
  finalVel = clamp(mix(clampedCenter, tileNeighborVel, fillPull), vec2<f32>(-0.97), vec2<f32>(0.97));

  if (inBounds) {
    textureStore(u_outFlowTex, vec2<i32>(safeCoord), vec4<f32>(finalVel, finalConf, sadErrorNorm));
  }
}

@compute @workgroup_size(8, 8, 1)
fn cs_sad_heatmap(@builtin(global_invocation_id) gid: vec3<u32>) {
  let outW = max(1u, u32(u.outDims.x));
  let outH = max(1u, u32(u.outDims.y));
  if (gid.x >= outW || gid.y >= outH) { return; }
  let uv = (vec2<f32>(gid.xy) + 0.5) / max(u.outDims, vec2<f32>(1.0));
  let sadNorm = textureSampleLevel(u_lastFlowTex, u_samp, uv, 0.0).a;
  textureStore(u_outFlowTex, vec2<i32>(gid.xy), vec4<f32>(sadToThermalHeatmap(sadNorm), sadNorm));
}

@compute @workgroup_size(8, 8, 1)
fn cs_clear_flow(@builtin(global_invocation_id) gid: vec3<u32>) {
  let outW = max(1u, u32(u.outDims.x));
  let outH = max(1u, u32(u.outDims.y));
  if (gid.x >= outW || gid.y >= outH) { return; }
  textureStore(u_outFlowTex, vec2<i32>(gid.xy), vec4<f32>(0.0, 0.0, 1.0, 0.0));
}
`;

// Pass 2 WGSL Render Shader:
// Tear-Free Continuous Motion Synthesis + Smooth Bidirectional Occlusion Resolver + Stage A/B Post-Processing
export const WGSL_SYNTH_RENDER_SHADER = /* wgsl */ `
struct SynthUniforms {
  uvScale: vec2<f32>,
  sourceTexel: vec2<f32>,
  flowStep: vec2<f32>,
  alpha: f32,
  strength: f32,
  maxShift: f32,
  haloGuard: f32,
  brightness: f32,
  contrast: f32,
  saturation: f32,
  blackPoint: f32,
  debandStrength: f32,
  lutStrength: f32,
  hdrStrength: f32,
  targetFps: f32,
  upscaleFactor: f32,
  upscaleSharpness: f32,
  upscaleDenoise: f32,
  coherenceGuard: f32,
  mode: i32,
  splitCompare: i32,
  monochrome: i32,
  showVectors: i32,
  showSadHeatmap: i32,
  upscaleMode: i32,
  adrenoOpt: i32,
  adrenoTrue10: i32,
  fboPass: i32,
  subframeCascade: i32,
  fp16Flow: i32,
  useStageATex: i32,
  _pad0: vec2<f32>,
};

@group(0) @binding(0) var<uniform> u: SynthUniforms;
@group(0) @binding(1) var u_prevTex: texture_2d<f32>;
@group(0) @binding(2) var u_currTex: texture_2d<f32>;
@group(0) @binding(3) var u_flowTex: texture_2d<f32>;
@group(0) @binding(4) var u_sadDebugTex: texture_2d<f32>;
@group(0) @binding(5) var u_subframeMidTex: texture_2d<f32>;
@group(0) @binding(6) var u_lutTex: texture_2d<f32>;
@group(0) @binding(7) var u_subframeQ1Tex: texture_2d<f32>;
@group(0) @binding(8) var u_subframeQ3Tex: texture_2d<f32>;
@group(0) @binding(9) var u_animeGradTex: texture_2d<f32>;
@group(0) @binding(10) var u_samp: sampler;

struct VsOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) v_uv: vec2<f32>,
};

@vertex
fn vs_synth(@builtin(vertex_index) vid: u32) -> VsOut {
  var positions = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>(-1.0,  1.0),
    vec2<f32>(-1.0,  1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>( 1.0,  1.0)
  );
  let p = positions[vid];
  var out: VsOut;
  out.pos = vec4<f32>(p, 0.0, 1.0);
  out.v_uv = vec2<f32>((p.x + 1.0) * 0.5, (1.0 - p.y) * 0.5);
  return out;
}

fn decodeFlow(rg: vec2<f32>) -> vec2<f32> {
  return clamp(rg, vec2<f32>(-1.0), vec2<f32>(1.0));
}

fn getLuma(c: vec3<f32>) -> f32 {
  return dot(c, vec3<f32>(0.299, 0.587, 0.114));
}

fn sampleCrispTex(tex: texture_2d<f32>, uv: vec2<f32>, srcTexel: vec2<f32>) -> vec3<f32> {
  let c = textureSampleLevel(tex, u_samp, uv, 0.0).rgb;
  let texPos = uv / max(srcTexel, vec2<f32>(0.00001));
  let f = fract(texPos);
  let subFrac = 0.5 * ((4.0 * f.x * (1.0 - f.x)) + (4.0 * f.y * (1.0 - f.y)));
  if (subFrac < 0.06) { return c; }
  let stepDiag = srcTexel * 0.75;
  let n1 = textureSampleLevel(tex, u_samp, clamp(uv + vec2<f32>(-stepDiag.x, -stepDiag.y), vec2<f32>(0.001), vec2<f32>(0.999)), 0.0).rgb;
  let n2 = textureSampleLevel(tex, u_samp, clamp(uv + vec2<f32>( stepDiag.x, -stepDiag.y), vec2<f32>(0.001), vec2<f32>(0.999)), 0.0).rgb;
  let n3 = textureSampleLevel(tex, u_samp, clamp(uv + vec2<f32>(-stepDiag.x,  stepDiag.y), vec2<f32>(0.001), vec2<f32>(0.999)), 0.0).rgb;
  let n4 = textureSampleLevel(tex, u_samp, clamp(uv + vec2<f32>( stepDiag.x,  stepDiag.y), vec2<f32>(0.001), vec2<f32>(0.999)), 0.0).rgb;
  let avgN = 0.25 * (n1 + n2 + n3 + n4);
  let nMin = min(c, min(min(n1, n2), min(n3, n4)));
  let nMax = max(c, max(max(n1, n2), max(n3, n4)));
  return clamp(c + (c - avgN) * (0.24 * subFrac), nMin, nMax);
}

fn gsrFastLanczos2(dSq: f32) -> f32 {
  let w = clamp(1.0 - dSq * 0.45, 0.0, 1.0);
  return w * w * (2.2 * w - 1.2);
}

fn sample3DLutStrip(col: vec3<f32>) -> vec3<f32> {
  let c = clamp(col, vec3<f32>(0.0), vec3<f32>(1.0));
  let bSlice = c.b * 15.0;
  let b0 = floor(bSlice);
  let b1 = min(15.0, b0 + 1.0);
  let bf = bSlice - b0;
  let uBase = (c.r * 15.0 + 0.5) / 256.0;
  let vCoord = (c.g * 15.0 + 15.0 * 0.0 + 0.5) / 16.0;
  let s0 = textureSampleLevel(u_lutTex, u_samp, vec2<f32>(uBase + b0 / 16.0, vCoord), 0.0).rgb;
  let s1 = textureSampleLevel(u_lutTex, u_samp, vec2<f32>(uBase + b1 / 16.0, vCoord), 0.0).rgb;
  return mix(s0, s1, bf);
}

fn samplePostTex(useStageATex: i32, uv: vec2<f32>) -> vec3<f32> {
  let cUv = clamp(uv, vec2<f32>(0.001), vec2<f32>(0.999));
  if (useStageATex == 1) {
    return textureSampleLevel(u_animeGradTex, u_samp, cUv, 0.0).rgb;
  }
  return textureSampleLevel(u_currTex, u_samp, cUv, 0.0).rgb;
}

fn applyFusedDenoiseAndUpscale(
  fragXY: vec2<f32>,
  inColor: vec3<f32>,
  uvSample: vec2<f32>,
  upMode: i32,
  upFactor: f32,
  sharpness: f32,
  denoiseStrength: f32,
  debandStr: f32,
  motionStress: f32,
  occDamp: f32,
  useStageATex: i32
) -> vec4<f32> {
  let factorNorm = clamp((upFactor - 1.5) / 2.5, 0.0, 1.0);
  let texel = u.sourceTexel * select(0.90, mix(0.90, 0.65, factorNorm), upMode > 0);
  let dStr = clamp(denoiseStrength + motionStress * 0.12, 0.0, 1.0);
  if (dStr <= 0.01 && debandStr <= 0.01 && upMode <= 0) {
    return vec4<f32>(inColor, 0.0);
  }

  let cN  = samplePostTex(useStageATex, uvSample + vec2<f32>(0.0, -texel.y));
  let cS  = samplePostTex(useStageATex, uvSample + vec2<f32>(0.0,  texel.y));
  let cW  = samplePostTex(useStageATex, uvSample + vec2<f32>(-texel.x, 0.0));
  let cE  = samplePostTex(useStageATex, uvSample + vec2<f32>( texel.x, 0.0));
  let cNW = samplePostTex(useStageATex, uvSample + vec2<f32>(-texel.x, -texel.y) * 0.85);
  let cNE = samplePostTex(useStageATex, uvSample + vec2<f32>( texel.x, -texel.y) * 0.85);
  let cSW = samplePostTex(useStageATex, uvSample + vec2<f32>(-texel.x,  texel.y) * 0.85);
  let cSE = samplePostTex(useStageATex, uvSample + vec2<f32>( texel.x,  texel.y) * 0.85);

  let minCard = min(min(cN, cS), min(cW, cE));
  let maxCard = max(max(cN, cS), max(cW, cE));
  let minDiag = min(min(cNW, cSE), min(cNE, cSW));
  let maxDiag = max(max(cNW, cSE), max(cNE, cSW));

  var cleanBase = inColor;
  if (dStr > 0.01) {
    let softMin = max(min(minCard, minDiag), min(maxCard, minDiag) * 0.5 + min(minCard, minDiag) * 0.5);
    let softMax = min(max(maxCard, maxDiag), max(minCard, maxDiag) * 0.5 + max(maxCard, maxDiag) * 0.5);
    let despiked = mix(inColor, clamp(inColor, softMin, softMax), clamp(dStr * 0.85, 0.0, 0.92));

    let invSigmaSq = mix(140.0, 38.0, dStr);
    let wN  = 1.0 / (1.0 + dot(cN  - despiked, cN  - despiked) * invSigmaSq);
    let wS  = 1.0 / (1.0 + dot(cS  - despiked, cS  - despiked) * invSigmaSq);
    let wW  = 1.0 / (1.0 + dot(cW  - despiked, cW  - despiked) * invSigmaSq);
    let wE  = 1.0 / (1.0 + dot(cE  - despiked, cE  - despiked) * invSigmaSq);
    let wNW = 0.7 / (1.0 + dot(cNW - despiked, cNW - despiked) * invSigmaSq);
    let wNE = 0.7 / (1.0 + dot(cNE - despiked, cNE - despiked) * invSigmaSq);
    let wSW = 0.7 / (1.0 + dot(cSW - despiked, cSW - despiked) * invSigmaSq);
    let wSE = 0.7 / (1.0 + dot(cSE - despiked, cSE - despiked) * invSigmaSq);
    let wCenter = mix(2.2, 0.95, dStr);

    let wTotal = wCenter + wN + wS + wW + wE + wNW + wNE + wSW + wSE;
    let bilateral = (
      despiked * wCenter +
      cN * wN + cS * wS + cW * wW + cE * wE +
      cNW * wNW + cNE * wNE + cSW * wSW + cSE * wSE
    ) / max(wTotal, 0.0001);

    cleanBase = clamp(mix(despiked, bilateral, clamp(dStr * 0.88, 0.0, 0.90)), vec3<f32>(0.0), vec3<f32>(1.0));
  }

  if (debandStr > 0.01) {
    let avg8Deband = (cN + cS + cW + cE + cNW + cNE + cSW + cSE) * 0.125;
    let maxDiffCard = max(
      max(abs(cN - cleanBase), abs(cS - cleanBase)),
      max(abs(cW - cleanBase), abs(cE - cleanBase))
    );
    let thresh = mix(0.006, 0.036, debandStr);
    let bandMask = vec3<f32>(1.0) - smoothstep(vec3<f32>(thresh * 0.35), vec3<f32>(thresh), maxDiffCard);
    let bn1 = fract(52.9829189 * fract(dot(fragXY, vec2<f32>(0.06711056, 0.00583715))));
    let bn2 = fract(52.9829189 * fract(dot(fragXY + vec2<f32>(11.0, 23.0), vec2<f32>(0.06711056, 0.00583715))));
    let blueDither = ((bn1 + bn2) - 1.0) * (mix(1.2, 4.2, debandStr) / 255.0);
    cleanBase = clamp(mix(cleanBase, avg8Deband + vec3<f32>(blueDither), bandMask * debandStr * 0.88), vec3<f32>(0.0), vec3<f32>(1.0));
  }

  if (upMode <= 0) {
    return vec4<f32>(cleanBase, 0.0);
  }

  let lC  = getLuma(cleanBase);
  let lN  = getLuma(cN);
  let lS  = getLuma(cS);
  let lW  = getLuma(cW);
  let lE  = getLuma(cE);
  let lNW = getLuma(cNW);
  let lNE = getLuma(cNE);
  let lSW = getLuma(cSW);
  let lSE = getLuma(cSE);

  let avgCross = 0.25 * (cN + cS + cW + cE);
  let avgDiag  = 0.25 * (cNW + cNE + cSW + cSE);
  let avg8     = avgCross * 0.68 + avgDiag * 0.32;

  let nbhMin  = min(cleanBase, min(minCard, minDiag));
  let nbhMax  = max(cleanBase, max(maxCard, maxDiag));
  let effSharp = sharpness * (1.0 + 0.22 * factorNorm) * (1.0 - 0.32 * clamp(denoiseStrength, 0.0, 1.0));

  if (upMode == 2) {
    let cNN = samplePostTex(useStageATex, uvSample + vec2<f32>(0.0, -2.0 * texel.y));
    let cSS = samplePostTex(useStageATex, uvSample + vec2<f32>(0.0,  2.0 * texel.y));
    let cWW = samplePostTex(useStageATex, uvSample + vec2<f32>(-2.0 * texel.x, 0.0));
    let cEE = samplePostTex(useStageATex, uvSample + vec2<f32>( 2.0 * texel.x, 0.0));

    let gC = clamp(length(vec2<f32>(lE - lW, lS - lN)) * 1.45, 0.0, 1.0);
    let gN = length(vec2<f32>(lNE - lNW, lC - getLuma(cNN)));
    let gS = length(vec2<f32>(lSE - lSW, getLuma(cSS) - lC));
    let gW = length(vec2<f32>(lC - getLuma(cWW), lSW - lNW));
    let gE = length(vec2<f32>(getLuma(cEE) - lC, lSE - lNE));

    let gradAscent = vec2<f32>(gE - gW, gS - gN);
    let ascentLen = length(gradAscent);
    let pushDir = select(vec2<f32>(0.0), gradAscent / max(ascentLen, 0.0005), ascentLen > 0.0005);
    let pushStrength = clamp(ascentLen * (0.65 + 0.70 * effSharp) * occDamp, 0.0, 0.82);
    let pushedUV = clamp(uvSample - pushDir * texel * pushStrength * (0.55 + 0.35 * factorNorm), vec2<f32>(0.001), vec2<f32>(0.999));
    let pushedCol = samplePostTex(useStageATex, pushedUV);

    let tangentStep = vec2<f32>(-pushDir.y, pushDir.x) * texel * 0.65;
    let tangA = samplePostTex(useStageATex, pushedUV + tangentStep);
    let tangB = samplePostTex(useStageATex, pushedUV - tangentStep);
    let directionalLine = mix(pushedCol, 0.5 * (tangA + tangB), 0.22 * smoothstep(0.08, 0.42, gC));
    let highFreq = (directionalLine - avg8) * (0.36 * effSharp * occDamp);
    return vec4<f32>(clamp(directionalLine + highFreq, nbhMin, nbhMax), gC);
  }

  let rawDetail = cleanBase - avg8;
  let detailMag = length(rawDetail);
  let noiseFloor = mix(0.004, 0.026, clamp(denoiseStrength, 0.0, 1.0));
  let coringGate = smoothstep(noiseFloor, noiseFloor * 3.0 + 0.006, detailMag);
  let zeroDcDetail = rawDetail * coringGate * occDamp;

  let span     = max(nbhMax - nbhMin, vec3<f32>(0.012));
  let minBound = clamp(cleanBase - span * 0.52, vec3<f32>(0.0), vec3<f32>(1.0));
  let maxBound = clamp(cleanBase + span * 0.52, vec3<f32>(0.0), vec3<f32>(1.0));
  let gradMag = abs(lN - lS) + abs(lE - lW) + 0.5 * (abs(lNW - lSE) + abs(lNE - lSW));

  if (upMode == 4) {
    let gx = (lE - lW) + 0.5 * ((lNE - lNW) + (lSE - lSW));
    let gy = (lS - lN) + 0.5 * ((lSE - lNE) + (lSW - lNW));
    let gradLen = max(length(vec2<f32>(gx, gy)), 0.0005);
    let edgeWeight = smoothstep(0.012, 0.16, gradLen);
    let gsrGain = mix(0.48, 1.38, clamp(effSharp * 0.82, 0.0, 1.0)) * gsrFastLanczos2(gradLen * 1.25);
    let gsrBase = mix(cleanBase, mix(cleanBase, avg8, 0.24 * edgeWeight), occDamp);
    return vec4<f32>(clamp(gsrBase + zeroDcDetail * gsrGain, minBound, maxBound), 0.0);
  } else if (upMode == 1) {
    let minL = min(lC, min(min(lN, lS), min(lW, lE)));
    let maxL = max(lC, max(max(lN, lS), max(lW, lE)));
    let casAmp = sqrt(clamp(min(minL, 1.0 - maxL) / max(maxL, 0.001), 0.0, 1.0));
    let gain = casAmp * mix(0.45, 1.32, clamp(effSharp * 0.80, 0.0, 1.0));
    return vec4<f32>(clamp(cleanBase + zeroDcDetail * gain, minBound, maxBound), 0.0);
  } else {
    let midToneBell = 4.0 * lC * (1.0 - lC);
    let ringingGuard = 1.0 - smoothstep(0.16, 0.50, gradMag);
    let boost = (0.52 + 1.02 * effSharp) * mix(0.48, 1.0, midToneBell) * mix(0.55, 1.0, ringingGuard);
    return vec4<f32>(clamp(cleanBase + zeroDcDetail * boost, minBound, maxBound), 0.0);
  }
}

fn applyHdr10ToneMap(fragXY: vec2<f32>, color: vec3<f32>, intensity: f32, adrenoOpt: i32, true10Mode: i32) -> vec3<f32> {
  let lin = select(
    pow(max(color, vec3<f32>(0.0001)), vec3<f32>(2.2)),
    color * color * (0.72 + 0.28 * color),
    adrenoOpt == 1
  );
  let luma = dot(lin, vec3<f32>(0.2126, 0.7152, 0.0722));
  let shadowToe = smoothstep(0.0, 0.26, luma);
  let specPeak = 1.0 + smoothstep(0.28, 0.94, luma) * select(0.94, 1.06, true10Mode == 1) * intensity;
  let hdrLin = lin * mix(0.85, specPeak, shadowToe);
  let hdrLuma = dot(hdrLin, vec3<f32>(0.2126, 0.7152, 0.0722));

  let maxC = max(hdrLin.r, max(hdrLin.g, hdrLin.b));
  let minC = min(hdrLin.r, min(hdrLin.g, hdrLin.b));
  let sat = (maxC - minC) / max(maxC, 0.001);
  let vibranceWeight = (1.0 - sat * 0.45) * select(0.35, 0.42, true10Mode == 1) * intensity;
  let wideGamut = mix(vec3<f32>(hdrLuma), hdrLin, 1.0 + vibranceWeight);

  let x = max(vec3<f32>(0.0), wideGamut * (1.0 + 0.18 * intensity));
  let aces = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);
  let clampAces = clamp(aces, vec3<f32>(0.0), vec3<f32>(1.0));
  let mapped = select(
    pow(clampAces, vec3<f32>(1.0 / 2.2)),
    sqrt(clampAces) * (0.94 + 0.06 * clampAces),
    adrenoOpt == 1
  );
  let res = mix(color, mapped, clamp(intensity, 0.0, 1.5));

  let ign1 = fract(52.9829189 * fract(dot(fragXY, vec2<f32>(0.06711056, 0.00583715))));
  let ign2 = fract(52.9829189 * fract(dot(fragXY + vec2<f32>(17.0, 31.0), vec2<f32>(0.06711056, 0.00583715))));
  let tpdf = (ign1 + ign2) - 1.0;
  let ditherAmp = select(1.1 / 511.0, 1.6 / 1023.0, true10Mode == 1);
  return clamp(res + vec3<f32>(tpdf * ditherAmp), vec3<f32>(0.0), vec3<f32>(1.0));
}

fn distToSegment(p: vec2<f32>, a: vec2<f32>, b: vec2<f32>) -> f32 {
  let pa = p - a;
  let ba = b - a;
  let h = clamp(dot(pa, ba) / max(dot(ba, ba), 0.00001), 0.0, 1.0);
  return length(pa - ba * h);
}

@fragment
fn fs_synth(in: VsOut) -> @location(0) vec4<f32> {
  let mappedUV = select(((in.v_uv - 0.5) * u.uvScale + 0.5), in.v_uv, u.fboPass >= 1);
  if (u.fboPass == 0 && (mappedUV.x < 0.0 || mappedUV.x > 1.0 || mappedUV.y < 0.0 || mappedUV.y > 1.0)) {
    return vec4<f32>(0.0, 0.0, 0.0, 1.0);
  }

  let isOriginalSide = (u.fboPass == 0 && u.splitCompare == 1 && in.v_uv.x < 0.5);
  var occBias: f32 = 0.0;
  var outColor = vec3<f32>(0.0);
  var upscalerUvCurr = mappedUV;

  if (u.fboPass == 0 && u.useStageATex == 1 && !isOriginalSide) {
    let stageAData = textureSampleLevel(u_animeGradTex, u_samp, mappedUV, 0.0);
    outColor = stageAData.rgb;
    occBias = stageAData.a;
    upscalerUvCurr = mappedUV;
  } else if (isOriginalSide || u.alpha <= 0.005) {
    outColor = textureSampleLevel(u_prevTex, u_samp, mappedUV, 0.0).rgb;
  } else if (u.mode == 0 || u.alpha >= 0.995) {
    outColor = textureSampleLevel(u_currTex, u_samp, mappedUV, 0.0).rgb;
  } else if (u.mode == 1) {
    let pCol = textureSampleLevel(u_prevTex, u_samp, mappedUV, 0.0).rgb;
    let cCol = textureSampleLevel(u_currTex, u_samp, mappedUV, 0.0).rgb;
    outColor = mix(pCol, cCol, u.alpha);
  } else {
    let isRifeEngine = (u.mode == 3);
    let flowStep = u.flowStep;
    let flowC = textureSampleLevel(u_flowTex, u_samp, mappedUV, 0.0);
    let flowN = textureSampleLevel(u_flowTex, u_samp, mappedUV + vec2<f32>(0.0, -flowStep.y), 0.0);
    let flowS = textureSampleLevel(u_flowTex, u_samp, mappedUV + vec2<f32>(0.0,  flowStep.y), 0.0);
    let flowW = textureSampleLevel(u_flowTex, u_samp, mappedUV + vec2<f32>(-flowStep.x, 0.0), 0.0);
    let flowE = textureSampleLevel(u_flowTex, u_samp, mappedUV + vec2<f32>( flowStep.x, 0.0), 0.0);

    let vC = decodeFlow(flowC.rg);
    let vN = decodeFlow(flowN.rg);
    let vS = decodeFlow(flowS.rg);
    let vW = decodeFlow(flowW.rg);
    let vE = decodeFlow(flowE.rg);

    let patchOff = u.sourceTexel * 1.25;
    let unwarpedPrev = textureSampleLevel(u_prevTex, u_samp, mappedUV, 0.0).rgb;
    let unwarpedCurr = textureSampleLevel(u_currTex, u_samp, mappedUV, 0.0).rgb;

    // 5-Tap Morphological Vector Median Clamp (strips isolated spikes before warping)
    let vMinCard = min(min(vN, vS), min(vW, vE));
    let vMaxCard = max(max(vN, vS), max(vW, vE));
    let vMedC = clamp(vC, vMinCard, vMaxCard);
    let baseMean = vMedC * 0.40 + (vN + vS + vW + vE) * 0.15;

    let qC = (0.40 + flowC.b) * (1.15 - 0.60 * flowC.a);
    let qN = (0.32 + flowN.b) * (1.15 - 0.60 * flowN.a);
    let qS = (0.32 + flowS.b) * (1.15 - 0.60 * flowS.a);
    let qW = (0.32 + flowW.b) * (1.15 - 0.60 * flowW.a);
    let qE = (0.32 + flowE.b) * (1.15 - 0.60 * flowE.a);

    let wC = qC * 1.50 / (1.0 + dot(vMedC - baseMean, vMedC - baseMean) * 14.0);
    let wN = qN / (1.0 + dot(vN - baseMean, vN - baseMean) * 14.0);
    let wS = qS / (1.0 + dot(vS - baseMean, vS - baseMean) * 14.0);
    let wW = qW / (1.0 + dot(vW - baseMean, vW - baseMean) * 14.0);
    let wE = qE / (1.0 + dot(vE - baseMean, vE - baseMean) * 14.0);
    let wSum = max(wC + wN + wS + wW + wE, 0.0001);
    var cleanVel = (vMedC * wC + vN * wN + vS * wS + vW * wW + vE * wE) / wSum;

    // Smooth 9-Tap ContextNet Regularizer
    let flowNW = textureSampleLevel(u_flowTex, u_samp, mappedUV + vec2<f32>(-flowStep.x, -flowStep.y), 0.0);
    let flowNE = textureSampleLevel(u_flowTex, u_samp, mappedUV + vec2<f32>( flowStep.x, -flowStep.y), 0.0);
    let flowSW = textureSampleLevel(u_flowTex, u_samp, mappedUV + vec2<f32>(-flowStep.x,  flowStep.y), 0.0);
    let flowSE = textureSampleLevel(u_flowTex, u_samp, mappedUV + vec2<f32>( flowStep.x,  flowStep.y), 0.0);
    let vNW = clamp(decodeFlow(flowNW.rg), vMinCard, vMaxCard);
    let vNE = clamp(decodeFlow(flowNE.rg), vMinCard, vMaxCard);
    let vSW = clamp(decodeFlow(flowSW.rg), vMinCard, vMaxCard);
    let vSE = clamp(decodeFlow(flowSE.rg), vMinCard, vMaxCard);
    let diagAvg = 0.25 * (vNW + vNE + vSW + vSE);
    cleanVel = mix(cleanVel, diagAvg, select(0.18, 0.28, isRifeEngine));

    let sourceAspect = select(16.0 / 9.0, u.sourceTexel.y / max(u.sourceTexel.x, 0.00001), u.sourceTexel.y > 0.0);
    let shiftScaleUV = vec2<f32>(u.maxShift, u.maxShift * clamp(sourceAspect, 0.5, 2.4)) * u.strength;

    // Continuous Phase-Aligned Flow Lookup (NO per-pixel RGB branch switching — 100% C1 spatial continuity!)
    let uvMidLocal = clamp(mappedUV + (0.5 - u.alpha) * (cleanVel * shiftScaleUV) * 0.65, vec2<f32>(0.001), vec2<f32>(0.999));
    let vMidRaw = decodeFlow(textureSampleLevel(u_flowTex, u_samp, uvMidLocal, 0.0).rg);
    let vMidClamped = clamp(vMidRaw, vMinCard, vMaxCard);
    let midAgree = smoothstep(0.22, 0.02, length(vMidClamped - cleanVel));
    cleanVel = mix(cleanVel, vMidClamped, 0.42 * midAgree);

    let chosenShiftUV = cleanVel * shiftScaleUV;
    let uvPrev = clamp(mappedUV - u.alpha * chosenShiftUV, vec2<f32>(0.001), vec2<f32>(0.999));
    let uvCurr = clamp(mappedUV + (1.0 - u.alpha) * chosenShiftUV, vec2<f32>(0.001), vec2<f32>(0.999));

    let warpedPrev = sampleCrispTex(u_prevTex, uvPrev, u.sourceTexel);
    let warpedCurr = sampleCrispTex(u_currTex, uvCurr, u.sourceTexel);
    let wpD = textureSampleLevel(u_prevTex, u_samp, clamp(uvPrev + patchOff, vec2<f32>(0.001), vec2<f32>(0.999)), 0.0).rgb;
    let wcD = textureSampleLevel(u_currTex, u_samp, clamp(uvCurr + patchOff, vec2<f32>(0.001), vec2<f32>(0.999)), 0.0).rgb;
    let warpErr = length(warpedPrev - warpedCurr) * 0.62 + length(wpD - wcD) * 0.38;

    let flowDiv = (vE.x - vW.x) + (vS.y - vN.y);
    let velShear = length(vE - vW) + length(vS - vN);
    let velMag = length(cleanVel);
    let phaseEnv = 4.0 * u.alpha * (1.0 - u.alpha);

    // Smooth Bidirectional Occlusion Resolver (warpedPrev vs warpedCurr — NEVER rips back to unwarped V=0!)
    let uvPrevHalf = mix(mappedUV, uvPrev, 0.5);
    let uvCurrHalf = mix(mappedUV, uvCurr, 0.5);
    let flowAtPrev = textureSampleLevel(u_flowTex, u_samp, uvPrevHalf, 0.0);
    let flowAtCurr = textureSampleLevel(u_flowTex, u_samp, uvCurrHalf, 0.0);
    let vAtPrev = decodeFlow(flowAtPrev.rg);
    let vAtCurr = decodeFlow(flowAtCurr.rg);
    let errPrev = length(vAtPrev - cleanVel) + flowAtPrev.a * 0.50 + (1.0 - flowAtPrev.b) * 0.25;
    let errCurr = length(vAtCurr - cleanVel) + flowAtCurr.a * 0.50 + (1.0 - flowAtCurr.b) * 0.25;
    let occGain = select(1.25, 1.55, isRifeEngine);
    let occBoundary = smoothstep(0.025, 0.14, warpErr) * smoothstep(0.020, 0.16, velShear + abs(errPrev - errCurr));
    let dirSelect = clamp((errPrev - errCurr) * occGain + flowDiv * 0.35, -0.78, 0.78) * occBoundary;

    let baseWeight = clamp(u.alpha + dirSelect * (0.48 + 0.36 * u.haloGuard) * phaseEnv, 0.0, 1.0);
    // Tear-Free De-Ghosting: when warpedPrev and warpedCurr differ at an occlusion edge, smoothly favor the dominant
    // warped endpoint (warpedPrev or warpedCurr) instead of mixing 50/50 OR ripping back to unwarped V=0!
    let deghostBias = smoothstep(0.06, 0.24, warpErr) * clamp(0.45 + 0.55 * max(u.haloGuard, u.coherenceGuard), 0.35, 1.0);
    let singleEndpointWeight = smoothstep(0.22, 0.78, baseWeight);
    let forwardWeight = mix(baseWeight, singleEndpointWeight, deghostBias * 0.75);
    let primaryWarped = mix(warpedPrev, warpedCurr, forwardWeight);

    // Strict Stationary & Global Scene-Cut Guard ONLY (never triggers on moving objects!)
    let staticDiff = length(unwarpedCurr - unwarpedPrev);
    let staticGuardMask =
      (1.0 - smoothstep(0.0015, 0.0075, velMag)) *
      (1.0 - smoothstep(0.003, 0.014, staticDiff)) *
      smoothstep(0.020, 0.070, warpErr - staticDiff);

    let sceneCutFallback =
      smoothstep(0.38, 0.65, warpErr) *
      smoothstep(0.32, 0.58, staticDiff) *
      (1.0 - flowC.b * 0.80);

    let preserveUnwarped = clamp(max(staticGuardMask, sceneCutFallback), 0.0, 0.95);
    let cleanFastRef = mix(unwarpedPrev, unwarpedCurr, smoothstep(0.25, 0.75, u.alpha));
    outColor = mix(primaryWarped, cleanFastRef, preserveUnwarped);

    upscalerUvCurr = mix(uvCurr, mappedUV, preserveUnwarped);
    occBias = clamp(deghostBias * 0.5 + preserveUnwarped, 0.0, 1.0);
  }

  if (u.fboPass >= 1 && u.fboPass <= 3) {
    return vec4<f32>(clamp(outColor, vec3<f32>(0.0), vec3<f32>(2.0)), 1.0);
  }

  if (u.fboPass == 4) {
    return vec4<f32>(clamp(outColor, vec3<f32>(0.0), vec3<f32>(1.0)), clamp(occBias, 0.0, 1.0));
  }

  // Only execute spatial post-processing when Stage A texture is active OR when rendering raw currTex (alpha >= 0.995 / mode == 0)
  // Prevents sampling u_currTex (T=1.0) over an interpolated frame (T=alpha)!
  let canSamplePostNeighbors = (u.useStageATex == 1 || u.mode == 0 || u.alpha >= 0.995);
  if (!isOriginalSide && canSamplePostNeighbors && (u.upscaleDenoise > 0.01 || u.debandStrength > 0.01 || u.upscaleMode > 0)) {
    let stageBUv = select(upscalerUvCurr, mappedUV, u.useStageATex == 1);
    outColor = applyFusedDenoiseAndUpscale(
      in.pos.xy,
      outColor,
      stageBUv,
      u.upscaleMode,
      u.upscaleFactor,
      u.upscaleSharpness,
      u.upscaleDenoise,
      u.debandStrength,
      occBias,
      1.0 - occBias * 0.65,
      u.useStageATex
    ).rgb;
  }

  if (u.hdrStrength > 0.01 && !isOriginalSide) {
    outColor = applyHdr10ToneMap(in.pos.xy, outColor, u.hdrStrength, u.adrenoOpt, u.adrenoTrue10);
  }
  outColor = clamp(outColor * u.brightness, vec3<f32>(0.0), vec3<f32>(1.0));

  if (!isOriginalSide) {
    if (u.blackPoint > 0.0005 || abs(u.contrast - 1.0) > 0.005 || abs(u.saturation - 1.0) > 0.005) {
      outColor = clamp((outColor - vec3<f32>(u.blackPoint)) / max(1.0 - u.blackPoint, 0.05), vec3<f32>(0.0), vec3<f32>(1.0));
      outColor = clamp((outColor - 0.5) * u.contrast + 0.5, vec3<f32>(0.0), vec3<f32>(1.0));
      let lumaSat = getLuma(outColor);
      outColor = clamp(mix(vec3<f32>(lumaSat), outColor, u.saturation), vec3<f32>(0.0), vec3<f32>(1.0));
    }
    if (u.lutStrength > 0.005) {
      let lutCol = sample3DLutStrip(outColor);
      outColor = mix(outColor, lutCol, clamp(u.lutStrength, 0.0, 1.0));
    }
  }

  if (u.monochrome == 1) {
    var gray = getLuma(outColor);
    gray = clamp((gray - 0.5) * 1.08 + 0.5, 0.0, 1.0);
    outColor = vec3<f32>(gray);
  }

  if (u.showSadHeatmap == 1 && !isOriginalSide) {
    let sadBuf = textureSampleLevel(u_sadDebugTex, u_samp, mappedUV, 0.0);
    let sadVal = sadBuf.a;
    let baseLuma = getLuma(outColor);
    var heatComposite = mix(vec3<f32>(baseLuma * 0.55), sadBuf.rgb, 0.84);
    let cellLocal = abs(fract(mappedUV / max(u.flowStep, vec2<f32>(0.001))) - 0.5);
    let gridEdge = smoothstep(0.43, 0.49, max(cellLocal.x, cellLocal.y));
    let hotZone = smoothstep(0.38, 0.76, sadVal);
    heatComposite = mix(heatComposite, vec3<f32>(1.0, 0.96, 0.90), gridEdge * hotZone * 0.55);
    outColor = heatComposite;
  }

  if (u.showVectors == 1 && u.mode != 0) {
    let gridSize = vec2<f32>(24.0, 13.5);
    let cellCenterUV = (floor(mappedUV * gridSize) + 0.5) / gridSize;
    let cellLocal = fract(mappedUV * gridSize) - 0.5;
    let cellVel = decodeFlow(textureSampleLevel(u_flowTex, u_samp, cellCenterUV, 0.0).rg);
    let warpedGridLocal = abs(fract((mappedUV - cellVel * 0.018) * gridSize) - 0.5);
    if (max(warpedGridLocal.x, warpedGridLocal.y) > 0.472) {
      outColor = mix(outColor, vec3<f32>(0.22, 0.78, 0.98), 0.28);
    }
    let mag = dot(cellVel, cellVel);
    if (mag > 0.0005) {
      let tip = clamp(cellVel * 0.56, vec2<f32>(-0.46), vec2<f32>(0.46));
      let dLine = distToSegment(cellLocal, vec2<f32>(0.0), tip);
      let dTip = length(cellLocal - tip);
      if (dTip < 0.058 || dLine < 0.024) {
        outColor = mix(outColor, vec3<f32>(0.0, 1.0, 0.78), 0.90);
      }
    }
  }

  if (u.splitCompare == 1 && abs(in.v_uv.x - 0.5) < 0.0018) {
    outColor = vec3<f32>(1.0, 1.0, 0.0);
  }

  return vec4<f32>(outColor, 1.0);
}
`;
