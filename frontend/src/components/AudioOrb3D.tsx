import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { Analyser } from './Analyser';
import { fs as backdropFS, vs as backdropVS } from './shaders/backdrop-shader';
import { vs as sphereVS } from './shaders/sphere-shader';

interface AudioOrb3DProps {
  inputNode: AudioNode | null;
  outputNode: AudioNode | null;
  appState?: string;
  mood?: string;
  isMuted?: boolean;
}

export function AudioOrb3D({ inputNode, outputNode, appState = 'idle', mood = 'idle', isMuted = false }: AudioOrb3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputAnalyserRef = useRef<Analyser | null>(null);
  const outputAnalyserRef = useRef<Analyser | null>(null);
  const sceneReadyRef = useRef(false);
  const appStateRef = useRef(appState);
  const moodRef = useRef(mood);
  const isMutedRef = useRef(isMuted);

  useEffect(() => { appStateRef.current = appState; }, [appState]);
  useEffect(() => { moodRef.current = mood; }, [mood]);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);

  // Connect analysers when audio nodes become available
  useEffect(() => {
    if (inputNode) {
      inputAnalyserRef.current = new Analyser(inputNode);
    }
  }, [inputNode]);

  useEffect(() => {
    if (outputNode) {
      outputAnalyserRef.current = new Analyser(outputNode);
    }
  }, [outputNode]);

  // Set up Three.js scene once on mount
  useEffect(() => {
    const container = containerRef.current;
    if (!container || sceneReadyRef.current) return;
    sceneReadyRef.current = true;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x100c14);

    // Backdrop
    const backdrop = new THREE.Mesh(
      new THREE.IcosahedronGeometry(10, 5),
      new THREE.RawShaderMaterial({
        uniforms: {
          resolution: { value: new THREE.Vector2(1, 1) },
          rand: { value: 0 },
        },
        vertexShader: backdropVS,
        fragmentShader: backdropFS,
        glslVersion: THREE.GLSL3,
      }),
    );
    (backdrop.material as THREE.RawShaderMaterial).side = THREE.BackSide;
    scene.add(backdrop);

    // Camera
    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    );
    camera.position.set(2, -2, 5);

    // Renderer
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'width:100%!important;height:100%!important;position:absolute;inset:0;';
    container.appendChild(canvas);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);

    // Sphere geometry + material
    const geometry = new THREE.IcosahedronGeometry(1, 10);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();

    const sphereMaterial = new THREE.MeshStandardMaterial({
      color: 0x000010,
      metalness: 0.5,
      roughness: 0.1,
      emissive: 0x000010,
      emissiveIntensity: 1.5,
    });

    sphereMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.time = { value: 0 };
      shader.uniforms.ambient = { value: 0.06 };
      shader.uniforms.inputData = { value: new THREE.Vector4() };
      shader.uniforms.outputData = { value: new THREE.Vector4() };
      sphereMaterial.userData.shader = shader;
      shader.vertexShader = sphereVS;
    };

    const sphere = new THREE.Mesh(geometry, sphereMaterial);
    scene.add(sphere);
    sphere.visible = false;

    // Load EXR environment map
    new EXRLoader().load('/piz_compressed.exr', (texture: THREE.DataTexture) => {
      texture.mapping = THREE.EquirectangularReflectionMapping;
      const exrCubeRenderTarget = pmremGenerator.fromEquirectangular(texture);
      sphereMaterial.envMap = exrCubeRenderTarget.texture;
      sphere.visible = true;
    });

    // Post-processing
    const renderPass = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      5,
      0.5,
      0,
    );
    const composer = new EffectComposer(renderer);
    composer.addPass(renderPass);
    composer.addPass(bloomPass);

    // Resize handling
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      const dPR = renderer.getPixelRatio();
      const w = window.innerWidth;
      const h = window.innerHeight;
      (backdrop.material as THREE.RawShaderMaterial).uniforms.resolution.value.set(w * dPR, h * dPR);
      renderer.setSize(w, h);
      composer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);
    onResize();

    // Animation loop
    let prevTime = 0;
    const rotation = new THREE.Vector3(0, 0, 0);
    let animId = 0;

    const animate = () => {
      animId = requestAnimationFrame(animate);

      inputAnalyserRef.current?.update();
      outputAnalyserRef.current?.update();

      const inputData = (!isMutedRef.current && inputAnalyserRef.current?.data) ? inputAnalyserRef.current.data : new Uint8Array(16);
      const outputData = outputAnalyserRef.current?.data ?? new Uint8Array(16);

      const t = performance.now();
      const dt = prevTime ? (t - prevTime) / (1000 / 60) : 1;
      prevTime = t;

      const backdropMat = backdrop.material as THREE.RawShaderMaterial;
      backdropMat.uniforms.rand.value = Math.random() * 10000;

      if (sphereMaterial.userData.shader) {
        const shader = sphereMaterial.userData.shader;
        const state = appStateRef.current;
        const effectiveState = (state === 'listening' && isMutedRef.current) ? 'idle' : state;
        const moodState = moodRef.current;
        const isRescue = moodState === 'rescue';
        const isAnalyzing = moodState.includes('inspect_visual');
        const isGenerating = moodState.includes('generate') || moodState.includes('search') || moodState.includes('solving');

        // Breathing scale + audio reactivity
        const breathe = 1 + (isAnalyzing ? 0.014 : 0.012) * Math.sin(t * (isAnalyzing ? 0.0011 : 0.0008));
        const baseScale = isRescue ? 1.03 : isGenerating ? 1.015 : 1;
        sphere.scale.setScalar(baseScale * (breathe + (0.2 * outputData[1]) / 255));

        const f = 0.001;
        // Constant slow orbit + audio-driven boosts
        rotation.x += dt * f * 0.08;
        rotation.x += (dt * f * 0.5 * outputData[1]) / 255;
        rotation.z += (dt * f * 0.5 * inputData[1]) / 255;
        rotation.y += dt * f * 0.04;
        rotation.y += (dt * f * 0.25 * inputData[2]) / 255;
        rotation.y += (dt * f * 0.25 * outputData[2]) / 255;

        const euler = new THREE.Euler(rotation.x, rotation.y, rotation.z);
        const quaternion = new THREE.Quaternion().setFromEuler(euler);
        const vector = new THREE.Vector3(0, 0, 5);
        vector.applyQuaternion(quaternion);
        camera.position.copy(vector);
        camera.lookAt(sphere.position);

        // Time: ambient base + audio-driven
        shader.uniforms.time.value += dt * 0.004;
        shader.uniforms.time.value += (dt * 0.1 * outputData[0]) / 255;

        // State-based emissive intensity
        const intensityTarget = isRescue
          ? 3.0
          : isAnalyzing
            ? 3.3
            : isGenerating
              ? 3.05
              : effectiveState === 'speaking'
                ? 2.8
                : effectiveState === 'listening'
                  ? 2.0
                  : effectiveState === 'thinking'
                    ? 2.4
                    : 1.4;
        sphereMaterial.emissiveIntensity += (intensityTarget - sphereMaterial.emissiveIntensity) * 0.04;
        const targetMetalness = isGenerating ? 0.56 : isAnalyzing ? 0.54 : 0.5;
        const targetRoughness = isRescue ? 0.13 : isAnalyzing ? 0.08 : 0.1;
        sphereMaterial.metalness += (targetMetalness - sphereMaterial.metalness) * 0.025;
        sphereMaterial.roughness += (targetRoughness - sphereMaterial.roughness) * 0.025;

        // Ambient deformation level
        const ambientTarget = isAnalyzing
          ? 0.14
          : isRescue
            ? 0.1
            : effectiveState === 'speaking'
              ? 0.12
              : effectiveState === 'listening'
                ? 0.08
                : 0.05;
        shader.uniforms.ambient.value += (ambientTarget - shader.uniforms.ambient.value) * 0.03;

        shader.uniforms.inputData.value.set(
          (1 * inputData[0]) / 255,
          (0.1 * inputData[1]) / 255,
          (10 * inputData[2]) / 255,
          0,
        );
        shader.uniforms.outputData.value.set(
          (2 * outputData[0]) / 255,
          (0.1 * outputData[1]) / 255,
          (10 * outputData[2]) / 255,
          0,
        );
      }

      const bloomTarget = moodRef.current.includes('inspect')
        ? 5.5
        : moodRef.current.includes('generate') || moodRef.current.includes('search')
          ? 5.25
          : moodRef.current === 'rescue'
            ? 5.15
            : 5;
      bloomPass.strength += (bloomTarget - bloomPass.strength) * 0.03;

      composer.render();
    };

    animate();

    // Cleanup
    return () => {
      sceneReadyRef.current = false;
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      geometry.dispose();
      sphereMaterial.dispose();
      (backdrop.material as THREE.RawShaderMaterial).dispose();
      backdrop.geometry.dispose();
      composer.dispose();
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={containerRef} className="absolute inset-0" />;
}
