import 'dotenv/config';
import { setPin } from './src/services/auth.js';
import supabase from './src/config/supabase.js';

async function main() {
    const { data, error } = await supabase.from('merchants').select('id, phone').limit(1).single();
    if (error) {
        console.error('Error fetching merchant', error);
        process.exit(1);
    }

    console.log(`Setting up user with phone: ${data.phone}`);
    const res = await setPin(data.id, '1234');

    console.log('Result:', res);
    console.log(`Ready! User: ${data.phone} | PIN: 1234`);
    process.exit(0);
}

main();
