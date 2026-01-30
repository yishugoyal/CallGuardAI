import requests
import urllib.parse

STT_API_URL = "https://stt.apkadadyy.workers.dev/"
LLAMA_API_URL = "https://llama.apkadadyy.workers.dev/?q="

# -----------------------------
# Speech to Text
# -----------------------------
def transcribe_audio(audio_path: str):
    with open(audio_path, "rb") as f:
        audio_data = f.read()

    headers = {
        "Content-Type": "audio/mpeg"  # mp3
    }

    response = requests.post(STT_API_URL, data=audio_data, headers=headers)

    if response.status_code != 200:
        print("❌ STT Error:", response.text)
        return None

    return response.json().get("text", "")


# -----------------------------
# Fraud + Sentiment Analysis
# -----------------------------
def analyze_call(transcribed_text: str):

    prompt = f"""
    You are an AI model specialized in real-time call conversation analysis.

Your task is to analyze phone call conversations between two people and determine whether the call is:
- Normal person-to-person conversation
- Slightly suspicious
- Highly suspicious or fraudulent

You must understand both normal and fraudulent conversations accurately.
Do NOT assume fraud unless there are strong indicators.

You are analyzing partial chunks of a real-time call, so context may be incomplete.
Be cautious and balanced in judgment. Rules:
1. Normal daily conversations should receive very low scores.
2. Fraud or scam calls should receive high scores.
3. Do not overreact to polite requests or casual discussions.
4. Strong fraud indicators include:
   - Asking for OTP, PIN, CVV, passwords
   - Urgency or pressure tactics
   - Threats or fear-based language
   - Impersonation (bank, police, company)
   - Requests for money transfer or sensitive data
5. The score must be a SINGLE aggregated score from 0 to 100.

Score meaning:
- 0–20  : Completely normal conversation
- 21–40 : Normal with minor caution
- 41–60 : Suspicious
- 61–80 : High risk
- 81–100: Very confident fraud. Write a Score on top as -Score-
This is a partial transcript of a real-time phone call between two people.
Analyze the conversation carefully.
Remember:
- This is a real-time call chunk.
- Judge calmly.
Conversation:
\"\"\"{transcribed_text}\"\"\" "
}}
"""

    url = LLAMA_API_URL + urllib.parse.quote(prompt)
    response = requests.get(url)

    if response.status_code != 200:
        print("❌ LLaMA Error:", response.text)
        return None

    return response.text


# -----------------------------
# Complete Caller Guard Pipeline
# -----------------------------
def caller_guard_ai(audio_path: str):
    print("🎧 Transcribing audio...")
    text = transcribe_audio(audio_path)

    if not text:
        print("❌ Transcription failed")
        return

    print("\n📝 Transcription:")
    print(text)

    print("\n🛡️ Fraud + Sentiment Analysis...")
    analysis = analyze_call(text)

    if not analysis:
        print("❌ Analysis failed")
        return

    print("\n📊 Caller Guard AI Result:")
    print(analysis)


# -----------------------------
# Example
# -----------------------------
if __name__ == "__main__":
    audio_file = "audio1.wav"
    caller_guard_ai(audio_file)
