import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { config } from '../domain/config';

const connectionString = config.database.url;

// Disable prefetch as it's not supported for transactions
const client = postgres(connectionString, { prepare: false });

export const db = drizzle(client, { schema });

export { schema };