import 'dotenv/config';
import { generateAudioFromText } from './src/services/tts.js';
import { sendAudioMessage } from './src/services/whatsapp.js';

async function testAudioSend() {
    try {
        console.log('1. Generating audio...');
        const audioBuffer = await generateAudioFromText('Probando el envío de audio de NexoBot');
        console.log(`Audio generated, size: ${audioBuffer.length} bytes`);

        console.log('2. Uploading and sending audio...');
        // Sending to user's phone +15551912247 as seen in conversation
        await sendAudioMessage('+15551912247', audioBuffer);
        console.log('Success!');
    } catch (e) {
        console.error('Test failed:', e);
    }
}

testAudioSend();
