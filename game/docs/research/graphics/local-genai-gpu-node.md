# Local open-weights generative models on the owner's RTX 3090 node

Angle: can free, open-weights image and image-to-3D models running on the owner's GPU node (RTX 3090 24 GB,
32 GB RAM, WSL2 with a 24 GB limit, `gpu-run` jail per `game/docs/GPU_PC_SETUP.md`) improve Orbkin's graphics?
This covers licences, how the models would run inside the jail, IP drift, the asset policy, an honest quality
check, and an A/B test ready for the first `gpu-run` session.

Method: I read primary sources (licence files, READMEs, diffusers source, kiln's measured benchmarks) through
raw.githubusercontent.com, PyPI and `pip download`. Hugging Face model cards could not be reached from this
container (curl gets 403, WebFetch gets DNS errors), so licence facts that live only on HF cards are marked
"verify on HF". Nothing here ran on a GPU. Experiments: CPU-only image-processing tests (§6.3) and a resolved,
hash-pinned lockfile (§3.4).

Date: 2026-10-14. Confidence tags: **high** = primary source read; **medium** = consistent secondary
sources, or my own inference from primary ones; **low** = a single secondary source or untested.

---

## 0. TL;DR

1. **Licences, models that fit 24 GB:**
   - Usable for a shipped hobby game:
     - FLUX.2 [klein] 4B and 4B Base (Apache-2.0);
     - Z-Image-Turbo and Z-Image (Apache-2.0);
     - original Qwen-Image and Qwen-Image-Edit-2511 (Apache-2.0, but 20B, so quantization is needed);
     - SDXL (OpenRAIL++-M: use-based restrictions only, outputs unrestricted);
     - Marigold (Apache-2.0 code; check the weights on HF);
     - Depth Anything V2-Small and DA3-Small/Base (Apache-2.0);
     - TRELLIS / TRELLIS.2, TripoSR, TripoSG and Pixal3D (MIT, with non-MIT dependencies).
   - Not usable:
     - FLUX.1-dev, FLUX.2-dev and klein 9B. Their outputs are licensed for commercial use, but using the model
       for anything that "has impact on end users" is excluded from "Non-Commercial Purpose".
     - Qwen-Image-2.1 and 2.1-Turbo (research licence).
     - Depth Anything V2-Base/Large and DA3-Large/Giant (CC-BY-NC).
     - Zero123++ weights (CC-BY-NC).
     - RMBG-2.0 (CC-BY-NC), which is loaded by default by the TRELLIS.2 pipeline.
     - Hunyuan3D 2.x. Its licence "DOES NOT APPLY IN THE EUROPEAN UNION, UNITED KINGDOM AND SOUTH KOREA" and
       bans *displaying* Output outside its Territory, which a public browser game does.
   **high**
2. **The jail favours plain diffusers scripts over ComfyUI.**
   - `gpu-run` runs one `.py` file from `game/tools/gpu-pc/`, with no network, a throwaway HOME and a read-only
     repo.
   - A diffusers script fits that exactly: it is offline, loads only safetensors, uses no remote code and has a
     reviewable diff.
   - ComfyUI is a server with a browser UI. Its custom-node ecosystem has had real malware (a Ultralytics
     cryptominer pulled in through Impact-Pack, Dec 2024; ComfyUI_LLMVision; a 2026 botnet that installed
     nodes through ComfyUI-Manager; the Sept 2026 champdev RAT).
   - The diffusers stack (torch 2.14.0, diffusers 0.40.0, transformers 5.17.0) resolves to a 859-hash lock with
     a ≥ 2-week age cut-off, and it co-resolves with bpy 5.2.2 (numpy 2.5.3).
   - The torch 2.14 PyPI wheels use **CUDA 13**, which needs a Windows driver from the **580 branch or newer**.
     The guide currently says ≥ 575.

   **high** for the facts; the recommendation is mine.
3. **Image-to-3D does not fit the jail as it stands.**
   - TRELLIS.2, Pixal3D, TripoSG and TripoSR need compiled CUDA extensions or git installs: flash-attn, natten
     and diso ship only as sdists; nvdiffrast and torchmcubes are not on PyPI; Pixal3D needs a wheel from a
     personal GitHub release.
   - The node deliberately has no compilers.
   - kiln's measured run (TRELLIS.2 on 24 GB): 5–7 min a model, 19.5–22.5 GB peak, 31 GB of weights,
     160–190k triangles, one material. It is good as a **measuring template**; it broke when finished directly.

   **high**
4. **Honest quality outlook at Orbkin's sprite size (28–40 texels, 56 at 2×):**
   - Earlier measurements already showed that the modelling tool does not matter at that size: Blender SDF kin
     and code kin through the same live bake were indistinguishable. Image-to-3D to toon bake will very
     probably not beat SDF or code kin on looks either; its only plausible gain is design (proportions).
     **medium-high**
   - Pixel-art LoRA output is "pseudo-pixel" art at ~8–16 px a cell on a 1024 canvas, i.e. 64–128 cells. That is
     designed for sprites 2–4× bigger than Orbkin's.
   - My detail-survival test: a detailed 431-px render keeps its eyes and face at 56 px and loses them at 28 px.
     Even in a best-case simulation, recovering the grid and locking the palette restored only 77–88% of texels
     exactly. **medium**
   - A generated 2D sprite is also *static*. It loses the live bake's per-arena relighting, any-yaw views,
     vertex-shader motion and evolution morphs.
5. **Where local generation plausibly *does* pay off:**
   - concept thumbnails and silhouettes for new kin (owner-curated, IP-gated);
   - title and key art, and dex portraits;
   - far background and sky layers, with depth from DA3-Small for parallax;
   - tileable ground and rock textures, palette-locked;
   - proportion templates for hero kin.

   These are the places where the "AI look" is least exposed and the live bake is not replaced. **medium**
6. **IP drift is real and measurable.** "Fantastic Copyrighted Beasts" (ICLR 2025) shows that 2 generic keywords
   can reproduce a franchise character without naming it. Every output must pass the existing blind `ip_check.py`
   (3 runs, FAIL ≥ 7 + distinctive) on the **final in-game crop**, not only on the concept. The
   Maelstrode lesson: the sprite bake raised similarity from 5–6 to 7–9. **high** for the paper; the gate design
   is mine.
7. **Policy is the owner's call.** Options 0–3 are in §5. My recommendation is **Option 1, "reference-only"**,
   for now, and Option 2, "provenance-clean shipping", only for non-kin 2D assets and only after the A/B.
8. **The A/B is designed and scripted (§7):**
   - 5 weak kin, the same written brief for each;
   - arm A: procedural live bake;
   - arm B: Apache text-to-image with palette-locked sprites;
   - arm C (optional, needs a toolchain decision): image-to-3D, then the live bake;
   - blind pairwise judging with the calibrated `visual_judge.py`, owner picks, and `ip_check.py` on everything;
   - pre-registered adoption rule.

---

## 1. What the node is and what the jail allows (read from the repo)

Source: `game/docs/GPU_PC_SETUP.md` (marked **PARKED — do not follow**; a simpler version will replace it) and
`game/docs/DECISIONS.md` ("GPU PC node: pinned tool chain").

- Hardware: i9-12900K, RTX 3090 24 GB (Ampere, sm_86), 32 GB RAM. `.wslconfig` gives Ubuntu **24 GB RAM,
  20 threads, 8 GB swap**.
- `gpu-run <program> <script> [args]`:
  - It accepts only `~/orbkin-bpy/bin/python` or node, plus `nvidia-smi` and `eglinfo`. The script must be a
    `.py/.mjs/.js` file under `game/tools/gpu-pc/` (inline `-c` is refused).
  - Inside bubblewrap with `--unshare-all` it gets: `/dev/dxg` (the GPU), the repo **read-only**,
    `~/orbkin-bpy` and `~/.local` read-only, and `~/orbkin-cache` **writable**. Output goes to
    `$ORBKIN_OUT=~/orbkin-cache/out`.
  - HOME is a tmpfs. There is **no network** and no AF_VSOCK.
  - Env: `XDG_CACHE_HOME=~/orbkin-cache/xdg`, `LD_LIBRARY_PATH=/usr/lib/wsl/lib`.
- Each `gpu-run` call is approved by the owner. Approval means approving whatever code Claude wrote, run inside
  the jail.
- The node pins every tool by hash. `tools/gpu-pc/requirements-bpy.lock` was made in the cloud with
  `uv pip compile --generate-hashes` and installed with `--require-hashes`, and "the node never resolves
  packages itself".
- The node has no compilers, by design ("The project compiles no native code, so no compilers are installed").

Consequences for generative models:
- Weights cannot be downloaded from inside the jail, and the guide forbids running project code in a plain
  terminal. So **the owner downloads weights** in a plain terminal with `curl`, pinned to a commit hash, and
  checks them against a manifest. Downloading is not running code. **high**
- `~/orbkin-cache` is writable by sandboxed commands and by earlier jail jobs. Weights stored there must be
  **re-hashed before every load**. Better is a new read-only folder `~/orbkin-models`; that is a root edit to
  `gpu-run` (one extra `--ro-bind`) and the owner's decision. **high** (follows from the jail design)
- Torch, diffusers and bpy co-resolve in one venv (§3.4), so the stack can go into `~/orbkin-bpy` with **no
  change to `gpu-run`**. The alternative is a second venv `~/orbkin-gen`, which needs a root edit. **medium**:
  it resolves, but the install has not run on the node.
- Anything that needs `nvcc`/`gcc` at install time (most image-to-3D repos) is outside the current design.
  **high**

---

## 2. Models: licence, VRAM, fit (24 GB card, 24 GB WSL RAM)

### 2.1 Text-to-image and image editing

| Model | Params | Licence (weights) | Outputs | 3090 fit | Notes / source |
|---|---|---|---|---|---|
| **FLUX.2 [klein] 4B** (distilled) | 4B + Qwen3 text encoder | **Apache-2.0** | free | "fits in ~8GB VRAM (RTX 3090/4070 and up)" per the flux2 README; ~13 GB per the HF card (secondary) | Text-to-image plus **single- and multi-reference editing** (`Flux2KleinPipeline(image=[...])`). BFL's README recommends it for "Consumer GPU (e.g. RTX 3090/4070)". Released 2026-01-15. [flux2 README] **high** |
| **FLUX.2 [klein] 4B Base** | 4B | **Apache-2.0** | free | as above | For LoRA training. ai-toolkit supports it. **high** |
| FLUX.2 [klein] 9B / 9B KV / 9B Base, FLUX.2 [dev] | 9B / 32B | FLUX Non-Commercial | "You may use Output for any purpose (including for commercial purposes)", but the *model use* must be a Non-Commercial Purpose, which excludes use "(b) in direct interactions with or that has impact on end users" | — | **Avoid.** Making shipped game assets arguably "has impact on end users". [LICENSE-FLUX-DEV §1c, §2d] **high** for the text, **medium** for my reading |
| FLUX.1 [schnell] | 12B | Apache-2.0 | free | bf16 needs offload; fp8 fits | Older; klein 4B supersedes it. [HF discussions, secondary] **medium** |
| **Z-Image-Turbo** | 6B (+ text encoder) | **Apache-2.0** (repo LICENSE; HF card per secondary sources) | free | "fits comfortably within 16G VRAM consumer devices"; 8 NFE, `guidance_scale=0.0` | Diffusers `ZImagePipeline`, plus `ZImageControlNetPipeline` with alibaba-pai's Union ControlNet (Apache-2.0 per a secondary source; verify on HF). Low diversity by design. [Z-Image README] **high** |
| **Z-Image** (base) | 6B | Apache-2.0 | free | 28–50 steps, CFG 3–5 | "well-suited for … fine-tuning"; supports negative prompts. Released 2026-01-27. **high** |
| Qwen-Image / -2512, **Qwen-Image-Edit-2511** | 20B | Apache-2.0 (repo LICENSE) | free | bf16 ≈ 40 GB of weights: needs FP8/GGUF plus offload; tight in 24 GB WSL RAM | Strongest open editor; "Qwen-Image-Layered" decomposes images into RGBA layers. The fal Multiple-Angles LoRA (Apache-2.0, 96 camera poses, trained on 3,000+ Gaussian-splat renders of unstated origin) **[low]**. Too heavy for a first session. **high** for licence/size |
| Qwen-Image-2.1 / 2.1-Turbo | 7B | Qwen Research Licence (non-commercial) | — | — | **Avoid.** [secondary, consistent] **medium** |
| **SDXL 1.0** | 3.5B | CreativeML **Open RAIL++-M** | "Licensor claims no rights in the Output … No use of the output can contravene any provision"; use-based restrictions (Attachment A) must be passed on | ~8–10 GB | Mature ControlNet, IP-Adapter and tiling ecosystem; most pixel-art LoRAs target it. [LICENSE-SDXL1.0] **high** |
| SD 1.5 | 0.9B | CreativeML OpenRAIL-M | free | small | Avoid. Its LAION-5B training set had a CSAM finding (Stanford Internet Observatory, Dec 2023), and the original runwayml repo was removed. **medium** (from memory) |
| Stable Cascade | — | Stability non-commercial research licence | — | — | **Avoid.** **medium** (from memory) |
| SD 3.5 | 2.5–8B | Stability Community Licence (free under $1M annual revenue) | — | — | Possible, but nothing above needs it. **low** (licence text not re-read) |

### 2.2 Pixel-art specific

| Option | Licence | What it gives | Verdict |
|---|---|---|---|
| **SD-πXL** (SIGGRAPH Asia 2024, `AlexandreBinninger/SD-piXL`) | MIT code; SDXL plus ControlNet depth/canny weights | **Exact output size and exact palette**: "a palette of n colors"; Gumbel-softmax argmax gives "crisp pixel art result that adheres exactly to the color palette". Takes an input image and conditions on its depth and canny (scale 0.15 + 0.15), so it **can pixelate our own render**. Defaults: 64×64, 10k–30k steps, LR 0.025, SD guidance 40, optional LoRA (e.g. `nerijs/pixel-art-xl`). | The only method found that enforces Orbkin's palette lock *during* generation. Cost: "takes a few hours to complete" and "24GB is recommended", so it suits one-off hero portraits, not 18 kin × views × frames. Its `--download` must be replaced with local paths. **high** (README and config read) |
| `nerijs/pixel-art-xl` (SDXL LoRA) | CreativeML OpenRAIL-M (tag; secondary) | Pseudo-pixel style; "downscale 8× with nearest" (secondary) | Training data undisclosed, so IP and provenance are unknown. Reference-only at most. **medium** |
| `svntax-dev/pixel_spritesheet_4walk_small_lora_v1` (klein 4B) | Apache-2.0 (HF card, secondary) | 32×32 four-direction walk sheets, trained on edits of one artist's template | A small, single-artist provenance; a candidate *pattern* for our own LoRA. **low** |
| `Onodofthenorth/SD_PixelArt_SpriteSheet_Generator` | SD1.x era | 4-view sheets via model merging | Old (2022) and SD1.x. Skip. **medium** |
| Civitai pixel-art LoRAs | mixed, often NC; training data almost never disclosed | — | **Never ship.** The licence tag says nothing about the *training data* (often game sprites). **high** for the practice |
| Retro Diffusion, PixelLab | paid hosted | best-known pixel tools | Out of scope (not free). **high** |
| Cleanup tools (`unfake.js`/`unfake.py`, `spritefusion-pixel-snapper`, `perfectPixel`, `pixelfit`, `pixel-art-lab`) | MIT/various, local | Grid detection, palette snap, orphan removal | Useful as references. §6.3 shows **known-grid sampling beats auto-detection**, and JPEG/WebP 8-px blocks fool detectors. pixelfit notes that nearest-neighbour fails because "there is no consistent grid to downscale onto". **medium** |

### 2.3 Consistency tools (multi-view, pose, identity)

- **FLUX.2 klein multi-reference editing** (Apache, in diffusers). Feed the front view and ask for the back view.
  Community report (Civitai multi-angle workflow, 4B Q4): "useful for rough reference blocking … not a perfect
  character turnaround … rear views or small costume details may still need cleanup". **low-medium**
- **Qwen-Image-Edit-2511 with the Multiple-Angles LoRA** (Apache): 96 camera poses. Heavy, and the training
  renders' origin is unknown. **low**
- **MV-Adapter** (Apache-2.0 code per its LICENSE; SDXL weights, licence to verify on HF) gives multi-view
  consistent images at 768 px. **Zero123++** weights are **CC-BY-NC 4.0** (its README), so avoid them. **high**
  for both licence lines read
- **Sprite Sheet Diffusion** (arXiv 2412.03685): Animate-Anyone-style pose-conditioned sprite animation, with a
  150-pair dataset; code status unverified. **low**
- **ControlNet/IP-Adapter for 4-direction sprites:** I found no reproducible open workflow (search, with no hits
  beyond vendor pages). Orbkin does not need one anyway: its 3D kin already give any yaw for free. **medium**

### 2.4 Depth, normals and intrinsics from painted images

| Model | Licence | Use for Orbkin |
|---|---|---|
| **Depth Anything V2-Small** (24.8M) | Apache-2.0 (Base/Large/Giant are **CC-BY-NC-4.0**) | Depth for parallax layers of key art and title screens. The official repo ships `.pth` (pickle), so use the `-hf` transformers safetensors variant only. **high** |
| **DA3-Small / DA3-Base / DA3Metric-Large** | Apache-2.0 (DA3-Large/Giant and Nested are **CC BY-NC 4.0**) | Same use, newer (Nov 2025). **high** |
| **Marigold** depth / normals / IID v1.1 (`prs-eth`) | Apache-2.0 code; weight licence to verify on HF (one secondary source says RAIL++-M, being SD2-based) | Normals from a painted portrait, so a 2D asset can take the arena key light. In diffusers core: `MarigoldNormalsPipeline.from_pretrained("prs-eth/marigold-normals-v1-1", variant="fp16")`. **medium** |

### 2.5 Image-to-3D

| Model | Licence | VRAM / time | Install reality in the jail | Notes |
|---|---|---|---|---|
| **TRELLIS.2-4B** (`microsoft/TRELLIS.2`) | MIT; but **nvdiffrast/nvdiffrec are NVIDIA Source Code Licence, "non-commercially … research or evaluation purposes only"**; DINOv3 encoder under Meta's custom licence (gated); RMBG-2.0 background remover **CC BY-NC 4.0** unless you pass an alpha cut-out | README: "at least 24GB". kiln measured on M4 Pro 24 GB: 5–7 min, 19.5–22.5 GB peak, **31 GB weights** | `setup.sh` builds flash-attn, cumesh, o-voxel, flexgemm, nvdiffrast, nvdiffrec with the CUDA toolkit. **Not possible without compilers.** | kiln §7: raw lantern 0.952 shape score, 191k tris, one material. Decimating 97% "broke every wire". **Use as a measuring template** (`template_profile.py`). **high** |
| **Pixal3D** (`TencentARC/Pixal3D`, SIGGRAPH 2026) | MIT (LICENSE, Copyright 2026 Tencent); NOTICE lists dinov2 (Apache-2.0). A third-party ComfyUI wrapper claims "academic/non-commercial, not EU"; I found no Tencent source for that **[low]** | Built on the TRELLIS.2 backbone; `--low_vram` defaults to 1024 resolution | Needs the TRELLIS.2 environment, plus `natten` (sdist, CUDA build), MoGe from git, and a `utils3d` wheel **from a personal GitHub release**. Fails our supply-chain rules as-is. | **Multi-view input** (`inference_mv.py`, 4 orbit views plus `transforms.json`, front view first) is interesting: feed it our own renders or turnarounds. **high** |
| TRELLIS (v1) | MIT; diffoctreerast is derived from Inria's non-commercial diff-gaussian-rasterization; modified FlexiCubes under NVIDIA's licence | "at least 16GB" | spconv/kaolin/nvdiffrast builds | Superseded. **high** |
| **TripoSG** | MIT (secondary) | "at least 8GB VRAM" | Needs `diso` (sdist, CUDA build); `numpy==1.22.3` pin conflicts with Python 3.13 | Geometry only. **medium** |
| TripoSR | MIT | "about 6GB VRAM" | Needs `torchmcubes` from git (CUDA build); pins transformers 4.35 | Old (2024), low fidelity. **high** |
| Hunyuan3D-2.1 / 2mini | Tencent community licence: **not valid in the EU, UK, South Korea**; "must not use, reproduce, modify, distribute, or **display** … Output … outside the Territory"; 1M-MAU cap | 10 GB shape, 21 GB texture (2.1); 2mini ~6 GB | `requirements.txt` adds **two extra package indexes** (`mirrors.cloud.tencent.com`, `mirrors.aliyun.com`), which violates "never add package sources", plus custom-rasteriser builds | **Avoid.** A browser game "displays" output worldwide. **high** |

---

## 3. Running it inside `gpu-run`

### 3.1 Diffusers scripts vs ComfyUI

| | diffusers script | ComfyUI |
|---|---|---|
| Fits `gpu-run` (one script, no server, no browser) | yes | No. It is a server on :8188 with a web UI. Inside `--unshare-all` only the jail's own loopback exists, so the owner's browser cannot reach it; it could only run via its API from a script in the same job. |
| Code you did not review | none beyond pinned wheels | the core, plus a frontend pip package (`--front-end-version` downloads from GitHub releases), plus any custom nodes |
| Safety switches | `HF_HUB_OFFLINE=1`, `use_safetensors=True`, `local_files_only=True`, never `trust_remote_code` | `--disable-all-custom-nodes`, `--offline` (CSP plus no partner/API nodes), `--listen 127.0.0.1` (default), never `--enable-manager` |
| Determinism | `enable_full_determinism()` + CPU `Generator` | `--deterministic` ("might not make images deterministic in all cases") |
| Real incidents | — | Ultralytics 8.3.41/8.3.42 XMRig miner via Impact-Pack (Dec 2024; ComfyUI blog); ComfyUI_LLMVision credential theft (Wikipedia, citing 404 Media); 2026 botnet that installed nodes through ComfyUI-Manager CVE-2025-67303 (Censys, CSA); champdev-comfyui-nodes RAT and miner (ComfyUI issue #16631, Sept 2026) |

Verdict: **diffusers only.** ComfyUI is acceptable only for the owner's own manual exploration on Windows,
outside the node, and even then with no custom nodes. **high** (flags read from `comfy/cli_args.py`)

### 3.2 Model files are untrusted data

- **Safetensors only.** `torch.load` on pickles runs code. CVE-2025-32434 showed that even
  `weights_only=True` could be bypassed in torch ≤ 2.5.1 (fixed in 2.6.0, NVD). Refuse `.bin/.pt/.pth/.ckpt/
  .pkl/.npy` outright (`verify_weights.py` below). **high**
- **No remote code.** Never pass `trust_remote_code=True`. Never `pip install -e` a model repo. Image-to-3D repos
  *are* code: each one is a reviewed, commit-pinned dependency or nothing. **high**
- **Pin by commit.** Download URLs take the form
  `https://huggingface.co/<repo>/resolve/<40-hex commit>/<file>`. Record each file's sha256 in a committed
  manifest (`game/tools/gpu-pc/weights.manifest.json`). The HF "Files" page shows each LFS file's SHA256 to
  cross-check against. This is trust-on-first-use pinned to an immutable commit, which is the best available
  without signatures. **medium**
- **Gated repos** (DINOv3, RMBG-2.0) need the owner's HF account. Avoid them; the MIT/Apache set needs no
  gating, except possibly klein 4B (check its card).
- **Third-party LoRAs are not allowed** (§5). They are tiny safetensors and safe to *load*, but their training
  data is unknown.

### 3.3 Weight manifest and download (owner, plain terminal, no code execution)

```bash
# owner, Ubuntu terminal, as claude (NOT inside Claude Code). Only curl + sha256sum run.
M=~/orbkin-models/z-image-turbo; REV=<commit hash shown on the HF "Files" page>
mkdir -p "$M/transformer"
curl -fL --proto '=https' -o "$M/transformer/diffusion_pytorch_model-00001-of-00003.safetensors" \
  "https://huggingface.co/Tongyi-MAI/Z-Image-Turbo/resolve/$REV/transformer/diffusion_pytorch_model-00001-of-00003.safetensors"
# … one line per file listed in the manifest (configs, tokenizer JSONs, VAE, text encoder) …
sha256sum -c ~/orbkin/game/tools/gpu-pc/weights/z-image-turbo.sha256   # every line must say OK
```

Approximate disk: Z-Image-Turbo ≈ 20 GB (6B bf16 plus the text encoder); klein 4B ≈ 15 GB; SDXL ≈ 7 GB;
Marigold ≈ 2–5 GB; DA3-Small < 0.5 GB; TRELLIS.2 31 GB (kiln, measured). **low-medium** (estimates, except
TRELLIS.2)

### 3.4 Python environment: a lock resolved here

Ran in this container (`uv 0.11.32`):

```bash
# requirements-gen.in: torch diffusers transformers accelerate safetensors peft pillow numpy
uv pip compile requirements-gen.in --python-version 3.13 --python-platform x86_64-manylinux_2_28 \
   --generate-hashes --exclude-newer 2026-09-29T00:00:00Z -o requirements-gen.lock
```

Result: **859 hashes.** torch 2.14.0 (528 MB wheel plus nvidia-* wheels), diffusers 0.40.0, transformers
5.17.0, accelerate 1.15.0, safetensors 0.8.0, peft 0.21.0, numpy 2.5.3, triton 3.8.0, cuda-toolkit 13.0.3
(nvidia-cudnn-cu13 9.24).
- `--exclude-newer` enforces the repo's "≥ 2 weeks old" pin rule automatically. A plain date did not work:
  `--exclude-newer 2026-09-30` still let in torch 2.14.1, uploaded 2026-09-30T17:43. Use a full UTC timestamp.
- **Combined with `bpy==5.2.2` it resolves** (same numpy 2.5.3), so one venv works.
- diffusers 0.40.0 (2026-08-20) contains `Flux2KleinPipeline`, `ZImagePipeline`, `ZImageControlNetPipeline`,
  `MarigoldNormalsPipeline`, `QwenImageEditPlusPipeline` and the SDXL pipelines (checked in the wheel).

Files: `scratchpad/genai-lock/requirements-gen.{in,lock}`. **high**

**Driver warning.** torch ≥ 2.13 on PyPI depends on `cuda-toolkit==13.0.x`. CUDA 13 needs driver ≥ 580 on Linux
(580.65.06); NVIDIA no longer prints a Windows minimum, but it is the 580 branch. `GPU_PC_SETUP.md` Step 3a
currently says "575 or newer", so bump it to ≥ 580. The alternative is cu12 wheels from download.pytorch.org,
which means adding a package index: an owner decision, and against the repo rule. Ampere sm_86 is supported by
CUDA 13 (it dropped only Maxwell, Pascal and Volta). **medium-high**

### 3.5 Jail-specific settings

- Offline: `HF_HUB_OFFLINE=1`, `TRANSFORMERS_OFFLINE=1`, `HF_HOME=~/orbkin-cache/hf`, load from local paths
  with `local_files_only=True`.
- HOME is a tmpfs, so Triton/torch.compile caches vanish each job. Leave `torch.compile` off (first-run compile
  cost on every job).
- No inline code: every job is a `.py` file in `game/tools/gpu-pc/` plus a job JSON. That is good, because the
  owner approves a reviewable file.
- Output goes only to `$ORBKIN_OUT`, as PNG (never JPEG/WebP; see §6.3), with a JSON sidecar per image.
- The originality check (`ip_check.py`) calls `claude -p`, which needs the network. Run it **in the sandbox
  after the job**, reading `~/orbkin-cache/out` (already an `additionalDirectory`).
- RAM: WSL has 24 GB. `enable_model_cpu_offload()` keeps VRAM low but holds the idle components in system RAM.
  Fine for 4–6B models; 20B Qwen in bf16 will not fit.

### 3.6 Determinism with fixed seeds on CUDA

From the diffusers reproducibility guide (read from the repo) and the `enable_full_determinism` source (0.40.0
wheel):
- Use a **CPU `torch.Generator`** ("CPU RNG is more stable across machines"). Re-create it per image; a
  generator's state is consumed.
- `enable_full_determinism()` sets `CUDA_LAUNCH_BLOCKING=1` and `CUBLAS_WORKSPACE_CONFIG=:16:8`, calls
  `torch.use_deterministic_algorithms(True)`, sets cudnn deterministic, turns off cudnn.benchmark, and disables
  TF32.
- The guarantee is limited: "You can try to limit randomness, but it is not *guaranteed* even with an identical
  seed." Same GPU, driver, wheels and weights should reproduce; across GPUs or versions, expect small
  differences.
- Practice: store everything in the sidecar (model revision, manifest sha256, versions, seed, steps, guidance,
  size, output sha256). **Re-run 1 job in 10** and compare output hashes. A mismatch is logged, not fatal; the
  sidecar, not bit-identity, is the provenance. **high** for the facts; the policy is mine

### 3.7 VRAM and time per step (to measure in session 1)

| Model | Expected peak VRAM | Time | Basis |
|---|---|---|---|
| klein 4B, 1024², 4 steps (distilled) | ~8–13 GB | seconds | flux2 README (~8 GB); HF card (~13 GB, secondary). **medium** |
| Z-Image-Turbo, 1024², 9 steps / 8 NFE | ≤ 16 GB, less with offload | seconds | README. **medium** |
| SDXL, 1024², 30 steps | ~8–10 GB | ~10–20 s (guess) | **low** |
| SD-πXL, 64², 10k steps | ~24 GB | "a few hours" | README. **high** |
| TRELLIS.2 | 19.5–22.5 GB peak | 5–7 min | kiln on Apple M4 Pro; CUDA should be faster. **medium** |

I found no trustworthy 3090 timings for klein 4B or Z-Image-Turbo. One secondary site claims FLUX.1-dev at
5.3 s/image on a 3090, which I do not believe for 28 bf16 steps. **The first session should log
`torch.cuda.max_memory_allocated()` and wall time per image**; `gen_image.py` writes both to every sidecar.

### 3.8 Drafted job scripts (syntax-checked, not run)

Both are in `scratchpad/genai-exp/gpu-pc-draft/`.
- `verify_weights.py MANIFEST [model]`: walks the model folder, refuses pickle extensions, unlisted files and
  symlinks, and checks every sha256. Exit 3 on any problem.
- `gen_image.py JOB.json`:
  - runs `verify_weights.py` first;
  - sets the offline env and `enable_full_determinism()`;
  - loads a pipeline from an allow-list (`ZImagePipeline`, `Flux2KleinPipeline`, `StableDiffusionXLPipeline`)
    with `use_safetensors=True, local_files_only=True`;
  - uses a CPU generator per image and supports klein `reference_images`;
  - saves PNG plus a sidecar (licence, repo, revision, manifest sha, prompt, negative, seed, steps, guidance,
    size, seconds, peak VRAM, versions, GPU, output sha256, `ip_check: null`, `human_edit: null`,
    `status: generated-unreviewed`).

Core of the loader:

```python
os.environ['HF_HUB_OFFLINE'] = '1'; os.environ['TRANSFORMERS_OFFLINE'] = '1'
from diffusers.utils.torch_utils import enable_full_determinism; enable_full_determinism()
pipe = getattr(diffusers, PIPES[model][0]).from_pretrained(
    man['root'], torch_dtype=torch.bfloat16, use_safetensors=True, local_files_only=True)
pipe.enable_model_cpu_offload()
g = torch.Generator('cpu').manual_seed(seed)
img = pipe(prompt=..., width=1024, height=1024, num_inference_steps=9, guidance_scale=0.0, generator=g).images[0]
```

---

## 4. IP drift: why every output is gated

- **Evidence.** He et al., "Fantastic Copyrighted Beasts and How (Not) to Generate Them" (ICLR 2025; code
  `princeton-nlp/CopyCat`):
  - Image models reproduce copyrighted characters from **generic keywords** ("indirect anchoring"); "videogame,
    plumber" gives Mario, and two keywords often suffice. 50 characters from 18 studios were tested.
  - Prompt rewriting alone is insufficient. Rewriting **plus negative prompts naming the characters** blocked
    > 80%.

  A creature collector's natural briefs ("small yellow electric rodent", "fire lizard") are exactly the
  indirect anchors. **high**
- **Orbkin's own evidence** (`judge-calibration.md` §8): the blind check already caught Maelstrode → Dragonair
  (7–9, distinctive), Dropple → Dragon Quest Slime, and the old hero → Red. It also showed the **sprite bake can
  increase resemblance** (Maelstrode 5–6 in the lineup, 7–9 in the battle crop). **high**
- **Legal backdrop** (not legal advice; trackers, **medium**):
  - Disney/Universal v. Midjourney (C.D. Cal.) is in discovery and about *outputs* reproducing characters.
  - Getty v. Stability (UK High Court, 4 Nov 2025): the main secondary-infringement claim failed; the court held
    that model weights are not a stored copy.
  - The US Copyright Office Part 2 report (29 Jan 2025) says prompts alone do not make a user the author. Purely
    generated assets are likely **not copyrightable**, so others could reuse them. Human modification or
    arrangement can be protected.
- **Gate design** (required for any generated pixel that leaves `~/orbkin-cache`):
  1. **Brief hygiene.** Brief from animal + element + behaviour + one twist (creature-design §3.8). Never name a
     franchise or creature in the positive prompt. Avoid the iconic combos (yellow electric mouse, fire lizard
     with tail flame, nine-tailed fox).
  2. **Negative prompt** with franchise and character names, per the paper's mitigation. Z-Image base and SDXL
     support negatives; distilled klein and Turbo ignore CFG, so for them gating is all there is.
  3. **Over-generate** (8 seeds per brief) and run `ip_check.py` (3 blind runs) on each **concept**. Discard
     REVIEW and FAIL concepts before any human time is spent.
  4. Run `ip_check.py --scene` again on the **final in-game crop** (front and back), because the bake can raise
     resemblance.
  5. **Free tripwire.** grep every judge reason (visual_judge, ip_check) for franchise names; any hit escalates.
  6. **Drift rate is a metric.** Report the share of generated concepts that hit REVIEW/FAIL, against the
     procedural arm's rate. If generated concepts drift much more often, that alone argues against shipping
     them.
  7. Record the verdict in the sidecar (`ip_check` field) and keep the JSON.

---

## 5. What `ASSETS.md`'s "no external art" policy should say about AI outputs (owner decision)

Current text: "All art is procedurally generated in code … No external models, textures, fonts or audio are
used … no CC0 or third-party packs." HD2D.md repeats "no external art". The other notes already recommend
relaxing this for CC0 assets (Poly Haven, Kenney, ambientCG); this section covers only AI outputs.

| Option | Rule | Pros | Cons |
|---|---|---|---|
| **0. Status quo** | No AI-generated pixels anywhere, not even as reference | Simplest; no disclosure; no IP drift path | Gives up concept exploration and the local GPU's main value |
| **1. Reference-only (recommended now)** | Generated images may be **internal references only**: thumbnails, silhouettes, moodboards, proportion templates. Never shipped, never traced 1:1, never committed (they live in `~/orbkin-cache`; contact sheets for review on `claude/gpu-pc*` branches only, deleted after the decision). Shipped art stays code-authored. Derived kin still pass `ip_check` on the final crop. | Captures most of the value (design); shipped art stays original and copyrightable; no store disclosure needed for shipped content | Needs discipline: "reference" must not become tracing |
| **2. Provenance-clean shipping, non-kin 2D only (after the A/B)** | Allowed: key art, title, dex portraits, far backgrounds, textures. Conditions: (a) **Apache-2.0/MIT weights only** from an allow-list (klein 4B, Z-Image(-Turbo), Qwen-Image Apache versions; SDXL allowed with its OpenRAIL use restrictions); (b) **no third-party LoRAs or embeddings**, only LoRAs trained in-house on Orbkin-owned or CC0 images with the dataset listed; (c) a sidecar per asset, kept in the repo next to the asset; (d) `ip_check` PASS (REVIEW goes to the owner); (e) a human or agent edit pass (palette lock, cleanup), noted in the sidecar; (f) **one `ASSETS.md` row per asset**: "AI-assisted: <model> (<licence>), seed, edit summary"; (g) **store disclosure**: itch.io's "AI Generated → Graphics" tag (mandatory for assets since Nov 2024, enforced by delisting), and Steam's AI disclosure if ever on Steam (Jan 2026 rules focus on content players see) | Best-quality path for big 2D art | Outputs likely uncopyrightable; some players dislike AI art; licence and policy upkeep |
| **3. Permissive** | Any open model, community LoRAs, Civitai | — | **Reject.** Unknown training data (franchise sprites), NC licences, highest IP drift |

Under any option, kin sprites remain the code-built, live-baked pipeline unless the A/B (§7) clears its adoption
rule.

A grey area to state plainly: Orbkin's procedural art is *code written by an AI agent*. Steam's 2026 rewrite
exempts code-assist tools, and itch's tag is about generative-AI *content*. Procedural code output is
conventionally not "AI-generated content", but if the owner wants to be conservative, a one-line credits note
("art generated by code written with Claude") costs nothing. **medium**

Suggested `ASSETS.md` wording for Option 1:

> **AI image models.** Open-weights image models may be run on the owner's GPU node to make *internal design
> references only* (thumbnails, silhouettes, proportion templates). No generated pixel ships, is committed to
> `main`, or is traced. Every design derived from a reference passes `ip_check.py` on the final in-game crop.
> Allowed models: Apache-2.0/MIT weights listed in `tools/gpu-pc/weights.manifest.json`; no third-party LoRAs.

---

## 6. Quality reality check

### 6.1 What the repo has already measured (other notes)

- `ingame-vertical-slice.md`: "Creatures: the renderer matters more than the modelling tool at Orbkin's sprite
  size". Blender SDF/remesh GLBs vs code-built kin through the same live bake showed "no detectable difference";
  live bake beat an offline Blender toon sprite 3–0; **doubling texel density (kin 28 → 56) won 3–0**, "larger
  than any asset-source effect". **high** (their measurement)
- So **image-to-3D, then the live bake, is another modelling tool**. Prior: it will not beat SDF or code kin on
  looks at 28–40 texels. Any gain would come from better *proportions and silhouette*, i.e. the 2D design step,
  which a template can carry into code kin without shipping the mesh (kiln's template lesson). **medium-high**
- Arm C still earns a place in the A/B as an optional arm, at 2× density, where faces start to read.

### 6.2 Pixel-art LoRAs vs Orbkin's 56–70 px and palette lock

- Diffusion models work in ~1024² latent space. "Pixel art" LoRAs paint pseudo-pixels at ~8–16 px per cell, so
  their designs carry 64–128 cells of detail, which is 2–4× more than a 28–40 texel kin can hold. **medium**
- Generated grids are inconsistent (drifting, fractional). The cleanup projects exist *because* of this
  (unfake.js handles "fractional grids such as 200 cells at 2048 px"; pixelfit says nearest-neighbour
  downscaling fails because there is no consistent grid). **medium**
- Palette lock: only SD-πXL enforces an exact palette and size. Everything else needs a post-pass, Orbkin's OKLab
  LUT lock (`hd2d-pixel.md` §8.6), which is lossy (§6.3).
- No verified public evidence (repo, talk, postmortem) shows LoRA pixel art beating hand or procedural sprites
  at ~32–64 px in a shipped game. Searches found tool pages, vendor claims and one 14-day prototype blog.
  GDC 2026 talks (Ubisoft La Forge "AI Models for 2D Generation"; Keywords "brand-trained" pipelines) describe
  **fine-tuning on the studio's own data for concept art, textures and thumbnails**, not final sprites.
  **medium** (session abstracts only)

### 6.3 Experiments run here (CPU, `scratchpad/genai-exp/`)

**(a) Detail survival** (`survival.py`). I took Pyrelord (431 px tall) from
`docs/screenshots/creatures/lineup-0-flame.jpg`, standing in for a detailed generated concept, and reduced it
with box resampling plus a 12-colour OKLab k-means lock to each height. Contact sheet:
`survival_pyrelord.png`.

| Height (texels) | Opaque px | Colour regions ≥ 2 px | Singleton (orphan) regions | Read |
|---|---|---|---|---|
| 28 | 299 | 47 | 82 (27% of pixels) | eyes and brow gone; spikes become noise |
| 40 | 571 | 76 | 103 (18%) | eye just visible; mane is mush |
| 56 | 1128 | 95 | 178 (16%) | face, eye, brow, mane read |
| 70 | 1774 | 127 | 244 (14%) | clean |

A naive reduction of a detailed image is **not pixel art**: about a fifth to a quarter of the texels are orphan
pixels that a pixel artist would remove. Concepts need to be *designed* for the texel height (3–5 tertiary
details, per creature-design.md), not downscaled. **medium** (one creature; orphan share is a proxy)

**(b) Grid recovery** (`snap.py`, `snap_png.py`, `knowngrid.py`). I made a 35×56, 16-colour ground-truth sprite
and faked "AI pseudo-pixels" from it: bilinear upscale ×8 / ×10.24 / ×14.7 / ×16, blur σ = 0.12 × scale, noise
σ = 6, saved as PNG or JPEG q85. Then I tried to recover the exact sprite.
- **Auto period detection failed.** With JPEG, the detector locked onto the **8-px JPEG block grid** (period
  8.00) at every scale. With PNG and no hint, it locked onto silhouette-scale structure (periods 24–40).
- With a ±25% hint from the known target size, it recovered the grid (14.57 vs 14.70), but the sampled sizes
  were off by one at 3 of 4 scales.
- **Known grid** (generate at an integer multiple of the target, then sample cell centres): exact texel recovery
  after the palette lock:
  - cell-median: 77–88%;
  - box resize: 77–87%;
  - naive nearest: 68–80%.

Even in this **best case** (the underlying image *is* a perfect grid), 12–23% of texels come back wrong. Real
generations have no perfect grid, so expect worse.

Lessons:
- Save generator output as **PNG** only.
- Generate at **target texels × integer k**.
- Sample cells with box or median, never nearest.
- Palette-lock.
- Then run an orphan-cleanup pass and **budget human/agent cleanup per sprite.**

**medium** (synthetic)

### 6.4 Can image-to-3D-to-toon-bake beat SDF kin?

- Fidelity: TRELLIS.2 gave the best raw shape on kiln's bench (0.952), but at 1 m tall, 191k tris and one
  material. Decimating to Orbkin's ≤ 2,500-tri budget breaks thin parts: Orbkin's horns, spikes, tails and fins
  are exactly the "wires" that broke. Vertex colours from its texture would also carry baked lighting and
  smears.
- At 28–40 texels, the earlier result (tool doesn't matter) predicts a tie at best.
- Plausible win: **hero kin proportions**. Use TRELLIS.2 or Pixal3D on an owner-approved concept, measure the
  silhouette profile with kiln's `template_profile.py` approach, and rebuild in code.

Recommendation: no image-to-3D in the jail until the owner decides on a compile toolchain (Tier 2, §8); test it
as the optional Arm C. **medium-high**

### 6.5 Hype check

- Most "Claude + AI assets" showcases used **paid** generators. Our own `showcases.md` lists Paper Racers, The
  Little Prince and the anime character as made with Tripo/Tripo P2. The Blender MCP bridges' `generate_3d`
  calls Hyper3D, Tripo or Hunyuan cloud.
- Vendor pages making sprite-sheet claims ("40% faster", "outperforms Midjourney") had no reproducible evidence.
- Only kiln's benchmarks (repo, numbers, failed tries shown) and the model repos' own READMEs count as evidence
  here.

---

## 7. The A/B for the first `gpu-run` session

**Question.** At Orbkin's battle framing, does an open-weights generative path produce kin that a blind judge
prefers to the procedural live-bake kin, without raising IP risk, within a sane cleanup budget?

**Subjects.** 5 kin from the weak-silhouette list: Vulcrag, Stormoth, Surgeray, Rillback, Pebblet.
- Each has **one written brief**, the same for all arms: the CREATURES.md row (concept, signature, palette)
  rewritten as animal + element + behaviour + twist.
- Positive prompts never mention franchises.
- The arena palette and battle camera are fixed: the cave arena, standard battle shot plus a 2× focal crop.

**Arms.**

| Arm | Pipeline | Notes |
|---|---|---|
| **A: control** | Current code kin through `sprite.ts` live bake, at both the standard texel height and **2× density** | Captured with the existing harness (same seeds and camera) |
| **B: 2D generation** | Brief → Z-Image-Turbo (and klein 4B as a second sampler) at 1024², flat chroma background, **8 seeds** → `ip_check` on the concepts → owner or Claude picks the best PASS concept per kin (picker blind to arm A) → **known-grid reduction** to the same texel height (box) → arena OKLab palette lock → 1-texel outline and orphan cleanup (same rules as `sprite.ts`) → composited into a kin-hidden capture at the sprite's feet anchor (from `window.__game.renderInfo()`) | Static, unlit sprite: that is the honest cost of this arm. Background removal is a chroma key (never RMBG-2.0). Back view via klein multi-reference editing (front as reference). |
| **C: image-to-3D (optional, Tier 2 only)** | B's chosen front concept (with alpha) → TRELLIS.2 or Pixal3D (MIT path; BiRefNet MIT instead of RMBG; nvdiffrast caveat recorded) → bpy decimate to ≤ 2,500 tris; thin parts rebuilt as curves (kiln) → vertex colours → GLB → the existing GLB-kin live-bake path | Skip unless the owner approves a toolchain. Variant C′: use the mesh only as a proportion template for the code kin (2–3 h agent time per kin). |

**Judging** (all tools already exist in `scratchpad/jc/scripts/`):
1. **Defect floor:** `artgate_compare.py` per frame (no flattened values, no blur).
2. **Blind pairwise:** `visual_judge.py --candidate B --baseline A` (and C vs A, B vs C) on full frames and on
   2× focal crops, both display orders, with a canary pair.
   - Count a win only when **both orders agree**. "no_difference" means no claim.
   - A full frame and a focal crop are separate signals (they disagreed on 8/12 pairs in calibration).
3. **IP:** `ip_check.py` on every concept (8 seeds × 5 kin × 2 samplers = 80 concepts, 3 runs each) and
   `ip_check.py --scene` on every final crop. Report the **drift rate** per arm.
4. **Owner ground truth:** 10–15 blind A/B picks shown in random order with no arm labels; the judge–human
   agreement goes in the result.
5. **Cost log:** GPU minutes, peak VRAM, agent turns or $, and **minutes of cleanup per kin**.

**Pre-registered adoption rule** (write it into DECISIONS.md *before* running):
- Arm B or C replaces arm A for kin **only if** all of these hold:
  - it wins ≥ 4/5 kin with order-consistent judge votes;
  - the owner agrees on ≥ 2/3 of the shown pairs;
  - there are **zero** FAILs on final crops;
  - its REVIEW rate is not above arm A's;
  - cleanup is ≤ 30 min per kin per view.
- Otherwise generative output stays at Option 1 (reference-only) for kin.
- The A/B separately notes whether B's *concepts* (not sprites) suggested better silhouettes. If so, feed them
  into code kin as references, which Option 1 already allows.

**Session-1 runbook** (each `gpu-run` call approved by the owner):
1. Owner: driver ≥ 580; install `requirements-gen.lock` with `uv pip install --require-hashes` into
   `~/orbkin-bpy`, or into a new `~/orbkin-gen` plus the root edit; download the weights and check `sha256sum -c`.
2. `gpu-run …/python …/game/tools/gpu-pc/verify_weights.py …/weights.manifest.json` must print "weights OK".
3. `gpu-run …/python …/gen_image.py jobs/ab1-zimage.json`: 5 briefs × 8 seeds. Log seconds and peak VRAM per
   image.
4. Repeat for `jobs/ab1-klein.json`. Re-run one job to check determinism (hash compare).
5. In the sandbox: `ip_check.py` on all concepts; pick the concepts; reduce, lock and outline with a CPU script;
   composite.
6. Capture arm A with the harness; run the judges; owner picks; write up in DECISIONS.md with the sidecars'
   summary.

Estimated GPU time: 80 images at a few seconds each plus model loads, so **< 30 min**. Most of the cost is
judging and agent time. judge-calibration reports $0.08 for a 2-image × 3-run ip_check test, so the
240 concept runs come to roughly $2–4. **medium**

---

## 8. Implications for Orbkin

1. **Don't replace the kin pipeline with generated sprites.** The live bake's relighting, yaw, vertex motion
   and 10-fps re-bake are Orbkin's sprite advantages; a generated sprite is static and unlit. The proven lever is
   texel density (2×), not the asset source.
2. **Tier 1 (diffusers only, Apache models, no root changes beyond the driver):**
   - **Concept thumbnails and silhouettes** for new and weak kin. 8 seeds a brief, ip-gated, owner-picked, used
     as references for code kin (Option 1).
   - **Title-screen and key-art studies:** generate, then rebuild in the HD-2D diorama, or (under Option 2)
     ship a painted key art layer with DA3-Small depth for parallax.
   - **Tileable textures** for rock and ground at 64–128 px with SDXL plus circular padding (the classic
     Conv2d `padding_mode='circular'` patch on UNet and VAE). For DiT models (klein, Z-Image) only the VAE is
     convolutional, so tiling needs latent rolling, which is untested. Compare against CC0 Poly Haven scans
     pixelised through the same palette lock (the other notes rated scans the best material upgrade).
3. **Tier 2 (needs the owner):** image-to-3D (TRELLIS.2 or Pixal3D) for hero-kin proportion templates. This
   needs a compiler and CUDA toolkit in WSL, git and personal-release wheels vetted and pinned, the nvdiffrast
   NC licence accepted for template-only use, and the MIT BiRefNet swap. Its output is never shipped.
4. **Tier 3 (hero portraits):** SD-πXL with our palette and our own render as the input image: exact palette,
   exact size, hours per image. Only for a handful of dex or title portraits.
5. **Own-style LoRA.** Train on klein 4B Base or Z-Image (ai-toolkit, MIT, has 24 GB configs) using
   **Orbkin-owned renders plus CC0 pixel art**, which is the only provenance-clean dataset.
   - Caveat: a LoRA trained on 6/10 art reproduces 6/10 art, and no free provenance-clean HD-2D dataset exists.
     So style LoRAs are for consistency, not quality.
   - The base model's own "pixel art" knowledge comes from scraped data, which is exactly why the IP gate is
     mandatory.
6. **Skill content to encode:**
   - the model allow-list with licences;
   - the jail recipe (offline, safetensors-only, manifest, CPU generator, sidecar);
   - the ip gate (concept and final crop);
   - known-grid reduction (PNG, integer k, box, palette lock, orphan cleanup);
   - "generated = reference unless policy says otherwise";
   - the A/B adoption rule;
   - the ComfyUI and custom-node ban;
   - "never run model-repo code or add package indexes without the owner".
7. **Fix in `GPU_PC_SETUP.md` when it is rewritten:**
   - driver ≥ 580 for CUDA 13 wheels;
   - a read-only `~/orbkin-models` mount, or re-hash weights before every load;
   - either reuse `~/orbkin-bpy` (it co-resolves) or add `~/orbkin-gen` to `gpu-run`'s allow-list.

---

## 9. Sources

Primary (read):
- FLUX.2 README (licence table, klein VRAM, 3090 recommendation):
  https://github.com/black-forest-labs/flux2 (`README.md`, `model_licenses/LICENSE-FLUX-DEV`)
- Z-Image README and LICENSE: https://github.com/Tongyi-MAI/Z-Image
- Qwen-Image README and LICENSE: https://github.com/QwenLM/Qwen-Image
- SDXL licence (CreativeML Open RAIL++-M): https://github.com/Stability-AI/generative-models/blob/main/model_licenses/LICENSE-SDXL1.0
- SD-πXL README and config: https://github.com/AlexandreBinninger/SD-piXL ; paper https://arxiv.org/abs/2410.06236
- TRELLIS / TRELLIS.2 READMEs and `setup.sh`: https://github.com/microsoft/TRELLIS , https://github.com/microsoft/TRELLIS.2
- nvdiffrast licence: https://github.com/NVlabs/nvdiffrast/blob/main/LICENSE.txt
- Pixal3D README, LICENSE, NOTICE, requirements: https://github.com/TencentARC/Pixal3D
- TripoSR / TripoSG READMEs and requirements: https://github.com/VAST-AI-Research/TripoSR , https://github.com/VAST-AI-Research/TripoSG
- Hunyuan3D-2.1 LICENSE and requirements: https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1
- Marigold README: https://github.com/prs-eth/Marigold ; Depth Anything V2: https://github.com/DepthAnything/Depth-Anything-V2 ; DA3: https://github.com/ByteDance-Seed/Depth-Anything-3
- MV-Adapter LICENSE: https://github.com/huanngzh/MV-Adapter ; Zero123++ README: https://github.com/SUDO-AI-3D/zero123plus
- ComfyUI CLI flags: https://github.com/comfyanonymous/ComfyUI/blob/master/comfy/cli_args.py
- diffusers reproducibility doc: https://github.com/huggingface/diffusers/blob/main/docs/source/en/using-diffusers/reusing_seeds.md ; diffusers 0.40.0 wheel (pipelines and `enable_full_determinism` source)
- ai-toolkit README and LICENSE: https://github.com/ostris/ai-toolkit
- kiln (measured TRELLIS.2 run, template lesson, licence notes): https://github.com/elithril/blender-kiln (`docs/benchmarks.md` §7, `plugin/references/ai-generation.md`)
- PyPI JSON API (versions, dates, wheel availability for diso/natten/flash-attn/nvdiffrast/torchmcubes)
- Orbkin repo: `game/docs/GPU_PC_SETUP.md`, `game/docs/DECISIONS.md`, `game/ASSETS.md`, `game/src/render/hd2d/sprite.ts`; research notes `judge-calibration.md`, `ingame-vertical-slice.md`, `creature-design.md`, `hd2d-pixel.md`, `showcases.md`, `blender-llm.md`

Secondary (search results; see the confidence tags):
- Fantastic Copyrighted Beasts (ICLR 2025): https://proceedings.iclr.cc/paper_files/paper/2025/file/d28077e5ff52034cd35b4aa15320caea-Paper-Conference.pdf ; https://github.com/princeton-nlp/CopyCat
- USCO Part 2 summaries: https://ipwatchdog.com/2025/01/29/part-two-copyright-office-ai-report-says-creative-prompting-doesnt-constitute-authorship/
- Litigation trackers: https://www.mckoolsmith.com/newsroom-ailitigation-58 , https://rinzara.com/articles/ai-copyright-lawsuit-tracker-2026
- Steam 2026 disclosure update: https://gigazine.net/gsc_news/en/20260120-steam-updates-ai-disclosure-guidelines ; itch.io: https://gamingonlinux.com/2024/11/itchio-store-now-requires-ai-generated-content-disclosures-for-assets
- ComfyUI incidents: https://blog.comfy.org/comfyui-statement-on-the-ultralytics-crypto-miner-situation , https://censys.com/blog/comfyui-servers-cryptomining-proxy-botnet/ , https://github.com/Comfy-Org/ComfyUI/issues/16631 , https://en.wikipedia.org/wiki/ComfyUI
- CVE-2025-32434: https://nvd.nist.gov/vuln/detail/cve-2025-32434
- CUDA 13 driver floor: https://docs.nvidia.com/cuda/archive/13.0.0/cuda-toolkit-release-notes/index.html
- Pixel-cleanup tools: https://github.com/jenissimo/unfake.js , https://github.com/painebenjamin/unfake.py , https://github.com/Hugo-Dz/spritefusion-pixel-snapper , https://github.com/Ign1s-Reiga/pixelfit
- DINOv3 licence: https://ai.meta.com/resources/models-and-libraries/dinov3-license ; https://github.com/facebookresearch/dinov3/issues/31
- Qwen Multiple-Angles LoRA: https://huggingface.co/fal/Qwen-Image-Edit-2511-Multiple-Angles-LoRA ; klein multi-angle community test: https://civitai.com/models/2642426/flux-klein-4b9b-multiple-angles
- GDC 2026 sessions: https://schedule.gdconf.com/session/ai-models-for-2d-generation/915061
- Sprite Sheet Diffusion: https://arxiv.org/html/2412.03685v2 ; tiling with SD: https://www.boristhebrave.com/2025/02/04/generating-tilesets-with-stable-diffusion/ (not fetched)

Scratch artefacts: `scratchpad/genai-src/` (READMEs and licences), `scratchpad/genai-lock/` (lockfile),
`scratchpad/genai-exp/` (survival, snap and known-grid experiments; the `gpu-pc-draft/` scripts).
