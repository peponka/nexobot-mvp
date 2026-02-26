import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
// We'll lazy-load elevenlabs below if the key is present.

/**
 * Generates audio from text using OpenAI TTS (or ElevenLabs if configured) and returns the audio buffer.
 * @param {string} text - The response text to synthesize.
 * @returns {Promise<Buffer>} The synthesized audio buffer in OGG format.
 */
export async function generateAudioFromText(text) {
    console.log(`🔊 Generating audio for text: "${text.substring(0, 50)}..."`);

    if (process.env.ELEVENLABS_API_KEY) {
        console.log(`🎙️ Unlocked ElevenLabs API Key, attempting ElevenLabs TTS`);
        try {
            const cleanApiKey = process.env.ELEVENLABS_API_KEY.trim();
            const cleanVoiceId = (process.env.ELEVENLABS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb").trim();
            console.log(`Voice ID being used: '${cleanVoiceId}'`);

            const { ElevenLabsClient } = await import('elevenlabs');
            const elevenlabsClient = new ElevenLabsClient({ apiKey: cleanApiKey });

            const audioStream = await elevenlabsClient.generate({
                voice: cleanVoiceId,
                text: text,
                model_id: "eleven_multilingual_v2",
                output_format: "mp3_44100_128" // WhatsApp native format
            });

            const chunks = [];
            for await (const chunk of audioStream) {
                chunks.push(chunk);
            }
            return Buffer.concat(chunks);
        } catch (error) {
            console.error('❌ ElevenLabs TTS Error or missing module:', error.message);
            // Fallthrough to OpenAI
        }
    }

    // Default to OpenAI TTS (we know the key exists and works)
    console.log(`🎙️ Using OpenAI TTS`);
    try {
        const mp3Response = await openai.audio.speech.create({
            model: "tts-1",
            voice: "onyx", // Deep, clear voice suited for this context
            input: text,
            response_format: "mp3" // WhatsApp compatible
        });

        const arrayBuffer = await mp3Response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    } catch (error) {
        console.error('❌ OpenAI TTS Error:', error);
        throw error;
    }
}
