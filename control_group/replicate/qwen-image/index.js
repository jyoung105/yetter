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

  const model = 'qwen/qwen-image';

  const defaultInput = {
    prompt: prompt,
    negative_prompt: '',
    enhance_prompt: false,
    image_size: 'optimize_for_quality',
    aspect_ratio: '1:1',
    output_format: 'png',
    output_quality: 100,
    go_fast: true,
    num_inference_steps: 50,
    guidance: 4,
    num_outputs: 1,
    disable_safety_checker: true
  };

  const input = {
    ...defaultInput,
    ...options
  };

  try {
    console.log(`\n🎨 Generating image with Replicate Qwen-Image: "${prompt}"`);
    console.log("Configuration:", input);
    console.log("\n--- Starting Image Generation ---");
    
    const startTime = Date.now();
    
    const output = await replicate.run(`${model}`, { input });
    
    const totalTime = (Date.now() - startTime) / 1000;
    
    if (output && output.length > 0) {
      const imageUrl = output[0];
      console.log("✅ Task completed. URL:", imageUrl);
      console.log(`⏱️ Total generation time: ${totalTime.toFixed(2)}s`);
      
      return {
        success: true,
        images: [imageUrl],
        prompt: prompt,
        model_execution_time: totalTime,
        model_name: "replicate-qwen-image",
        pipeline_complete: true,
        metadata: {
          model: `${model}`,
          output_format: input.output_format,
          aspect_ratio: input.aspect_ratio,
          output_quality: input.output_quality,
          num_outputs: input.num_outputs
        }
      };
    } else {
      throw new Error("No images generated");
    }
  } catch (error) {
    console.error("\n❌ Replicate Qwen-Image Generation Failed");
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
  if (process.argv.includes("--aspect")) {
    const aspectIndex = process.argv.indexOf("--aspect");
    if (process.argv[aspectIndex + 1]) {
      options.aspect_ratio = process.argv[aspectIndex + 1];
    }
  }
  if (process.argv.includes("--quality")) {
    const qualityIndex = process.argv.indexOf("--quality");
    if (process.argv[qualityIndex + 1]) {
      options.output_quality = parseInt(process.argv[qualityIndex + 1]);
    }
  }
  if (process.argv.includes("--format")) {
    const formatIndex = process.argv.indexOf("--format");
    if (process.argv[formatIndex + 1]) {
      options.output_format = process.argv[formatIndex + 1];
    }
  }

  try {
    const result = await generateImage(prompt, options);
    console.log("\n--- Generation Result ---");
    console.log("✅ Image generated successfully!");
    console.log("Image URL:", result.images[0]);
    console.log("Generation time:", result.model_execution_time, "seconds");
    console.log("Model:", result.model_name);
    console.log("Aspect ratio:", result.metadata.aspect_ratio);
    console.log("Output format:", result.metadata.output_format);
    console.log("Output quality:", result.metadata.output_quality);
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