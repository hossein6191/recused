"use client";

// An animated simplex-noise gradient drawn in WebGL, used behind the landing hero.
//
// Three rules keep it from costing anything it should not: it stops when the tab is hidden or the
// canvas scrolls out of view, it draws a single still frame when the visitor asks for reduced
// motion, and a browser without WebGL simply shows the background colour with the hero on top.

import * as React from "react";

import { cn } from "@/lib/utils";

const vertexShaderGLSL = `
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const fragmentShaderGLSL = `
precision highp float;
varying vec2 vUv;

uniform vec2  u_resolution;
uniform float u_time;
uniform float u_grain;
uniform vec3  u_colors[4];
uniform vec3  u_bg;

vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }

float snoise(vec2 v){
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
           -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy) );
  vec2 x0 = v -   i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
  + i.x + vec3(0.0, i1.x, 1.0 ));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy),
    dot(x12.zw,x12.zw)), 0.0);
  m = m*m ;
  m = m*m ;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

void main() {
  vec2 uv = vUv;
  float ratio = u_resolution.x / u_resolution.y;
  vec2 p = uv - 0.5;
  p.x *= ratio;

  float t = u_time * 0.1;

  float n1 = snoise(p * 0.4 + vec2(t * 0.2, -t * 0.3));
  float n2 = snoise(p * 0.55 + vec2(-t * 0.15, t * 0.25) + n1 * 0.25);
  float n3 = snoise(p * 0.75 + vec2(t * 0.1, -t * 0.2) + n2 * 0.2);

  vec3 col = u_bg;

  float dist = length(p) * 1.5;
  float vignette = 1.0 - smoothstep(0.3, 1.2, dist);

  col = mix(col, u_colors[0], smoothstep(-0.2, 0.5, n1) * 0.85);
  col = mix(col, u_colors[1], smoothstep(-0.1, 0.6, n2) * 0.7);
  col = mix(col, u_colors[2], smoothstep(-0.3, 0.4, n3) * 0.6);
  col = mix(col, u_colors[3], smoothstep(0.0, 0.7, n1 * n2) * 0.5);

  float glow = smoothstep(0.8, 0.0, dist) * 0.3;
  col += u_colors[1] * glow;

  col = mix(col * 0.2, col, vignette);

  float grain = fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453 + u_time);
  col += (grain - 0.5) * u_grain * 0.1;

  gl_FragColor = vec4(col, 1.0);
}
`;

export type VelarisProps = {
  /** The colour the noise is mixed onto, as #rrggbb. */
  bg?: string;
  /** Up to four #rrggbb colours; fewer are repeated to fill the four the shader reads. */
  colors?: string[];
  speed?: number;
  grain?: number;
  /** Any CSS height. "auto" lets the children decide, which is what the hero does. */
  height?: string;
  className?: string;
  children?: React.ReactNode;
};

const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace("#", "").trim();
  const full = h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h;
  return [
    parseInt(full.slice(0, 2), 16) / 255,
    parseInt(full.slice(2, 4), 16) / 255,
    parseInt(full.slice(4, 6), 16) / 255,
  ];
};

/** Four colours, whatever the caller passed: fewer are repeated, more are dropped. */
function fourColours(colors: string[]): Float32Array {
  const four = Array.from({ length: 4 }, (_, i) => colors[i % Math.max(colors.length, 1)] ?? "#000000");
  return new Float32Array(four.flatMap(hexToRgb));
}

export function Velaris({
  bg = "#0B0E11",
  colors = ["#110FFF", "#9B6AF6", "#E37DF7", "#0B0E11"],
  speed = 2.0,
  grain = 0.3,
  height = "100vh",
  className,
  children,
}: VelarisProps) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  // The colours are read inside the frame loop, so the effect does not restart when the caller
  // passes a fresh array with the same values.
  const key = `${bg}|${colors.join(",")}|${speed}|${grain}`;
  const settings = React.useRef({ bg, colors, speed, grain });
  React.useEffect(() => {
    settings.current = { bg, colors, speed, grain };
  }, [bg, colors, speed, grain]);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const gl = canvas.getContext("webgl", { antialias: false, depth: false, powerPreference: "low-power" });
    if (!gl) return; // no WebGL: the hero keeps its own background and everything still reads

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type);
      if (!s) return null;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
    };

    const vs = compile(gl.VERTEX_SHADER, vertexShaderGLSL);
    const fs = compile(gl.FRAGMENT_SHADER, fragmentShaderGLSL);
    const program = gl.createProgram();
    if (!vs || !fs || !program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const pos = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

    const locs = {
      res: gl.getUniformLocation(program, "u_resolution"),
      time: gl.getUniformLocation(program, "u_time"),
      grain: gl.getUniformLocation(program, "u_grain"),
      colors: gl.getUniformLocation(program, "u_colors"),
      bg: gl.getUniformLocation(program, "u_bg"),
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(container.clientWidth * dpr));
      const h = Math.max(1, Math.round(container.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    };
    resize();

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const draw = (ms: number) => {
      const { bg: b, colors: c, speed: sp, grain: gr } = settings.current;
      gl.uniform2f(locs.res, canvas.width, canvas.height);
      gl.uniform1f(locs.time, ms * 0.001 * sp);
      gl.uniform1f(locs.grain, gr);
      gl.uniform3f(locs.bg, ...hexToRgb(b));
      gl.uniform3fv(locs.colors, fourColours(c));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    let raf = 0;
    let running = false;
    const frame = (ms: number) => {
      draw(ms);
      raf = requestAnimationFrame(frame);
    };
    const start = () => {
      if (running || still) return;
      running = true;
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    // On screen and visible: animate. Anywhere else: nothing is drawn at all.
    let onScreen = true;
    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      if (onScreen && !document.hidden) start();
      else stop();
    });
    io.observe(container);
    const onVisibility = () => {
      if (!document.hidden && onScreen) start();
      else stop();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const ro = new ResizeObserver(() => {
      resize();
      if (still) draw(0);
    });
    ro.observe(container);

    if (still) draw(0);
    else start();

    return () => {
      stop();
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buffer);
    };
  }, [key]);

  return (
    <div
      ref={containerRef}
      style={{ height, backgroundColor: bg }}
      className={cn("relative w-full overflow-hidden", className)}
    >
      <canvas ref={canvasRef} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />
      <div className="relative z-10 h-full w-full">{children}</div>
    </div>
  );
}

export default Velaris;
