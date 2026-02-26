import { ElevenLabsClient } from 'elevenlabs';

async function testVoice() {
    try {
        const client = new ElevenLabsClient({ apiKey: 'sk_1040cd1be4ab65a488c62aedc56696cfe0c9e16ff2d19ffc' });
        const voiceId = "gAHnnZoEngjkMz2Laif6";

        console.log(`Getting info for voice: ${voiceId}...`);
        const voiceInfo = await client.voices.get(voiceId);

        console.log('Voice Name:', voiceInfo.name);
        console.log('Voice Category:', voiceInfo.category);
        console.log('Voice Description:', voiceInfo.description);
        console.log('Voice Labels:', voiceInfo.labels);
    } catch (e) {
        console.error('Error:', e.message);
    }
}
testVoice();
