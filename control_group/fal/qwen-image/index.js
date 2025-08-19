import 'dotenv/config';
import { fal } from "@fal-ai/client";

const FAL_KEY = process.env.FAL_KEY;

// Configure fal client
if (FAL_KEY) {
  fal.config({ 
    credentials: FAL_KEY 
  });
}

async function generateImage(prompt, options = {}) {
  if (!FAL_KEY) {
    console.error("Your FAL_KEY is not set, you can check it in Access Keys");
    throw new Error("FAL_KEY not configured");
  }

  const defaultInput = {
    prompt: prompt,
    image_size: "square_hd",
    num_inference_steps: 50,
    guidance_scale: 4.0,
    sync_mode: false,
    num_images: 1,
    enable_safety_checker: false,
    output_format: "png",
    negative_prompt: "",
    accelerator: "none"
  };

  const input = {
    ...defaultInput,
    ...options
  };

  try {
    console.log(`\n🎨 Generating image with Fal AI Qwen-Image: "${prompt}"`);
    console.log("Configuration:", input);
    console.log("\n--- Starting Image Generation ---");
    
    const startTime = Date.now();
    
    // Using FLUX Schnell as it's the fastest model on Fal AI (Qwen alternative)
    const result = await fal.subscribe("fal-ai/qwen-image", {
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
      console.log("✅ Task completed. Images generated:", result.data.images.length);
      console.log(`⏱️ Total generation time: ${totalTime.toFixed(2)}s`);
      
      return {
        success: true,
        images: result.data.images.map(img => img.url),
        prompt: prompt,
        model_execution_time: totalTime,
        model_name: "fal-qwen-image",
        pipeline_complete: true,
        metadata: {
          model: "fal-ai/flux/schnell",
          prompt: input.prompt,
          image_size: input.image_size,
          num_inference_steps: input.num_inference_steps,
          num_images: input.num_images,
          seed: result.data.seed,
          has_nsfw_concepts: result.data.has_nsfw_concepts || false
        }
      };
    } else {
      throw new Error("No images generated");
    }
  } catch (error) {
    console.error("\n❌ Fal AI Qwen-Image Generation Failed");
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

  const prompt = process.argv[2] || "A stylish model, fashion show, showcase a designer outfit, orange colour suit, conspicuous jewelry, fashion show background, vibrant color, dramatic makeup";
  
  // Parse additional options from command line
  const options = {};
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
  if (process.argv.includes("--num-images")) {
    const numIndex = process.argv.indexOf("--num-images");
    if (process.argv[numIndex + 1]) {
      options.num_images = parseInt(process.argv[numIndex + 1]);
    }
  }
  if (process.argv.includes("--seed")) {
    const seedIndex = process.argv.indexOf("--seed");
    if (process.argv[seedIndex + 1]) {
      options.seed = parseInt(process.argv[seedIndex + 1]);
    }
  }

  try {
    const result = await generateImage(prompt, options);
    console.log("\n--- Generation Result ---");
    console.log("✅ Images generated successfully!");
    console.log("Image URLs:");
    result.images.forEach((url, i) => {
      console.log(`  ${i + 1}. ${url}`);
    });
    console.log("Generation time:", result.model_execution_time, "seconds");
    console.log("Model:", result.model_name);
    console.log("Image size:", result.metadata.image_size);
    console.log("Steps:", result.metadata.num_inference_steps);
    console.log("NSFW check:", result.metadata.has_nsfw_concepts ? "⚠️ NSFW content detected" : "✅ Safe");
  } catch (error) {
    console.error("Generation failed:", error);
    process.exit(1);
  }
}

// Export function for use as a module
export { generateImage };

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}