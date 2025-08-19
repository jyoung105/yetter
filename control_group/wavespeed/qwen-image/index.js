import 'dotenv/config';

// Configure the WaveSpeed API with API key from environment
const WAVESPEED_API_KEY = process.env.WAVESPEED_API_KEY;

async function generateImage(prompt, options = {}) {
  if (!WAVESPEED_API_KEY) {
    console.error("Your API_KEY is not set, you can check it in Access Keys");
    throw new Error("WAVESPEED_API_KEY not configured");
  }

  const url = "https://api.wavespeed.ai/api/v3/wavespeed-ai/qwen-image/text-to-image";
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${WAVESPEED_API_KEY}`
  };

  const defaultPayload = {
    size: "1024*1024",
    seed: -1,
    output_format: "png",
    enable_sync_mode: false,
    enable_base64_output: false
  };

  const payload = {
    prompt: prompt,
    ...defaultPayload,
    ...options
  };

  try {
    console.log(`\n🎨 Generating image with WaveSpeed Qwen: "${prompt}"`);
    console.log("Configuration:", payload);
    console.log("\n--- Starting Image Generation ---");
    
    const startTime = Date.now();
    
    // Submit the generation request
    const response = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed: ${response.status} - ${errorText}`);
    }
    
    const result = await response.json();
    const requestId = result.data.id;
    console.log(`Task submitted successfully. Request ID: ${requestId}`);
    
    // Poll for completion
    while (true) {
      const statusResponse = await fetch(
        `https://api.wavespeed.ai/api/v3/predictions/${requestId}/result`, 
        { 
          headers: {
            "Authorization": `Bearer ${WAVESPEED_API_KEY}`
          } 
        }
      );
      
      const statusResult = await statusResponse.json();
      
      if (statusResponse.ok) {
        const data = statusResult.data;
        const status = data.status;
        
        if (status === "completed") {
          const totalTime = (Date.now() - startTime) / 1000;
          const resultUrl = data.outputs[0];
          console.log("✅ Task completed. URL:", resultUrl);
          console.log(`⏱️ Total generation time: ${totalTime.toFixed(2)}s`);
          
          return {
            success: true,
            images: [resultUrl],
            prompt: prompt,
            requestId: requestId,
            model_execution_time: totalTime,
            model_name: "wavespeed-qwen-image",
            pipeline_complete: true,
            metadata: {
              size: payload.size,
              seed: payload.seed,
              output_format: payload.output_format,
              enable_sync_mode: payload.enable_sync_mode
            }
          };
        } else if (status === "failed") {
          console.error("❌ Task failed:", data.error);
          throw new Error(`Generation failed: ${data.error}`);
        } else {
          console.log(`🔄 Task still processing. Status: ${status}`);
        }
      } else {
        console.error("Error checking status:", statusResponse.status, JSON.stringify(statusResult));
        throw new Error(`Status check failed: ${statusResponse.status}`);
      }
      
      // Wait before next poll (0.1 second as in original)
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  } catch (error) {
    console.error("\n❌ WaveSpeed Image Generation Failed");
    console.error("Error:", error.message || error);
    throw error;
  }
}

// Main execution function
async function main() {
  // Check for API key
  if (!WAVESPEED_API_KEY) {
    console.error("❌ Error: Please set WAVESPEED_API_KEY environment variable");
    process.exit(1);
  }

  const prompt = process.argv[2] || "a beautiful landscape with mountains and a lake at sunset";
  
  // Parse additional options from command line
  const options = {};
  if (process.argv.includes("--size")) {
    const sizeIndex = process.argv.indexOf("--size");
    if (process.argv[sizeIndex + 1]) {
      options.size = process.argv[sizeIndex + 1];
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
    console.log("✅ Image generated successfully!");
    console.log("Image URL:", result.images[0]);
    console.log("Request ID:", result.requestId);
    console.log("Generation time:", result.model_execution_time, "seconds");
    console.log("Model:", result.model_name);
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