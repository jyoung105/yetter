import 'dotenv/config';
import Replicate from 'replicate';
import fs from 'fs/promises';
import path from 'path';

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;

// Helper function to convert local image to base64 data URL
async function imageToDataURL(imagePath) {
  try {
    const imageBuffer = await fs.readFile(imagePath);
    const base64 = imageBuffer.toString('base64');
    const ext = path.extname(imagePath).slice(1).toLowerCase();
    const mimeType = ext === 'jpg' ? 'jpeg' : ext;
    return `data:image/${mimeType};base64,${base64}`;
  } catch (error) {
    console.error(`Error reading image file ${imagePath}:`, error.message);
    throw error;
  }
}

async function generateEditedImage(imageUrl, prompt, options = {}) {
  if (!REPLICATE_API_TOKEN) {
    console.error("Your API_TOKEN is not set, you can check it in Access Keys");
    throw new Error("REPLICATE_API_TOKEN not configured");
  }

  const replicate = new Replicate({
    auth: REPLICATE_API_TOKEN
  });

  const model = 'prunaai/flux-kontext-dev';
  const version = '2f311ad6069d6cb2ec28d46bb0d1da5148a983b56f4f2643d2d775d39d11e44b';

  const defaultInput = {
    prompt: prompt,
    img_cond_path: imageUrl,
    num_inference_steps: 28,
    guidance: 2.5,
    image_size: 1024,
    aspect_ratio: 'match_input_image',
    speed_mode: 'Real Time',
    output_format: 'png',
    output_quality: 100
  };

  const input = {
    ...defaultInput,
    ...options
  };

  try {
    console.log(`\n🎨 Editing image with Replicate Flux-Kontext-Dev: "${prompt}"`);
    console.log(`Image URL: ${imageUrl.substring(0, 100)}${imageUrl.length > 100 ? '...' : ''}`);
    console.log("Configuration:", { ...input, img_cond_path: input.img_cond_path.substring(0, 50) + '...' });
    console.log("\n--- Starting Image Editing ---");
    
    const startTime = Date.now();
    
    const output = await replicate.run(`${model}:${version}`, { input });
    
    const totalTime = (Date.now() - startTime) / 1000;
    
    if (output && output.length > 0) {
      const imageFile = output;
      // Get the URL from the file object
      const imageUrl = imageFile.url ? imageFile.url() : imageFile;
      console.log("✅ Task completed. URL:", imageUrl);
      console.log(`⏱️ Total generation time: ${totalTime.toFixed(2)}s`);
      
      return {
        success: true,
        images: [imageFile], // Return the file object, not just URL
        prompt: prompt,
        source_image: input.img_cond_path,
        model_execution_time: totalTime,
        model_name: "replicate-flux-kontext-dev",
        pipeline_complete: true,
        metadata: {
          model: `${model}:${version}`,
          guidance_scale: input.guidance,
          steps: input.num_inference_steps,
          strength: input.strength,
          seed: input.seed
        }
      };
    } else {
      throw new Error("No images generated");
    }
  } catch (error) {
    console.error("\n❌ Replicate Flux-Kontext-Dev Image Editing Failed");
    console.error("Error:", error.message || error);
    throw error;
  }
}

// Main execution function
async function main() {
  // Check for API key
  if (!REPLICATE_API_TOKEN) {
    console.error("❌ Error: Please set REPLICATE_API_TOKEN environment variable");
    process.exit(1);
  }

  const imagePath = process.argv[2] || "example_inputs/edit-images/image_01.jpg";
  const prompt = process.argv[3] || "Change the car color to red";
  
  // Parse additional options from command line
  const options = {};
  if (process.argv.includes("--guidance")) {
    const guidanceIndex = process.argv.indexOf("--guidance");
    if (process.argv[guidanceIndex + 1]) {
      options.guidance_scale = parseFloat(process.argv[guidanceIndex + 1]);
    }
  }
  if (process.argv.includes("--steps")) {
    const stepsIndex = process.argv.indexOf("--steps");
    if (process.argv[stepsIndex + 1]) {
      options.steps = parseInt(process.argv[stepsIndex + 1]);
    }
  }
  if (process.argv.includes("--strength")) {
    const strengthIndex = process.argv.indexOf("--strength");
    if (process.argv[strengthIndex + 1]) {
      options.strength = parseFloat(process.argv[strengthIndex + 1]);
    }
  }
  if (process.argv.includes("--seed")) {
    const seedIndex = process.argv.indexOf("--seed");
    if (process.argv[seedIndex + 1]) {
      options.seed = parseInt(process.argv[seedIndex + 1]);
    }
  }

  try {
    // Convert local image to data URL
    const imageUrl = await imageToDataURL(imagePath);
    
    const result = await generateEditedImage(imageUrl, prompt, options);
    console.log("\n--- Edit Result ---");
    console.log("✅ Image edited successfully!");
    console.log("Image URL:", result.images[0]);
    console.log("Edit time:", result.model_execution_time, "seconds");
    console.log("Model:", result.model_name);
    console.log("Guidance:", result.metadata.guidance_scale);
    console.log("Steps:", result.metadata.steps);
    console.log("Strength:", result.metadata.strength);
  } catch (error) {
    console.error("Edit failed:", error);
    process.exit(1);
  }
}

// Export functions for use as a module
export { generateEditedImage, imageToDataURL };

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}