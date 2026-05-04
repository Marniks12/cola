import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const canvas = document.querySelector("#three-canvas");
const magicPanel = document.querySelector("#magic");
const motionTrail = document.querySelector(".motion-trail");
const productCards = Array.from(document.querySelectorAll(".product-card"));

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  38,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.set(0, 0, 7.2);

const renderer = new THREE.WebGLRenderer({
  canvas,
  alpha: true,
  antialias: true,
});

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

scene.add(new THREE.AmbientLight(0xffffff, 1.85));

const keyLight = new THREE.DirectionalLight(0xffffff, 3);
keyLight.position.set(4.5, 5.5, 6);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xffffff, 1.4);
fillLight.position.set(-5, 1.5, 4);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xffe2d5, 1.15);
rimLight.position.set(2.2, 0.8, -4.8);
scene.add(rimLight);

const rubLight = new THREE.PointLight(0xff5a36, 0, 9, 2);
scene.add(rubLight);

const loader = new GLTFLoader();
const canScreenPosition = new THREE.Vector3();

let can = null;
let canSpin = 0;
let currentSpinVelocity = 0;
let shakeProgress = 0;
let lastPointerX = null;
let lastPointerTime = 0;
let isMagicActive = false;
let isMagicRevealed = false;
let hasTriggeredMagicBurst = false;
let canBaseScale = 1;
let currentCanFlavor = "classic";

const recolorableCanMaterials = [];

const CAN_FLAVOR_CONFIG = {
  classic: {
    color: "#e61c2a",
    strength: 0,
  },
  zero: {
    color: "#090909",
    strength: 1,
  },
  cherry: {
    color: "#c2185b",
    strength: 1,
  },
};

const MAIN_CAN_MODEL_PATH = "/models/coke-can.glb";
const MAIN_CAN_SCALE_DIVISOR = 1.45;
const RECOLORABLE_CAN_MATERIAL_NAMES = new Set([
  "Body",
  "Can_Base_Red",
  "Can_Body_Red",
  "Can_Label_Red",
  "Body_Red",
  "Label_Red",
]);

const current = {
  x: 1.35,
  y: -0.38,
  z: 0,
  scale: 1.35,
  rx: 0.55,
  ry: -0.35,
  rz: -0.65,
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function easeOutQuad(t) {
  return 1 - (1 - t) * (1 - t);
}

function ensureHeroBubbles() {
  const heroPanel = document.getElementById("hero");
  if (!heroPanel) return;

  let bubbles = heroPanel.querySelector(".hero-bubbles");
  if (!bubbles) {
    bubbles = document.createElement("div");
    bubbles.className = "hero-bubbles";
    bubbles.setAttribute("aria-hidden", "true");
    heroPanel.appendChild(bubbles);
  }

  if (bubbles.children.length > 0) return;

  for (let i = 0; i < 16; i += 1) {
    const bubble = document.createElement("span");
    const size = 10 + Math.random() * 28;

    bubble.style.width = `${size}px`;
    bubble.style.height = `${size}px`;
    bubble.style.left = `${Math.random() * 100}%`;
    bubble.style.animationDelay = `${Math.random() * 7}s`;
    bubble.style.animationDuration = `${8 + Math.random() * 7}s`;
    bubble.style.opacity = `${0.18 + Math.random() * 0.28}`;

    bubbles.appendChild(bubble);
  }
}

function ensureMagicBurstBubbles() {
  if (!magicPanel) return null;

  let burst = magicPanel.querySelector(".magic-burst-bubbles");
  if (!burst) {
    burst = document.createElement("div");
    burst.className = "magic-burst-bubbles";
    burst.setAttribute("aria-hidden", "true");
    magicPanel.appendChild(burst);
  }

  return burst;
}

function triggerMagicBurst() {
  const burst = ensureMagicBurstBubbles();
  if (!burst) return;

  burst.innerHTML = "";
  burst.classList.remove("is-active");
  void burst.offsetWidth;

  for (let i = 0; i < 56; i += 1) {
    const bubble = document.createElement("span");
    const size = 10 + Math.random() * 34;
    const xStart = -46 + Math.random() * 92;
    const xOffset = -260 + Math.random() * 520;
    const yRise = 240 + Math.random() * 420;
    const delay = Math.random() * 0.75;
    const duration = 2.6 + Math.random() * 2.8;

    bubble.style.width = `${size}px`;
    bubble.style.height = `${size}px`;
    bubble.style.left = `${xStart}%`;
    bubble.style.setProperty("--bubble-x", `${xOffset}px`);
    bubble.style.setProperty("--bubble-y", `${-yRise}px`);
    bubble.style.animationDelay = `${delay}s`;
    bubble.style.animationDuration = `${duration}s`;
    bubble.style.opacity = `${0.28 + Math.random() * 0.42}`;

    burst.appendChild(bubble);
  }

  burst.classList.add("is-active");

  window.setTimeout(() => {
    burst.classList.remove("is-active");
    burst.innerHTML = "";
  }, 7200);
}

function getScrollProgress() {
  const maxScroll = document.body.scrollHeight - window.innerHeight;
  if (maxScroll <= 0) return 0;
  return clamp(window.scrollY / maxScroll, 0, 1);
}

function getSectionStops() {
  const sections = ["hero", "collection", "heritage", "magic"]
    .map((id) => document.getElementById(id))
    .filter(Boolean);

  const maxScroll = Math.max(document.body.scrollHeight - window.innerHeight, 1);

  return sections.reduce((acc, section) => {
    acc[section.id] = clamp(section.offsetTop / maxScroll, 0, 1);
    return acc;
  }, {});
}

let sectionStops = getSectionStops();

function getProgressBetween(start, end, progress) {
  const span = Math.max(end - start, 0.0001);
  return clamp((progress - start) / span, 0, 1);
}

/* MAIN CAN */

function getMainKeyframes() {
  const hero = sectionStops.hero ?? 0;
  const collection = sectionStops.collection ?? 0.25;
  const heritage = sectionStops.heritage ?? 0.55;
  const magic = sectionStops.magic ?? 0.82;

  return [
    {
      progress: 0,
      x: 1.35,
      y: -0.38,
      z: 0,
      scale: 1.35,
      rx: 0.55,
      ry: -0.35,
      rz: -0.65,
    },
    {
      progress: clamp(hero + 0.16, 0, 1),
      x: 1.2,
      y: -0.42,
      z: -0.1,
      scale: 1.22,
      rx: 0.7,
      ry: -0.1,
      rz: -1.05,
    },
    {
      progress: clamp(collection + 0.05, 0, 1),
      x: 1.7,
      y: 0.7,
      z: -0.2,
      scale: 0.68,
      rx: 1.05,
      ry: 0.7,
      rz: -2.2,
    },
    {
      progress: clamp(heritage + 0.02, 0, 1),
      x: 0.95,
      y: 0.18,
      z: -0.05,
      scale: 1.04,
      rx: 0.48,
      ry: 1.25,
      rz: -3.85,
    },
    {
      progress: clamp(magic - 0.08, 0, 1),
      x: 0,
      y: 0.05,
      z: -1.2,
      scale: 0.9,
      rx: 0.16,
      ry: 0.55,
      rz: -5.95,
    },
    {
      progress: 1,
      x: 0,
      y: 0.05,
      z: -1.2,
      scale: 0.9,
      rx: 0.08,
      ry: 0.08,
      rz: -6.28,
    },
  ]
    .map((keyframe) => ({
      ...keyframe,
      progress: clamp(keyframe.progress, 0, 1),
    }))
    .sort((a, b) => a.progress - b.progress);
}

function getInterpolatedState(progress) {
  const keyframes = getMainKeyframes();
  let start = keyframes[0];
  let end = keyframes[keyframes.length - 1];

  for (let i = 0; i < keyframes.length - 1; i += 1) {
    if (progress >= keyframes[i].progress && progress <= keyframes[i + 1].progress) {
      start = keyframes[i];
      end = keyframes[i + 1];
      break;
    }
  }

  const span = Math.max(end.progress - start.progress, 0.0001);
  const rawT = clamp((progress - start.progress) / span, 0, 1);
  const t = easeInOutCubic(rawT);

  return {
    x: lerp(start.x, end.x, t),
    y: lerp(start.y, end.y, t),
    z: lerp(start.z, end.z, t),
    scale: lerp(start.scale, end.scale, t),
    rx: lerp(start.rx, end.rx, t),
    ry: lerp(start.ry, end.ry, t),
    rz: lerp(start.rz, end.rz, t),
  };
}

function clearCanMaterials() {
  recolorableCanMaterials.length = 0;
}

function isRecolorableCanMaterial(material) {
  if (!material || !material.color) return false;

  return RECOLORABLE_CAN_MATERIAL_NAMES.has(material.name);
}

function addBodyRecolorShader(material) {
  material.userData.currentBodyColor = new THREE.Color(CAN_FLAVOR_CONFIG.classic.color);
  material.userData.targetBodyColor = new THREE.Color(CAN_FLAVOR_CONFIG.classic.color);
  material.userData.currentBodyStrength = CAN_FLAVOR_CONFIG.classic.strength;
  material.userData.targetBodyStrength = CAN_FLAVOR_CONFIG.classic.strength;

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uBodyTargetColor = {
      value: material.userData.currentBodyColor,
    };
    shader.uniforms.uBodyRecolorStrength = {
      value: material.userData.currentBodyStrength,
    };

    material.userData.recolorShader = shader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `#include <map_fragment>
#ifdef USE_MAP
  float redDominance = sampledDiffuseColor.r - max(sampledDiffuseColor.g, sampledDiffuseColor.b);
  float redMask = smoothstep(0.12, 0.42, redDominance);
  redMask *= smoothstep(0.25, 0.55, sampledDiffuseColor.r);
  redMask *= 1.0 - smoothstep(0.72, 0.92, min(min(sampledDiffuseColor.r, sampledDiffuseColor.g), sampledDiffuseColor.b));
  redMask *= smoothstep(0.08, 0.2, max(max(sampledDiffuseColor.r, sampledDiffuseColor.g), sampledDiffuseColor.b));
  redMask *= uBodyRecolorStrength;

  float bodyShade = clamp(sampledDiffuseColor.r * 1.15, 0.22, 1.15);
  diffuseColor.rgb = mix(diffuseColor.rgb, uBodyTargetColor * bodyShade, redMask);
#endif`
    );
    shader.fragmentShader = `
uniform vec3 uBodyTargetColor;
uniform float uBodyRecolorStrength;
${shader.fragmentShader}`;
  };

  material.needsUpdate = true;
}

function applyMainCanMaterials(model) {
  clearCanMaterials();
  const allMaterials = [];

  model.traverse((child) => {
    if (!child.isMesh || !child.material) return;

    const materials = Array.isArray(child.material) ? child.material : [child.material];
    const clonedMaterials = materials.map((material) => {
      const cloned = material.clone();
      cloned.userData.originalColor = cloned.color ? cloned.color.clone() : null;
      cloned.needsUpdate = true;
      allMaterials.push(cloned);

      if (isRecolorableCanMaterial(cloned)) {
        addBodyRecolorShader(cloned);
        recolorableCanMaterials.push(cloned);
      }

      return cloned;
    });

    child.material = Array.isArray(child.material) ? clonedMaterials : clonedMaterials[0];
  });

  console.log("All material names:", allMaterials.map((material) => material.name));
  console.log(
    "Recolorable materials:",
    recolorableCanMaterials.map((material) => material.name)
  );

  if (recolorableCanMaterials.length === 0) {
    console.warn(
      "No separate red can material found. Recolor disabled until model material is split/renamed in Blender."
    );
  }
}

function loadMainCan() {
  loader.load(
    MAIN_CAN_MODEL_PATH,
    (gltf) => {
      if (can) {
        scene.remove(can);
      }

      can = gltf.scene;
      can.userData.flavor = currentCanFlavor;

      const box = new THREE.Box3().setFromObject(can);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z) || 1;

      can.position.sub(center);
      canBaseScale = MAIN_CAN_SCALE_DIVISOR / maxDim;

      applyMainCanMaterials(can);

      scene.add(can);
      updateMainCan(getScrollProgress());
    },
    undefined,
    (error) => {
      console.error("Main model could not load:", error);
    }
  );
}

function updateCanScreenPosition() {
  if (!can) return null;

  canScreenPosition.copy(can.position);
  canScreenPosition.project(camera);

  return {
    x: (canScreenPosition.x * 0.5 + 0.5) * window.innerWidth,
    y: (-canScreenPosition.y * 0.5 + 0.5) * window.innerHeight,
  };
}

function updateMotionTrail(progress) {
  if (!motionTrail) return;

  const heroTrail = getProgressBetween(0.01, (sectionStops.collection ?? 0.25) + 0.04, progress);
  const opacity = Math.sin(heroTrail * Math.PI) * 0.18;
  motionTrail.style.opacity = `${clamp(opacity, 0.04, 0.18)}`;
}

function updateMainCan(progress) {
  if (!can) return;

  const isMobile = window.innerWidth <= 640;
  const isTablet = window.innerWidth > 640 && window.innerWidth <= 1024;
  const isCompact = window.innerWidth <= 1024;
  const state = getInterpolatedState(progress);
  const smooth = 0.08;
  const collectionStart = sectionStops.collection ?? 0.25;
  const heritageStart = sectionStops.heritage ?? 0.55;
  const magicStart = sectionStops.magic ?? 0.82;

  const heroDrift = easeOutQuad(getProgressBetween(0, collectionStart + 0.04, progress));
  const cinematicSpin = getProgressBetween(collectionStart, magicStart - 0.06, progress);
  const spinRampDown = 1 - easeInOutCubic(getProgressBetween(magicStart - 0.1, 1, progress));
  const targetSpinVelocity = lerp(0.002, 0.013, cinematicSpin) * Math.max(spinRampDown, 0.12);

  currentSpinVelocity = lerp(currentSpinVelocity, targetSpinVelocity, 0.065);
  canSpin += currentSpinVelocity;

  current.x = lerp(current.x, state.x, smooth);
  current.y = lerp(current.y, state.y, smooth);
  current.z = lerp(current.z, state.z, smooth);
  current.scale = lerp(current.scale, state.scale, smooth);
  current.rx = lerp(current.rx, state.rx, smooth);
  current.ry = lerp(current.ry, state.ry, smooth);
  current.rz = lerp(current.rz, state.rz, smooth);

  isMagicActive = isMagicPanelActive();
  const time = performance.now();
  const shakeBlend = isMagicActive && !isMagicRevealed ? shakeProgress : 0;
  const revealGlow = isMagicRevealed ? 0.85 + Math.sin(time * 0.004) * 0.12 : 0;
  const heritageGlow = getProgressBetween(heritageStart - 0.04, heritageStart + 0.16, progress);
  const glowTarget = isMagicActive
    ? 0.35 + shakeProgress * 1.35 + revealGlow * 0.95
    : heritageGlow * 0.4;

  rubLight.position.set(current.x + 0.18, current.y, 2.6);
  rubLight.intensity = lerp(rubLight.intensity, glowTarget, 0.08);

  recolorableCanMaterials.forEach((material) => {
    if (!material.userData.targetBodyColor) return;

    material.userData.currentBodyColor.lerp(material.userData.targetBodyColor, 0.06);
    material.userData.currentBodyStrength = lerp(
      material.userData.currentBodyStrength,
      material.userData.targetBodyStrength,
      0.06
    );

    const shader = material.userData.recolorShader;
    if (!shader) return;

    shader.uniforms.uBodyTargetColor.value.copy(material.userData.currentBodyColor);
    shader.uniforms.uBodyRecolorStrength.value = material.userData.currentBodyStrength;
  });

  let finalX = current.x;
  let finalY = current.y;
  let finalZ = current.z;
  let finalRx = current.rx;
  let finalRy = current.ry + canSpin;
  let finalRz = current.rz;
  let finalScale = current.scale;
  const isHero = progress < collectionStart;

  if (progress > 0 && progress < collectionStart + 0.04) {
    finalX += Math.sin(heroDrift * Math.PI) * 0.04;
    finalY -= heroDrift * 0.015;
    finalRz -= heroDrift * 0.08;
  }

  if (isMagicActive && !isMagicRevealed) {
    finalX += Math.sin(time * 0.09) * shakeProgress * 0.14;
    finalRz += Math.sin(time * 0.1) * shakeProgress * 0.14;
    finalRx += Math.cos(time * 0.06) * shakeProgress * 0.04;
  }

  if (isMagicRevealed) {
    const settle = 1 + Math.sin(time * 0.018) * 0.014;
    finalScale *= settle;
    finalY -= 0.01;
    finalRz -= 0.02;
    finalRx += 0.02;
    finalRy = lerp(finalRy, 0.64, 0.1);
  }

  if (isHero && isMobile) {
    finalX = 0.12;
    finalY = 0.05;
    finalScale *= 0.55;
  }

  if (isHero && isTablet) {
    finalX = 0.45;
    finalY = 0.12;
    finalScale *= 0.72;
  }

  if (!isHero && isCompact) {
    finalX = clamp(finalX, -0.2, 0.45);
    finalY = clamp(finalY, -0.58, 0.68);
  }

  if (isMagicActive) {
    finalX = 1.45;
    finalY = 0.1;
    finalScale *= 0.9;
  }

  if (isMobile && isMagicActive) {
    finalX = 0.68;
    finalY = 0.15;
    finalScale *= 0.65;
  }

  if (isTablet && isMagicActive) {
    finalX = 1.32;
    finalY = 0.12;
    finalScale *= 0.75;
  }

  can.position.set(finalX, finalY, finalZ);
  can.rotation.set(finalRx, finalRy, finalRz);
  can.scale.setScalar(canBaseScale * finalScale);
}

/* CARD MODELS */

function applyFlavorTheme(flavor) {
  productCards.forEach((card) => {
    card.classList.toggle("is-selected", Boolean(flavor) && card.dataset.flavor === flavor);
  });
}

function setCanFlavor(flavor) {
  const flavorConfig = CAN_FLAVOR_CONFIG[flavor] ?? CAN_FLAVOR_CONFIG.classic;

  currentCanFlavor = flavor || "classic";
  if (recolorableCanMaterials.length === 0) {
    if (can) {
      can.userData.flavor = currentCanFlavor;
    }
    return;
  }

  const targetColor = new THREE.Color(flavorConfig.color);

  recolorableCanMaterials.forEach((material) => {
    material.userData.targetBodyColor.copy(targetColor);
    material.userData.targetBodyStrength = flavorConfig.strength;
  });

  if (can) {
    can.userData.flavor = currentCanFlavor;
  }
}

productCards.forEach((card) => {
  const activate = () => {
    const flavor = card.dataset.flavor || "classic";
    applyFlavorTheme(flavor);
    setCanFlavor(flavor);
  };

  card.addEventListener("click", activate);
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      activate();
    }
  });
});

/* FINAL SHAKE REVEAL */

function isMagicPanelActive() {
  if (!magicPanel) return false;

  const rect = magicPanel.getBoundingClientRect();
  return rect.top < window.innerHeight * 0.72 && rect.bottom > window.innerHeight * 0.28;
}

function isPointerInCanZone(x, y) {
  const projected = updateCanScreenPosition();
  const isCompact = window.innerWidth <= 1024;
  const fallbackX = window.innerWidth * 0.5;
  const fallbackY = window.innerHeight * 0.52;
  const centerX = projected?.x ?? fallbackX;
  const centerY = projected?.y ?? fallbackY;
  const dx = Math.abs(x - centerX);
  const dy = Math.abs(y - centerY);
  const zoneWidth = isMagicActive
    ? window.innerWidth * (isCompact ? 0.24 : 0.16)
    : window.innerWidth * (isCompact ? 0.32 : 0.2);
  const zoneHeight = isMagicActive
    ? window.innerHeight * (isCompact ? 0.28 : 0.22)
    : window.innerHeight * (isCompact ? 0.34 : 0.3);

  return dx < zoneWidth && dy < zoneHeight;
}

function syncMagicRevealState() {
  if (!magicPanel) return;

  if (isMagicRevealed) {
    magicPanel.classList.add("revealed");
  } else {
    magicPanel.classList.remove("revealed");
  }
}

function handleShakeMove(currentX, currentY) {
  const now = performance.now();
  isMagicActive = isMagicPanelActive();

  if (!isMagicActive || isMagicRevealed || !isPointerInCanZone(currentX, currentY)) {
    lastPointerX = currentX;
    lastPointerTime = now;
    return;
  }

  if (lastPointerX !== null && lastPointerTime !== 0) {
    const dx = Math.abs(currentX - lastPointerX);
    const dt = Math.max(now - lastPointerTime, 1);
    const speed = dx / dt;

    const minSpeed = 0.3;
    const minDistance = 4;
    const shakeGain = 0.042;

    if (speed > minSpeed && dx > minDistance) {
      shakeProgress = clamp(shakeProgress + speed * shakeGain, 0, 1);
    } else if (speed < 0.14) {
      shakeProgress = clamp(shakeProgress - 0.0025, 0, 1);
    }

    if (shakeProgress >= 1) {
      shakeProgress = 1;
      isMagicRevealed = true;
      if (!hasTriggeredMagicBurst) {
        hasTriggeredMagicBurst = true;
        triggerMagicBurst();
      }
      syncMagicRevealState();
    }
  }

  lastPointerX = currentX;
  lastPointerTime = now;
}

/* REVEAL OBSERVER */

function animate() {
  const progress = getScrollProgress();

  updateMotionTrail(progress);
  updateMainCan(progress);

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

loadMainCan();
syncMagicRevealState();
ensureHeroBubbles();
ensureMagicBurstBubbles();
applyFlavorTheme(null);

window.addEventListener("pointermove", (event) => {
  handleShakeMove(event.clientX, event.clientY);
});

window.addEventListener(
  "touchmove",
  (event) => {
    const touch = event.touches[0];
    if (!touch) return;
    if (isMagicPanelActive() && isPointerInCanZone(touch.clientX, touch.clientY)) {
      event.preventDefault();
    }
    handleShakeMove(touch.clientX, touch.clientY);
  },
  { passive: false }
);

window.addEventListener("pointerup", () => {
  lastPointerX = null;
  lastPointerTime = 0;
});

window.addEventListener("touchend", () => {
  lastPointerX = null;
  lastPointerTime = 0;
});

window.addEventListener("touchcancel", () => {
  lastPointerX = null;
  lastPointerTime = 0;
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  sectionStops = getSectionStops();
});

const revealItems = document.querySelectorAll(
  ".hero-copy, .section-copy, .product-card"
);

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
      }
    });
  },
  {
    threshold: 0.18,
  }
);

revealItems.forEach((item, index) => {
  item.style.transitionDelay = `${Math.min(index * 80, 280)}ms`;
  revealObserver.observe(item);
});

animate();
