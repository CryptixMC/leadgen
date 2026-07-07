import { db } from './db';
import { LeadOpError } from './leadOperations';
import type { Client } from '$lib/api';

export async function listClients(): Promise<Client[]> {
	const { data, error: err } = await db
		.from('clients')
		.select('*')
		.order('created_at', { ascending: false });
	if (err) throw new LeadOpError(err.message, 500);
	return (data ?? []) as Client[];
}

export async function getClient(id: string): Promise<Client> {
	const { data, error: err } = await db.from('clients').select('*').eq('id', id).single();
	if (err || !data) throw new LeadOpError('Client not found', 404);
	return data as Client;
}
