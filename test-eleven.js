import 'dotenv/config';
import { ElevenLabsClient } from 'elevenlabs';
import FormData from 'form-data';

const elevenlabs = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY || 'sk-test' });

async function test() {
    try {
        console.log('Testing ElevenLabs');
        const res = await elevenlabs.generate({
            voice: "JBFqnCBsd6RMkjVDRZzb", // Some ID
            text: "Hola, probando ElevenLabs",
            model_id: "eleven_multilingual_v2"
        });
        const chunks = [];
        for await (const chunk of res) {
            chunks.push(chunk);
        }
        console.log('Got audio buffer size:', Buffer.concat(chunks).length);

        console.log('Test form data');
        const form = new FormData();
        form.append('messaging_product', 'whatsapp');
        form.append('file', Buffer.from('test'), { filename: 'audio.ogg', contentType: 'audio/ogg' });
        console.log('Created form data, headers:', form.getHeaders());

    } catch (err) {
        console.error('Failed test:', err.message);
    }
}
test();
