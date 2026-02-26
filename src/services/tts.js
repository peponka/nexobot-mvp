import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import { ElevenLabsClient } from 'elevenlabs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
// Fallback to ElevenLabs if the user provides the key
const elevenlabs = process.env.ELEVENLABS_API_KEY ? new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY }) : null;

/**
 * Generates audio from text using OpenAI TTS (or ElevenLabs if configured) and returns the audio buffer.
 * @param {string} text - The response text to synthesize.
 * @returns {Promise<Buffer>} The synthesized audio buffer in OGG format.
 */
export async function generateAudioFromText(text) {
    console.log(`🔊 Generating audio for text: "${text.substring(0, 50)}..."`);

    // Si tenemos clave de ElevenLabs, usamos ElevenLabs
    if (elevenlabs) {
        console.log(`🎙️ Using ElevenLabs TTS`);
        try {
            const audioStream = await elevenlabs.generate({
                voice: "JBFqnCBsd6RMkjVDRZzb", // Replace with preferred voice ID
                text: text,
                model_id: "eleven_multilingual_v2",
                output_format: "ogg_opus" // WhatsApp native format
            });

            const chunks = [];
            for await (const chunk of audioStream) {
                chunks.push(chunk);
            }
            return Buffer.concat(chunks);
        } catch (error) {
            console.error('❌ ElevenLabs TTS Error:', error);
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
            response_format: "opus" // Native whatsapp format
        });

        const arrayBuffer = await mp3Response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    } catch (error) {
        console.error('❌ OpenAI TTS Error:', error);
        throw error;
    }
}
