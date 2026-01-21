
// src/core/db/actions.ts
import { supabase } from './client';
import { Database } from './schema';

type CustomerInsert = Database['public']['Tables']['customers']['Insert'];
type HelperInsert = Database['public']['Tables']['helpers']['Insert'];
type TicketInsert = Database['public']['Tables']['tickets']['Insert'];

const IS_DEMO = process.env.DEMO_MODE === 'true';

export async function createCustomer(data: CustomerInsert) {
    if (IS_DEMO) {
        console.log("[DEMO MODE] createCustomer:", data);
        return { id: 'demo-customer-id', ...data, created_at: new Date().toISOString() };
    }

    const { data: customer, error } = await supabase
        .from('customers')
        .insert(data as any)
        .select()
        .single();

    if (error) throw new Error(`Failed to create customer: ${error.message}`);
    return customer;
}

export async function createHelper(data: HelperInsert) {
    if (IS_DEMO) {
        console.log("[DEMO MODE] createHelper:", data);
        return { id: 'demo-helper-id', ...data, created_at: new Date().toISOString() };
    }

    const { data: helper, error } = await supabase
        .from('helpers')
        .insert(data as any)
        .select()
        .single();

    if (error) throw new Error(`Failed to create helper: ${error.message}`);
    return helper;
}

export async function createTicket(data: TicketInsert) {
    if (IS_DEMO) {
        console.log("[DEMO MODE] createTicket:", data);
        return { id: 'demo-ticket-id', ...data, created_at: new Date().toISOString() };
    }

    const { data: ticket, error } = await supabase
        .from('tickets')
        .insert(data as any)
        .select()
        .single();

    if (error) throw new Error(`Failed to create ticket: ${error.message}`);
    return ticket;
}

export async function findCustomerByPhone(phone: string) {
    if (IS_DEMO) {
        console.log("[DEMO MODE] findCustomerByPhone:", phone);
        // Simulate finding a user if phone is '9999999999', else null
        if (phone === '9999999999') {
            return {
                id: 'demo-existing-id',
                full_name: 'Demo Existing User',
                phone: phone,
                address: '123 Demo St',
                house_details: { family_members: 4, house_size: '3 BHK' },
                requirements: { work_type: 'cooking', duration: '6 months' },
                status: 'demo',
                created_at: new Date().toISOString()
            } as unknown as Database['public']['Tables']['customers']['Row'];
        }
        return null;
    }

    const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('phone', phone)
        .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 is 'not found'
        throw new Error(`Error finding customer: ${error.message}`);
    }
    return data as Database['public']['Tables']['customers']['Row'] | null;
}
