export default {
  async fetch(request, env) {
    // ✅ CORS
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    if (request.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Only POST method allowed" }),
        {
          status: 405,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    try {
      // ✅ Read raw audio data (binary)
      const audioBuffer = await request.arrayBuffer();

      if (!audioBuffer || audioBuffer.byteLength === 0) {
        return new Response(
          JSON.stringify({ error: "No audio file provided" }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          }
        );
      }

      // ✅ Send audio to Hugging Face Whisper
      const hfResponse = await fetch(
        "https://router.huggingface.co/hf-inference/models/openai/whisper-large-v3",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.HF_API_KEY}`,
            "Content-Type": "audio/flac", // can also be audio/wav or audio/mpeg
          },
          body: audioBuffer,
        }
      );

      if (!hfResponse.ok) {
        const errorText = await hfResponse.text();
        return new Response(
          JSON.stringify({
            error: errorText,
            model: "whisper-large-v3",
            dev: "YishuGoyalCGC",
          }),
          {
            status: 500,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          }
        );
      }

      const result = await hfResponse.json();

      // ✅ Final response
      return new Response(
        JSON.stringify({
          text: result.text || "No transcription found",
          model: "whisper-large-v3",
          dev: "YishuGoyalCGC",
        }),
        {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    } catch (err) {
      return new Response(
        JSON.stringify({
          error: err.message,
          model: "whisper-large-v3",
          dev: "YishuGoyalCGC",
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }
  },
};
