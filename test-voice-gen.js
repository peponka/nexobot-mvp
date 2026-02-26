import { ElevenLabsClient } from 'elevenlabs';

async function testVoice() {
    try {
        console.log('Generating with gAHnnZoEngjkMz2Laif6...');
        const client = new ElevenLabsClient({ apiKey: 'sk_02998ee32eb464845d63a159a35aff3dd14ec9cfd4bd392d' });

        const audioStream = await client.generate({
            voice: "gAHnnZoEngjkMz2Laif6",
            text: "Hola probando la voz de la mujer paraguaya.",
            model_id: "eleven_multilingual_v2",
            output_format: "opus_48000_128"
        });

        const chunks = [];
        for await (const chunk of audioStream) {
            chunks.push(chunk);
        }
        console.log('Success! Buffer length:', Buffer.concat(chunks).length);
    } catch (e) {
        if (e.body && e.body.getReader) {
            const reader = e.body.getReader();
            const { value } = await reader.read();
            console.error('TTS Failed 403:', new TextDecoder().decode(value));
        } else {
            console.error(e);
        }
    }
}
testVoice();
