const { createClient } = require('@supabase/supabase-js');
const { config } = require('dotenv');
config();

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;

if (!url || !key) {
    console.log('Faltan credenciales de Supabase');
    process.exit(1);
}

const supabase = createClient(url, key);

async function checkTables() {
    console.log('Comenzando check tables...');
    try {
        const { data, error } = await supabase.from('superadmins').select('*').limit(1);
        if (error) {
            console.log('Error checking superadmins:', error.message);
        } else {
            console.log('Tabla superadmins existe!');
        }

        const { data: b2b, error: errB2b } = await supabase.from('b2b_partners').select('*').limit(1);
        if (errB2b) {
            console.log('Error checking b2b_partners:', errB2b.message);
        } else {
            console.log('Tabla b2b_partners existe!');
        }
    } catch (e) {
        console.error('Exception:', e);
    }
}

checkTables();
