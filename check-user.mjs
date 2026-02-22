import 'dotenv/config';
import supabase from './src/config/supabase.js';

async function main() {
    const { data } = await supabase.from('merchants').select('phone, dashboard_pin').eq('phone', '+595981234567').single();
    if (data) {
        console.log(`User: ${data.phone} | PIN: ${data.dashboard_pin}`);
    } else {
        console.log('User not found in DB.');

        // Let's create one with a cleartext pin "1234" to bypass the bcrypt issue for now
        const user = { phone: '0981123456', name: 'Demo', dashboard_pin: '1234' };
        await supabase.from('merchants').upsert(user, { onConflict: 'phone' });
        console.log('Created user 0981123456 with pin 1234');
    }
}
main();
