import { ElevenLabsClient } from 'elevenlabs';

async function testVoice() {
    try {
        const client = new ElevenLabsClient({ apiKey: 'sk_02998ee32eb464845d63a159a35aff3dd14ec9cfd4bd392d' });
        const voiceId = "gAHnnZoEngjkMz2Laif6";

        console.log(`Getting info for voice: ${voiceId}...`);
        const voiceInfo = await client.voices.get(voiceId);

        console.log('Voice Name:', voiceInfo.name);
        console.log('Voice Category:', voiceInfo.category);
        console.log('Voice Description:', voiceInfo.description);
        console.log('Voice Preview URL:', voiceInfo.preview_url);
    } catch (e) {
        console.error('Error:', e.message);
    }
}
testVoice();
