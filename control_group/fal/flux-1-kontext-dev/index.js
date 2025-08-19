import 'dotenv/config';
import { fal } from "@fal-ai/client";
import fs from 'fs/promises';
import path from 'path';

const FAL_KEY = process.env.FAL_KEY;

// Configure fal client
if (FAL_KEY) {
  fal.config({
    credentials: FAL_KEY
  });
}

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
  if (!FAL_KEY) {
    console.error("Your FAL_KEY is not set, you can check it in Access Keys");
    throw new Error("FAL_KEY not configured");
  }

  // Using FLUX Image-to-Image on Fal AI
  const defaultInput = {
    prompt: prompt,
    image_url: imageUrl,
    image_size: "square_hd",
    num_inference_steps: 28,
    guidance_scale: 2.5,
    sync_mode: false,
    num_images: 1,
    enable_safety_checker: false,
    output_format: "png",
    accelerator: "none",
    resolution_mode: "match_input"
  };

  const input = {
    ...defaultInput,
    ...options
  };

  try {
    console.log(`\n🎨 Editing image with Fal AI Flux-Kontext-Dev: "${prompt}"`);
    console.log(`Image URL: ${imageUrl.substring(0, 100)}${imageUrl.length > 100 ? '...' : ''}`);
    console.log("Configuration:", { ...input, image_url: input.image_url.substring(0, 50) + '...' });
    console.log("\n--- Starting Image Editing ---");
    
    const startTime = Date.now();
    
    // Using FLUX dev img2img model on Fal AI
    const result = await fal.subscribe("fal-ai/flux-kontext/dev", {
      input,
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === "IN_PROGRESS") {
          if (update.logs && update.logs.length > 0) {
            const latestLog = update.logs[update.logs.length - 1];
            console.log(`[Progress] ${latestLog.message}`);
          }
        }
      },
    });
    
    const totalTime = (Date.now() - startTime) / 1000;
    
    if (result && result.data && result.data.images && result.data.images.length > 0) {
      console.log("✅ Task completed. Images edited:", result.data.images.length);
      console.log(`⏱️ Total editing time: ${totalTime.toFixed(2)}s`);
      
      return {
        success: true,
        images: result.data.images.map(img => img.url),
        prompt: prompt,
        source_image: input.image_url,
        model_execution_time: totalTime,
        model_name: "fal-flux-kontext-dev",
        pipeline_complete: true,
        metadata: {
          model: "fal-ai/flux/dev/image-to-image",
          prompt: input.prompt,
          strength: input.strength,
          image_size: input.image_size,
          num_inference_steps: input.num_inference_steps,
          guidance_scale: input.guidance_scale,
          num_images: input.num_images,
          seed: result.data.seed,
          has_nsfw_concepts: result.data.has_nsfw_concepts || false
        }
      };
    } else {
      throw new Error("No images generated");
    }
  } catch (error) {
    console.error("\n❌ Fal AI Flux-Kontext-Dev Image Editing Failed");
    console.error("Error:", error.message || error);
    throw error;
  }
}

// Main execution function
async function main() {
  // Check for API key
  if (!FAL_KEY) {
    console.error("❌ Error: Please set FAL_KEY environment variable");
    process.exit(1);
  }

  const imagePath = process.argv[2] || "example_inputs/edit-images/image_01.jpg";
  const prompt = process.argv[3] || "Change the car color to red";
  
  // Parse additional options from command line
  const options = {};
  if (process.argv.includes("--strength")) {
    const strengthIndex = process.argv.indexOf("--strength");
    if (process.argv[strengthIndex + 1]) {
      options.strength = parseFloat(process.argv[strengthIndex + 1]);
    }
  }
  if (process.argv.includes("--size")) {
    const sizeIndex = process.argv.indexOf("--size");
    if (process.argv[sizeIndex + 1]) {
      options.image_size = process.argv[sizeIndex + 1];
    }
  }
  if (process.argv.includes("--steps")) {
    const stepsIndex = process.argv.indexOf("--steps");
    if (process.argv[stepsIndex + 1]) {
      options.num_inference_steps = parseInt(process.argv[stepsIndex + 1]);
    }
  }
  if (process.argv.includes("--guidance")) {
    const guidanceIndex = process.argv.indexOf("--guidance");
    if (process.argv[guidanceIndex + 1]) {
      options.guidance_scale = parseFloat(process.argv[guidanceIndex + 1]);
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
    console.log("✅ Images edited successfully!");
    console.log("Image URLs:");
    result.images.forEach((url, i) => {
      console.log(`  ${i + 1}. ${url}`);
    });
    console.log("Edit time:", result.model_execution_time, "seconds");
    console.log("Model:", result.model_name);
    console.log("Strength:", result.metadata.strength);
    console.log("Image size:", result.metadata.image_size);
    console.log("Steps:", result.metadata.num_inference_steps);
    console.log("Guidance:", result.metadata.guidance_scale);
    console.log("NSFW check:", result.metadata.has_nsfw_concepts ? "⚠️ NSFW content detected" : "✅ Safe");
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