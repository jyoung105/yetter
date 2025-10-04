## Yetter Image Generation Project

This guide explains how to run all three image pipelines, where inputs come from, what outputs are produced, and how time-per-image and total time are calculated.

### 1) Setup
- **Install**: `npm install`
- **API key**: Create a `.env` file at the project root with:
  - `YTR_API_KEY=your_api_key_here`
  The code uses `dotenv` and reads the key from the environment automatically.

### 2) Inputs
- **Prompts for text-to-image** (`qwen-image` and `flux-1-dev`):
  - File: `example_inputs/prompts.txt` (one prompt per line)
- **Edit prompts and source images** for image-to-image (`flux-1-kontext-dev`):
  - Prompts: `example_inputs/edit-prompts.txt` (one edit instruction per line)
  - Images: `example_inputs/edit-images/`
  - Pairing rule: images are sorted by filename and matched by index with the corresponding line in `edit-prompts.txt`.

### 3) How to run
- Text-to-image with Qwen:
  - `node model/qwen-image/batch-generate.js`
- Text-to-image with Flux 1 Dev:
  - `node model/flux-1-dev/batch-generate.js`
- Image-to-image edits with Flux 1 Kontext Dev:
  - `node model/flux-1-kontext-dev/batch-generate.js`

All scripts will exit early if `YTR_API_KEY` is missing.

### 4) Output location and files
Each pipeline writes to its own `results` folder:
- Qwen: `model/qwen-image/results/`
- Flux 1 Dev: `model/flux-1-dev/results/`
- Flux 1 Kontext Dev: `model/flux-1-kontext-dev/results/`

Inside each `results` folder you will find:
- Generated images (filenames like `prompt_01_image_1.png` or `.webp`, or `edit_01_image_01_result_1.png`/`.webp` for edits)
- `batch_results.json` (structured detailed data)
- `summary_report.md` (human-readable summary)

### 5) What gets recorded (same in both JSON and summary)
For each processed item (prompt/edit), the scripts store:
- `success` status and any `error` message
- `executionTime` (model-reported) and `wallClockTime` (measured)
- `imagesGenerated` and a list of `savedImages` (filename, size, type, dimensions)
- `metadata` like `model_name` and `pipeline_complete`

Aggregate fields:
- Total count (prompts/edits), successes, failures
- `totalImages`
- `totalExecutionTime` (seconds)
- Average time per item (`averageTimePerPrompt` for T2I, `averageTimePerEdit` for I2I)
- `timestamp`

### 6) Input parameters used by the models
All parameters are passed to the Yetter API through `@yetter/client` and align with the model cards. The batch scripts set sensible defaults; you can change them in the respective files.

Common text-to-image parameters (`qwen-image`, `flux-1-dev`):
- `prompt` (string)
- `image_size` (e.g., `square_hd`)
- `num_inference_steps` (e.g., 28–50)
- `guidance_scale` (e.g., 3.5–4.0)
- `num_images` (default 1)
- `negative_prompt` (optional)
- `enable_safety_checker` (boolean)
- `sync_mode` (boolean)
- `streaming` (boolean)
- `acceleration` (e.g., `none`)

Kontext (image-to-image) additional parameters:
- `image_url` (data URL or remote URL)
- `resolution_mode` (e.g., `match_input`)

Model identifiers used:
- Qwen T2I: `ytr-ai/qwen/image/t2i`
- Flux 1 Dev T2I: `ytr-ai/flux/v1.0-dev/t2i`
- Flux 1 Kontext Dev I2I: `ytr-ai/flux/v1.0-dev/i2i/kontext`

### 7) Time per 1 image and total time per 10 images
The scripts measure total wall-clock time for the batch and the average per item automatically:
- Time per 1 image = `averageTimePerPrompt` (T2I) or `averageTimePerEdit` (I2I)
- Total time for 10 images = `totalExecutionTime`

Example values from current `results`:
- Qwen T2I (`model/qwen-image/results/batch_results.json`)
  - `totalExecutionTime`: 62.568s
  - `averageTimePerPrompt`: 6.2568s
- Flux 1 Dev T2I (`model/flux-1-dev/results/batch_results.json`)
  - `totalExecutionTime`: 69.364s
  - `averageTimePerPrompt`: 6.9364s
- Flux 1 Kontext Dev I2I (`model/flux-1-kontext-dev/results/batch_results.json`)
  - `totalExecutionTime`: 121.952s
  - `averageTimePerEdit`: 12.1952s

Notes:
- One image is generated per prompt/edit in the provided scripts (`num_images: 1`), so “time per 1 image” equals the recorded average time.
- Seeds are fixed to `42` in batch scripts for repeatability.

### 8) Where things are in code
- Qwen
  - Runner: `model/qwen-image/batch-generate.js`
  - Core: `model/qwen-image/index.js`
- Flux 1 Dev
  - Runner: `model/flux-1-dev/batch-generate.js`
  - Core: `model/flux-1-dev/index.js`
- Flux 1 Kontext Dev
  - Runner: `model/flux-1-kontext-dev/batch-generate.js`
  - Core: `model/flux-1-kontext-dev/index.js`

All runners read inputs from `example_inputs/` and store images, `batch_results.json`, and `summary_report.md` under their respective `results/` directories.


