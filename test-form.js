import { generateAudioFromText } from './src/services/tts.js';

async function verifyFetchFormData() {
    try {
        console.log('Generating TTS...');
        const buffer = await generateAudioFromText('Prueba');

        console.log('Using Global FormData:');
        const form = new FormData();
        form.append('messaging_product', 'whatsapp');
        const blob = new Blob([buffer], { type: 'audio/ogg' });
        form.append('file', blob, 'audio.ogg');

        console.log('Form data:', form);

        // I won't actually fetch because the token is expired locally. But I can print types.
        console.log('Built in Blob type:', Object.prototype.toString.call(blob));
        console.log('Built in FormData type:', Object.prototype.toString.call(form));

    } catch (e) {
        console.error(e);
    }
}
verifyFetchFormData();
