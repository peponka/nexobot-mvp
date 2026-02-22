import 'dotenv/config';
import supabase from './src/config/supabase.js';
import bcrypt from 'bcrypt';

async function main() {
    const defaultPin = '1234';
    const hashed = await bcrypt.hash(defaultPin, 10);

    // Create or update demo user
    const user = { phone: '0981123456', name: 'Usuario Prueba', dashboard_pin: hashed };
    const { data, error } = await supabase.from('merchants').upsert(user, { onConflict: 'phone' }).select();

    console.log('User created/updated:', error || data);
    console.log('Phone: 0981123456');
    console.log('PIN: 1234');
    process.exit(0);
}
main();
