import { yetter } from "@yetter/client";

// Configure the Yetter client with API key
yetter.configure({
  credentials: process.env.YTR_API_KEY || process.env.REACT_APP_YTR_API_KEY
});

const MODEL = "ytr-ai/qwen/image/t2i";

async function generateImage(prompt, options = {}) {
  const defaultOptions = {
    prompt: prompt,
    image_size: "square_hd",
    num_inference_steps: 50,
    guidance_scale: 4.0,
    sync_mode: false,
    num_images: 1,
    enable_safety_checker: false,
    negative_prompt: "",
    streaming: false
  };

  const input = { ...defaultOptions, ...options };

  try {
    console.log(`\n🎨 Generating image with prompt: "${prompt}"`);
    console.log("Configuration:", input);
    console.log("\n--- Starting Image Generation ---");

    const result = await yetter.subscribe(MODEL, {
      input,
      logs: true,
      onQueueUpdate: (update) => {
        console.log(`[Queue Update] Status: ${update.status}, Position: ${update.queue_position}`);
        
        if (update.status === "IN_PROGRESS" && update.logs) {
          console.log("Processing logs:");
          update.logs.forEach(log => console.log(`  - ${log.message}`));
        } else if (update.status === "COMPLETED") {
          console.log("✅ Processing completed!");
        } else if (update.status === "FAILED") {
          console.error("❌ Processing failed. Logs:", update.logs);
        }
      },
    });

    console.log("\n--- Generation Result ---");
    console.log("✅ Images generated successfully!");
    console.log("Number of images:", result.images?.length || 0);
    console.log("Execution time:", result.model_execution_time, "seconds");
    console.log("Original prompt:", result.prompt);
    
    return result;

  } catch (error) {
    console.error("\n❌ Image Generation Failed");
    console.error("Error:", error.message || error);
    throw error;
  }
}

async function generateImageStream(prompt, options = {}) {
  const defaultOptions = {
    prompt: prompt,
    image_size: "square_hd",
    num_inference_steps: 50,
    guidance_scale: 4.0,
    sync_mode: false,
    num_images: 1,
    enable_safety_checker: false,
    negative_prompt: ""
  };

  const input = { ...defaultOptions, ...options };

  try {
    console.log(`\n🎨 Streaming image generation with prompt: "${prompt}"`);
    console.log("Configuration:", input);
    console.log("\n--- Starting Stream ---");

    const streamInstance = await yetter.stream(MODEL, { input });
    const requestId = streamInstance.getRequestId();
    console.log(`Stream initiated for Request ID: ${requestId}`);

    // Iterate over stream events
    for await (const event of streamInstance) {
      console.log(`[STREAM EVENT - ${requestId}] Status: ${event.status}, Queue Position: ${event.queue_position}`);
      
      if (event.logs && event.logs.length > 0) {
        console.log(`  Logs for ${requestId}:`);
        event.logs.forEach(log => console.log(`    - ${log.message}`));
      }
    }

    console.log(`Stream for ${requestId} finished.`);

    // Get final result
    const result = await streamInstance.done();
    console.log("\n--- Stream Final Result ---");
    console.log("✅ Images generated successfully!");
    console.log("Number of images:", result.images?.length || 0);
    console.log("Execution time:", result.model_execution_time, "seconds");
    
    return result;

  } catch (error) {
    console.error("\n❌ Stream Image Generation Failed");
    console.error("Error:", error.message || error);
    throw error;
  }
}

// Main execution
async function main() {
  // Check for API key
  if (!process.env.YTR_API_KEY && !process.env.REACT_APP_YTR_API_KEY) {
    console.error("❌ Error: Please set YTR_API_KEY or REACT_APP_YTR_API_KEY environment variable");
    process.exit(1);
  }

  const prompt = process.argv[2] || "a beautiful landscape with mountains and a lake at sunset";
  const useStream = process.argv.includes("--stream");

  try {
    if (useStream) {
      await generateImageStream(prompt);
    } else {
      await generateImage(prompt);
    }
  } catch (error) {
    console.error("Generation failed:", error);
    process.exit(1);
  }
}

// Export functions for use as a module
export { generateImage, generateImageStream };

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}