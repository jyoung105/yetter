import 'dotenv/config';
import Replicate from 'replicate';

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;

async function generateImage(prompt, options = {}) {
  if (!REPLICATE_API_TOKEN) {
    console.error("Your API_TOKEN is not set, you can check it in Access Keys");
    throw new Error("REPLICATE_API_TOKEN not configured");
  }

  const replicate = new Replicate({
    auth: REPLICATE_API_TOKEN
  });

  const model = 'prunaai/flux.1-dev';
  const version = 'b0306d92aa025bb747dc74162f3c27d6ed83798e08e5f8977adf3d859d0536a3';

  const defaultInput = {
    prompt: prompt,
    guidance: 3.5,
    image_size: 1024,
    aspect_ratio: '1:1',
    speed_mode: 'Blink of an eye 👁️',
    output_format: 'png',
    output_quality: 100,
    num_inference_steps: 28
  };

  const input = {
    prompt: prompt,
    ...defaultInput,
    ...options
  };

  try {
    console.log(`\n🎨 Generating image with Replicate Flux-Dev: "${prompt}"`);
    console.log("Configuration:", input);
    console.log("\n--- Starting Image Generation ---");
    
    const startTime = Date.now();
    
    const output = await replicate.run(`${model}:${version}`, { input });
    
    const totalTime = (Date.now() - startTime) / 1000;
    
    if (output && output.length > 0) {
      const imageUrl = output;
      console.log("✅ Task completed. URL:", imageUrl);
      console.log(`⏱️ Total generation time: ${totalTime.toFixed(2)}s`);
      
      return {
        success: true,
        images: [imageUrl],
        prompt: prompt,
        model_execution_time: totalTime,
        model_name: "replicate-flux-1-dev",
        pipeline_complete: true,
        metadata: {
          model: `${model}:${version}`,
          guidance: input.guidance,
          image_size: input.image_size,
          aspect_ratio: input.aspect_ratio,
          num_inference_steps: input.num_inference_steps,
          speed_mode: input.speed_mode
        }
      };
    } else {
      throw new Error("No images generated");
    }
  } catch (error) {
    console.error("\n❌ Replicate Flux-Dev Image Generation Failed");
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

  const prompt = process.argv[2] || "A stylish model, fashion show, showcase a designer outfit, orange colour suit, conspicuous jewelry, fashion show background, vibrant color, dramatic makeup";
  
  // Parse additional options from command line
  const options = {};
  if (process.argv.includes("--guidance")) {
    const guidanceIndex = process.argv.indexOf("--guidance");
    if (process.argv[guidanceIndex + 1]) {
      options.guidance = parseFloat(process.argv[guidanceIndex + 1]);
    }
  }
  if (process.argv.includes("--size")) {
    const sizeIndex = process.argv.indexOf("--size");
    if (process.argv[sizeIndex + 1]) {
      options.image_size = parseInt(process.argv[sizeIndex + 1]);
    }
  }
  if (process.argv.includes("--steps")) {
    const stepsIndex = process.argv.indexOf("--steps");
    if (process.argv[stepsIndex + 1]) {
      options.num_inference_steps = parseInt(process.argv[stepsIndex + 1]);
    }
  }
  if (process.argv.includes("--aspect")) {
    const aspectIndex = process.argv.indexOf("--aspect");
    if (process.argv[aspectIndex + 1]) {
      options.aspect_ratio = process.argv[aspectIndex + 1];
    }
  }

  try {
    const result = await generateImage(prompt, options);
    console.log("\n--- Generation Result ---");
    console.log("✅ Image generated successfully!");
    console.log("Image URL:", result.images[0]);
    console.log("Generation time:", result.model_execution_time, "seconds");
    console.log("Model:", result.model_name);
    console.log("Guidance:", result.metadata.guidance);
    console.log("Steps:", result.metadata.num_inference_steps);
    console.log("Aspect ratio:", result.metadata.aspect_ratio);
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