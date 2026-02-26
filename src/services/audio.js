import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import FormData from 'form-data';
import OpenAI from 'openai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WHATSAPP_API_URL = 'https://graph.facebook.com/v22.0';

// In-memory token cache to avoid requesting a token on every call
const WA_MEDIA_TOKENS = new Map();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Downloads an audio file from WhatsApp, transcribes it with Whisper, and returns the text.
 */
export async function transcribeAudio(mediaId) {
    console.log(`🎙️ Processing audio message ID: ${mediaId}`);
    const token = process.env.WHATSAPP_TOKEN;

    if (!token || token === 'your-whatsapp-token') {
        throw new Error('WhatsApp Token no configurado');
    }

    try {
        // 1. Get the media URL from WhatsApp
        const mediaUrlResponse = await fetch(`${WHATSAPP_API_URL}/${mediaId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const mediaData = await mediaUrlResponse.json();

        if (mediaData.error) {
            throw new Error(`Error getting media URL: ${mediaData.error.message}`);
        }

        const mediaUrl = mediaData.url;
        console.log(`🔽 Downloading audio from: ${mediaUrl}`);

        // 2. Download the actual audio file
        const audioResponse = await fetch(mediaUrl, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!audioResponse.ok) {
            throw new Error(`Failed to download audio file: ${audioResponse.statusText}`);
        }

        // 3. Save it to a temporary file
        const arrayBuffer = await audioResponse.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Use .ogg extension as WhatsApp audio is typically OGG/Opus
        const tempFilePath = path.join(__dirname, '..', '..', 'temp', `audio_${mediaId}.ogg`);

        // Ensure temp directory exists
        const tempDir = path.dirname(tempFilePath);
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        fs.writeFileSync(tempFilePath, buffer);
        console.log(`💾 Saved temporarily at: ${tempFilePath}`);

        // 4. Send to OpenAI Whisper for Transcription
        console.log(`🧠 Sending to OpenAI Whisper for transcription...`);
        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(tempFilePath),
            model: "whisper-1",
            language: "es", // Force Spanish/Guarani context
            response_format: "text"
        });

        console.log(`✅ Transcription ready: "${transcription.trim()}"`);

        // 5. Clean up temporary file
        try {
            fs.unlinkSync(tempFilePath);
        } catch (e) {
            console.error('Warning: Failed to clean up temp audio file:', e.message);
        }

        return transcription.trim();

    } catch (error) {
        console.error('❌ Error processing audio:', error);
        throw error;
    }
}
