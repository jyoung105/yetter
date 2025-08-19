import 'dotenv/config';
import { Runware } from "@runware/sdk-js";

const RUNWARE_API_KEY = process.env.RUNWARE_API_KEY;

async function generateImage(prompt, options = {}) {
  if (!RUNWARE_API_KEY) {
    console.error("Your API_KEY is not set, you can check it in Access Keys");
    throw new Error("RUNWARE_API_KEY not configured");
  }

  const runware = new Runware({ apiKey: RUNWARE_API_KEY });

  const defaultPayload = {
    taskType: "imageInference",
    model: "runware:108@1",
    numberResults: 1,
    outputFormat: "PNG",
    width: 1024,
    height: 1024,
    steps: 50,
    CFGScale: 4.0,
    scheduler: "UniPCMultistepScheduler",
    includeCost: true,
    outputType: ["URL"]
  };

  const payload = {
    positivePrompt: prompt,
    ...defaultPayload,
    ...options
  };

  try {
    console.log(`\n🎨 Generating image with Runware Qwen-Image: "${prompt}"`);
    console.log("Configuration:", payload);
    console.log("\n--- Starting Image Generation ---");
    
    const startTime = Date.now();
    
    const images = await runware.requestImages(payload);
    
    const totalTime = (Date.now() - startTime) / 1000;
    
    if (images && images.length > 0) {
      const imageUrl = images[0].imageURL;
      console.log("✅ Task completed. URL:", imageUrl);
      console.log(`⏱️ Total generation time: ${totalTime.toFixed(2)}s`);
      
      return {
        success: true,
        images: [imageUrl],
        prompt: prompt,
        model_execution_time: totalTime,
        model_name: "runware-qwen-image",
        pipeline_complete: true,
        metadata: {
          model: payload.model,
          width: payload.width,
          height: payload.height,
          steps: payload.steps,
          CFGScale: payload.CFGScale,
          scheduler: payload.scheduler,
          outputFormat: payload.outputFormat,
          cost: images[0].cost || null
        }
      };
    } else {
      throw new Error("No images generated");
    }
  } catch (error) {
    console.error("\n❌ Runware Qwen-Image Generation Failed");
    console.error("Error:", error.message || error);
    throw error;
  }
}

// Main execution function
async function main() {
  // Check for API key
  if (!RUNWARE_API_KEY) {
    console.error("❌ Error: Please set RUNWARE_API_KEY environment variable");
    process.exit(1);
  }

  const prompt = process.argv[2] || "a beautiful landscape with mountains and a lake at sunset";
  
  // Parse additional options from command line
  const options = {};
  if (process.argv.includes("--width")) {
    const widthIndex = process.argv.indexOf("--width");
    if (process.argv[widthIndex + 1]) {
      options.width = parseInt(process.argv[widthIndex + 1]);
    }
  }
  if (process.argv.includes("--height")) {
    const heightIndex = process.argv.indexOf("--height");
    if (process.argv[heightIndex + 1]) {
      options.height = parseInt(process.argv[heightIndex + 1]);
    }
  }
  if (process.argv.includes("--steps")) {
    const stepsIndex = process.argv.indexOf("--steps");
    if (process.argv[stepsIndex + 1]) {
      options.steps = parseInt(process.argv[stepsIndex + 1]);
    }
  }
  if (process.argv.includes("--cfg")) {
    const cfgIndex = process.argv.indexOf("--cfg");
    if (process.argv[cfgIndex + 1]) {
      options.CFGScale = parseFloat(process.argv[cfgIndex + 1]);
    }
  }

  try {
    const result = await generateImage(prompt, options);
    console.log("\n--- Generation Result ---");
    console.log("✅ Image generated successfully!");
    console.log("Image URL:", result.images[0]);
    console.log("Generation time:", result.model_execution_time, "seconds");
    console.log("Model:", result.model_name);
    console.log("Steps:", result.metadata.steps);
    console.log("CFG Scale:", result.metadata.CFGScale);
    console.log("Scheduler:", result.metadata.scheduler);
    if (result.metadata.cost) {
      console.log("Cost:", result.metadata.cost);
    }
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