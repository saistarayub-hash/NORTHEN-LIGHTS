/* ============================================================
   three.js stub for the Node headless test.
   Every class returns an "instance" proxy: any method call is
   a no-op returning the instance itself, any property set is
   stored, and any numeric read behaves as 0 (via valueOf), so
   the real game code (world / player / ui / sim) executes its
   full frame loop without WebGL.
   ============================================================ */

function makeInstance() {
  const store = {};
  const self = new Proxy(function () {}, {
    get(t, p) {
      if (p in store) return store[p];
      if (p === 'valueOf') return () => 0;
      if (p === 'toString') return () => '0';
      if (p === Symbol.toPrimitive) return () => 0;
      if (p === 'constructor') return self;
      if (typeof p === 'symbol') return undefined;
      return self;
    },
    set(t, p, v) { store[p] = v; return true; },
    has() { return true; },
    apply() { return self; },
  });
  return self;
}

function makeClass(name) {
  const ctor = new Proxy(function () {}, {
    get(t, p) {
      if (p === 'prototype') return {};
      if (p === 'name') return name;
      if (p === Symbol.toPrimitive) return () => String(name);
      if (typeof p === 'symbol') return undefined;
      if (!(p in t)) t[p] = makeClass(name + '.' + String(p));
      return t[p];
    },
    set(t, p, v) { t[p] = v; return true; },
    apply() { return makeInstance(); },
    construct() { return makeInstance(); },
  });
  return ctor;
}

const NS = {};

const CLASSES = [
  'WebGLRenderer', 'Scene', 'PerspectiveCamera', 'OrthographicCamera', 'Camera',
  'Object3D', 'Group', 'Mesh', 'Points', 'Line', 'Sprite', 'InstancedMesh',
  'BufferGeometry', 'BufferAttribute', 'Float32BufferAttribute', 'Float64BufferAttribute',
  'Matrix4', 'Matrix3', 'Vector2', 'Vector3', 'Quaternion', 'Color', 'Ray',
  'CanvasTexture', 'Texture', 'DataTexture',
  'SpriteMaterial', 'MeshBasicMaterial', 'MeshStandardMaterial', 'MeshLambertMaterial',
  'ShaderMaterial', 'PointsMaterial', 'LineBasicMaterial', 'Material',
  'PlaneGeometry', 'BoxGeometry', 'SphereGeometry', 'CylinderGeometry', 'ConeGeometry',
  'TorusGeometry', 'CircleGeometry', 'CapsuleGeometry', 'RingGeometry', 'Shape', 'ShapeGeometry',
  'HemisphereLight', 'DirectionalLight', 'AmbientLight', 'PointLight', 'SpotLight',
  'Fog', 'FogExp2', 'Clock', 'BufferGeometryUtils',
];
for (const c of CLASSES) NS[c] = makeClass(c);

const CONSTANTS = [
  'SRGBColorSpace', 'LinearSRGBColorSpace', 'NoColorSpace',
  'RepeatWrapping', 'ClampToEdgeWrapping', 'MirroredRepeatWrapping',
  'NearestFilter', 'LinearFilter', 'LinearMipmapLinearFilter',
  'FrontSide', 'BackSide', 'DoubleSide',
  'AdditiveBlending', 'NormalBlending', 'NoBlending',
  'DynamicDrawUsage', 'StaticDrawUsage', 'DrawArrayMode', 'DrawElementsMode',
];
let _c = 1;
for (const c of CONSTANTS) NS[c] = _c++;

NS.MathUtils = {
  clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
  lerp: (a, b, t) => a + (b - a) * t,
  damp: (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt)),
  degToRad: (d) => d * Math.PI / 180,
  radToDeg: (r) => r * 180 / Math.PI,
  randFloat: (a, b) => a + Math.random() * (b - a),
};

export default NS;

/* explicit named exports (mirrors `import * as THREE from 'three'`) */
export const
  WebGLRenderer = NS.WebGLRenderer, Scene = NS.Scene, PerspectiveCamera = NS.PerspectiveCamera,
  OrthographicCamera = NS.OrthographicCamera, Camera = NS.Camera, Object3D = NS.Object3D,
  Group = NS.Group, Mesh = NS.Mesh, Points = NS.Points, Line = NS.Line, Sprite = NS.Sprite,
  InstancedMesh = NS.InstancedMesh, BufferGeometry = NS.BufferGeometry,
  BufferAttribute = NS.BufferAttribute, Float32BufferAttribute = NS.Float32BufferAttribute,
  Float64BufferAttribute = NS.Float64BufferAttribute, Matrix4 = NS.Matrix4, Matrix3 = NS.Matrix3,
  Vector2 = NS.Vector2, Vector3 = NS.Vector3, Quaternion = NS.Quaternion, Color = NS.Color,
  Ray = NS.Ray, CanvasTexture = NS.CanvasTexture, Texture = NS.Texture,
  DataTexture = NS.DataTexture, SpriteMaterial = NS.SpriteMaterial,
  MeshBasicMaterial = NS.MeshBasicMaterial, MeshStandardMaterial = NS.MeshStandardMaterial,
  MeshLambertMaterial = NS.MeshLambertMaterial, ShaderMaterial = NS.ShaderMaterial,
  PointsMaterial = NS.PointsMaterial, LineBasicMaterial = NS.LineBasicMaterial,
  Material = NS.Material, PlaneGeometry = NS.PlaneGeometry, BoxGeometry = NS.BoxGeometry,
  SphereGeometry = NS.SphereGeometry, CylinderGeometry = NS.CylinderGeometry,
  ConeGeometry = NS.ConeGeometry, TorusGeometry = NS.TorusGeometry,
  CircleGeometry = NS.CircleGeometry, CapsuleGeometry = NS.CapsuleGeometry,
  RingGeometry = NS.RingGeometry, Shape = NS.Shape, ShapeGeometry = NS.ShapeGeometry,
  HemisphereLight = NS.HemisphereLight, DirectionalLight = NS.DirectionalLight,
  AmbientLight = NS.AmbientLight, PointLight = NS.PointLight, SpotLight = NS.SpotLight,
  Fog = NS.Fog, FogExp2 = NS.FogExp2, Clock = NS.Clock,
  BufferGeometryUtils = NS.BufferGeometryUtils, MathUtils = NS.MathUtils,
  SRGBColorSpace = NS.SRGBColorSpace, LinearSRGBColorSpace = NS.LinearSRGBColorSpace,
  NoColorSpace = NS.NoColorSpace, RepeatWrapping = NS.RepeatWrapping,
  ClampToEdgeWrapping = NS.ClampToEdgeWrapping, MirroredRepeatWrapping = NS.MirroredRepeatWrapping,
  NearestFilter = NS.NearestFilter, LinearFilter = NS.LinearFilter,
  LinearMipmapLinearFilter = NS.LinearMipmapLinearFilter, FrontSide = NS.FrontSide,
  BackSide = NS.BackSide, DoubleSide = NS.DoubleSide, AdditiveBlending = NS.AdditiveBlending,
  NormalBlending = NS.NormalBlending, NoBlending = NS.NoBlending,
  DynamicDrawUsage = NS.DynamicDrawUsage, StaticDrawUsage = NS.StaticDrawUsage,
  DrawArrayMode = NS.DrawArrayMode, DrawElementsMode = NS.DrawElementsMode;
